import type { FastifyRequest, FastifyReply } from 'fastify';
import { validateBody } from '../../utils/zodToJsonSchema';
import { ForbiddenError } from '@wsaas/utils';
import { updateTenantSchema, notificationPrefsSchema, setWhatsappModeSchema } from './tenant.schema';
import * as tenantService from './tenant.service';

export async function getTenantController(request: FastifyRequest, reply: FastifyReply) {
  const data = await tenantService.getTenantProfile(request.tenantId);
  return reply.send({ success: true, requestId: request.id, data });
}

export async function updateTenantController(request: FastifyRequest, reply: FastifyReply) {
  const body = validateBody(updateTenantSchema, request.body);
  const data = await tenantService.updateTenantProfile(request.tenantId, body);
  return reply.send({ success: true, requestId: request.id, data });
}

export async function getNotificationPrefsController(request: FastifyRequest, reply: FastifyReply) {
  const data = await tenantService.getNotificationPrefs(request.userId);
  return reply.send({ success: true, requestId: request.id, data });
}

export async function updateNotificationPrefsController(request: FastifyRequest, reply: FastifyReply) {
  const body = validateBody(notificationPrefsSchema, request.body);
  const data = await tenantService.updateNotificationPrefs(request.userId, body);
  return reply.send({ success: true, requestId: request.id, data });
}

export async function setWhatsappModeController(request: FastifyRequest, reply: FastifyReply) {
  const body = validateBody(setWhatsappModeSchema, request.body);
  try {
    const data = await tenantService.setWhatsappMode(request.tenantId, body);
    return reply.send({ success: true, requestId: request.id, data });
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return reply.status(403).send({ success: false, requestId: request.id, error: { code: 'FORBIDDEN', message: err.message } });
    }
    throw err;
  }
}
