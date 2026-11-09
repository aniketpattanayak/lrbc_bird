import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyWebhookSignature } from '@wsaas/meta-cloud-api';
import { createLogger } from '@wsaas/logger';
import * as metaWebhookService from './metaWebhook.service';

const logger = createLogger({ name: 'api:meta-webhook-routes' });

export async function metaWebhookRoutes(app: FastifyInstance): Promise<void> {
  // Meta calls this endpoint directly — no Authorization header, no cookie.
  // It's authenticated instead by: (1) the GET handshake's verify_token,
  // and (2) the POST payload's HMAC-SHA256 signature. This plugin registers
  // its own content-type parser (Fastify encapsulates parsers per-plugin)
  // so the POST handler gets the exact raw body bytes signature
  // verification needs — the default JSON parser would otherwise consume
  // and re-serialize the body, breaking the signature check.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    done(null, body);
  });

  app.get(
    '/webhook',
    { schema: { tags: ['Meta Webhook'], summary: 'Meta webhook verification handshake' } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as Record<string, string>;
      const mode = query['hub.mode'];
      const token = query['hub.verify_token'];
      const challenge = query['hub.challenge'];

      if (mode !== 'subscribe' || !token) {
        return reply.status(400).send('Bad request');
      }

      const instance = await metaWebhookService.findInstanceByVerifyToken(token);
      if (!instance) {
        logger.warn('Meta webhook verification failed — no instance matches the given verify token');
        return reply.status(403).send('Verification token mismatch');
      }

      logger.info({ instanceId: instance.id }, 'Meta webhook verified');
      return reply.status(200).send(challenge);
    },
  );

  app.post(
    '/webhook',
    { schema: { tags: ['Meta Webhook'], summary: 'Meta webhook event delivery' } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const rawBody = request.body as unknown as string;
      const signatureHeader = request.headers['x-hub-signature-256'] as string | undefined;

      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(rawBody);
      } catch {
        return reply.status(400).send({ success: false, error: { code: 'INVALID_BODY', message: 'Body is not valid JSON' } });
      }

      // Identify which instance this payload belongs to so we can verify
      // against *that* instance's own App Secret (each tenant may use their
      // own Meta app).
      const phoneNumberId = (parsedBody as any)?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
      const appSecret = phoneNumberId ? await metaWebhookService.getAppSecretForPhoneNumber(phoneNumberId) : null;

      if (!appSecret) {
        logger.warn({ phoneNumberId }, 'Meta webhook payload for unknown/unconfigured phoneNumberId — rejecting');
        return reply.status(404).send();
      }

      if (!verifyWebhookSignature(appSecret, rawBody, signatureHeader)) {
        logger.warn({ phoneNumberId }, 'Meta webhook signature verification failed');
        return reply.status(401).send();
      }

      // Meta requires a fast 200 OK — process and respond immediately,
      // don't make Meta wait on our downstream webhook delivery.
      reply.status(200).send('EVENT_RECEIVED');

      try {
        await metaWebhookService.processWebhookPayload(parsedBody);
      } catch (err) {
        logger.error({ err }, 'Failed to process Meta webhook payload');
      }
    },
  );
}
