/**
 * Emits a webhook event: persists a WebhookEvent row (the audit trail) and
 * enqueues a delivery job for the dispatcher, but only if the tenant's
 * instance has a webhook configured and subscribed to that event type.
 */
import { prisma } from '@wsaas/database';
import { getWebhookDeliveryQueue } from '@wsaas/queue';
import { JOB_NAMES, JOB_OPTIONS } from '@wsaas/types';
import type { WebhookEventType, WebhookDeliveryJobPayload } from '@wsaas/types';
import { createLogger } from '@wsaas/logger';

const logger = createLogger({ name: 'worker:webhook-emitter' });

export async function emitWebhookEvent(
  tenantId: string,
  instanceId: string,
  eventType: WebhookEventType,
  data: unknown,
): Promise<void> {
  try {
    const config = await prisma.webhookConfig.findUnique({ where: { instanceId } });

    // Always record the event (useful for debugging/history even with no
    // webhook configured), but only enqueue delivery if it's wired up.
    const event = await prisma.webhookEvent.create({
      data: { tenantId, instanceId, eventType, payload: data as any },
    });

    if (!config || !config.isEnabled || !config.events.includes(eventType)) {
      return;
    }

    const payload: WebhookDeliveryJobPayload = {
      eventId: event.id,
      instanceId,
      tenantId,
      attemptNumber: 1,
    };

    await getWebhookDeliveryQueue().add(JOB_NAMES.DELIVER_WEBHOOK, payload, JOB_OPTIONS.WEBHOOK);
  } catch (err) {
    logger.error({ err, instanceId, eventType }, 'Failed to emit webhook event');
  }
}
