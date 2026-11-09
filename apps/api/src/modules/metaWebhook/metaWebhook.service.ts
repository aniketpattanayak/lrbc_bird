/**
 * Inbound handling for Meta's WhatsApp Cloud API webhooks — the Official
 * (Meta Cloud API) counterpart to the Baileys `message.handler.ts` in the
 * worker. Meta calls this directly (no auth header, no cookie), so every
 * POST is authenticated instead by its HMAC-SHA256 signature.
 */
import { prisma } from '@wsaas/database';
import { createLogger } from '@wsaas/logger';
import { getWebhookDeliveryQueue } from '@wsaas/queue';
import { JOB_NAMES, JOB_OPTIONS, type WebhookEventType } from '@wsaas/types';
import { parseWebhookPayload, type ParsedWebhookPayload } from '@wsaas/meta-cloud-api';

const logger = createLogger({ name: 'api:meta-webhook' });

interface OfficialInstanceMeta {
  phoneNumberId?: string;
  webhookVerifyToken?: string;
  appSecret?: string;
}

interface OfficialInstanceRow {
  id: string;
  tenantId: string;
  metadata: { connectionMode?: string; meta?: OfficialInstanceMeta } | null;
}

/** Scans Official instances for one whose stored verify token matches. Used
 *  for the GET handshake, where Meta gives us no other way to identify which
 *  tenant's webhook config this is — every tenant's Meta app points its
 *  webhook at this same URL but with its own chosen verify token. */
export async function findInstanceByVerifyToken(token: string): Promise<OfficialInstanceRow | null> {
  const instances = await prisma.instance.findMany({
    where: { deletedAt: null },
    select: { id: true, tenantId: true, metadata: true },
  });
  const match = (instances as OfficialInstanceRow[]).find(
    (i) => i.metadata?.connectionMode === 'OFFICIAL' && i.metadata?.meta?.webhookVerifyToken === token,
  );
  return match ?? null;
}

async function findInstanceByPhoneNumberId(phoneNumberId: string): Promise<OfficialInstanceRow | null> {
  const instances = await prisma.instance.findMany({
    where: { deletedAt: null },
    select: { id: true, tenantId: true, metadata: true },
  });
  const match = (instances as OfficialInstanceRow[]).find(
    (i) => i.metadata?.connectionMode === 'OFFICIAL' && i.metadata?.meta?.phoneNumberId === phoneNumberId,
  );
  return match ?? null;
}

export async function getAppSecretForPhoneNumber(phoneNumberId: string): Promise<string | null> {
  const instance = await findInstanceByPhoneNumberId(phoneNumberId);
  return instance?.metadata?.meta?.appSecret ?? null;
}

/** Mirrors worker's emitWebhookEvent (api and worker are separate apps, so
 *  this is intentionally a small duplicate rather than a cross-app import). */
async function emitWebhookEvent(
  tenantId: string,
  instanceId: string,
  eventType: WebhookEventType,
  data: unknown,
): Promise<void> {
  try {
    const config = await prisma.webhookConfig.findUnique({ where: { instanceId } });
    const event = await prisma.webhookEvent.create({
      data: { tenantId, instanceId, eventType, payload: data as any },
    });
    if (!config || !config.isEnabled || !config.events.includes(eventType)) return;
    await getWebhookDeliveryQueue().add(
      JOB_NAMES.DELIVER_WEBHOOK,
      { eventId: event.id, instanceId, tenantId, attemptNumber: 1 },
      JOB_OPTIONS.WEBHOOK,
    );
  } catch (err) {
    logger.error({ err, instanceId, eventType }, 'Failed to emit webhook event');
  }
}

const STATUS_TO_MESSAGE_STATUS: Record<string, 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'> = {
  sent: 'SENT',
  delivered: 'DELIVERED',
  read: 'READ',
  failed: 'FAILED',
};

export async function processWebhookPayload(body: unknown): Promise<void> {
  const parsed: ParsedWebhookPayload = parseWebhookPayload(body);

  for (const msg of parsed.messages) {
    const instance = await findInstanceByPhoneNumberId(msg.phoneNumberId);
    if (!instance) {
      logger.warn({ phoneNumberId: msg.phoneNumberId }, 'Inbound Meta message for unknown phoneNumberId — ignoring');
      continue;
    }

    const content: Record<string, unknown> =
      msg.type === 'text'
        ? { text: msg.text }
        : msg.type === 'location'
          ? { latitude: msg.latitude, longitude: msg.longitude, name: msg.locationName }
          : {
              caption: msg.mediaCaption ?? null,
              filename: msg.mediaFilename ?? null,
              mimeType: msg.mediaMimeType ?? null,
              // Media bytes aren't downloaded/stored here — this dev environment
              // has no R2/S3 credentials configured (same limitation as the
              // Baileys media path). `metaMediaId` is kept so it can be fetched
              // on demand via GET /{mediaId} with the instance's access token.
              metaMediaId: msg.mediaId ?? null,
            };

    const record = await prisma.message.create({
      data: {
        tenantId: instance.tenantId,
        instanceId: instance.id,
        whatsappMessageId: msg.waMessageId,
        direction: 'INBOUND',
        type: (msg.type.toUpperCase() as any) ?? 'UNKNOWN',
        status: 'DELIVERED',
        fromNumber: msg.from,
        content: content as any,
        isGroupMessage: false,
        deliveredAt: new Date(Number(msg.timestamp) * 1000 || Date.now()),
      },
    });

    logger.info({ instanceId: instance.id, messageId: record.id, type: msg.type }, 'Inbound Meta message stored');

    await emitWebhookEvent(instance.tenantId, instance.id, 'message.received', {
      messageId: record.id,
      from: msg.from,
      fromName: msg.contactsPushName ?? null,
      to: msg.phoneNumberId,
      type: msg.type,
      timestamp: new Date().toISOString(),
      isGroup: false,
      content,
    });
  }

  for (const status of parsed.statuses) {
    const instance = await findInstanceByPhoneNumberId(status.phoneNumberId);
    if (!instance) continue;

    const mapped = STATUS_TO_MESSAGE_STATUS[status.status];
    if (!mapped) continue;

    const existing = await prisma.message.findFirst({ where: { whatsappMessageId: status.waMessageId } });
    if (existing) {
      await prisma.message.update({
        where: { id: existing.id },
        data: {
          status: mapped,
          ...(mapped === 'DELIVERED' && { deliveredAt: new Date() }),
          ...(mapped === 'READ' && { readAt: new Date() }),
          ...(mapped === 'FAILED' && { failedAt: new Date(), errorMessage: status.errorMessage ?? null }),
        },
      });
    }

    await emitWebhookEvent(
      instance.tenantId,
      instance.id,
      mapped === 'FAILED' ? 'message.failed' : 'message.sent',
      {
        messageId: existing?.id ?? null,
        whatsappMessageId: status.waMessageId,
        status: mapped,
        by: 'meta',
        at: new Date().toISOString(),
      },
    );
  }
}
