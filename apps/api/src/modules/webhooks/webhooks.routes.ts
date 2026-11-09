import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import * as controller from './webhooks.controller';

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', { preHandler: [authenticate], schema: { tags: ['Webhooks'], summary: 'List webhook endpoints', security: [{ BearerAuth: [] }] }, handler: controller.listWebhooksController });
  app.post('/', { preHandler: [authenticate], schema: { tags: ['Webhooks'], summary: 'Create a webhook endpoint', security: [{ BearerAuth: [] }] }, handler: controller.createWebhookController });
  app.patch('/:configId', { preHandler: [authenticate], schema: { tags: ['Webhooks'], summary: 'Update a webhook endpoint', security: [{ BearerAuth: [] }] }, handler: controller.updateWebhookController });
  app.delete('/:configId', { preHandler: [authenticate], schema: { tags: ['Webhooks'], summary: 'Delete a webhook endpoint', security: [{ BearerAuth: [] }] }, handler: controller.deleteWebhookController });
  app.post('/:configId/rotate-secret', { preHandler: [authenticate], schema: { tags: ['Webhooks'], summary: 'Rotate signing secret', security: [{ BearerAuth: [] }] }, handler: controller.rotateSecretController });
  app.get('/:configId/deliveries', { preHandler: [authenticate], schema: { tags: ['Webhooks'], summary: 'List recent deliveries', security: [{ BearerAuth: [] }] }, handler: controller.listDeliveriesController });
  app.post('/:configId/test', { preHandler: [authenticate], config: { rateLimit: { max: 20, timeWindow: '10 minutes' } }, schema: { tags: ['Webhooks'], summary: 'Send a test delivery now', security: [{ BearerAuth: [] }] }, handler: controller.testDeliveryController });
}
