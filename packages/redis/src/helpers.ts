import type { Redis } from 'ioredis';

// ─── Typed Redis Helpers ──────────────────────────────────────────────────────

/**
 * Get a JSON value from Redis. Returns null if key doesn't exist.
 */
export async function getJson<T>(redis: Redis, key: string): Promise<T | null> {
  const value = await redis.get(key);
  if (value === null) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

/**
 * Set a JSON value in Redis with optional TTL.
 */
export async function setJson<T>(
  redis: Redis,
  key: string,
  value: T,
  ttlSeconds?: number,
): Promise<void> {
  const serialized = JSON.stringify(value);
  if (ttlSeconds) {
    await redis.set(key, serialized, 'EX', ttlSeconds);
  } else {
    await redis.set(key, serialized);
  }
}

/**
 * Set a JSON value only if the key doesn't exist (NX flag).
 * Returns true if set, false if key already existed.
 */
export async function setJsonNx<T>(
  redis: Redis,
  key: string,
  value: T,
  ttlSeconds: number,
): Promise<boolean> {
  const serialized = JSON.stringify(value);
  const result = await redis.set(key, serialized, 'EX', ttlSeconds, 'NX');
  return result === 'OK';
}

/**
 * Increment a counter and set TTL if it's new.
 * Returns the new count.
 */
export async function incrWithTtl(
  redis: Redis,
  key: string,
  ttlSeconds: number,
): Promise<number> {
  const pipeline = redis.pipeline();
  pipeline.incr(key);
  pipeline.expire(key, ttlSeconds);
  const results = await pipeline.exec();
  const incrResult = results?.[0];
  if (!incrResult || incrResult[0]) return 0;
  return incrResult[1] as number;
}

/**
 * Sliding window rate limiter.
 * Returns { allowed, count, resetAt }
 */
export async function checkRateLimit(
  redis: Redis,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; count: number; resetAt: number }> {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStart = now - windowMs;

  const pipeline = redis.pipeline();
  // Remove expired entries
  pipeline.zremrangebyscore(key, 0, windowStart);
  // Count remaining
  pipeline.zcard(key);
  // Add current request
  pipeline.zadd(key, now, `${now}-${Math.random()}`);
  // Set TTL to clean up eventually
  pipeline.expire(key, windowSeconds * 2);

  const results = await pipeline.exec();
  const count = (results?.[1]?.[1] as number) ?? 0;
  const resetAt = Math.ceil((now + windowMs) / 1000);

  return {
    allowed: count < limit,
    count,
    resetAt,
  };
}

/**
 * Publish a message to a Redis channel.
 */
export async function publish(
  redis: Redis,
  channel: string,
  data: unknown,
): Promise<void> {
  await redis.publish(channel, JSON.stringify(data));
}
