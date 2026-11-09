import type { WebhookEventType, WebhookEventEnvelope } from '@wsaas/types';

/**
 * Wraps a stored WebhookEvent row into the envelope format we promise
 * tenants in the API docs: { id, apiVersion, event, instanceId, timestamp, data }.
 */
export function buildEnvelope(event: {
  id: string;
  eventType: string;
  instanceId: string;
  payload: unknown;
  createdAt: Date;
}): WebhookEventEnvelope {
  return {
    id: event.id,
    apiVersion: '2025-01',
    event: event.eventType as WebhookEventType,
    instanceId: event.instanceId,
    timestamp: event.createdAt.toISOString(),
    data: event.payload as Record<string, unknown>,
  };
}
