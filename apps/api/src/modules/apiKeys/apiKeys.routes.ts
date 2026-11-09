import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import * as controller from './apiKeys.controller';
import { createApiKeySchema, updateApiKeySchema } from './apiKeys.schema';
import { zodToJsonSchema } from '../../utils/zodToJsonSchema';

export async function apiKeyRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', { preHandler: [authenticate], schema: { tags: ['API Keys'], summary: 'List API keys', security: [{ BearerAuth: [] }] }, handler: controller.listApiKeysController });
  app.post('/', { preHandler: [authenticate], config: { rateLimit: { max: 10, timeWindow: '1 hour' } }, schema: { tags: ['API Keys'], summary: 'Create API key', security: [{ BearerAuth: [] }], body: zodToJsonSchema(createApiKeySchema) }, handler: controller.createApiKeyController });
  app.get('/:keyId', { preHandler: [authenticate], schema: { tags: ['API Keys'], summary: 'Get API key', security: [{ BearerAuth: [] }], params: { type: 'object', properties: { keyId: { type: 'string' } }, required: ['keyId'] } }, handler: controller.getApiKeyController });
  app.patch('/:keyId', { preHandler: [authenticate], schema: { tags: ['API Keys'], summary: 'Update API key', security: [{ BearerAuth: [] }], params: { type: 'object', properties: { keyId: { type: 'string' } }, required: ['keyId'] }, body: zodToJsonSchema(updateApiKeySchema) }, handler: controller.updateApiKeyController });
  app.delete('/:keyId', { preHandler: [authenticate], schema: { tags: ['API Keys'], summary: 'Revoke API key', security: [{ BearerAuth: [] }], params: { type: 'object', properties: { keyId: { type: 'string' } }, required: ['keyId'] } }, handler: controller.revokeApiKeyController });
}
