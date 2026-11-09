import { Queue, type ConnectionOptions } from 'bullmq';
import { QUEUE_NAMES } from '@wsaas/types';

// ─── Queue Connection Setup ───────────────────────────────────────────────────

function getRedisConnection(): ConnectionOptions {
  const url = process.env['REDIS_URL'] ?? 'redis://localhost:6379';

  // Parse Redis URL for BullMQ connection options
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port || '6379', 10),
      password: parsed.password || process.env['REDIS_PASSWORD'] || undefined,
      tls: parsed.protocol === 'rediss:' ? {} : undefined,
      maxRetriesPerRequest: null, // Required for BullMQ
    };
  } catch {
    return {
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null,
    };
  }
}

// ─── Queue Registry ───────────────────────────────────────────────────────────
// All queues are defined here. Import the queue you need in your app.

let queues: Map<string, Queue> | null = null;

function getQueues(): Map<string, Queue> {
  if (queues) return queues;

  const connection = getRedisConnection();
  queues = new Map();

  // Message outbound — highest priority
  queues.set(
    QUEUE_NAMES.MESSAGE_OUTBOUND,
    new Queue(QUEUE_NAMES.MESSAGE_OUTBOUND, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 2000 },
      },
    }),
  );

  // Bulk message processing
  queues.set(
    QUEUE_NAMES.MESSAGE_BULK,
    new Queue(QUEUE_NAMES.MESSAGE_BULK, {
      connection,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    }),
  );

  // Webhook delivery — dispatcher manages retry logic internally
  queues.set(
    QUEUE_NAMES.WEBHOOK_DELIVERY,
    new Queue(QUEUE_NAMES.WEBHOOK_DELIVERY, {
      connection,
      defaultJobOptions: {
        attempts: 1, // Dispatcher handles its own retries
        removeOnComplete: { count: 5000 },
        removeOnFail: { count: 10000 },
      },
    }),
  );

  // Session lifecycle commands
  queues.set(
    QUEUE_NAMES.SESSION_LIFECYCLE,
    new Queue(QUEUE_NAMES.SESSION_LIFECYCLE, {
      connection,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 200 },
      },
    }),
  );

  // Email sending
  queues.set(
    QUEUE_NAMES.EMAIL,
    new Queue(QUEUE_NAMES.EMAIL, {
      connection,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 500 },
      },
    }),
  );

  // Usage aggregation (runs on schedule)
  queues.set(
    QUEUE_NAMES.USAGE_AGGREGATION,
    new Queue(QUEUE_NAMES.USAGE_AGGREGATION, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'fixed', delay: 30000 },
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 50 },
      },
    }),
  );

  return queues;
}

// ─── Queue Getters ────────────────────────────────────────────────────────────

export function getMessageOutboundQueue(): Queue {
  const q = getQueues().get(QUEUE_NAMES.MESSAGE_OUTBOUND);
  if (!q) throw new Error('Message outbound queue not initialized');
  return q;
}

export function getMessageBulkQueue(): Queue {
  const q = getQueues().get(QUEUE_NAMES.MESSAGE_BULK);
  if (!q) throw new Error('Message bulk queue not initialized');
  return q;
}

export function getWebhookDeliveryQueue(): Queue {
  const q = getQueues().get(QUEUE_NAMES.WEBHOOK_DELIVERY);
  if (!q) throw new Error('Webhook delivery queue not initialized');
  return q;
}

export function getSessionLifecycleQueue(): Queue {
  const q = getQueues().get(QUEUE_NAMES.SESSION_LIFECYCLE);
  if (!q) throw new Error('Session lifecycle queue not initialized');
  return q;
}

export function getEmailQueue(): Queue {
  const q = getQueues().get(QUEUE_NAMES.EMAIL);
  if (!q) throw new Error('Email queue not initialized');
  return q;
}

export function getUsageAggregationQueue(): Queue {
  const q = getQueues().get(QUEUE_NAMES.USAGE_AGGREGATION);
  if (!q) throw new Error('Usage aggregation queue not initialized');
  return q;
}

/**
 * Close all queue connections gracefully.
 * Call this in your process shutdown handler.
 */
export async function closeAllQueues(): Promise<void> {
  if (!queues) return;
  const closePromises = Array.from(queues.values()).map((q) => q.close());
  await Promise.all(closePromises);
  queues = null;
}

export { getRedisConnection };
