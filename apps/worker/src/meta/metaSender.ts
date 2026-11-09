/**
 * Sends an outbound message for an Official (Meta Cloud API) instance.
 * Mirrors the shape of the Baileys send path in queue/consumer.ts but goes
 * through Meta's Graph API instead of a WhatsApp Web session.
 */
import {
  sendTextMessage,
  sendImageMessage,
  sendDocumentMessage,
  sendLocationMessage,
  MetaApiError,
} from '@wsaas/meta-cloud-api';
import type { MessageType, MessageContent } from '@wsaas/types';
import { createLogger } from '@wsaas/logger';

const logger = createLogger({ name: 'worker:meta-sender' });

interface MetaInstanceMetadata {
  connectionMode?: string;
  meta?: {
    phoneNumberId?: string;
    accessToken?: string;
    wabaId?: string;
  };
}

export async function sendViaMetaCloudApi(
  rawMetadata: unknown,
  type: MessageType,
  to: string,
  content: MessageContent,
): Promise<string> {
  const metadata = rawMetadata as MetaInstanceMetadata | null;
  const phoneNumberId = metadata?.meta?.phoneNumberId;
  const accessToken = metadata?.meta?.accessToken;

  if (!phoneNumberId || !accessToken) {
    throw new Error('Official instance is missing Meta credentials (phoneNumberId/accessToken)');
  }

  // Meta's API wants bare MSISDN digits with country code, no '+' — same
  // normalization the API layer already applies before this job is queued.
  const toNumber = to.includes('@') ? to.split('@')[0]! : to;

  try {
    let result: { messageId: string };

    if (type === 'TEXT') {
      const textContent = content as { text: string };
      result = await sendTextMessage(phoneNumberId, accessToken, toNumber, textContent.text);
    } else if (type === 'IMAGE') {
      const mediaContent = content as { mediaUrl?: string; caption?: string };
      if (!mediaContent.mediaUrl) throw new Error('mediaUrl required for IMAGE');
      result = await sendImageMessage(phoneNumberId, accessToken, toNumber, mediaContent.mediaUrl, mediaContent.caption);
    } else if (type === 'DOCUMENT') {
      const mediaContent = content as { mediaUrl?: string; caption?: string; filename?: string };
      if (!mediaContent.mediaUrl) throw new Error('mediaUrl required for DOCUMENT');
      result = await sendDocumentMessage(
        phoneNumberId,
        accessToken,
        toNumber,
        mediaContent.mediaUrl,
        mediaContent.filename,
        mediaContent.caption,
      );
    } else if (type === 'LOCATION') {
      const loc = content as { latitude: number; longitude: number; name?: string };
      result = await sendLocationMessage(phoneNumberId, accessToken, toNumber, loc.latitude, loc.longitude, loc.name);
    } else {
      throw new Error(`Message type ${type} is not yet supported for Official (Meta Cloud API) instances`);
    }

    logger.info({ phoneNumberId, toNumber, type, waMessageId: result.messageId }, 'Sent via Meta Cloud API');
    return result.messageId;
  } catch (err) {
    if (err instanceof MetaApiError) {
      logger.error(
        { phoneNumberId, toNumber, type, statusCode: err.statusCode, metaErrorCode: err.metaErrorCode, message: err.message },
        'Meta Cloud API send failed',
      );
      throw new Error(`Meta Cloud API error: ${err.message}`);
    }
    throw err;
  }
}
