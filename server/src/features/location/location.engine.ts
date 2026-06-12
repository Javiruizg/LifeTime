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
  // Defensive validation
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error('Invalid coordinates: out of valid range');
  }

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

  // Batch all hgetall calls into a single pipeline round-trip
  const pipelineEntries: Array<{ memberId: string; distance: number }> = [];
  const hgetallPipeline = redis.pipeline();

  for (const entry of radiusResults) {
    const memberId = entry[0];
    const distanceStr = entry[1];
    const distance = parseFloat(distanceStr as string);

    if (String(memberId) === String(userId)) continue;
    if (Number.isNaN(distance)) continue;

    pipelineEntries.push({ memberId, distance });
    hgetallPipeline.hgetall(`${SESSION_KEY_PREFIX}:${memberId}`);
  }

  const hgetallResults = await hgetallPipeline.exec();
  if (!hgetallResults) return [];

  const visibleUsers: VisibleUser[] = [];
  const staleMembers: string[] = [];

  for (let i = 0; i < pipelineEntries.length; i++) {
    const { memberId, distance } = pipelineEntries[i];
    const [err, theirSession] = hgetallResults[i];

    if (err) continue;

    // In ioredis, hgetall on a missing key returns {} (empty object)
    const session = theirSession as Record<string, string>;
    if (!session || Object.keys(session).length === 0) {
      staleMembers.push(memberId);
      continue;
    }

    const theirRange = parseFloat(session.range);
    if (Number.isNaN(theirRange)) continue;

    // Mutual range check: they must be within their own range too
    if (distance > theirRange) continue;

    const theirLat = parseFloat(session.lat);
    const theirLng = parseFloat(session.lng);

    visibleUsers.push({
      userId: memberId,
      latitude: Number.isNaN(theirLat) ? 0 : theirLat,
      longitude: Number.isNaN(theirLng) ? 0 : theirLng,
      distance,
    });
  }

  // Batch cleanup of stale geo entries
  if (staleMembers.length > 0) {
    const cleanupPipeline = redis.pipeline();
    for (const memberId of staleMembers) {
      cleanupPipeline.zrem(GEO_KEY, memberId);
    }
    await cleanupPipeline.exec();
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
