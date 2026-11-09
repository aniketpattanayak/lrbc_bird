import type { FastifyRequest, FastifyReply } from 'fastify';
import * as usageService from './usage.service';

interface RangeQuery {
  from?: string;
  to?: string;
  groupBy?: 'day' | 'week' | 'month';
}

function parseRange(query: RangeQuery): { from: Date; to: Date; groupBy: 'day' | 'week' | 'month' } {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  const groupBy = query.groupBy && ['day', 'week', 'month'].includes(query.groupBy) ? query.groupBy : 'day';
  return { from, to, groupBy };
}

export async function getUsageSummaryController(request: FastifyRequest, reply: FastifyReply) {
  const data = await usageService.getUsageSummary(request.tenantId);
  return reply.send({ success: true, requestId: request.id, data });
}

export async function getMessagesTimeSeriesController(
  request: FastifyRequest<{ Querystring: RangeQuery }>,
  reply: FastifyReply,
) {
  const { from, to, groupBy } = parseRange(request.query);
  const data = await usageService.getMessagesTimeSeries(request.tenantId, groupBy, from, to);
  return reply.send({ success: true, requestId: request.id, data });
}

export async function getUsageByInstanceController(
  request: FastifyRequest<{ Querystring: RangeQuery }>,
  reply: FastifyReply,
) {
  const { from, to } = parseRange(request.query);
  const data = await usageService.getUsageByInstance(request.tenantId, from, to);
  return reply.send({ success: true, requestId: request.id, data });
}

export async function getDeliveryRateController(
  request: FastifyRequest<{ Querystring: RangeQuery }>,
  reply: FastifyReply,
) {
  const { from, to } = parseRange(request.query);
  const data = await usageService.getDeliveryRateStats(request.tenantId, from, to);
  return reply.send({ success: true, requestId: request.id, data });
}
