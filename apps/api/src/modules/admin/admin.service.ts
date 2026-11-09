import { prisma } from '@wsaas/database';
import { NotFoundError, ValidationError } from '@wsaas/utils';

import { createLogger } from '@wsaas/logger';
const logger = createLogger({ name: 'api:admin' });

// ─── List Tenants ─────────────────────────────────────────────────────────────

export async function listTenants(opts: {
  search?: string;
  status?: string;
  limit: number;
  offset: number;
}) {
  const where: any = {};
  if (opts.search) {
    where.OR = [
      { name: { contains: opts.search, mode: 'insensitive' } },
      { email: { contains: opts.search, mode: 'insensitive' } },
      { companyName: { contains: opts.search, mode: 'insensitive' } },
    ];
  }
  if (opts.status) where.status = opts.status;

  const [tenants, total] = await Promise.all([
    prisma.tenant.findMany({
      where,
      include: {
        plan: { select: { id: true, name: true, displayName: true } },
        _count: { select: { instances: true, messages: true, users: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: opts.limit,
      skip: opts.offset,
    }),
    prisma.tenant.count({ where }),
  ]);

  return { data: tenants, total };
}

// ─── Get Single Tenant ────────────────────────────────────────────────────────

export async function getTenant(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      plan: true,
      users: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          createdAt: true,
        },
      },
      _count: { select: { instances: true, messages: true, users: true } },
    },
  });

  if (!tenant) throw new NotFoundError('Tenant', tenantId);
  return { data: tenant };
}

// ─── Update Tenant Status ─────────────────────────────────────────────────────

export async function updateTenantStatus(
  tenantId: string,
  status: string,
  adminUserId: string,
) {
  const validStatuses = ['TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED'];
  if (!validStatuses.includes(status)) {
    throw new ValidationError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new NotFoundError('Tenant', tenantId);

  const updated = await prisma.tenant.update({
    where: { id: tenantId },
    data: { status: status as any },
  });

  logger.info({ tenantId, status, adminUserId }, 'Admin updated tenant status');
  return { data: updated };
}

// ─── Plans ────────────────────────────────────────────────────────────────────

export async function listAllPlans() {
  const plans = await prisma.plan.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return { data: plans };
}

export async function createPlan(dto: {
  name: string;
  displayName: string;
  priceMonthlyUsdCents: number;
  priceYearlyUsdCents: number;
  maxInstances: number;
  maxMessagesPerMonth: number | null;
  maxTeamMembers: number;
  maxApiCallsPerMinute: number;
  messageRetentionDays: number;
  maxWebhookPerInstance: number;
  storageGb: number;
  features: Record<string, unknown>;
  isPublic: boolean;
  isActive: boolean;
}) {
  const existing = await prisma.plan.findUnique({ where: { name: dto.name } });
  if (existing) throw new ValidationError(`Plan with name "${dto.name}" already exists`);

  const maxSort = await prisma.plan.aggregate({ _max: { sortOrder: true } });
  const sortOrder = (maxSort._max.sortOrder ?? 0) + 1;

  const plan = await prisma.plan.create({ data: { ...dto, sortOrder } as any });
  return { data: plan };
}

export async function updatePlan(planId: string, dto: Partial<{
  displayName: string;
  priceMonthlyUsdCents: number;
  priceYearlyUsdCents: number;
  maxInstances: number;
  maxMessagesPerMonth: number | null;
  maxTeamMembers: number;
  maxApiCallsPerMinute: number;
  messageRetentionDays: number;
  maxWebhookPerInstance: number;
  storageGb: number;
  features: Record<string, unknown>;
  isPublic: boolean;
  isActive: boolean;
}>) {
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) throw new NotFoundError('Plan', planId);

  const updated = await prisma.plan.update({ where: { id: planId }, data: dto as any });
  return { data: updated };
}

export async function softDeletePlan(planId: string) {
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) throw new NotFoundError('Plan', planId);

  // Plan has no deletedAt column — deactivate instead of hard-deleting so
  // existing tenants/subscriptions referencing it don't break.
  await prisma.plan.update({
    where: { id: planId },
    data: { isActive: false, isPublic: false },
  });
  return { message: 'Plan deactivated' };
}

// ─── WhatsApp Mode Override (super admin only) ───────────────────────────────
// Lets support override a tenant's locked WhatsApp mode for migration cases.
// `force: true` is required to move an already-locked tenant.

export async function setTenantWhatsappModeOverride(
  tenantId: string,
  mode: string,
  force: boolean,
  adminUserId: string,
) {
  const validModes = ['UNOFFICIAL', 'OFFICIAL'];
  if (!validModes.includes(mode)) {
    throw new ValidationError(`Invalid mode. Must be one of: ${validModes.join(', ')}`);
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new NotFoundError('Tenant', tenantId);

  if (tenant.modeLockedAt && !force) {
    throw new ValidationError(
      'This tenant\'s WhatsApp mode is already locked. Pass force: true to override it.',
    );
  }

  const updated = await prisma.tenant.update({
    where: { id: tenantId },
    data: { whatsappMode: mode as any, modeLockedAt: new Date() },
  });

  logger.info({ tenantId, mode, force, adminUserId }, 'Admin overrode tenant WhatsApp mode');
  return { data: updated };
}

// ─── Platform Stats ───────────────────────────────────────────────────────────

export async function getPlatformStats() {
  const [
    totalTenants,
    tenantsByStatusRaw,
    totalMessages,
    activeInstances,
    mrrRaw,
  ] = await Promise.all([
    prisma.tenant.count({ where: { deletedAt: null } }),
    prisma.tenant.groupBy({ by: ['status'], _count: { status: true } }),
    prisma.message.count(),
    prisma.instance.count({ where: { status: 'CONNECTED' } }),
    prisma.$queryRaw<{ mrr: bigint }[]>`
      SELECT COALESCE(SUM(p."priceMonthlyUsdCents"), 0) as mrr
      FROM "Tenant" t
      JOIN "Plan" p ON t."currentPlanId" = p.id
      WHERE t.status = 'ACTIVE' AND t."deletedAt" IS NULL
    `,
  ]);

  const tenantsByStatus: Record<string, number> = {};
  for (const row of tenantsByStatusRaw) {
    tenantsByStatus[row.status] = row._count.status;
  }

  const mrrCents = Number(mrrRaw[0]?.mrr ?? 0);

  return {
    data: {
      totalTenants,
      tenantsByStatus,
      totalMessages,
      activeInstances,
      mrrCents,
      mrrUsd: (mrrCents / 100).toFixed(2),
    },
  };
}
