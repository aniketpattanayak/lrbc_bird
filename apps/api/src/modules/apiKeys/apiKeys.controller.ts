import type { FastifyRequest, FastifyReply } from 'fastify';
import { NotFoundError, ValidationError } from '@wsaas/utils';
import * as apiKeysService from './apiKeys.service';
import type { CreateApiKeyDto, UpdateApiKeyDto } from './apiKeys.schema';

export async function listApiKeysController(request: FastifyRequest, reply: FastifyReply) {
  const keys = await apiKeysService.listApiKeys(request.tenantId);
  return reply.send({ success: true, requestId: request.id, data: keys });
}

export async function createApiKeyController(request: FastifyRequest<{ Body: CreateApiKeyDto }>, reply: FastifyReply) {
  try {
    const result = await apiKeysService.createApiKey(request.tenantId, request.body);
    return reply.status(201).send({ success: true, requestId: request.id, data: result });
  } catch (err) {
    if (err instanceof ValidationError) {
      return reply.status(422).send({ success: false, requestId: request.id, error: { code: 'VALIDATION_ERROR', message: err.message } });
    }
    throw err;
  }
}

export async function getApiKeyController(request: FastifyRequest<{ Params: { keyId: string } }>, reply: FastifyReply) {
  try {
    const key = await apiKeysService.getApiKey(request.tenantId, request.params.keyId);
    return reply.send({ success: true, requestId: request.id, data: key });
  } catch (err) {
    if (err instanceof NotFoundError) {
      return reply.status(404).send({ success: false, requestId: request.id, error: { code: 'NOT_FOUND', message: err.message } });
    }
    throw err;
  }
}

export async function updateApiKeyController(request: FastifyRequest<{ Params: { keyId: string }; Body: UpdateApiKeyDto }>, reply: FastifyReply) {
  try {
    const key = await apiKeysService.updateApiKey(request.tenantId, request.params.keyId, request.body);
    return reply.send({ success: true, requestId: request.id, data: key });
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

export async function revokeApiKeyController(request: FastifyRequest<{ Params: { keyId: string } }>, reply: FastifyReply) {
  try {
    await apiKeysService.revokeApiKey(request.tenantId, request.params.keyId);
    return reply.send({ success: true, requestId: request.id, data: { message: 'API key revoked successfully' } });
  } catch (err) {
    if (err instanceof NotFoundError) {
      return reply.status(404).send({ success: false, requestId: request.id, error: { code: 'NOT_FOUND', message: err.message } });
    }
    throw err;
  }
}
