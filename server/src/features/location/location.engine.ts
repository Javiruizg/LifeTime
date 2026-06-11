import redis from '../../shared/lib/redis';
import { prisma } from '../../shared/lib/prisma';

const SESSION_KEY_PREFIX = 'location:session';
const GEO_KEY = 'geo:connected_users';

export interface VisibleUser {
  userId: string;
  latitude: number;
  longitude: number;
  distance: number;
}

export async function updateUserLocation(
  userId: number,
  lat: number,
  lng: number
): Promise<void> {
  const key = `${SESSION_KEY_PREFIX}:${userId}`;
  await redis.hset(key, 'lat', String(lat), 'lng', String(lng));
  await redis.geoadd(GEO_KEY, lng, lat, String(userId));
}

export async function findVisibleUsersFor(userId: number): Promise<VisibleUser[]> {
  const ownKey = `${SESSION_KEY_PREFIX}:${userId}`;
  const ownSession = await redis.hgetall(ownKey);

  if (!ownSession || Object.keys(ownSession).length === 0) {
    return [];
  }

  const ownLat = parseFloat(ownSession.lat);
  const ownLng = parseFloat(ownSession.lng);
  const ownRange = parseFloat(ownSession.range);

  if (Number.isNaN(ownLat) || Number.isNaN(ownLng) || Number.isNaN(ownRange)) {
    return [];
  }

  const radiusResults = await redis.georadius(
    GEO_KEY,
    ownLng,
    ownLat,
    ownRange,
    'm',
    'WITHDIST'
  ) as Array<[string, string]>;

  const visibleUsers: VisibleUser[] = [];

  for (const entry of radiusResults) {
    const memberId = entry[0];
    const distanceStr = entry[1];

    if (String(memberId) === String(userId)) {
      continue;
    }

    const distance = parseFloat(distanceStr as string);
    if (Number.isNaN(distance)) {
      continue;
    }

    const theirKey = `${SESSION_KEY_PREFIX}:${memberId}`;
    const theirSession = await redis.hgetall(theirKey);

    // Lazy cleanup: if their session is gone, remove stale geo entry
    if (!theirSession || Object.keys(theirSession).length === 0) {
      await redis.zrem(GEO_KEY, String(memberId));
      continue;
    }

    const theirRange = parseFloat(theirSession.range);
    if (Number.isNaN(theirRange)) {
      continue;
    }

    // Mutual range check: they must be within their own range too
    if (distance > theirRange) {
      continue;
    }

    const theirLat = parseFloat(theirSession.lat);
    const theirLng = parseFloat(theirSession.lng);

    visibleUsers.push({
      userId: String(memberId),
      latitude: Number.isNaN(theirLat) ? 0 : theirLat,
      longitude: Number.isNaN(theirLng) ? 0 : theirLng,
      distance,
    });
  }

  return visibleUsers;
}

export interface ConnectedFriend {
  userId: number;
  latitude: number;
  longitude: number;
}

export async function findConnectedFriendsFor(userId: number): Promise<ConnectedFriend[]> {
  const friendships = await prisma.friendship.findMany({
    where: {
      OR: [{ userIdA: userId }, { userIdB: userId }],
    },
  });

  const friends: ConnectedFriend[] = [];
  for (const f of friendships) {
    const friendId = f.userIdA === userId ? f.userIdB : f.userIdA;
    const friendKey = `${SESSION_KEY_PREFIX}:${friendId}`;
    const friendSession = await redis.hgetall(friendKey);

    if (!friendSession || Object.keys(friendSession).length === 0) continue;

    const friendLat = parseFloat(friendSession.lat);
    const friendLng = parseFloat(friendSession.lng);
    if (Number.isNaN(friendLat) || Number.isNaN(friendLng)) continue;

    friends.push({
      userId: friendId,
      latitude: friendLat,
      longitude: friendLng,
    });
  }

  return friends;
}
