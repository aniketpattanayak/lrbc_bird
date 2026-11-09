import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import * as controller from './messagesList.controller';

export async function messageListRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', { preHandler: [authenticate], schema: { tags: ['Messages'], summary: 'List messages across instances', security: [{ BearerAuth: [] }] }, handler: controller.listMessagesController });
  app.get('/conversation', { preHandler: [authenticate], schema: { tags: ['Messages'], summary: 'Get a conversation thread with a contact', security: [{ BearerAuth: [] }] }, handler: controller.getConversationController });
}
