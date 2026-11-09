/**
 * Session Worker Entry Point
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { getConfig } from '@wsaas/config';
import { createLogger } from '@wsaas/logger';
import { prisma } from '@wsaas/database';
import { getRedis, disconnectRedis } from '@wsaas/redis';
import { closeAllQueues } from '@wsaas/queue';
import { SessionManager } from './session/SessionManager';
import { startQueueConsumer } from './queue/consumer';
import { startLifecycleConsumer } from './queue/lifecycle';
import { registerWorker, deregisterWorker } from './registry/workerRegistry';

const logger = createLogger({ name: 'worker' });

async function main() {
  const config = getConfig();

  logger.info(
    { workerId: config.WORKER_ID, maxSessions: config.WORKER_MAX_SESSIONS },
    'Starting session worker...',
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

  // ── Initialize session manager ──────────────────────────────────────────
  sessionManager = new SessionManager();
  await sessionManager.initialize();
  logger.info({ sessionCount: sessionManager.getSessionCount() }, 'Sessions loaded');

  // ── Register with the worker registry (DB row + Redis heartbeat) ───────
  await registerWorker(() => sessionManager!.getSessionCount());

  // ── Start queue consumers ───────────────────────────────────────────────
  startQueueConsumer(sessionManager);
  startLifecycleConsumer(sessionManager);

  logger.info(`✅ Worker ${config.WORKER_ID} ready`);

  // Keep process alive
  await new Promise<void>((resolve) => {
    process.on('SIGTERM', resolve);
    process.on('SIGINT', resolve);
  });
}

// ── Graceful Shutdown ────────────────────────────────────────────────────────
let isShuttingDown = false;
let sessionManager: SessionManager | null = null;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal }, 'Worker graceful shutdown initiated...');

  try {
    if (sessionManager) await sessionManager.drainAll();
    await deregisterWorker();
    await closeAllQueues();
    await Promise.all([prisma.$disconnect(), disconnectRedis()]);
    logger.info('Worker shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error during worker shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  const r = reason; console.error('REJECTION DETAIL:', typeof r, r instanceof Error ? r.stack : JSON.stringify(r, Object.getOwnPropertyNames(r))); logger.error({ reason }, 'Worker: unhandled promise rejection');
  if (process.env['NODE_ENV'] === 'development') process.exit(1);
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Worker: uncaught exception');
  process.exit(1);
});

void main();
