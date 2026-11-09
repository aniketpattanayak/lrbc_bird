import type { FastifyRequest, FastifyReply } from 'fastify';
import { ValidationError } from '@wsaas/utils';
import { validateBody } from '../../utils/zodToJsonSchema';
import { checkoutSchema } from './billing.schema';
import * as billingService from './billing.service';
import { getConfig } from '@wsaas/config';

export async function listPlansController(request: FastifyRequest, reply: FastifyReply) {
  const data = await billingService.listPlans();
  return reply.send({ success: true, requestId: request.id, data });
}

export async function getSubscriptionController(request: FastifyRequest, reply: FastifyReply) {
  const data = await billingService.getCurrentSubscription(request.tenantId);
  return reply.send({ success: true, requestId: request.id, data });
}

export async function createCheckoutController(request: FastifyRequest, reply: FastifyReply) {
  const body = validateBody(checkoutSchema, request.body);
  const data = await billingService.createCheckoutSession(request.tenantId, body, getConfig().APP_URL);
  return reply.send({ success: true, requestId: request.id, data });
}

export async function createPortalController(request: FastifyRequest, reply: FastifyReply) {
  const data = await billingService.createPortalSession(request.tenantId, getConfig().APP_URL);
  return reply.send({ success: true, requestId: request.id, data });
}

export async function listInvoicesController(request: FastifyRequest, reply: FastifyReply) {
  const data = await billingService.listInvoices(request.tenantId);
  return reply.send({ success: true, requestId: request.id, data });
}

export async function stripeWebhookController(request: FastifyRequest, reply: FastifyReply) {
  const signature = request.headers['stripe-signature'];
  if (!signature || typeof signature !== 'string') {
    throw new ValidationError('Missing Stripe-Signature header');
  }

  const rawBody = request.body as Buffer;
  const event = billingService.verifyStripeSignature(rawBody, signature);
  await billingService.handleStripeEvent(event);

  return reply.send({ received: true });
}
