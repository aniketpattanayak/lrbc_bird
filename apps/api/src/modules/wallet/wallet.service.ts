import crypto from 'crypto';
import Razorpay from 'razorpay';
import { prisma, getOrCreateWallet, creditWallet, listWalletTransactions } from '@wsaas/database';
import { getConfig } from '@wsaas/config';
import { createLogger } from '@wsaas/logger';
import { ValidationError, InternalError, NotFoundError } from '@wsaas/utils';
import type { CreateTopupOrderDto, VerifyTopupDto, ListTransactionsQuery } from './wallet.schema';

const logger = createLogger({ name: 'api:wallet' });

let razorpayClient: Razorpay | null = null;

function getRazorpay(): Razorpay {
  const config = getConfig();
  if (!config.RAZORPAY_KEY_ID || !config.RAZORPAY_KEY_SECRET) {
    throw new InternalError('Wallet top-ups are not configured on this server (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing)');
  }
  if (!razorpayClient) {
    razorpayClient = new Razorpay({ key_id: config.RAZORPAY_KEY_ID, key_secret: config.RAZORPAY_KEY_SECRET });
  }
  return razorpayClient;
}

function serializeWallet(wallet: { id: string; tenantId: string; balancePaise: bigint; currency: string; lowBalanceThresholdPaise: bigint; createdAt: Date; updatedAt: Date }) {
  const balancePaise = wallet.balancePaise;
  const lowThreshold = wallet.lowBalanceThresholdPaise;
  return {
    balancePaise: balancePaise.toString(),
    balanceRupees: Number(balancePaise) / 100,
    currency: wallet.currency,
    lowBalanceThresholdPaise: lowThreshold.toString(),
    isLowBalance: balancePaise < lowThreshold,
  };
}

function serializeTransaction(t: {
  id: string; type: string; status: string; amountPaise: bigint; balanceAfterPaise: bigint | null;
  description: string | null; razorpayOrderId: string | null; razorpayPaymentId: string | null; messageId: string | null; createdAt: Date;
}) {
  return {
    id: t.id,
    type: t.type,
    status: t.status,
    amountPaise: t.amountPaise.toString(),
    amountRupees: Number(t.amountPaise) / 100,
    balanceAfterPaise: t.balanceAfterPaise?.toString() ?? null,
    description: t.description,
    razorpayOrderId: t.razorpayOrderId,
    razorpayPaymentId: t.razorpayPaymentId,
    messageId: t.messageId,
    createdAt: t.createdAt,
  };
}

export async function getWalletSummary(tenantId: string) {
  const wallet = await getOrCreateWallet(tenantId);
  return serializeWallet(wallet);
}

export async function getTransactionHistory(tenantId: string, query: ListTransactionsQuery) {
  const { transactions, total, wallet } = await listWalletTransactions(tenantId, { page: query.page ?? 1, limit: query.limit ?? 20 });
  return {
    wallet: serializeWallet(wallet),
    transactions: transactions.map(serializeTransaction),
    pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
  };
}

export async function createTopupOrder(tenantId: string, dto: CreateTopupOrderDto) {
  const config = getConfig();
  const amountPaise = dto.amountRupees * 100;

  if (amountPaise < config.WALLET_MIN_TOPUP_PAISE) {
    throw new ValidationError(`Minimum top-up amount is ₹${config.WALLET_MIN_TOPUP_PAISE / 100}`);
  }
  if (amountPaise > config.WALLET_MAX_TOPUP_PAISE) {
    throw new ValidationError(`Maximum top-up amount is ₹${config.WALLET_MAX_TOPUP_PAISE / 100} per transaction`);
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new NotFoundError('Tenant', tenantId);

  const wallet = await getOrCreateWallet(tenantId);
  const razorpay = getRazorpay();

  const order = await razorpay.orders.create({
    amount: amountPaise, // Razorpay expects the smallest currency unit — paise
    currency: 'INR',
    receipt: `wallet_${tenantId.slice(0, 8)}_${Date.now()}`,
    notes: { tenantId, walletId: wallet.id },
  });

  // Record a PENDING ledger row now so a page refresh / closed tab still shows
  // the attempt; it's promoted to SUCCESS (and the balance credited) only once
  // the signature is verified in `verifyTopup`, or by the Razorpay webhook as
  // a fallback if the client never calls back.
  await prisma.walletTransaction.create({
    data: {
      walletId: wallet.id,
      tenantId,
      type: 'TOPUP',
      status: 'PENDING',
      amountPaise: BigInt(amountPaise),
      description: `Wallet top-up via Razorpay`,
      razorpayOrderId: order.id,
    },
  });

  logger.info({ tenantId, orderId: order.id, amountPaise }, 'Razorpay top-up order created');

  return {
    orderId: order.id,
    amountPaise,
    currency: 'INR',
    razorpayKeyId: config.RAZORPAY_KEY_ID,
  };
}

export async function verifyTopup(tenantId: string, dto: VerifyTopupDto) {
  const config = getConfig();
  if (!config.RAZORPAY_KEY_SECRET) {
    throw new InternalError('Wallet top-ups are not configured on this server');
  }

  const expectedSignature = crypto
    .createHmac('sha256', config.RAZORPAY_KEY_SECRET)
    .update(`${dto.razorpayOrderId}|${dto.razorpayPaymentId}`)
    .digest('hex');

  if (expectedSignature !== dto.razorpaySignature) {
    logger.warn({ tenantId, orderId: dto.razorpayOrderId }, 'Razorpay signature verification failed');
    throw new ValidationError('Payment verification failed — signature mismatch');
  }

  return creditTopupIfPending(tenantId, dto.razorpayOrderId, dto.razorpayPaymentId, dto.razorpaySignature);
}

/**
 * Idempotent: called either from the client's post-payment callback
 * (`verifyTopup`) or from the Razorpay webhook as a durable fallback in case
 * the browser tab closed before the callback fired. Whichever arrives first
 * flips the PENDING row to SUCCESS and credits the wallet exactly once —
 * the second caller sees it already SUCCESS and is a no-op.
 */
export async function creditTopupIfPending(tenantId: string, orderId: string, paymentId: string, signature?: string) {
  const existing = await prisma.walletTransaction.findUnique({ where: { razorpayOrderId: orderId } });
  if (!existing) throw new NotFoundError('Top-up order', orderId);
  if (existing.tenantId !== tenantId) throw new ValidationError('Order does not belong to this tenant');

  if (existing.status === 'SUCCESS') {
    const wallet = await getOrCreateWallet(tenantId);
    return { credited: false, alreadyProcessed: true, wallet: serializeWallet(wallet) };
  }

  const result = await creditWallet({
    tenantId,
    amountPaise: existing.amountPaise,
    type: 'TOPUP',
    description: 'Wallet top-up via Razorpay',
    razorpayOrderId: orderId,
    razorpayPaymentId: paymentId,
    razorpaySignature: signature,
  });

  // The original PENDING row stays as an audit trail of the order; mark it
  // FAILED->SUCCESS is not applicable since creditWallet created a new SUCCESS
  // row. Clean up by deleting the now-redundant PENDING placeholder.
  await prisma.walletTransaction.delete({ where: { id: existing.id } }).catch(() => undefined);

  logger.info({ tenantId, orderId, paymentId, amountPaise: existing.amountPaise.toString() }, 'Wallet top-up credited');

  return { credited: true, alreadyProcessed: false, wallet: serializeWallet(result.wallet), transaction: serializeTransaction(result.transaction) };
}

export function verifyRazorpayWebhookSignature(rawBody: Buffer, signature: string): void {
  const config = getConfig();
  if (!config.RAZORPAY_WEBHOOK_SECRET) {
    throw new InternalError('RAZORPAY_WEBHOOK_SECRET is not configured');
  }
  const expected = crypto.createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
  if (expected !== signature) {
    throw new ValidationError('Invalid Razorpay webhook signature');
  }
}

export async function handleRazorpayWebhookEvent(event: any): Promise<void> {
  logger.info({ event: event.event }, 'Razorpay webhook received');

  if (event.event === 'payment.captured') {
    const payment = event.payload?.payment?.entity;
    const orderId = payment?.order_id;
    const paymentId = payment?.id;
    if (!orderId || !paymentId) return;

    const txn = await prisma.walletTransaction.findUnique({ where: { razorpayOrderId: orderId } });
    if (!txn) {
      logger.warn({ orderId }, 'Webhook payment.captured for unknown order');
      return;
    }
    if (txn.status === 'SUCCESS') return; // already credited via client verify call

    await creditTopupIfPending(txn.tenantId, orderId, paymentId);
  }
}
