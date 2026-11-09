import type { FastifyRequest, FastifyReply } from 'fastify';
import { validateBody } from '../../utils/zodToJsonSchema';
import { createTemplateSchema, updateTemplateSchema } from './templates.schema';
import * as templatesService from './templates.service';

export async function listTemplatesController(request: FastifyRequest, reply: FastifyReply) {
  const data = await templatesService.listTemplates(request.tenantId);
  return reply.send({ success: true, requestId: request.id, data });
}

export async function createTemplateController(request: FastifyRequest, reply: FastifyReply) {
  const body = validateBody(createTemplateSchema, request.body);
  const data = await templatesService.createTemplate(request.tenantId, body);
  return reply.status(201).send({ success: true, requestId: request.id, data });
}

export async function updateTemplateController(
  request: FastifyRequest<{ Params: { templateId: string } }>,
  reply: FastifyReply,
) {
  const body = validateBody(updateTemplateSchema, request.body);
  const data = await templatesService.updateTemplate(request.tenantId, request.params.templateId, body);
  return reply.send({ success: true, requestId: request.id, data });
}

export async function deleteTemplateController(
  request: FastifyRequest<{ Params: { templateId: string } }>,
  reply: FastifyReply,
) {
  await templatesService.deleteTemplate(request.tenantId, request.params.templateId);
  return reply.send({ success: true, requestId: request.id, data: { message: 'Template deleted' } });
}

export async function submitTemplateController(
  request: FastifyRequest<{ Params: { templateId: string } }>,
  reply: FastifyReply,
) {
  const data = await templatesService.submitTemplate(request.tenantId, request.params.templateId);
  return reply.send({ success: true, requestId: request.id, data });
}
