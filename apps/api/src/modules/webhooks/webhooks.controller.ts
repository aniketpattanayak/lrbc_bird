import type { FastifyRequest, FastifyReply } from 'fastify';
import { validateBody } from '../../utils/zodToJsonSchema';
import { createWebhookSchema, updateWebhookSchema } from './webhooks.schema';
import * as webhooksService from './webhooks.service';

export async function listWebhooksController(request: FastifyRequest, reply: FastifyReply) {
  const data = await webhooksService.listWebhooks(request.tenantId);
  return reply.send({ success: true, requestId: request.id, data });
}

export async function createWebhookController(request: FastifyRequest, reply: FastifyReply) {
  const body = validateBody(createWebhookSchema, request.body);
  const data = await webhooksService.createWebhook(request.tenantId, body);
  return reply.status(201).send({ success: true, requestId: request.id, data });
}

export async function updateWebhookController(
  request: FastifyRequest<{ Params: { configId: string } }>,
  reply: FastifyReply,
) {
  const body = validateBody(updateWebhookSchema, request.body);
  const data = await webhooksService.updateWebhook(request.tenantId, request.params.configId, body);
  return reply.send({ success: true, requestId: request.id, data });
}

export async function deleteWebhookController(
  request: FastifyRequest<{ Params: { configId: string } }>,
  reply: FastifyReply,
) {
  await webhooksService.deleteWebhook(request.tenantId, request.params.configId);
  return reply.send({ success: true, requestId: request.id, data: { message: 'Webhook deleted' } });
}

export async function rotateSecretController(
  request: FastifyRequest<{ Params: { configId: string } }>,
  reply: FastifyReply,
) {
  const data = await webhooksService.rotateSecret(request.tenantId, request.params.configId);
  return reply.send({ success: true, requestId: request.id, data });
}

export async function listDeliveriesController(
  request: FastifyRequest<{ Params: { configId: string } }>,
  reply: FastifyReply,
) {
  const data = await webhooksService.listDeliveries(request.tenantId, request.params.configId);
  return reply.send({ success: true, requestId: request.id, data });
}

export async function testDeliveryController(
  request: FastifyRequest<{ Params: { configId: string } }>,
  reply: FastifyReply,
) {
  const data = await webhooksService.testDelivery(request.tenantId, request.params.configId);
  return reply.send({ success: true, requestId: request.id, data });
}
