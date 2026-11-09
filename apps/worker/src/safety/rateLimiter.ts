/**
 * Per-instance send pacing.
 *
 * WhatsApp aggressively bans numbers that send messages too quickly or too
 * mechanically. Every outbound send should go through `waitForSendSlot`,
 * which enforces:
 *   1. A hard cap on messages/minute per instance (ban protection)
 *   2. A randomized human-like delay between consecutive sends
 *      (base `messageDelayMs` +/- `messageDelayJitter`, from Instance config)
 */
import { getRedis } from '@wsaas/redis';
import { REDIS_KEYS } from '@wsaas/types';
import { createLogger } from '@wsaas/logger';

const logger = createLogger({ name: 'worker:ratelimiter' });

const MAX_MESSAGES_PER_MINUTE = parseInt(process.env['MAX_MESSAGES_PER_MINUTE'] ?? '20', 10);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Blocks until it's safe to send the next message for this instance.
 * Combines a sliding per-minute cap with a jittered minimum delay.
 */
export async function waitForSendSlot(
  instanceId: string,
  opts: { messageDelayMs?: number; messageDelayJitter?: number } = {},
): Promise<void> {
  const redis = getRedis();
  const rateKey = REDIS_KEYS.MESSAGE_RATE(instanceId);

  // Sliding window cap: increment a counter that expires after 60s.
  const count = await redis.incr(rateKey);
  if (count === 1) {
    await redis.expire(rateKey, 60);
  }

  if (count > MAX_MESSAGES_PER_MINUTE) {
    const ttl = await redis.ttl(rateKey);
    const waitMs = Math.max(ttl, 1) * 1000;
    logger.warn({ instanceId, count, waitMs }, 'Instance hit per-minute send cap, throttling');
    await sleep(waitMs);
  }

  // Human-like jittered delay between sends.
  const baseDelay = opts.messageDelayMs ?? 1000;
  const jitter = opts.messageDelayJitter ?? 300;
  const delay = baseDelay + Math.floor(Math.random() * jitter * 2) - jitter;
  await sleep(Math.max(delay, 0));
}
