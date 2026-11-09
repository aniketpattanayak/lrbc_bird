import { prisma } from '@wsaas/database';
import { NotFoundError, ConflictError } from '@wsaas/utils';
import { generateWebhookSecret, generateWebhookSignature } from '@wsaas/crypto';
import { createLogger } from '@wsaas/logger';
import type { CreateWebhookDto, UpdateWebhookDto } from './webhooks.schema';

const logger = createLogger({ name: 'api:webhooks' });

async function getOwnedConfig(tenantId: string, configId: string) {
  const config = await prisma.webhookConfig.findUnique({
    where: { id: configId },
    include: { instance: { select: { id: true, tenantId: true, name: true } } },
  });
  if (!config || config.instance.tenantId !== tenantId) {
    throw new NotFoundError('Webhook', configId);
  }
  return config;
}

function serialize(config: Awaited<ReturnType<typeof getOwnedConfig>> | (Awaited<ReturnType<typeof getOwnedConfig>> & object)) {
  return {
    id: config.id,
    instanceId: config.instance.id,
    instanceName: config.instance.name,
    url: config.url,
    events: config.events,
    isEnabled: config.isEnabled,
    secretPrefix: config.secretPrefix,
    maxRetries: config.maxRetries,
    timeoutSeconds: config.timeoutSeconds,
    customHeaders: config.customHeaders,
    consecutiveFails: config.consecutiveFails,
    lastSuccessAt: config.lastSuccessAt,
    lastFailureAt: config.lastFailureAt,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  };
}

export async function listWebhooks(tenantId: string) {
  const configs = await prisma.webhookConfig.findMany({
    where: { instance: { tenantId } },
    include: { instance: { select: { id: true, tenantId: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return configs.map(serialize);
}

export async function createWebhook(tenantId: string, dto: CreateWebhookDto) {
  const instance = await prisma.instance.findUnique({ where: { id: dto.instanceId } });
  if (!instance || instance.tenantId !== tenantId || instance.deletedAt) {
    throw new NotFoundError('Instance', dto.instanceId);
  }

  const existing = await prisma.webhookConfig.findUnique({ where: { instanceId: dto.instanceId } });
  if (existing) {
    throw new ConflictError('This instance already has a webhook configured. Edit it instead.');
  }

  const { secret, secretHash, secretPrefix } = generateWebhookSecret();

  const config = await prisma.webhookConfig.create({
    data: {
      instanceId: dto.instanceId,
      url: dto.url,
      secretHash,
      secretPrefix,
      events: dto.events,
      timeoutSeconds: dto.timeoutSeconds ?? 10,
      maxRetries: dto.maxRetries ?? 7,
      customHeaders: dto.customHeaders ?? undefined,
    },
    include: { instance: { select: { id: true, tenantId: true, name: true } } },
  });

  logger.info({ tenantId, instanceId: dto.instanceId, configId: config.id }, 'Webhook config created');

  return { ...serialize(config), secret };
}

export async function updateWebhook(tenantId: string, configId: string, dto: UpdateWebhookDto) {
  await getOwnedConfig(tenantId, configId);

  const updated = await prisma.webhookConfig.update({
    where: { id: configId },
    data: {
      ...(dto.url !== undefined && { url: dto.url }),
      ...(dto.events !== undefined && { events: dto.events }),
      ...(dto.isEnabled !== undefined && { isEnabled: dto.isEnabled }),
      ...(dto.timeoutSeconds !== undefined && { timeoutSeconds: dto.timeoutSeconds }),
      ...(dto.maxRetries !== undefined && { maxRetries: dto.maxRetries }),
      ...(dto.customHeaders !== undefined && { customHeaders: dto.customHeaders }),
    },
    include: { instance: { select: { id: true, tenantId: true, name: true } } },
  });

  logger.info({ tenantId, configId }, 'Webhook config updated');
  return serialize(updated);
}

export async function deleteWebhook(tenantId: string, configId: string) {
  await getOwnedConfig(tenantId, configId);
  await prisma.webhookConfig.delete({ where: { id: configId } });
  logger.info({ tenantId, configId }, 'Webhook config deleted');
}

export async function rotateSecret(tenantId: string, configId: string) {
  await getOwnedConfig(tenantId, configId);
  const { secret, secretHash, secretPrefix } = generateWebhookSecret();

  await prisma.webhookConfig.update({ where: { id: configId }, data: { secretHash, secretPrefix } });
  logger.info({ tenantId, configId }, 'Webhook secret rotated');

  return { secret, secretPrefix };
}

export async function listDeliveries(tenantId: string, configId: string, limit = 50) {
  const config = await getOwnedConfig(tenantId, configId);

  const deliveries = await prisma.webhookDelivery.findMany({
    where: { instanceId: config.instance.id },
    orderBy: { attemptedAt: 'desc' },
    take: limit,
    include: { event: { select: { eventType: true } } },
  });

  return deliveries.map((d) => ({
    id: d.id,
    eventType: d.event.eventType,
    attemptNumber: d.attemptNumber,
    status: d.status,
    httpStatusCode: d.httpStatusCode,
    latencyMs: d.latencyMs,
    errorMessage: d.errorMessage,
    attemptedAt: d.attemptedAt,
  }));
}

/**
 * Sends a sample payload to the configured URL right now, synchronously,
 * so the dashboard "Test delivery" button gets an immediate result rather
 * than going through the async queue.
 */
export async function testDelivery(tenantId: string, configId: string) {
  const config = await getOwnedConfig(tenantId, configId);

  const envelope = {
    id: 'test_' + Math.random().toString(36).slice(2, 10),
    apiVersion: '2025-01',
    event: config.events[0] ?? 'message.received',
    instanceId: config.instance.id,
    timestamp: new Date().toISOString(),
    data: { test: true, message: 'This is a test delivery from your WhatsApp SaaS dashboard.' },
  };

  const rawBody = JSON.stringify(envelope);
  const signature = generateWebhookSignature(config.secretHash, rawBody);

  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), (config.timeoutSeconds || 10) * 1000);

  // Record this as a real WebhookEvent so the delivery shows up in the
  // dashboard's "View log" list, same as a production delivery would.
  const event = await prisma.webhookEvent.create({
    data: {
      tenantId,
      instanceId: config.instance.id,
      eventType: envelope.event,
      payload: envelope,
    },
  });

  let result: {
    success: boolean;
    httpStatusCode: number | null;
    responseBody: string | null;
    errorMessage?: string;
    latencyMs: number;
  };

  try {
    const response = await fetch(config.url, {
      method: 'POST',
      body: rawBody,
      headers: {
        'Content-Type': 'application/json',
        'X-WA-Signature': signature,
        'X-WA-Event': envelope.event,
        'X-WA-Delivery-Id': 'test',
      },
      signal: controller.signal,
    });
    const body = await response.text().catch(() => '');
    result = {
      success: response.ok,
      httpStatusCode: response.status,
      responseBody: body.slice(0, 2000),
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    result = {
      success: false,
      httpStatusCode: null,
      responseBody: null,
      errorMessage: isAbort ? 'Request timed out' : err instanceof Error ? err.message : 'Request failed',
      latencyMs: Date.now() - start,
    };
  } finally {
    clearTimeout(timeout);
  }

  await prisma.webhookDelivery.create({
    data: {
      eventId: event.id,
      instanceId: config.instance.id,
      attemptNumber: 1,
      status: result.success ? 'SUCCESS' : 'FAILED',
      httpStatusCode: result.httpStatusCode,
      responseBody: result.responseBody,
      errorMessage: result.errorMessage,
      latencyMs: result.latencyMs,
    },
  });

  return result;
}

