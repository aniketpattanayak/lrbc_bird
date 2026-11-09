import { prisma } from '@wsaas/database';
import { NotFoundError, ForbiddenError } from '@wsaas/utils';
import { createLogger } from '@wsaas/logger';
import type { UpdateTenantDto, NotificationPrefsDto, SetWhatsappModeDto } from './tenant.schema';

const logger = createLogger({ name: 'api:tenant' });

const DEFAULT_NOTIFICATION_PREFS: Required<NotificationPrefsDto> = {
  emailOnMessageFailed: true,
  emailOnWeeklyDigest: true,
  emailOnBillingIssue: true,
  emailOnTeamActivity: false,
  emailOnWebhookFailure: true,
};

function serializeTenant(tenant: { metadata: unknown } & Record<string, unknown>) {
  const metadata = (tenant.metadata as Record<string, unknown> | null) ?? {};
  return {
    ...tenant,
    logoUrl: (metadata['logoUrl'] as string | undefined) ?? null,
  };
}

export async function getTenantProfile(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { plan: { select: { id: true, name: true, displayName: true } } },
  });
  if (!tenant) throw new NotFoundError('Tenant', tenantId);
  return serializeTenant(tenant);
}

export async function updateTenantProfile(tenantId: string, dto: UpdateTenantDto) {
  const existing = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!existing) throw new NotFoundError('Tenant', tenantId);

  const metadata = { ...(existing.metadata as Record<string, unknown> | null), } as Record<string, unknown>;
  if (dto.logoUrl !== undefined) metadata['logoUrl'] = dto.logoUrl;

  const updated = await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.companyName !== undefined && { companyName: dto.companyName }),
      ...(dto.timezone !== undefined && { timezone: dto.timezone }),
      metadata: metadata as any,
    },
  });

  logger.info({ tenantId }, 'Tenant profile updated');
  return serializeTenant(updated);
}

export async function getNotificationPrefs(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { notificationPrefs: true } });
  if (!user) throw new NotFoundError('User', userId);
  return { ...DEFAULT_NOTIFICATION_PREFS, ...(user.notificationPrefs as Record<string, unknown>) };
}

export async function updateNotificationPrefs(userId: string, dto: NotificationPrefsDto) {
  const current = await getNotificationPrefs(userId);
  const merged = { ...current, ...dto };

  await prisma.user.update({ where: { id: userId }, data: { notificationPrefs: merged } });
  logger.info({ userId }, 'Notification preferences updated');
  return merged;
}

// ─── WhatsApp Mode (Unofficial/Baileys vs Official/Meta Cloud API) ───────────
// A tenant picks exactly one mode, once. It locks the instant it's set and
// can never be changed through this endpoint again — only a super admin
// override (see admin.service.ts) can move a locked tenant.

export async function setWhatsappMode(tenantId: string, dto: SetWhatsappModeDto) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new NotFoundError('Tenant', tenantId);

  if (tenant.modeLockedAt) {
    throw new ForbiddenError('WhatsApp mode is already locked for this account and cannot be changed.');
  }

  const updated = await prisma.tenant.update({
    where: { id: tenantId },
    data: { whatsappMode: dto.mode, modeLockedAt: new Date() },
  });

  logger.info({ tenantId, mode: dto.mode }, 'WhatsApp mode locked for tenant');
  return serializeTenant(updated);
}
