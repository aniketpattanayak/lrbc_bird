/**
 * Downloads inbound media (image/video/audio/document/sticker) from Baileys,
 * uploads it to object storage, and records it as a MediaFile.
 */
import { downloadMediaMessage, type WAMessage, type WASocket } from '@whiskeysockets/baileys';
import { prisma } from '@wsaas/database';
import { createLogger } from '@wsaas/logger';
import type { MediaFile } from '@prisma/client';
import { uploadMediaBuffer } from './storage';

const logger = createLogger({ name: 'worker:media' });

export interface InboundMediaMeta {
  type: 'image' | 'video' | 'audio' | 'document' | 'sticker';
  mimeType: string;
  filename?: string | null;
  caption?: string | null;
  sizeBytes?: number | null;
}

/**
 * Extracts the media metadata (without downloading) from a Baileys message,
 * or null if the message has no media payload.
 */
export function extractMediaMeta(msg: WAMessage): InboundMediaMeta | null {
  const m = msg.message;
  if (!m) return null;

  if (m.imageMessage) {
    return {
      type: 'image',
      mimeType: m.imageMessage.mimetype ?? 'image/jpeg',
      caption: m.imageMessage.caption,
      sizeBytes: Number(m.imageMessage.fileLength ?? 0),
    };
  }
  if (m.videoMessage) {
    return {
      type: 'video',
      mimeType: m.videoMessage.mimetype ?? 'video/mp4',
      caption: m.videoMessage.caption,
      sizeBytes: Number(m.videoMessage.fileLength ?? 0),
    };
  }
  if (m.audioMessage) {
    return {
      type: 'audio',
      mimeType: m.audioMessage.mimetype ?? 'audio/ogg',
      sizeBytes: Number(m.audioMessage.fileLength ?? 0),
    };
  }
  if (m.documentMessage) {
    return {
      type: 'document',
      mimeType: m.documentMessage.mimetype ?? 'application/octet-stream',
      filename: m.documentMessage.fileName,
      caption: m.documentMessage.caption,
      sizeBytes: Number(m.documentMessage.fileLength ?? 0),
    };
  }
  if (m.stickerMessage) {
    return {
      type: 'sticker',
      mimeType: m.stickerMessage.mimetype ?? 'image/webp',
      sizeBytes: Number(m.stickerMessage.fileLength ?? 0),
    };
  }
  return null;
}

/**
 * Downloads the media bytes for an inbound message, stores them, and
 * persists a MediaFile row. Returns null if the message has no media
 * or the download fails (download failures are logged, not thrown —
 * we still want the text/metadata portion of the message to be saved).
 */
export async function downloadAndStoreMedia(
  sock: WASocket,
  msg: WAMessage,
  tenantId: string,
  instanceId: string,
): Promise<MediaFile | null> {
  const meta = extractMediaMeta(msg);
  if (!meta) return null;

  try {
    const buffer = (await downloadMediaMessage(
      msg,
      'buffer',
      {},
      { logger: logger as any, reuploadRequest: sock.updateMediaMessage },
    )) as Buffer;

    const { storageKey, storageUrl } = await uploadMediaBuffer(buffer, {
      tenantId,
      instanceId,
      mimeType: meta.mimeType,
    });

    const mediaFile = await prisma.mediaFile.create({
      data: {
        tenantId,
        instanceId,
        type: meta.type,
        originalFilename: meta.filename ?? null,
        mimeType: meta.mimeType,
        sizeBytes: BigInt(meta.sizeBytes ?? buffer.length),
        storageKey,
        storageUrl,
        isPublic: false,
      },
    });

    return mediaFile;
  } catch (err) {
    logger.error({ err, instanceId, msgId: msg.key.id }, 'Failed to download/store inbound media');
    return null;
  }
}
