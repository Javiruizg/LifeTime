import redis from '../../shared/lib/redis';
import type { ConnectLocationResult, LocationSession } from './location.types';
import { onUserDisconnected } from '../group/group.service';

const SESSION_KEY_PREFIX = 'location:session';
const GEO_KEY = 'geo:connected_users';

export async function connectUserLocation(
  userId: number,
  range: number,
  durationMinutes: number
): Promise<ConnectLocationResult> {
  const ttlSeconds = durationMinutes * 60;
  const connectedAt = Date.now();
  const key = `${SESSION_KEY_PREFIX}:${userId}`;

  await redis.hset(key, {
    range: String(range),
    connectedAt: String(connectedAt),
  });
  await redis.expire(key, ttlSeconds);

  const expiresAt = new Date(connectedAt + ttlSeconds * 1000);

  return {
    range,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function disconnectUserLocation(userId: number): Promise<void> {
  // Clean up group memberships before removing location session
  await onUserDisconnected(userId);

  const key = `${SESSION_KEY_PREFIX}:${userId}`;
  await redis.del(key);
  await redis.zrem(GEO_KEY, String(userId));
}

export async function getUserLocationStatus(userId: number): Promise<LocationSession> {
  const key = `${SESSION_KEY_PREFIX}:${userId}`;
  const [session, ttl] = await Promise.all([
    redis.hgetall(key),
    redis.ttl(key),
  ]);

  if (!session || Object.keys(session).length === 0 || ttl < 0) {
    return { active: false };
  }

  const expiresAt = new Date(Date.now() + ttl * 1000);

  return {
    active: true,
    range: parseFloat(session.range),
    expiresAt: expiresAt.toISOString(),
  };
}
