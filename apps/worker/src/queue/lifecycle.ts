/**
 * Session Lifecycle Queue Consumer
 *
 * Processes START_SESSION / STOP_SESSION / RESTART_SESSION jobs
 * sent by the API when instances are created or controlled.
 */

import { Worker, type Job, type ConnectionOptions } from 'bullmq';
import { QUEUE_NAMES, JOB_NAMES } from '@wsaas/types';
import { createLogger } from '@wsaas/logger';
import type { SessionManager } from '../session/SessionManager';

const logger = createLogger({ name: 'lifecycle-consumer' });

function getConnection(): ConnectionOptions {
  const url = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
  const password = process.env['REDIS_PASSWORD'] || undefined;

  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port || '6379', 10),
      password: parsed.password || password || undefined,
      tls: parsed.protocol === 'rediss:' ? {} : undefined,
      maxRetriesPerRequest: null,
    };
  } catch {
    return { host: 'localhost', port: 6379, password, maxRetriesPerRequest: null };
  }
}

interface SessionJobData {
  instanceId: string;
  tenantId: string;
}

export function startLifecycleConsumer(sessionManager: SessionManager): void {
  const connection = getConnection();

  logger.info('Starting session lifecycle consumer...');

  const worker = new Worker(
    QUEUE_NAMES.SESSION_LIFECYCLE,
    async (job: Job) => {
      const data = job.data as SessionJobData;
      logger.info({ jobId: job.id, jobName: job.name, instanceId: data.instanceId }, 'Lifecycle job');

      switch (job.name) {
        case JOB_NAMES.START_SESSION:
          logger.info({ instanceId: data.instanceId }, 'Starting session for new instance');
          await sessionManager.startSession(data.instanceId, data.tenantId);
          break;

        case JOB_NAMES.STOP_SESSION:
          logger.info({ instanceId: data.instanceId }, 'Stopping session');
          await sessionManager.stopSession(data.instanceId);
          break;

        case JOB_NAMES.RESTART_SESSION:
          logger.info({ instanceId: data.instanceId }, 'Restarting session');
          await sessionManager.stopSession(data.instanceId);
          await new Promise((r) => setTimeout(r, 1000));
          await sessionManager.startSession(data.instanceId, data.tenantId);
          break;

        default:
          logger.warn({ jobName: job.name }, 'Unknown lifecycle job, skipping');
      }
    },
    { connection, concurrency: 3 },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Lifecycle job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Lifecycle job failed');
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Lifecycle worker error');
  });

  logger.info('Session lifecycle consumer started');
}
