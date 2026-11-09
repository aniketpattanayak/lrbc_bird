import { prisma } from '@wsaas/database';
import { NotFoundError, ValidationError, ForbiddenError } from '@wsaas/utils';
import { createLogger } from '@wsaas/logger';
import { getSessionLifecycleQueue } from '@wsaas/queue';
import { JOB_NAMES, JOB_OPTIONS } from '@wsaas/types';
import { verifyPhoneNumber, MetaApiError } from '@wsaas/meta-cloud-api';

import type { CreateInstanceDto, UpdateInstanceDto } from './instances.schema';

const logger = createLogger({ name: 'api:instances' });

// ─── Serializer ───────────────────────────────────────────────────────────────

function serializeInstance(instance: Awaited<ReturnType<typeof prisma.instance.findUniqueOrThrow>>) {
  return {
    ...instance,
    displayName: instance.name,
  };
}

// ─── List Instances ────────────────────────────────────────────────────────────

export async function listInstances(tenantId: string) {
  const instances = await prisma.instance.findMany({
    where: { tenantId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  return instances.map(serializeInstance);
}

// ─── Create Instance ───────────────────────────────────────────────────────────

export async function createInstance(tenantId: string, dto: CreateInstanceDto) {
  // Check plan instance limit
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { plan: true },
  });

  const instanceCount = await prisma.instance.count({
    where: { tenantId, deletedAt: null },
  });

  if (tenant?.plan && instanceCount >= tenant.plan.maxInstances) {
    throw new ValidationError('Instance limit reached for your plan');
  }

  if (!tenant) throw new NotFoundError('Tenant', tenantId);

  // ── Enforce WhatsApp mode lock ──────────────────────────────────────────
  // A tenant must have chosen a mode (via PUT /v1/tenant/whatsapp-mode, or
  // implicitly by creating their very first instance) before creating any
  // instance, and every instance they create afterward must match that
  // locked mode — Unofficial (Baileys/QR) and Official (Meta Cloud API)
  // are mutually exclusive for the lifetime of the account.
  if (tenant.whatsappMode && tenant.whatsappMode !== dto.connectionMode) {
    throw new ForbiddenError(
      tenant.whatsappMode === 'UNOFFICIAL'
        ? 'Your account is configured for Unofficial WhatsApp only. You cannot create a Meta Cloud API (Official) instance.'
        : 'Your account is configured for Official WhatsApp only. You cannot create a QR-based (Unofficial) instance.',
    );
  }

  if (!tenant.whatsappMode || !tenant.modeLockedAt) {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { whatsappMode: dto.connectionMode, modeLockedAt: tenant.modeLockedAt ?? new Date() },
    });
  }

  const isOfficial = dto.connectionMode === 'OFFICIAL';

  // ── Validate Meta credentials for real before creating ──────────────────
  // Calls Meta's Graph API to confirm phoneNumberId/accessToken actually
  // work, so bad credentials fail loudly at creation time instead of the
  // instance silently sitting in a fake CONNECTED state that can never send.
  let verifiedPhoneNumber: { displayPhoneNumber: string; verifiedName: string } | null = null;
  if (isOfficial) {
    try {
      const info = await verifyPhoneNumber(dto.metaPhoneNumberId!, dto.metaAccessToken!);
      verifiedPhoneNumber = { displayPhoneNumber: info.display_phone_number, verifiedName: info.verified_name };
    } catch (err) {
      if (err instanceof MetaApiError) {
        throw new ValidationError(
          `Could not verify these Meta credentials: ${err.message} (make sure the Phone Number ID and Access Token are correct and the token hasn't expired)`,
        );
      }
      throw err;
    }
  }

  const instance = await prisma.instance.create({
    data: {
      tenantId,
      name: dto.displayName,
      description: dto.description ?? null,
      proxyUrl: dto.proxyUrl ?? null,
      phoneNumber: verifiedPhoneNumber?.displayPhoneNumber ?? null,
      displayName: verifiedPhoneNumber?.verifiedName ?? null,
      // Official (Meta Cloud API) instances don't go through Baileys pairing —
      // they're ready to send as soon as credentials are verified.
      status: isOfficial ? 'CONNECTED' : 'INITIALIZING',
      connectedAt: isOfficial ? new Date() : null,
      metadata: isOfficial
        ? ({
            connectionMode: 'OFFICIAL',
            meta: {
              phoneNumberId: dto.metaPhoneNumberId,
              wabaId: dto.metaWabaId,
              webhookVerifyToken: dto.metaWebhookVerifyToken,
              appSecret: dto.metaAppSecret,
              // Stored at rest in the Json metadata column — this codebase has
              // no dedicated encrypted-credentials path for Cloud API tokens
              // the way it does for Baileys session state.
              accessToken: dto.metaAccessToken,
            },
          } as any)
        : ({ connectionMode: 'UNOFFICIAL' } as any),
    },
  });

  logger.info({ tenantId, instanceId: instance.id, connectionMode: dto.connectionMode }, 'Instance created');

  if (!isOfficial) {
    // Enqueue START_SESSION so the worker picks it up immediately
    try {
      const queue = getSessionLifecycleQueue();
      await queue.add(
        JOB_NAMES.START_SESSION,
        { instanceId: instance.id, tenantId },
        JOB_OPTIONS.SESSION,
      );
      logger.info({ instanceId: instance.id }, 'START_SESSION job enqueued');
    } catch (err) {
      // Non-fatal — worker will pick it up on next restart
      logger.error({ err, instanceId: instance.id }, 'Failed to enqueue START_SESSION');
    }
  }

  return serializeInstance(instance);
}

// ─── Get Single Instance ───────────────────────────────────────────────────────

export async function getInstance(tenantId: string, instanceId: string) {
  const instance = await prisma.instance.findUnique({
    where: { id: instanceId },
  });

  if (!instance || instance.tenantId !== tenantId || instance.deletedAt !== null) {
    throw new NotFoundError('Instance', instanceId);
  }

  return serializeInstance(instance);
}

// ─── Update Instance ───────────────────────────────────────────────────────────

export async function updateInstance(
  tenantId: string,
  instanceId: string,
  dto: UpdateInstanceDto,
) {
  await getInstance(tenantId, instanceId);

  const updated = await prisma.instance.update({
    where: { id: instanceId },
    data: {
      ...(dto.displayName !== undefined && { name: dto.displayName }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.proxyUrl !== undefined && { proxyUrl: dto.proxyUrl }),
      ...(dto.autoReconnect !== undefined && { autoReconnect: dto.autoReconnect }),
      ...(dto.maxReconnectAttempts !== undefined && { maxReconnectAttempts: dto.maxReconnectAttempts }),
      ...(dto.messageDelayMs !== undefined && { messageDelayMs: dto.messageDelayMs }),
    },
  });

  logger.info({ tenantId, instanceId }, 'Instance updated');

  return serializeInstance(updated);
}

// ─── Delete Instance (soft delete) ────────────────────────────────────────────

export async function deleteInstance(tenantId: string, instanceId: string) {
  await getInstance(tenantId, instanceId);

  await prisma.instance.update({
    where: { id: instanceId },
    data: { deletedAt: new Date() },
  });

  logger.info({ tenantId, instanceId }, 'Instance soft-deleted');
}

// ─── Get Instance QR Code ──────────────────────────────────────────────────────

export async function getInstanceQr(tenantId: string, instanceId: string) {
  const instance = await getInstance(tenantId, instanceId);

  const { getRedis } = await import('@wsaas/redis');
  const { REDIS_KEYS } = await import('@wsaas/types');
  const redis = getRedis();
  const qrData = await redis.get(REDIS_KEYS.QR_CODE(instanceId));

  if (!qrData) {
    return {
      instanceId,
      status: instance.status,
      qrCode: null,
      message:
        instance.status === 'CONNECTED'
          ? 'Instance is already connected'
          : 'QR code not available yet — the worker is generating it. Try again in a few seconds.',
    };
  }

  let qrImageDataUri: string | null = null;
  try {
    // @ts-ignore — qrcode has no type declarations installed
    const QRCode = await import('qrcode');
    qrImageDataUri = await QRCode.toDataURL(qrData, { width: 300, margin: 2 });
  } catch {
    qrImageDataUri = qrData;
  }

  return {
    instanceId,
    status: instance.status,
    qrCode: qrImageDataUri,
    message: null,
  };
}
