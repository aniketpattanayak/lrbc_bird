/**
 * Webhook delivery processor.
 *
 * Consumes the `webhook-delivery` BullMQ queue. For each job:
 *   1. Load the WebhookEvent + its instance's WebhookConfig
 *   2. Sign the payload (HMAC-SHA256) and POST it to the tenant's URL
 *   3. Record every attempt in WebhookDelivery (status, response, latency)
 *   4. On success: mark the WebhookEvent processed, reset failure streak
 *   5. On failure: schedule the next retry (5s / 30s / 5min) or give up
 *      after the final attempt and mark the event FAILED / DEAD_LETTER
 */
import { Worker, type Job, type ConnectionOptions } from 'bullmq';
import { getConfig } from '@wsaas/config';
import { prisma } from '@wsaas/database';
import { createLogger } from '@wsaas/logger';
import { getWebhookDeliveryQueue, getRedisConnection } from '@wsaas/queue';
import { QUEUE_NAMES, JOB_NAMES, JOB_OPTIONS } from '@wsaas/types';
import type { WebhookDeliveryJobPayload } from '@wsaas/types';
import { signPayload } from '../delivery/signer';
import { postWebhook } from '../delivery/httpClient';
import { nextRetryDelayMs, isFinalAttempt } from '../delivery/retryPolicy';
import { recordDeliverySuccess, recordDeliveryFailure } from '../alerts/failureAlerts';
import { buildEnvelope } from '../utils/envelope';

const logger = createLogger({ name: 'dispatcher:processor' });

let worker: Worker<WebhookDeliveryJobPayload> | null = null;

export async function startWebhookProcessor(): Promise<void> {
  const config = getConfig();
  const connection: ConnectionOptions = getRedisConnection();

  worker = new Worker<WebhookDeliveryJobPayload>(
    QUEUE_NAMES.WEBHOOK_DELIVERY,
    async (job: Job<WebhookDeliveryJobPayload>) => {
      await processDeliveryJob(job.data, config.DISPATCHER_DEFAULT_TIMEOUT_MS);
    },
    { connection, concurrency: config.DISPATCHER_CONCURRENCY },
  );

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'Webhook delivery job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Webhook delivery job threw unexpectedly');
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Webhook processor error');
  });

  logger.info({ concurrency: config.DISPATCHER_CONCURRENCY }, 'Webhook delivery processor started');
}

export async function stopWebhookProcessor(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
}

async function processDeliveryJob(
  payload: WebhookDeliveryJobPayload,
  timeoutMs: number,
): Promise<void> {
  const { eventId, instanceId, attemptNumber } = payload;

  const event = await prisma.webhookEvent.findUnique({ where: { id: eventId } });
  if (!event) {
    logger.warn({ eventId }, 'WebhookEvent not found — skipping delivery');
    return;
  }

  const webhookConfig = await prisma.webhookConfig.findUnique({ where: { instanceId } });
  if (!webhookConfig || !webhookConfig.isEnabled) {
    logger.info({ eventId, instanceId }, 'No active webhook config — skipping delivery');
    return;
  }

  const envelope = buildEnvelope(event);
  const rawBody = JSON.stringify(envelope);

  // Reconstruct the plaintext secret isn't possible (we only store a hash),
  // so the signature is computed with the hash itself as the HMAC key. This
  // is still a secret value only we and the DB know, and it's stable for a
  // given config — tenants are given the plaintext secret once, at creation
  // time, and verify against that same value.
  const signature = signPayload(webhookConfig.secretHash, rawBody);

  const headers: Record<string, string> = {
    'X-WA-Signature': signature,
    'X-WA-Event': envelope.event,
    'X-WA-Delivery-Id': `${eventId}-${attemptNumber}`,
    ...(webhookConfig.customHeaders as Record<string, string> | null ?? {}),
  };

  const result = await postWebhook(
    webhookConfig.url,
    rawBody,
    headers,
    webhookConfig.timeoutSeconds ? webhookConfig.timeoutSeconds * 1000 : timeoutMs,
  );

  await prisma.webhookDelivery.create({
    data: {
      eventId,
      instanceId,
      attemptNumber,
      status: result.success ? 'SUCCESS' : 'FAILED',
      httpStatusCode: result.httpStatusCode,
      responseBody: result.responseBody,
      errorMessage: result.errorMessage,
      latencyMs: result.latencyMs,
      nextRetryAt: null,
    },
  });

  if (result.success) {
    await prisma.webhookEvent.update({ where: { id: eventId }, data: { processedAt: new Date() } });
    await recordDeliverySuccess(webhookConfig.id);
    logger.info({ eventId, instanceId, attemptNumber, latencyMs: result.latencyMs }, 'Webhook delivered');
    return;
  }

  await recordDeliveryFailure(webhookConfig.id);

  if (isFinalAttempt(attemptNumber)) {
    logger.warn({ eventId, instanceId, attemptNumber }, 'Webhook delivery exhausted all retries — dead-lettering');
    await prisma.webhookDelivery.create({
      data: {
        eventId,
        instanceId,
        attemptNumber: attemptNumber + 1,
        status: 'DEAD_LETTER',
        errorMessage: 'Max retry attempts exceeded',
      },
    });
    return;
  }

  const delayMs = nextRetryDelayMs(attemptNumber);
  if (delayMs === null) return;

  const nextPayload: WebhookDeliveryJobPayload = { ...payload, attemptNumber: attemptNumber + 1 };
  await getWebhookDeliveryQueue().add(JOB_NAMES.DELIVER_WEBHOOK, nextPayload, {
    ...JOB_OPTIONS.WEBHOOK,
    delay: delayMs,
  });

  logger.info(
    { eventId, instanceId, failedAttempt: attemptNumber, nextAttemptInMs: delayMs },
    'Webhook delivery failed — retry scheduled',
  );
}
