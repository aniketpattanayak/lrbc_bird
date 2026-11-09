/**
 * Delivery/read receipts for messages WE sent.
 * Baileys fires `messages.update` with a `status` ack code:
 *   1 = sent (server received), 2 = delivered, 3 = read, 4 = played (voice)
 */
import type { WAMessageUpdate } from '@whiskeysockets/baileys';
import { prisma } from '@wsaas/database';
import { createLogger } from '@wsaas/logger';
import type { MessageStatusData } from '@wsaas/types';
import { emitWebhookEvent } from './webhookEmitter';

const logger = createLogger({ name: 'worker:receipt-handler' });

export async function handleMessageUpdates(
  updates: WAMessageUpdate[],
  tenantId: string,
  instanceId: string,
): Promise<void> {
  for (const update of updates) {
    const waMessageId = update.key.id;
    const ack = update.update.status;
    if (!waMessageId || ack === undefined || ack === null) continue;

    const status = ack >= 3 ? 'READ' : ack >= 2 ? 'DELIVERED' : null;
    if (!status) continue;

    try {
      const message = await prisma.message.findFirst({
        where: { whatsappMessageId: waMessageId, instanceId },
      });
      if (!message || message.direction !== 'OUTBOUND') continue;

      const now = new Date();
      await prisma.message.update({
        where: { id: message.id },
        data: {
          status,
          deliveredAt: status === 'DELIVERED' ? now : message.deliveredAt ?? now,
          readAt: status === 'READ' ? now : message.readAt,
        },
      });

      const data: MessageStatusData = {
        messageId: message.id,
        whatsappMessageId: waMessageId,
        status,
        by: update.key.remoteJid ?? '',
        at: now.toISOString(),
      };

      await emitWebhookEvent(
        tenantId,
        instanceId,
        status === 'READ' ? 'message.read' : 'message.delivered',
        data,
      );
    } catch (err) {
      logger.error({ err, waMessageId, instanceId }, 'Failed to process message status update');
    }
  }
}
