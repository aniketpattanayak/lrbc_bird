import { prisma } from './client';
import type { Prisma } from '@prisma/client';

/**
 * Wallet ledger — the single place that touches Wallet.balancePaise.
 * Every mutation goes through these functions so the balance and its
 * transaction history can never drift apart, and so concurrent debits
 * (e.g. two messages sending at once) can never overdraw the wallet.
 */

export async function getOrCreateWallet(tenantId: string) {
  const existing = await prisma.wallet.findUnique({ where: { tenantId } });
  if (existing) return existing;

  return prisma.wallet.upsert({
    where: { tenantId },
    create: { tenantId },
    update: {},
  });
}

export async function getBalancePaise(tenantId: string): Promise<bigint> {
  const wallet = await getOrCreateWallet(tenantId);
  return wallet.balancePaise;
}

/**
 * Credits the wallet (top-up, refund, positive adjustment) and records the
 * ledger entry atomically.
 */
export async function creditWallet(params: {
  tenantId: string;
  amountPaise: bigint;
  type: 'TOPUP' | 'REFUND' | 'ADJUSTMENT';
  description?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  metadata?: Prisma.InputJsonValue;
}) {
  const { tenantId, amountPaise, type, description, razorpayOrderId, razorpayPaymentId, razorpaySignature, metadata } = params;
  if (amountPaise <= 0n) throw new Error('creditWallet: amountPaise must be positive');

  return prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.upsert({
      where: { tenantId },
      create: { tenantId },
      update: {},
    });

    const newBalance = wallet.balancePaise + amountPaise;

    const updated = await tx.wallet.update({
      where: { id: wallet.id },
      data: { balancePaise: newBalance },
    });

    const transaction = await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        tenantId,
        type,
        status: 'SUCCESS',
        amountPaise,
        balanceAfterPaise: newBalance,
        description: description ?? null,
        razorpayOrderId: razorpayOrderId ?? null,
        razorpayPaymentId: razorpayPaymentId ?? null,
        razorpaySignature: razorpaySignature ?? null,
        metadata: metadata ?? undefined,
      },
    });

    return { wallet: updated, transaction };
  });
}

/**
 * Debits the wallet for a sent message's Meta cost. Uses a conditional
 * `updateMany` guarded by `balancePaise >= amountPaise` so two concurrent
 * debits can never push the balance negative (the second one simply fails
 * the guard and `matchedCount` comes back 0).
 */
export async function debitWalletForMessage(params: {
  tenantId: string;
  amountPaise: bigint;
  messageId: string;
  description?: string;
}): Promise<{ success: boolean; balanceAfterPaise: bigint | null }> {
  const { tenantId, amountPaise, messageId, description } = params;
  if (amountPaise <= 0n) return { success: true, balanceAfterPaise: null }; // free (SERVICE category) message — nothing to charge

  return prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.upsert({
      where: { tenantId },
      create: { tenantId },
      update: {},
    });

    if (wallet.balancePaise < amountPaise) {
      return { success: false, balanceAfterPaise: wallet.balancePaise };
    }

    const newBalance = wallet.balancePaise - amountPaise;

    const result = await tx.wallet.updateMany({
      where: { id: wallet.id, balancePaise: { gte: amountPaise } },
      data: { balancePaise: newBalance },
    });

    if (result.count === 0) {
      // Lost the race to a concurrent debit between the read above and this write.
      return { success: false, balanceAfterPaise: null };
    }

    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        tenantId,
        type: 'MESSAGE_CHARGE',
        status: 'SUCCESS',
        amountPaise: -amountPaise,
        balanceAfterPaise: newBalance,
        description: description ?? 'WhatsApp message (Meta Cloud API)',
        messageId,
      },
    });

    return { success: true, balanceAfterPaise: newBalance };
  });
}

export async function hasSufficientBalance(tenantId: string, amountPaise: bigint): Promise<boolean> {
  if (amountPaise <= 0n) return true;
  const balance = await getBalancePaise(tenantId);
  return balance >= amountPaise;
}

export async function listWalletTransactions(tenantId: string, params: { page: number; limit: number }) {
  const wallet = await getOrCreateWallet(tenantId);
  const [transactions, total] = await Promise.all([
    prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    }),
    prisma.walletTransaction.count({ where: { walletId: wallet.id } }),
  ]);
  return { transactions, total, wallet };
}
