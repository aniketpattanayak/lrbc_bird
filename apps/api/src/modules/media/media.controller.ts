import type { FastifyRequest, FastifyReply } from 'fastify';
import { ValidationError } from '@wsaas/utils';
import * as mediaService from './media.service';

export async function uploadMediaController(request: FastifyRequest, reply: FastifyReply) {
  const file = await request.file();
  if (!file) {
    throw new ValidationError('No file uploaded. Send a multipart/form-data request with a single file field.');
  }

  const buffer = await file.toBuffer();
  const data = await mediaService.uploadMedia(request.tenantId, {
    buffer,
    mimetype: file.mimetype,
    filename: file.filename,
  });

  return reply.status(201).send({ success: true, requestId: request.id, data });
}

export async function listMediaController(
  request: FastifyRequest<{ Querystring: { page?: string; limit?: string; type?: string } }>,
  reply: FastifyReply,
) {
  const page = Math.max(1, parseInt(request.query.page ?? '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(request.query.limit ?? '24', 10) || 24));
  const { data, meta } = await mediaService.listMedia(request.tenantId, { page, limit, type: request.query.type });
  return reply.send({ success: true, requestId: request.id, data, meta });
}

export async function getSignedUrlController(
  request: FastifyRequest<{ Params: { mediaId: string } }>,
  reply: FastifyReply,
) {
  const data = await mediaService.getSignedUrl(request.tenantId, request.params.mediaId);
  return reply.send({ success: true, requestId: request.id, data });
}

export async function deleteMediaController(
  request: FastifyRequest<{ Params: { mediaId: string } }>,
  reply: FastifyReply,
) {
  await mediaService.deleteMedia(request.tenantId, request.params.mediaId);
  return reply.send({ success: true, requestId: request.id, data: { message: 'Media file deleted' } });
}
