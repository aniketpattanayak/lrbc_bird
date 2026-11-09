import type { FastifyRequest, FastifyReply } from 'fastify';
import { NotFoundError } from '@wsaas/utils';
import * as messagesService from './messages.service';
import { validateBody } from '../../utils/zodToJsonSchema';
import { sendTextSchema, sendImageSchema, sendDocumentSchema, sendLocationSchema } from './messages.schema';

function instanceNotConnectedReply(reply: FastifyReply, requestId: string, err: any) {
  if (err?.code === 'INSTANCE_NOT_CONNECTED') {
    return reply.status(422).send({ success: false, requestId, error: { code: err.code, message: err.message } });
  }
  return null;
}

export async function sendTextController(request: FastifyRequest<{ Params: { instanceId: string } }>, reply: FastifyReply) {
  try {
    const body = validateBody(sendTextSchema, request.body);
    const result = await messagesService.sendText(request.tenantId, request.params.instanceId, body);
    return reply.status(202).send({ success: true, requestId: request.id, data: result });
  } catch (err: any) {
    return instanceNotConnectedReply(reply, request.id, err)
      ?? (err instanceof NotFoundError ? reply.status(404).send({ success: false, requestId: request.id, error: { code: 'NOT_FOUND', message: err.message } }) : (() => { throw err; })());
  }
}

export async function sendImageController(request: FastifyRequest<{ Params: { instanceId: string } }>, reply: FastifyReply) {
  try {
    const body = validateBody(sendImageSchema, request.body);
    const result = await messagesService.sendImage(request.tenantId, request.params.instanceId, body);
    return reply.status(202).send({ success: true, requestId: request.id, data: result });
  } catch (err: any) {
    return instanceNotConnectedReply(reply, request.id, err)
      ?? (err instanceof NotFoundError ? reply.status(404).send({ success: false, requestId: request.id, error: { code: 'NOT_FOUND', message: err.message } }) : (() => { throw err; })());
  }
}

export async function sendDocumentController(request: FastifyRequest<{ Params: { instanceId: string } }>, reply: FastifyReply) {
  try {
    const body = validateBody(sendDocumentSchema, request.body);
    const result = await messagesService.sendDocument(request.tenantId, request.params.instanceId, body);
    return reply.status(202).send({ success: true, requestId: request.id, data: result });
  } catch (err: any) {
    return instanceNotConnectedReply(reply, request.id, err)
      ?? (err instanceof NotFoundError ? reply.status(404).send({ success: false, requestId: request.id, error: { code: 'NOT_FOUND', message: err.message } }) : (() => { throw err; })());
  }
}

export async function sendLocationController(request: FastifyRequest<{ Params: { instanceId: string } }>, reply: FastifyReply) {
  try {
    const body = validateBody(sendLocationSchema, request.body);
    const result = await messagesService.sendLocation(request.tenantId, request.params.instanceId, body);
    return reply.status(202).send({ success: true, requestId: request.id, data: result });
  } catch (err: any) {
    return instanceNotConnectedReply(reply, request.id, err)
      ?? (err instanceof NotFoundError ? reply.status(404).send({ success: false, requestId: request.id, error: { code: 'NOT_FOUND', message: err.message } }) : (() => { throw err; })());
  }
}

export async function getMessageStatusController(request: FastifyRequest<{ Params: { instanceId: string; messageId: string } }>, reply: FastifyReply) {
  try {
    const result = await messagesService.getMessageStatus(request.tenantId, request.params.messageId);
    return reply.send({ success: true, requestId: request.id, data: result });
  } catch (err: any) {
    if (err instanceof NotFoundError) return reply.status(404).send({ success: false, requestId: request.id, error: { code: 'NOT_FOUND', message: err.message } });
    throw err;
  }
}
