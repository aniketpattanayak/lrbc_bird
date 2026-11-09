import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import * as controller from './billing.controller';

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  app.get('/plans', { schema: { tags: ['Billing'], summary: 'List available plans' }, handler: controller.listPlansController });

  app.get('/subscription', { preHandler: [authenticate], schema: { tags: ['Billing'], summary: 'Get current subscription', security: [{ BearerAuth: [] }] }, handler: controller.getSubscriptionController });
  app.post('/checkout', { preHandler: [authenticate], schema: { tags: ['Billing'], summary: 'Create a Stripe Checkout session', security: [{ BearerAuth: [] }] }, handler: controller.createCheckoutController });
  app.post('/portal', { preHandler: [authenticate], schema: { tags: ['Billing'], summary: 'Create a Stripe billing portal session', security: [{ BearerAuth: [] }] }, handler: controller.createPortalController });
  app.get('/invoices', { preHandler: [authenticate], schema: { tags: ['Billing'], summary: 'List invoices', security: [{ BearerAuth: [] }] }, handler: controller.listInvoicesController });

  // Stripe webhook needs the raw request body to verify the signature, so
  // this route (and only this route, scoped to this encapsulated plugin)
  // overrides JSON parsing to hand back a raw Buffer instead of a parsed object.
  app.register(async (webhookScope) => {
    webhookScope.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
      done(null, body);
    });
    webhookScope.post('/webhook', {
      config: { rateLimit: { max: 100, timeWindow: '1 minute' } },
      schema: { tags: ['Billing'], summary: 'Stripe webhook receiver' },
      handler: controller.stripeWebhookController,
    });
  });
}
