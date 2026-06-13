import redis from '../../shared/lib/redis';
import { findVisibleUsersFor } from '../location/location.engine';
import type { VisibleUser } from '../location/location.engine';

const USER_GROUPS_PREFIX = 'user:groups';
const GROUP_CREATION_LOCK_PREFIX = 'group:creation_lock';

/**
 * Find a clique of >= 3 users (including the given user) where:
 * - All users are mutually visible within each other's range
 * - None of the users already have a group assigned (no user:groups flag in Redis)
 */
export async function findCliqueForUser(userId: number): Promise<number[] | null> {
  // 1. Check if the user itself already has a group
  const userHasGroup = await redis.scard(`${USER_GROUPS_PREFIX}:${userId}`);
  if (userHasGroup > 0) {
    return null;
  }

  // 2. Get visible users for the given user
  const { visibleUsers } = await findVisibleUsersFor(userId);

  // 3. Filter candidates: only those without a group assigned
  const candidates: VisibleUser[] = [];
  for (const user of visibleUsers) {
    const hasGroup = await redis.scard(`${USER_GROUPS_PREFIX}:${user.userId}`);
    if (hasGroup === 0) {
      candidates.push(user);
    }
  }

  // 4. Include the user itself in the pool
  const selfSession = await redis.hgetall(`location:session:${userId}`);
  if (!selfSession || Object.keys(selfSession).length === 0) {
    return null;
  }
  const selfLat = parseFloat(selfSession.lat);
  const selfLng = parseFloat(selfSession.lng);

  const pool = [
    { userId: String(userId), latitude: selfLat, longitude: selfLng, distance: 0 },
    ...candidates,
  ];

  // 5. Need at least 3 total (including self)
  if (pool.length < 3) {
    return null;
  }

  // 6. Verify mutual visibility with memoization to avoid redundant Redis calls
  // when the same user appears as a visible member across multiple iterations
  const visibleCache = new Map<number, Set<string>>();

  const getVisibleIds = async (memberId: number): Promise<Set<string>> => {
    if (visibleCache.has(memberId)) {
      return visibleCache.get(memberId)!;
    }
    const { visibleUsers: visible } = await findVisibleUsersFor(memberId);
    const ids = new Set(visible.map((u) => u.userId));
    visibleCache.set(memberId, ids);
    return ids;
  };

  const cliqueUserIds: number[] = [];

  for (const member of pool) {
    const memberId = parseInt(member.userId, 10);
    const memberVisibleIds = await getVisibleIds(memberId);

    // Check that every OTHER pool member is visible from this member
    let allVisible = true;
    for (const other of pool) {
      const otherId = other.userId;
      if (otherId === member.userId) continue;

      if (!memberVisibleIds.has(otherId)) {
        allVisible = false;
        break;
      }
    }

    if (!allVisible) {
      return null;
    }

    cliqueUserIds.push(memberId);
  }

  return cliqueUserIds;
}

/**
 * Calculate the geometric center (average lat/lng) of a set of users.
 */
export function calculateGroupCenter(users: Array<{ latitude: number; longitude: number }>): {
  lat: number;
  lng: number;
} {
  const totalLat = users.reduce((sum, u) => sum + u.latitude, 0);
  const totalLng = users.reduce((sum, u) => sum + u.longitude, 0);

  return {
    lat: totalLat / users.length,
    lng: totalLng / users.length,
  };
}

/**
 * Calculate a geohash for locking by rounding lat/lng to 3 decimals.
 * ~111m precision, good enough to prevent duplicate groups in the same area.
 */
export function calculateGeohash(lat: number, lng: number): string {
  const roundedLat = Math.round(lat * 1000) / 1000;
  const roundedLng = Math.round(lng * 1000) / 1000;
  return `${roundedLat}_${roundedLng}`;
}

/**
 * Acquire a distributed lock for creating a group in a given geohash.
 * Returns true if lock was acquired, false otherwise.
 */
export async function acquireCreationLock(geohash: string): Promise<boolean> {
  const key = `${GROUP_CREATION_LOCK_PREFIX}:${geohash}`;
  const result = await redis.set(key, '1', 'EX', 10, 'NX');
  return result === 'OK';
}

/**
 * Release the creation lock for a geohash.
 */
export async function releaseCreationLock(geohash: string): Promise<void> {
  const key = `${GROUP_CREATION_LOCK_PREFIX}:${geohash}`;
  await redis.del(key);
}
