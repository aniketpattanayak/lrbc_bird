import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import * as controller from './media.controller';

export async function mediaRoutes(app: FastifyInstance): Promise<void> {
  app.post('/upload', { preHandler: [authenticate], schema: { tags: ['Media'], summary: 'Upload a media file', security: [{ BearerAuth: [] }] }, handler: controller.uploadMediaController });
  app.get('/', { preHandler: [authenticate], schema: { tags: ['Media'], summary: 'List media files', security: [{ BearerAuth: [] }] }, handler: controller.listMediaController });
  app.get('/:mediaId/signed-url', { preHandler: [authenticate], schema: { tags: ['Media'], summary: 'Get a signed URL for a media file', security: [{ BearerAuth: [] }] }, handler: controller.getSignedUrlController });
  app.delete('/:mediaId', { preHandler: [authenticate], schema: { tags: ['Media'], summary: 'Delete a media file', security: [{ BearerAuth: [] }] }, handler: controller.deleteMediaController });
}
