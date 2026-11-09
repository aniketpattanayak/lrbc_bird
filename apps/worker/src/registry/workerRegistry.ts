/**
 * Worker registry.
 *
 * Keeps the `Worker` DB row and a Redis heartbeat key up to date so the API
 * (and other workers) know this worker is alive, how many sessions it's
 * carrying, and can route lifecycle commands to it.
 */
import * as os from 'os';
import { prisma } from '@wsaas/database';
import { getRedis } from '@wsaas/redis';
import { REDIS_KEYS } from '@wsaas/types';
import { getConfig } from '@wsaas/config';
import { createLogger } from '@wsaas/logger';

const logger = createLogger({ name: 'worker:registry' });

let heartbeatTimer: NodeJS.Timeout | null = null;

function memoryUsedMb(): number {
  return Math.round(process.memoryUsage().rss / 1024 / 1024);
}

export async function registerWorker(getSessionCount: () => number): Promise<void> {
  const config = getConfig();
  const workerId = config.WORKER_ID;

  await upsertWorkerRow(getSessionCount);

  heartbeatTimer = setInterval(() => {
    void upsertWorkerRow(getSessionCount).catch((err) =>
      logger.error({ err }, 'Worker heartbeat failed'),
    );
  }, config.WORKER_HEARTBEAT_INTERVAL_MS);

  logger.info({ workerId }, 'Worker registered, heartbeat started');
}

async function upsertWorkerRow(getSessionCount: () => number): Promise<void> {
  const config = getConfig();
  const workerId = config.WORKER_ID;
  const sessionCount = getSessionCount();
  const now = new Date();

  const info = {
    id: workerId,
    hostname: os.hostname(),
    ipAddress: '0.0.0.0',
    port: config.WORKER_PORT,
    status: 'running',
    sessionCount,
    maxSessions: config.WORKER_MAX_SESSIONS,
    memoryUsedMb: memoryUsedMb(),
    memoryLimitMb: config.WORKER_MEMORY_LIMIT_MB,
    cpuPercent: 0,
    version: process.env['npm_package_version'] ?? '0.0.0',
    lastHeartbeatAt: now,
  };

  await prisma.worker.upsert({
    where: { id: workerId },
    create: info,
    update: {
      status: info.status,
      sessionCount: info.sessionCount,
      memoryUsedMb: info.memoryUsedMb,
      lastHeartbeatAt: info.lastHeartbeatAt,
    },
  });

  const redis = getRedis();
  await redis.setex(REDIS_KEYS.WORKER_INFO(workerId), 30, JSON.stringify(info));
  await redis.setex(REDIS_KEYS.WORKER_HEARTBEAT(workerId), 30, now.toISOString());
  await redis.sadd(REDIS_KEYS.ALL_WORKERS(), workerId);
}

export async function deregisterWorker(): Promise<void> {
  const config = getConfig();
  const workerId = config.WORKER_ID;

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  try {
    await prisma.worker.update({ where: { id: workerId }, data: { status: 'stopped' } });
    const redis = getRedis();
    await redis.del(REDIS_KEYS.WORKER_HEARTBEAT(workerId));
    await redis.srem(REDIS_KEYS.ALL_WORKERS(), workerId);
  } catch (err) {
    logger.error({ err }, 'Failed to deregister worker cleanly');
  }

  logger.info({ workerId }, 'Worker deregistered');
}
