import type { FastifyRequest, FastifyReply } from 'fastify';
import * as messagesService from './messages.service';

interface ListQuery {
  page?: string;
  limit?: string;
  instanceId?: string;
  type?: string;
  status?: string;
  direction?: string;
  search?: string;
  from?: string;
  to?: string;
}

export async function listMessagesController(request: FastifyRequest<{ Querystring: ListQuery }>, reply: FastifyReply) {
  const q = request.query;
  const page = Math.max(1, parseInt(q.page ?? '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(q.limit ?? '25', 10) || 25));

  const { data, meta } = await messagesService.listMessages(request.tenantId, {
    page,
    limit,
    instanceId: q.instanceId,
    type: q.type,
    status: q.status,
    direction: q.direction,
    search: q.search,
    from: q.from ? new Date(q.from) : undefined,
    to: q.to ? new Date(q.to) : undefined,
  });

  return reply.send({ success: true, requestId: request.id, data, meta });
}

export async function getConversationController(
  request: FastifyRequest<{ Querystring: { instanceId: string; phone: string } }>,
  reply: FastifyReply,
) {
  const { instanceId, phone } = request.query;
  const data = await messagesService.getConversation(request.tenantId, instanceId, phone);
  return reply.send({ success: true, requestId: request.id, data });
}
