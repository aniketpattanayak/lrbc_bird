import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import * as controller from './templates.controller';

export async function templateRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', { preHandler: [authenticate], schema: { tags: ['Templates'], summary: 'List message templates', security: [{ BearerAuth: [] }] }, handler: controller.listTemplatesController });
  app.post('/', { preHandler: [authenticate], schema: { tags: ['Templates'], summary: 'Create a message template', security: [{ BearerAuth: [] }] }, handler: controller.createTemplateController });
  app.patch('/:templateId', { preHandler: [authenticate], schema: { tags: ['Templates'], summary: 'Update a template', security: [{ BearerAuth: [] }] }, handler: controller.updateTemplateController });
  app.delete('/:templateId', { preHandler: [authenticate], schema: { tags: ['Templates'], summary: 'Delete a template', security: [{ BearerAuth: [] }] }, handler: controller.deleteTemplateController });
  app.post('/:templateId/submit', { preHandler: [authenticate], schema: { tags: ['Templates'], summary: 'Submit a template for approval', security: [{ BearerAuth: [] }] }, handler: controller.submitTemplateController });
}
