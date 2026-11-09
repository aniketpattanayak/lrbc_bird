/**
 * Webhook Dispatcher Entry Point
 *
 * Consumes webhook delivery jobs from the queue and POSTs them
 * to tenant webhook endpoints with HMAC signing and retry logic.
 *
 * Runs as a separate process from the API and worker for independent scaling.
 * A busy webhook dispatch should not slow down message processing.
 */

import { getConfig } from '@wsaas/config';
import { createLogger } from '@wsaas/logger';
import { prisma } from '@wsaas/database';
import { getRedis, disconnectRedis } from '@wsaas/redis';
import { closeAllQueues } from '@wsaas/queue';
import { startWebhookProcessor, stopWebhookProcessor } from './processors/webhookProcessor';

const logger = createLogger({ name: 'dispatcher' });

async function main() {
  const config = getConfig();

  logger.info(
    {
      concurrency: config.DISPATCHER_CONCURRENCY,
      timeoutMs: config.DISPATCHER_DEFAULT_TIMEOUT_MS,
      maxRetries: config.DISPATCHER_MAX_RETRIES,
    },
    'Starting webhook dispatcher...',
  );

  // ── Connect to database ──────────────────────────────────────────────────
  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.info('Database connected');
  } catch (err) {
    logger.fatal({ err }, 'Failed to connect to database. Exiting.');
    process.exit(1);
  }

  // ── Connect to Redis ─────────────────────────────────────────────────────
  try {
    const redis = getRedis();
    await redis.connect();
    await redis.ping();
    logger.info('Redis connected');
  } catch (err) {
    logger.fatal({ err }, 'Failed to connect to Redis. Exiting.');
    process.exit(1);
  }

  // ── Start webhook delivery processor ──────────────────────────────────────
  await startWebhookProcessor();

  logger.info('✅ Dispatcher ready');

  // Keep process alive
  await new Promise<void>((resolve) => {
    process.on('SIGTERM', resolve);
    process.on('SIGINT', resolve);
  });
}

// ── Graceful Shutdown ────────────────────────────────────────────────────────
let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal }, 'Dispatcher graceful shutdown initiated...');

  try {
    // Stop accepting new delivery jobs; in-flight deliveries finish first
    await stopWebhookProcessor();

    await closeAllQueues();
    await Promise.all([prisma.$disconnect(), disconnectRedis()]);

    logger.info('Dispatcher shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error during dispatcher shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Dispatcher: unhandled promise rejection');
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Dispatcher: uncaught exception');
  process.exit(1);
});

void main();
