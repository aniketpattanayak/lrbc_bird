import type { FastifyRequest, FastifyReply } from 'fastify';
import { NotFoundError, ValidationError, ForbiddenError } from '@wsaas/utils';
import * as instancesService from './instances.service';
import type { CreateInstanceDto, UpdateInstanceDto } from './instances.schema';

export async function listInstancesController(request: FastifyRequest, reply: FastifyReply) {
  const instances = await instancesService.listInstances(request.tenantId);
  return reply.send({ success: true, requestId: request.id, data: instances });
}

export async function createInstanceController(request: FastifyRequest<{ Body: CreateInstanceDto }>, reply: FastifyReply) {
  try {
    const instance = await instancesService.createInstance(request.tenantId, request.body);
    return reply.status(201).send({ success: true, requestId: request.id, data: instance });
  } catch (err) {
    if (err instanceof ValidationError) {
      return reply.status(422).send({ success: false, requestId: request.id, error: { code: 'VALIDATION_ERROR', message: err.message } });
    }
    if (err instanceof ForbiddenError) {
      return reply.status(403).send({ success: false, requestId: request.id, error: { code: 'FORBIDDEN', message: err.message } });
    }
    throw err;
  }
}

export async function getInstanceController(request: FastifyRequest<{ Params: { instanceId: string } }>, reply: FastifyReply) {
  try {
    const instance = await instancesService.getInstance(request.tenantId, request.params.instanceId);
    return reply.send({ success: true, requestId: request.id, data: instance });
  } catch (err) {
    if (err instanceof NotFoundError) {
      return reply.status(404).send({ success: false, requestId: request.id, error: { code: 'NOT_FOUND', message: err.message } });
    }
    throw err;
  }
}

export async function updateInstanceController(request: FastifyRequest<{ Params: { instanceId: string }; Body: UpdateInstanceDto }>, reply: FastifyReply) {
  try {
    const instance = await instancesService.updateInstance(request.tenantId, request.params.instanceId, request.body);
    return reply.send({ success: true, requestId: request.id, data: instance });
  } catch (err) {
    if (err instanceof NotFoundError) {
      return reply.status(404).send({ success: false, requestId: request.id, error: { code: 'NOT_FOUND', message: err.message } });
    }
    if (err instanceof ValidationError) {
      return reply.status(422).send({ success: false, requestId: request.id, error: { code: 'VALIDATION_ERROR', message: err.message } });
    }
    throw err;
  }
}

export async function deleteInstanceController(request: FastifyRequest<{ Params: { instanceId: string } }>, reply: FastifyReply) {
  try {
    await instancesService.deleteInstance(request.tenantId, request.params.instanceId);
    return reply.send({ success: true, requestId: request.id, data: { message: 'Instance deleted successfully' } });
  } catch (err) {
    if (err instanceof NotFoundError) {
      return reply.status(404).send({ success: false, requestId: request.id, error: { code: 'NOT_FOUND', message: err.message } });
    }
    throw err;
  }
}

export async function getInstanceQrController(request: FastifyRequest<{ Params: { instanceId: string } }>, reply: FastifyReply) {
  try {
    const result = await instancesService.getInstanceQr(request.tenantId, request.params.instanceId);
    return reply.send({ success: true, requestId: request.id, data: result });
  } catch (err) {
    if (err instanceof NotFoundError) {
      return reply.status(404).send({ success: false, requestId: request.id, error: { code: 'NOT_FOUND', message: err.message } });
    }
    throw err;
  }
}
