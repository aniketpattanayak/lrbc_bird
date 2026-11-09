import { prisma } from '@wsaas/database';
import { createLogger } from '@wsaas/logger';

const logger = createLogger({ name: 'api:usage' });

function startOfCurrentBillingPeriod(): Date {
  // Simple monthly-period assumption when there's no active subscription record.
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/**
 * Current billing period usage vs the tenant's plan limits.
 */
export async function getUsageSummary(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, include: { plan: true } });

  const subscription = await prisma.subscription.findFirst({
    where: { tenantId, status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } },
    orderBy: { createdAt: 'desc' },
  });

  const periodStart = subscription?.currentPeriodStart ?? startOfCurrentBillingPeriod();
  const periodEnd = subscription?.currentPeriodEnd ?? new Date();

  const [messagesSent, messagesReceived, instancesUsed, teamMembersUsed] = await Promise.all([
    prisma.message.count({ where: { tenantId, direction: 'OUTBOUND', createdAt: { gte: periodStart } } }),
    prisma.message.count({ where: { tenantId, direction: 'INBOUND', createdAt: { gte: periodStart } } }),
    prisma.instance.count({ where: { tenantId, deletedAt: null } }),
    prisma.user.count({ where: { tenantId, deletedAt: null } }),
  ]);

  const messagesTotal = messagesSent + messagesReceived;
  const messagesLimit = tenant?.plan?.maxMessagesPerMonth ?? null;

  return {
    plan: tenant?.plan
      ? { id: tenant.plan.id, name: tenant.plan.name, displayName: tenant.plan.displayName }
      : null,
    period: { start: periodStart.toISOString(), end: periodEnd.toISOString() },
    messages: {
      sent: messagesSent,
      received: messagesReceived,
      total: messagesTotal,
      limit: messagesLimit,
      percentUsed: messagesLimit ? Math.min(100, Math.round((messagesTotal / messagesLimit) * 100)) : null,
    },
    instances: { used: instancesUsed, limit: tenant?.plan?.maxInstances ?? null },
    teamMembers: { used: teamMembersUsed, limit: tenant?.plan?.maxTeamMembers ?? null },
  };
}

/**
 * Message volume grouped by day/week/month for charting.
 */
export async function getMessagesTimeSeries(
  tenantId: string,
  groupBy: 'day' | 'week' | 'month',
  from: Date,
  to: Date,
) {
  const trunc = groupBy === 'day' ? 'day' : groupBy === 'week' ? 'week' : 'month';

  const rows = (await prisma.$queryRawUnsafe((
    `SELECT date_trunc($1, "createdAt") AS bucket, "direction", COUNT(*) AS count
     FROM "Message"
     WHERE "tenantId" = $2 AND "createdAt" >= $3 AND "createdAt" <= $4
     GROUP BY bucket, "direction"
     ORDER BY bucket ASC`,
    trunc,
    tenantId,
    from,
    to,
  ) as Array<{ bucket: Date; direction: string; count: bigint }>;

  const buckets = new Map<string, { date: string; sent: number; received: number }>();
  for (const row of rows) {
    const key = row.bucket.toISOString();
    const entry = buckets.get(key) ?? { date: key, sent: 0, received: 0 };
    if (row.direction === 'OUTBOUND') entry.sent = Number(row.count);
    if (row.direction === 'INBOUND') entry.received = Number(row.count);
    buckets.set(key, entry);
  }

  return Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Per-instance breakdown: volume + delivery rate.
 */
export async function getUsageByInstance(tenantId: string, from: Date, to: Date) {
  const instances = await prisma.instance.findMany({
    where: { tenantId, deletedAt: null },
    select: { id: true, name: true, phoneNumber: true, status: true },
  });

  const results = await Promise.all(
    instances.map(async (instance) => {
      const [sent, delivered, read, failed, received] = await Promise.all([
        prisma.message.count({ where: { instanceId: instance.id, direction: 'OUTBOUND', createdAt: { gte: from, lte: to } } }),
        prisma.message.count({ where: { instanceId: instance.id, direction: 'OUTBOUND', status: 'DELIVERED', createdAt: { gte: from, lte: to } } }),
        prisma.message.count({ where: { instanceId: instance.id, direction: 'OUTBOUND', status: 'READ', createdAt: { gte: from, lte: to } } }),
        prisma.message.count({ where: { instanceId: instance.id, direction: 'OUTBOUND', status: 'FAILED', createdAt: { gte: from, lte: to } } }),
        prisma.message.count({ where: { instanceId: instance.id, direction: 'INBOUND', createdAt: { gte: from, lte: to } } }),
      ]);

      const deliveredOrRead = delivered + read;
      return {
        instanceId: instance.id,
        instanceName: instance.name,
        phoneNumber: instance.phoneNumber,
        status: instance.status,
        sent,
        received,
        failed,
        deliveryRatePercent: sent > 0 ? Math.round((deliveredOrRead / sent) * 100) : null,
      };
    }),
  );

  return results;
}

/**
 * Overall delivery-rate stats across all instances for the period.
 */
export async function getDeliveryRateStats(tenantId: string, from: Date, to: Date) {
  const [sent, delivered, read, failed] = await Promise.all([
    prisma.message.count({ where: { tenantId, direction: 'OUTBOUND', createdAt: { gte: from, lte: to } } }),
    prisma.message.count({ where: { tenantId, direction: 'OUTBOUND', status: 'DELIVERED', createdAt: { gte: from, lte: to } } }),
    prisma.message.count({ where: { tenantId, direction: 'OUTBOUND', status: 'READ', createdAt: { gte: from, lte: to } } }),
    prisma.message.count({ where: { tenantId, direction: 'OUTBOUND', status: 'FAILED', createdAt: { gte: from, lte: to } } }),
  ]);

  const succeeded = delivered + read;
  return {
    sent,
    delivered,
    read,
    failed,
    deliveryRatePercent: sent > 0 ? Math.round((succeeded / sent) * 100) : 0,
    failureRatePercent: sent > 0 ? Math.round((failed / sent) * 100) : 0,
  };
}

export { logger as usageLogger };
