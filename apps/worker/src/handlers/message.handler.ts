/**
 * Inbound message handling.
 *
 * Baileys fires `messages.upsert` for every message the session sees,
 * including our own outgoing echoes (filtered out via `fromMe`). For each
 * genuine inbound message we:
 *   1. Parse it into our normalized MessageType/content shape
 *   2. Download + store any attached media
 *   3. Persist a Message row
 *   4. Emit a `message.received` webhook event
 */
import type { WAMessage, WASocket, proto } from '@whiskeysockets/baileys';
import { prisma } from '@wsaas/database';
import { createLogger } from '@wsaas/logger';
import type { MessageType } from '@wsaas/types';
import type { MessageReceivedData } from '@wsaas/types';
import { downloadAndStoreMedia, extractMediaMeta } from '../media/download';
import { emitWebhookEvent } from './webhookEmitter';

const logger = createLogger({ name: 'worker:message-handler' });

interface ParsedContent {
  type: MessageType;
  content: Record<string, unknown>;
}

function parseMessageContent(msg: WAMessage): ParsedContent {
  const m = msg.message;
  if (!m) return { type: 'UNKNOWN', content: {} };

  if (m.conversation) {
    return { type: 'TEXT', content: { text: m.conversation } };
  }
  if (m.extendedTextMessage) {
    return { type: 'TEXT', content: { text: m.extendedTextMessage.text ?? '' } };
  }
  if (m.imageMessage) {
    return { type: 'IMAGE', content: { caption: m.imageMessage.caption ?? null } };
  }
  if (m.videoMessage) {
    return { type: 'VIDEO', content: { caption: m.videoMessage.caption ?? null } };
  }
  if (m.audioMessage) {
    return { type: 'AUDIO', content: { ptt: m.audioMessage.ptt ?? false } };
  }
  if (m.documentMessage) {
    return {
      type: 'DOCUMENT',
      content: { filename: m.documentMessage.fileName ?? null, caption: m.documentMessage.caption ?? null },
    };
  }
  if (m.stickerMessage) {
    return { type: 'STICKER', content: {} };
  }
  if (m.locationMessage) {
    return {
      type: 'LOCATION',
      content: {
        latitude: m.locationMessage.degreesLatitude,
        longitude: m.locationMessage.degreesLongitude,
        name: m.locationMessage.name ?? null,
      },
    };
  }
  if (m.contactMessage) {
    return {
      type: 'CONTACT',
      content: { displayName: m.contactMessage.displayName ?? null, vcard: m.contactMessage.vcard ?? null },
    };
  }
  if (m.reactionMessage) {
    return {
      type: 'REACTION',
      content: {
        targetMessageId: m.reactionMessage.key?.id ?? null,
        emoji: m.reactionMessage.text ?? '',
      },
    };
  }
  if (m.pollCreationMessage) {
    return {
      type: 'POLL',
      content: {
        question: m.pollCreationMessage.name ?? '',
        options: (m.pollCreationMessage.options ?? []).map((o: any) => o.optionName),
      },
    };
  }
  if (m.buttonsResponseMessage) {
    return { type: 'BUTTONS', content: { selectedButtonId: m.buttonsResponseMessage.selectedButtonId } };
  }
  if (m.listResponseMessage) {
    return {
      type: 'LIST',
      content: { selectedRowId: m.listResponseMessage.singleSelectReply?.selectedRowId ?? null },
    };
  }

  return { type: 'UNKNOWN', content: {} };
}

function normalizeJid(jid: string | null | undefined): string | null {
  if (!jid) return null;
  return jid.split('@')[0] ?? jid;
}

export async function handleIncomingMessage(
  sock: WASocket,
  msg: WAMessage,
  tenantId: string,
  instanceId: string,
): Promise<void> {
  if (msg.key.fromMe) return;
  if (!msg.message) return; // e.g. protocol/revoke messages with no displayable content

  const remoteJid = msg.key.remoteJid ?? '';
  const isGroup = remoteJid.endsWith('@g.us');
  const fromNumber = normalizeJid(isGroup ? (msg.key.participant ?? remoteJid) : remoteJid);

  const { type, content } = parseMessageContent(msg);

  let mediaId: string | null = null;
  const mediaMeta = extractMediaMeta(msg);
  if (mediaMeta) {
    const stored = await downloadAndStoreMedia(sock, msg, tenantId, instanceId);
    mediaId = stored?.id ?? null;
  }

  try {
    const record = await prisma.message.create({
      data: {
        tenantId,
        instanceId,
        whatsappMessageId: msg.key.id ?? null,
        direction: 'INBOUND',
        type,
        status: 'DELIVERED',
        fromNumber,
        content: content as any,
        mediaId,
        isGroupMessage: isGroup,
        groupId: isGroup ? normalizeJid(remoteJid) : null,
        deliveredAt: new Date(),
      },
    });

    logger.info({ instanceId, messageId: record.id, type, isGroup }, 'Inbound message stored');

    const mediaFile = mediaId ? await prisma.mediaFile.findUnique({ where: { id: mediaId } }) : null;

    const webhookData: MessageReceivedData = {
      messageId: record.id,
      from: fromNumber ?? '',
      fromName: (msg.pushName as string | undefined) ?? null,
      to: normalizeJid(remoteJid) ?? '',
      type,
      timestamp: new Date().toISOString(),
      isGroup,
      groupId: isGroup ? normalizeJid(remoteJid) : null,
      groupName: null,
      content,
      quotedMessage: null,
      media: mediaFile
        ? {
            url: mediaFile.storageUrl,
            mimeType: mediaFile.mimeType,
            filename: mediaFile.originalFilename,
            filesize: Number(mediaFile.sizeBytes),
          }
        : null,
    };

    await emitWebhookEvent(tenantId, instanceId, 'message.received', webhookData);
  } catch (err) {
    logger.error({ err, instanceId, msgId: msg.key.id }, 'Failed to store inbound message');
  }
}
