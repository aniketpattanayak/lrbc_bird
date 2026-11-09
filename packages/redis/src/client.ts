import { Redis, type RedisOptions } from 'ioredis';

import { createLogger } from '@wsaas/logger';

const logger = createLogger({ name: 'redis' });

// ─── Redis Client Factory ─────────────────────────────────────────────────────

let redisInstance: Redis | null = null;

function buildRedisOptions(overrides?: Partial<RedisOptions>): RedisOptions {
  const url = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
  const envPassword = process.env['REDIS_PASSWORD'] || undefined;

  // Parse URL — if it has a password embedded, that takes precedence
  let parsed: URL | null = null;
  try { parsed = new URL(url); } catch { /* fall through */ }

  const urlPassword = parsed?.password || undefined;
  const password = urlPassword || envPassword;

  const defaultOptions: RedisOptions = {
    // Connection
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    password,
    // Reconnect strategy
    retryStrategy(times) {
      if (times > 10) {
        logger.error('Redis: too many reconnect attempts, giving up');
        return null; // Stop retrying
      }
      const delay = Math.min(times * 200, 3000);
      logger.warn(`Redis: reconnecting in ${delay}ms (attempt ${times})`);
      return delay;
    },
    // Connection lifecycle logging
    reconnectOnError(err) {
      logger.error({ err }, 'Redis: connection error');
      return true; // Always reconnect
    },
    ...overrides,
  };

  return defaultOptions;
}

export function createRedisClient(options?: Partial<RedisOptions>): Redis {
  const url = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
  const client = new Redis(url, buildRedisOptions(options));

  client.on('connect', () => logger.info('Redis: connected'));
  client.on('ready', () => logger.info('Redis: ready'));
  client.on('error', (err) => logger.error({ err }, 'Redis: error'));
  client.on('close', () => logger.warn('Redis: connection closed'));
  client.on('reconnecting', () => logger.info('Redis: reconnecting...'));
  client.on('end', () => logger.warn('Redis: connection ended'));

  return client;
}

/**
 * Returns the singleton Redis client.
 * Creates it on first call. All apps should use this.
 */
export function getRedis(): Redis {
  if (!redisInstance) {
    redisInstance = createRedisClient();
  }
  return redisInstance;
}

/**
 * Creates a duplicate connection for pub/sub.
 * Required because a Redis connection in subscribe mode
 * cannot be used for regular commands.
 */
export function createSubscriberClient(): Redis {
  return createRedisClient({ lazyConnect: false });
}

/**
 * Creates a duplicate connection for publishing.
 * Separated for clarity.
 */
export function createPublisherClient(): Redis {
  return createRedisClient({ lazyConnect: false });
}

/**
 * Gracefully disconnect from Redis.
 * Call this in your process shutdown handler.
 */
export async function disconnectRedis(): Promise<void> {
  if (redisInstance) {
    await redisInstance.quit();
    redisInstance = null;
    logger.info('Redis: disconnected gracefully');
  }
}

export { Redis };
