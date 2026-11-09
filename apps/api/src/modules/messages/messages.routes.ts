import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import * as controller from './messages.controller';

export async function messageRoutes(app: FastifyInstance): Promise<void> {

  // POST /v1/instances/:instanceId/messages/send/text
  app.post('/:instanceId/messages/send/text', {
    preHandler: [authenticate],
    schema: {
      tags: ['Messages'],
      summary: 'Send a text message',
      security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
      params: { type: 'object', properties: { instanceId: { type: 'string' } }, required: ['instanceId'] },
      body: { type: 'object', additionalProperties: true },
    },
    handler: controller.sendTextController,
  });

  // POST /v1/instances/:instanceId/messages/send/image
  app.post('/:instanceId/messages/send/image', {
    preHandler: [authenticate],
    schema: {
      tags: ['Messages'],
      summary: 'Send an image message',
      security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
      params: { type: 'object', properties: { instanceId: { type: 'string' } }, required: ['instanceId'] },
      body: { type: 'object', additionalProperties: true },
    },
    handler: controller.sendImageController,
  });

  // POST /v1/instances/:instanceId/messages/send/document
  app.post('/:instanceId/messages/send/document', {
    preHandler: [authenticate],
    schema: {
      tags: ['Messages'],
      summary: 'Send a document',
      security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
      params: { type: 'object', properties: { instanceId: { type: 'string' } }, required: ['instanceId'] },
      body: { type: 'object', additionalProperties: true },
    },
    handler: controller.sendDocumentController,
  });

  // POST /v1/instances/:instanceId/messages/send/location
  app.post('/:instanceId/messages/send/location', {
    preHandler: [authenticate],
    schema: {
      tags: ['Messages'],
      summary: 'Send a location',
      security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
      params: { type: 'object', properties: { instanceId: { type: 'string' } }, required: ['instanceId'] },
      body: { type: 'object', additionalProperties: true },
    },
    handler: controller.sendLocationController,
  });

  // GET /v1/instances/:instanceId/messages/:messageId
  app.get('/:instanceId/messages/:messageId', {
    preHandler: [authenticate],
    schema: {
      tags: ['Messages'],
      summary: 'Get message status',
      security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
      params: { type: 'object', properties: { instanceId: { type: 'string' }, messageId: { type: 'string' } }, required: ['instanceId', 'messageId'] },
    },
    handler: controller.getMessageStatusController,
  });
}
