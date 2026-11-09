import Stripe from 'stripe';
import { prisma } from '@wsaas/database';
import { NotFoundError, ValidationError, InternalError } from '@wsaas/utils';
import { getConfig } from '@wsaas/config';
import { createLogger } from '@wsaas/logger';
import type { CheckoutDto } from './billing.schema';

const logger = createLogger({ name: 'api:billing' });

let stripeClient: Stripe | null = null;

function getStripe(): Stripe {
  const config = getConfig();
  if (!config.STRIPE_SECRET_KEY) {
    throw new InternalError('Billing is not configured on this server (STRIPE_SECRET_KEY missing)');
  }
  if (!stripeClient) {
    stripeClient = new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
  }
  return stripeClient;
}

// ─── Plans ──────────────────────────────────────────────────────────────────

export async function listPlans() {
  return prisma.plan.findMany({
    where: { isActive: true, isPublic: true },
    orderBy: { sortOrder: 'asc' },
  });
}

export async function getCurrentSubscription(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, include: { plan: true } });
  if (!tenant) throw new NotFoundError('Tenant', tenantId);

  const subscription = await prisma.subscription.findFirst({
    where: { tenantId, status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE', 'UNPAID'] } },
    orderBy: { createdAt: 'desc' },
  });

  return { plan: tenant.plan, subscription, tenantStatus: tenant.status };
}

// ─── Checkout ───────────────────────────────────────────────────────────────

export async function createCheckoutSession(tenantId: string, dto: CheckoutDto, appUrl: string) {
  const [tenant, plan] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId } }),
    prisma.plan.findUnique({ where: { id: dto.planId } }),
  ]);

  if (!tenant) throw new NotFoundError('Tenant', tenantId);
  if (!plan || !plan.isActive) throw new NotFoundError('Plan', dto.planId);

  const priceId = dto.billingCycle === 'YEARLY' ? plan.stripePriceIdYearly : plan.stripePriceIdMonthly;
  if (!priceId) {
    throw new ValidationError(`Plan '${plan.name}' does not have a Stripe price configured for ${dto.billingCycle.toLowerCase()} billing`);
  }

  const stripe = getStripe();

  let customerId = tenant.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: tenant.email,
      name: tenant.name,
      metadata: { tenantId },
    });
    customerId = customer.id;
    await prisma.tenant.update({ where: { id: tenantId }, data: { stripeCustomerId: customerId } });
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/billing?checkout=success`,
    cancel_url: `${appUrl}/billing?checkout=cancelled`,
    metadata: { tenantId, planId: plan.id, billingCycle: dto.billingCycle },
    subscription_data: { metadata: { tenantId, planId: plan.id } },
  });

  logger.info({ tenantId, planId: plan.id, sessionId: session.id }, 'Checkout session created');
  return { url: session.url };
}

// ─── Billing portal ─────────────────────────────────────────────────────────

export async function createPortalSession(tenantId: string, appUrl: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new NotFoundError('Tenant', tenantId);
  if (!tenant.stripeCustomerId) {
    throw new ValidationError('No billing account found yet. Subscribe to a plan first.');
  }

  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: tenant.stripeCustomerId,
    return_url: `${appUrl}/billing`,
  });

  return { url: session.url };
}

// ─── Invoices ───────────────────────────────────────────────────────────────

export async function listInvoices(tenantId: string) {
  return prisma.invoice.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
  });
}

// ─── Stripe webhook handling ────────────────────────────────────────────────

export function verifyStripeSignature(rawBody: Buffer, signature: string): Stripe.Event {
  const config = getConfig();
  if (!config.STRIPE_WEBHOOK_SECRET) {
    throw new InternalError('STRIPE_WEBHOOK_SECRET is not configured');
  }
  const stripe = getStripe();
  return stripe.webhooks.constructEvent(rawBody, signature, config.STRIPE_WEBHOOK_SECRET);
}

export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  logger.info({ type: event.type, id: event.id }, 'Processing Stripe webhook event');

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await handleSubscriptionUpsert(event.data.object as Stripe.Subscription);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      break;
    case 'invoice.paid':
    case 'invoice.payment_succeeded':
      await handleInvoiceEvent(event.data.object as Stripe.Invoice, true);
      break;
    case 'invoice.payment_failed':
      await handleInvoiceEvent(event.data.object as Stripe.Invoice, false);
      break;
    default:
      logger.debug({ type: event.type }, 'Unhandled Stripe event type');
  }
}

async function resolveTenantId(customerId: string, metadataTenantId?: string | null): Promise<string | null> {
  if (metadataTenantId) return metadataTenantId;
  const tenant = await prisma.tenant.findFirst({ where: { stripeCustomerId: customerId } });
  return tenant?.id ?? null;
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const tenantId = (session.metadata?.['tenantId'] as string) ?? (await resolveTenantId(String(session.customer)));
  if (!tenantId) {
    logger.warn({ sessionId: session.id }, 'Could not resolve tenant for completed checkout session');
    return;
  }
  logger.info({ tenantId, sessionId: session.id }, 'Checkout completed — subscription will sync on subscription.* event');
}

async function handleSubscriptionUpsert(sub: Stripe.Subscription): Promise<void> {
  const tenantId = await resolveTenantId(String(sub.customer), sub.metadata?.['tenantId']);
  const planId = sub.metadata?.['planId'];
  if (!tenantId) {
    logger.warn({ subscriptionId: sub.id }, 'Could not resolve tenant for subscription event');
    return;
  }

  const plan = planId
    ? await prisma.plan.findUnique({ where: { id: planId } })
    : null;

  const statusMap: Record<string, string> = {
    trialing: 'TRIALING',
    active: 'ACTIVE',
    past_due: 'PAST_DUE',
    canceled: 'CANCELLED',
    unpaid: 'UNPAID',
    incomplete: 'INCOMPLETE',
    incomplete_expired: 'INCOMPLETE',
  };

  const data = {
    tenantId,
    planId: plan?.id ?? (await prisma.tenant.findUnique({ where: { id: tenantId } }))?.currentPlanId ?? '',
    stripeSubscriptionId: sub.id,
    status: (statusMap[sub.status] ?? 'ACTIVE') as any,
    billingCycle: (sub.items.data[0]?.price.recurring?.interval === 'year' ? 'YEARLY' : 'MONTHLY') as any,
    currentPeriodStart: new Date(sub.current_period_start * 1000),
    currentPeriodEnd: new Date(sub.current_period_end * 1000),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    trialStart: sub.trial_start ? new Date(sub.trial_start * 1000) : null,
    trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
  };

  if (!data.planId) {
    logger.warn({ tenantId, subscriptionId: sub.id }, 'No plan resolvable for subscription — skipping upsert');
    return;
  }

  await prisma.subscription.upsert({
    where: { stripeSubscriptionId: sub.id },
    create: data,
    update: {
      status: data.status,
      currentPeriodStart: data.currentPeriodStart,
      currentPeriodEnd: data.currentPeriodEnd,
      cancelAtPeriodEnd: data.cancelAtPeriodEnd,
      trialStart: data.trialStart,
      trialEnd: data.trialEnd,
      ...(plan && { planId: plan.id }),
    },
  });

  if (plan) {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { currentPlanId: plan.id, status: data.status === 'ACTIVE' ? 'ACTIVE' : undefined },
    });
  }

  logger.info({ tenantId, subscriptionId: sub.id, status: data.status }, 'Subscription synced');
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription): Promise<void> {
  await prisma.subscription
    .update({ where: { stripeSubscriptionId: sub.id }, data: { status: 'CANCELLED', cancelledAt: new Date() } })
    .catch(() => logger.warn({ subscriptionId: sub.id }, 'Subscription not found locally for deletion event'));
}

async function handleInvoiceEvent(invoice: Stripe.Invoice, paid: boolean): Promise<void> {
  const tenantId = await resolveTenantId(String(invoice.customer));
  if (!tenantId) {
    logger.warn({ invoiceId: invoice.id }, 'Could not resolve tenant for invoice event');
    return;
  }

  await prisma.invoice.upsert({
    where: { stripeInvoiceId: invoice.id },
    create: {
      tenantId,
      stripeInvoiceId: invoice.id,
      amountCents: invoice.amount_due,
      currency: invoice.currency,
      status: invoice.status ?? (paid ? 'paid' : 'open'),
      periodStart: invoice.period_start ? new Date(invoice.period_start * 1000) : null,
      periodEnd: invoice.period_end ? new Date(invoice.period_end * 1000) : null,
      paidAt: paid ? new Date() : null,
      invoicePdfUrl: invoice.invoice_pdf ?? null,
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
      lineItems: invoice.lines.data.map((l) => ({ description: l.description, amount: l.amount })) as any,
    },
    update: {
      status: invoice.status ?? (paid ? 'paid' : 'open'),
      paidAt: paid ? new Date() : null,
    },
  });

  if (!paid) {
    await prisma.tenant.update({ where: { id: tenantId }, data: { status: 'PAST_DUE' } }).catch(() => undefined);
  }

  logger.info({ tenantId, invoiceId: invoice.id, paid }, 'Invoice recorded');
}
