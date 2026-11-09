import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import * as controller from './wallet.controller';

export async function walletRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', {
    preHandler: [authenticate],
    schema: { tags: ['Wallet'], summary: 'Get current wallet balance', security: [{ BearerAuth: [] }] },
    handler: controller.getWalletController,
  });

  app.get('/transactions', {
    preHandler: [authenticate],
    schema: { tags: ['Wallet'], summary: 'List wallet transaction history', security: [{ BearerAuth: [] }] },
    handler: controller.listTransactionsController,
  });

  app.post('/topup/order', {
    preHandler: [authenticate],
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    schema: { tags: ['Wallet'], summary: 'Create a Razorpay order to top up the wallet', security: [{ BearerAuth: [] }] },
    handler: controller.createTopupOrderController,
  });

  app.post('/topup/verify', {
    preHandler: [authenticate],
    schema: { tags: ['Wallet'], summary: 'Verify a completed Razorpay payment and credit the wallet', security: [{ BearerAuth: [] }] },
    handler: controller.verifyTopupController,
  });

  // Razorpay webhook needs the raw request body to verify the HMAC signature.
  app.register(async (webhookScope) => {
    webhookScope.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
      done(null, body);
    });
    webhookScope.post('/webhook', {
      config: { rateLimit: { max: 100, timeWindow: '1 minute' } },
      schema: { tags: ['Wallet'], summary: 'Razorpay webhook receiver' },
      handler: controller.razorpayWebhookController,
    });
  });
}
