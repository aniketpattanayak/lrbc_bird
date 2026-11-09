import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import * as controller from './usage.controller';

export async function usageRoutes(app: FastifyInstance): Promise<void> {
  app.get('/summary', { preHandler: [authenticate], schema: { tags: ['Usage'], summary: 'Current period usage vs plan limits', security: [{ BearerAuth: [] }] }, handler: controller.getUsageSummaryController });
  app.get('/messages', { preHandler: [authenticate], schema: { tags: ['Usage'], summary: 'Message counts over time', security: [{ BearerAuth: [] }] }, handler: controller.getMessagesTimeSeriesController });
  app.get('/by-instance', { preHandler: [authenticate], schema: { tags: ['Usage'], summary: 'Usage breakdown per instance', security: [{ BearerAuth: [] }] }, handler: controller.getUsageByInstanceController });
  app.get('/delivery-rate', { preHandler: [authenticate], schema: { tags: ['Usage'], summary: 'Delivery rate statistics', security: [{ BearerAuth: [] }] }, handler: controller.getDeliveryRateController });
}
