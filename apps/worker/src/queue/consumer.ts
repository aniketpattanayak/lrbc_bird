import { QueueWorker, type Job } from '@wsaas/queue';
import { QUEUE_NAMES, JOB_NAMES, type SendMessageJobPayload } from '@wsaas/types';
import { prisma } from '@wsaas/database';
import { createLogger } from '@wsaas/logger';
import type { SessionManager } from '../session/SessionManager';
import { waitForSendSlot } from '../safety/rateLimiter';
import { emitWebhookEvent } from '../handlers/webhookEmitter';
import type { MessageStatusData } from '@wsaas/types';
import { sendViaMetaCloudApi } from '../meta/metaSender';
import { hasSufficientBalance, debitWalletForMessage } from '@wsaas/database';
import { getMessageCostPaise, type MetaMessageCategory } from '@wsaas/utils';

const logger = createLogger({ name: 'worker:consumer' });

function getConnection() {
  const url = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
  const password = process.env['REDIS_PASSWORD'] || undefined;
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port || '6379', 10),
      password: parsed.password || password,
      tls: parsed.protocol === 'rediss:' ? {} : undefined,
      maxRetriesPerRequest: null as null,
    };
  } catch {
    return { host: 'localhost', port: 6379, password, maxRetriesPerRequest: null as null };
  }
}

export function startQueueConsumer(sessionManager: SessionManager): void {
  const connection = getConnection();

  const worker = new QueueWorker(
    QUEUE_NAMES.MESSAGE_OUTBOUND,
    async (job: Job<SendMessageJobPayload>) => {
      const { instanceId, messageId, type, to, content, tenantId } = job.data;

      logger.info({ jobId: job.id, instanceId, messageId, type }, 'Processing send job');

      const instanceRow = await prisma.instance.findUnique({
        where: { id: instanceId },
        select: { messageDelayMs: true, messageDelayJitter: true, metadata: true },
      });

      const instanceMetadata = (instanceRow?.metadata as { connectionMode?: string; countryCode?: string } | null) ?? null;
      const isOfficial = instanceMetadata?.connectionMode === 'OFFICIAL';

      let waMessageId: string | null = null;

      // Message category drives Meta's conversation-based pricing. TEXT sends
      // from the dashboard/API default to UTILITY; template sends carry their
      // own category on `content.category` (set at template-submission time).
      const metaCategory: MetaMessageCategory = (content as { category?: MetaMessageCategory }).category ?? 'UTILITY';

      if (isOfficial) {
        // Official (Meta Cloud API) instances are billed per-conversation by
        // Meta, so every send here costs real money. Pre-check the wallet
        // BEFORE calling Meta's API — never spend money we don't have, and
        // never let a tenant's unofficial/Baileys sends (free) be blocked by
        // wallet rules that only apply to the official channel.
        const costPaise = BigInt(getMessageCostPaise(instanceMetadata?.countryCode, metaCategory));
        if (costPaise > 0n) {
          const sufficient = await hasSufficientBalance(tenantId, costPaise);
          if (!sufficient) {
            await prisma.message.update({
              where: { id: messageId },
              data: { status: 'FAILED', errorMessage: 'Insufficient wallet balance to send via official WhatsApp API', failedAt: new Date() },
            });
            logger.warn({ tenantId, instanceId, messageId, costPaise: costPaise.toString() }, 'Blocked official send — insufficient wallet balance');
            const failData: MessageStatusData = {
              messageId,
              whatsappMessageId: '',
              status: 'FAILED',
              by: 'system',
              at: new Date().toISOString(),
            };
            await emitWebhookEvent(tenantId, instanceId, 'message.failed', failData);
            return;
          }
        }

        // Official (Meta Cloud API) instances don't have a Baileys session —
        // send straight through Meta's Graph API using the stored credentials.
        waMessageId = await sendViaMetaCloudApi(instanceRow!.metadata, type, to, content);

        // Only charge once Meta has actually accepted the message — a thrown
        // error above skips this and the job is retried/marked FAILED without
        // ever touching the wallet.
        const chargeResult = await debitWalletForMessage({
          tenantId,
          amountPaise: costPaise,
          messageId,
          description: `${type} message via Meta Cloud API (${metaCategory})`,
        });
        if (!chargeResult.success) {
          // Lost a balance race between the pre-check and now (near-simultaneous
          // sends). The message already went out via Meta, so we don't fail it —
          // we log loudly so billing/support can reconcile the shortfall.
          logger.error({ tenantId, instanceId, messageId, costPaise: costPaise.toString() }, 'Message sent via Meta but wallet debit failed — balance went negative/race lost, needs reconciliation');
        }
      } else {
        const session = sessionManager.getSession(instanceId);
        if (!session?.socket) {
          throw new Error(`Instance ${instanceId} not connected`);
        }

        await waitForSendSlot(instanceId, {
          messageDelayMs: instanceRow?.messageDelayMs,
          messageDelayJitter: instanceRow?.messageDelayJitter,
        });

        const sock = session.socket;
        const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;

        if (type === 'TEXT') {
          const textContent = content as { text: string };
          const sent = await sock.sendMessage(jid, { text: textContent.text });
          waMessageId = sent?.key?.id ?? null;
        } else if (type === 'IMAGE') {
          const mediaContent = content as { mediaUrl?: string; caption?: string };
          if (!mediaContent.mediaUrl) throw new Error('mediaUrl required for IMAGE');
          const sent = await sock.sendMessage(jid, {
            image: { url: mediaContent.mediaUrl },
            caption: mediaContent.caption,
          });
          waMessageId = sent?.key?.id ?? null;
        } else if (type === 'DOCUMENT') {
          const mediaContent = content as { mediaUrl?: string; caption?: string; filename?: string };
          if (!mediaContent.mediaUrl) throw new Error('mediaUrl required for DOCUMENT');
          const sent = await sock.sendMessage(jid, {
            document: { url: mediaContent.mediaUrl },
            caption: mediaContent.caption,
            fileName: mediaContent.filename ?? 'file',
            mimetype: 'application/octet-stream',
          });
          waMessageId = sent?.key?.id ?? null;
        } else if (type === 'LOCATION') {
          const loc = content as { latitude: number; longitude: number; name?: string };
          const sent = await sock.sendMessage(jid, {
            location: { degreesLatitude: loc.latitude, degreesLongitude: loc.longitude },
          });
          waMessageId = sent?.key?.id ?? null;
        }
      }

      await prisma.message.update({
        where: { id: messageId },
        data: { status: 'SENT', whatsappMessageId: waMessageId, sentAt: new Date() },
      });

      logger.info({ jobId: job.id, messageId, waMessageId }, 'Message sent successfully');

      const sentData: MessageStatusData = {
        messageId,
        whatsappMessageId: waMessageId ?? '',
        status: 'SENT',
        by: 'system',
        at: new Date().toISOString(),
      };
      await emitWebhookEvent(job.data.tenantId, instanceId, 'message.sent', sentData);
    },
    { connection, concurrency: 5 },
  );

  worker.on('failed', async (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Send job failed');
    if (job?.data?.messageId) {
      await prisma.message.update({
        where: { id: job.data.messageId },
        data: { status: 'FAILED', errorMessage: err.message, failedAt: new Date() },
      });

      const failData: MessageStatusData = {
        messageId: job.data.messageId,
        whatsappMessageId: '',
        status: 'FAILED',
        by: 'system',
        at: new Date().toISOString(),
      };
      await emitWebhookEvent(job.data.tenantId, job.data.instanceId, 'message.failed', failData);
    }
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Queue worker error');
  });

  logger.info('Queue consumer started');
}
