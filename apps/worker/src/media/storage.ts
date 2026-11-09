/**
 * Media storage (Cloudflare R2 / S3-compatible, works with local MinIO too)
 */
import AWS from 'aws-sdk';
import { getConfig } from '@wsaas/config';
import { createLogger } from '@wsaas/logger';

const logger = createLogger({ name: 'worker:storage' });

let s3Client: AWS.S3 | null = null;

function getClient(): AWS.S3 {
  if (s3Client) return s3Client;

  const config = getConfig();
  const endpoint =
    config.R2_ENDPOINT ??
    (config.R2_ACCOUNT_ID ? `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined);

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

export interface UploadResult {
  storageKey: string;
  storageUrl: string;
}

/**
 * Uploads a buffer to the media bucket and returns the storage key + public URL.
 */
export async function uploadMediaBuffer(
  buffer: Buffer,
  opts: { tenantId: string; instanceId: string; mimeType: string; extension?: string },
): Promise<UploadResult> {
  const config = getConfig();
  const bucket = config.R2_BUCKET_MEDIA;

  const ext = opts.extension ?? inferExtension(opts.mimeType);
  const storageKey = `${opts.tenantId}/${opts.instanceId}/${Date.now()}-${randomSuffix()}${ext ? `.${ext}` : ''}`;

  try {
    await getClient()
      .putObject({
        Bucket: bucket,
        Key: storageKey,
        Body: buffer,
        ContentType: opts.mimeType,
      })
      .promise();
  } catch (err) {
    logger.error({ err, storageKey }, 'Failed to upload media to storage');
    throw err;
  }

  const base = config.R2_PUBLIC_URL ?? `${config.R2_ENDPOINT ?? ''}/${bucket}`;
  const storageUrl = `${base.replace(/\/$/, '')}/${storageKey}`;

  return { storageKey, storageUrl };
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

function inferExtension(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'application/pdf': 'pdf',
  };
  return map[mimeType] ?? 'bin';
}
