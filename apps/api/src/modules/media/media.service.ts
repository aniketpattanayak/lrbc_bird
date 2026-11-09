import AWS from 'aws-sdk';
import { prisma } from '@wsaas/database';
import { NotFoundError, ValidationError, InternalError } from '@wsaas/utils';
import { getConfig } from '@wsaas/config';
import { createLogger } from '@wsaas/logger';

const logger = createLogger({ name: 'api:media' });

const ALLOWED_MIME_PREFIXES = ['image/', 'video/', 'audio/', 'application/pdf', 'application/msword', 'application/vnd', 'text/plain'];
const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50MB — also enforced by @fastify/multipart config

let s3Client: AWS.S3 | null = null;

function getClient(): AWS.S3 {
  if (s3Client) return s3Client;
  const config = getConfig();
  if (!config.R2_ACCESS_KEY_ID || !config.R2_SECRET_ACCESS_KEY || !config.R2_BUCKET_MEDIA) {
    throw new InternalError('Media storage is not configured on this server (R2/S3 credentials missing)');
  }
  const endpoint = config.R2_ENDPOINT ?? (config.R2_ACCOUNT_ID ? `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined);
  s3Client = new AWS.S3({
    endpoint,
    accessKeyId: config.R2_ACCESS_KEY_ID,
    secretAccessKey: config.R2_SECRET_ACCESS_KEY,
    s3ForcePathStyle: true,
    signatureVersion: 'v4',
    region: 'auto',
  });
  return s3Client;
}

function inferType(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
}

function validateMimeType(mimeType: string): void {
  const ok = ALLOWED_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix));
  if (!ok) {
    throw new ValidationError(`File type '${mimeType}' is not supported`);
  }
}

export async function uploadMedia(
  tenantId: string,
  file: { buffer: Buffer; mimetype: string; filename: string },
): Promise<ReturnType<typeof serializeMediaFile>> {
  validateMimeType(file.mimetype);
  if (file.buffer.length > MAX_FILE_BYTES) {
    throw new ValidationError(`File exceeds maximum size of ${MAX_FILE_BYTES / 1024 / 1024}MB`);
  }

  const config = getConfig();
  const bucket = config.R2_BUCKET_MEDIA;
  const storageKey = `${tenantId}/uploads/${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${sanitizeFilename(file.filename)}`;

  await getClient()
    .putObject({ Bucket: bucket, Key: storageKey, Body: file.buffer, ContentType: file.mimetype })
    .promise();

  const base = config.R2_PUBLIC_URL ?? `${config.R2_ENDPOINT ?? ''}/${bucket}`;
  const storageUrl = `${base.replace(/\/$/, '')}/${storageKey}`;

  const mediaFile = await prisma.mediaFile.create({
    data: {
      tenantId,
      type: inferType(file.mimetype),
      originalFilename: file.filename,
      mimeType: file.mimetype,
      sizeBytes: BigInt(file.buffer.length),
      storageKey,
      storageUrl,
      isPublic: Boolean(config.R2_PUBLIC_URL),
    },
  });

  logger.info({ tenantId, mediaId: mediaFile.id, sizeBytes: file.buffer.length }, 'Media uploaded');
  return serializeMediaFile(mediaFile);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
}

function serializeMediaFile(m: Awaited<ReturnType<typeof prisma.mediaFile.findFirstOrThrow>>) {
  return { ...m, sizeBytes: Number(m.sizeBytes) };
}

export async function listMedia(
  tenantId: string,
  opts: { page: number; limit: number; type?: string },
) {
  const where = { tenantId, ...(opts.type && { type: opts.type }) };
  const [files, total] = await Promise.all([
    prisma.mediaFile.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (opts.page - 1) * opts.limit,
      take: opts.limit,
    }),
    prisma.mediaFile.count({ where }),
  ]);

  return {
    data: files.map(serializeMediaFile),
    meta: {
      page: opts.page,
      limit: opts.limit,
      total,
      hasNext: opts.page * opts.limit < total,
      hasPrev: opts.page > 1,
    },
  };
}

async function getOwnedMediaFile(tenantId: string, mediaId: string) {
  const file = await prisma.mediaFile.findUnique({ where: { id: mediaId } });
  if (!file || file.tenantId !== tenantId) {
    throw new NotFoundError('Media file', mediaId);
  }
  return file;
}

export async function getSignedUrl(tenantId: string, mediaId: string) {
  const file = await getOwnedMediaFile(tenantId, mediaId);

  if (file.isPublic) {
    return { url: file.storageUrl, expiresAt: null };
  }

  const config = getConfig();
  const expiresInSeconds = 3600;
  try {
    const url = getClient().getSignedUrl('getObject', {
      Bucket: config.R2_BUCKET_MEDIA,
      Key: file.storageKey,
      Expires: expiresInSeconds,
    });
    return { url, expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString() };
  } catch (err) {
    logger.error({ err, mediaId }, 'Failed to generate signed URL, falling back to storage URL');
    return { url: file.storageUrl, expiresAt: null };
  }
}

export async function deleteMedia(tenantId: string, mediaId: string) {
  const file = await getOwnedMediaFile(tenantId, mediaId);
  const config = getConfig();

  try {
    await getClient().deleteObject({ Bucket: config.R2_BUCKET_MEDIA, Key: file.storageKey }).promise();
  } catch (err) {
    logger.warn({ err, mediaId }, 'Failed to delete object from storage, continuing with DB delete');
  }

  await prisma.mediaFile.delete({ where: { id: mediaId } });
  logger.info({ tenantId, mediaId }, 'Media file deleted');
}
