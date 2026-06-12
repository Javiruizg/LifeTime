import rateLimit from 'express-rate-limit';
import redis from '../lib/redis';

// ── HTTP API rate limiter ─────────────────────────────────────────────────
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // 100 requests por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  skip: (req) => {
    // No rate-limitar health checks o tests
    if (req.path === '/health') return true;
    if (process.env.NODE_ENV === 'test') return true;
    return false;
  },
});

// ── WebSocket rate limiter (Redis-based) ──────────────────────────────────

export type WsEventType = 'connection' | 'chatSend' | 'locationUpdate' | 'chatJoinLeave';

const WS_LIMITS: Record<WsEventType, { max: number; windowMs: number }> = {
  connection: { max: 10, windowMs: 60000 },  // 10 conexiones / 60s
  chatSend: { max: 30, windowMs: 60000 },   // 30 mensajes / minuto
  locationUpdate: { max: 60, windowMs: 60000 }, // 60 updates / minuto
  chatJoinLeave: { max: 20, windowMs: 60000 },  // 20 join/leave / minuto
};

/**
 * Check if a user is within the rate limit for a specific WebSocket event.
 * @returns true if allowed, false if rate limit exceeded
 */
export async function checkWsRateLimit(
  event: WsEventType,
  userId: number
): Promise<boolean> {
  const config = WS_LIMITS[event];
  const key = `ratelimit:ws:${event}:${userId}`;

  const current = await redis.incr(key);

  if (current === 1) {
    await redis.expire(key, Math.ceil(config.windowMs / 1000));
  }

  return current <= config.max;
}

/**
 * Check if a connection from an IP is within the rate limit.
 * Used during the Socket.IO handshake.
 */
export async function checkWsConnectionRateLimit(ip: string): Promise<boolean> {
  const config = WS_LIMITS.connection;
  const key = `ratelimit:ws:connection:${ip}`;

  const current = await redis.incr(key);

  if (current === 1) {
    await redis.expire(key, Math.ceil(config.windowMs / 1000));
  }

  return current <= config.max;
}
