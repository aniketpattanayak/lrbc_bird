import type { FastifyRequest, FastifyReply } from 'fastify';
import { ValidationError } from '@wsaas/utils';
import { validateBody, validateQuery } from '../../utils/zodToJsonSchema';
import { createTopupOrderSchema, verifyTopupSchema, listTransactionsQuerySchema } from './wallet.schema';
import * as walletService from './wallet.service';

export async function getWalletController(request: FastifyRequest, reply: FastifyReply) {
  const data = await walletService.getWalletSummary(request.tenantId);
  return reply.send({ success: true, requestId: request.id, data });
}

export async function listTransactionsController(request: FastifyRequest, reply: FastifyReply) {
  const query = validateQuery(listTransactionsQuerySchema, request.query);
  const data = await walletService.getTransactionHistory(request.tenantId, query);
  return reply.send({ success: true, requestId: request.id, data });
}

export async function createTopupOrderController(request: FastifyRequest, reply: FastifyReply) {
  const body = validateBody(createTopupOrderSchema, request.body);
  const data = await walletService.createTopupOrder(request.tenantId, body);
  return reply.send({ success: true, requestId: request.id, data });
}

export async function verifyTopupController(request: FastifyRequest, reply: FastifyReply) {
  const body = validateBody(verifyTopupSchema, request.body);
  const data = await walletService.verifyTopup(request.tenantId, body);
  return reply.send({ success: true, requestId: request.id, data });
}

export async function razorpayWebhookController(request: FastifyRequest, reply: FastifyReply) {
  const signature = request.headers['x-razorpay-signature'];
  if (!signature || typeof signature !== 'string') {
    throw new ValidationError('Missing X-Razorpay-Signature header');
  }

  const rawBody = request.body as Buffer;
  walletService.verifyRazorpayWebhookSignature(rawBody, signature);
  const event = JSON.parse(rawBody.toString('utf8'));
  await walletService.handleRazorpayWebhookEvent(event);

  return reply.send({ received: true });
}
