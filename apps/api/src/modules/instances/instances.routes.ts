import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import * as controller from './instances.controller';
import { createInstanceSchema, updateInstanceSchema } from './instances.schema';
import { zodToJsonSchema } from '../../utils/zodToJsonSchema';

export async function instanceRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', { preHandler: [authenticate], schema: { tags: ['Instances'], summary: 'List instances', security: [{ BearerAuth: [] }] }, handler: controller.listInstancesController });
  app.post('/', { preHandler: [authenticate], schema: { tags: ['Instances'], summary: 'Create instance', security: [{ BearerAuth: [] }], body: zodToJsonSchema(createInstanceSchema) }, handler: controller.createInstanceController });
  app.get('/:instanceId', { preHandler: [authenticate], schema: { tags: ['Instances'], summary: 'Get instance', security: [{ BearerAuth: [] }], params: { type: 'object', properties: { instanceId: { type: 'string' } }, required: ['instanceId'] } }, handler: controller.getInstanceController });
  app.patch('/:instanceId', { preHandler: [authenticate], schema: { tags: ['Instances'], summary: 'Update instance', security: [{ BearerAuth: [] }], params: { type: 'object', properties: { instanceId: { type: 'string' } }, required: ['instanceId'] }, body: zodToJsonSchema(updateInstanceSchema) }, handler: controller.updateInstanceController });
  app.delete('/:instanceId', { preHandler: [authenticate], schema: { tags: ['Instances'], summary: 'Delete instance', security: [{ BearerAuth: [] }], params: { type: 'object', properties: { instanceId: { type: 'string' } }, required: ['instanceId'] } }, handler: controller.deleteInstanceController });
  app.get('/:instanceId/qr', { preHandler: [authenticate], schema: { tags: ['Instances'], summary: 'Get QR code', security: [{ BearerAuth: [] }], params: { type: 'object', properties: { instanceId: { type: 'string' } }, required: ['instanceId'] } }, handler: controller.getInstanceQrController });
}
