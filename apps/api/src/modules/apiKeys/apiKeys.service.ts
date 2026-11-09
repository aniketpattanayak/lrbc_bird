import { prisma } from '@wsaas/database';
import { getRedis } from '@wsaas/redis';
import { generateApiKey, hashApiKey } from '@wsaas/crypto';
import { NotFoundError } from '@wsaas/utils';
import { REDIS_KEYS } from '@wsaas/types';
import { createLogger } from '@wsaas/logger';

import type { CreateApiKeyDto, UpdateApiKeyDto } from './apiKeys.schema';

const logger = createLogger({ name: 'api:apiKeys' });

// Fields selected when returning an API key — never include keyHash
const API_KEY_SELECT = {
  id: true,
  tenantId: true,
  name: true,
  keyPrefix: true,
  environment: true,
  permissions: true,
  ipWhitelist: true,
  expiresAt: true,
  lastUsedAt: true,
  lastUsedIp: true,
  usageCount: true,
  revokedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

// Convert BigInt fields to Number for JSON serialization
function serializeApiKey(key: any) {
  return {
    ...key,
    usageCount: typeof key.usageCount === 'bigint' ? Number(key.usageCount) : key.usageCount,
  };
}

// ─── List API Keys ─────────────────────────────────────────────────────────────

export async function listApiKeys(tenantId: string) {
  const keys = await prisma.apiKey.findMany({
    where: {
      tenantId,
      revokedAt: null,
    },
    select: API_KEY_SELECT,
    orderBy: { createdAt: 'desc' },
  });
  return keys.map(serializeApiKey);
}

// ─── Create API Key ────────────────────────────────────────────────────────────

export async function createApiKey(tenantId: string, dto: CreateApiKeyDto) {
  const envToken = dto.environment === 'LIVE' ? 'live' : 'test';
  const { fullKey, keyHash, keyPrefix } = generateApiKey(envToken);

  const apiKey = await prisma.apiKey.create({
    data: {
      tenantId,
      name: dto.name,
      keyHash,
      keyPrefix,
      environment: dto.environment as any,
      permissions: dto.permissions,
      ipWhitelist: dto.ipWhitelist,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
    },
    select: API_KEY_SELECT,
  });

  logger.info({ tenantId, keyId: apiKey.id, environment: dto.environment }, 'API key created');

  // Return the raw key ONLY at creation time — never again
  return {
    key: fullKey,
    apiKey: serializeApiKey(apiKey),
  };
}

// ─── Get Single API Key ────────────────────────────────────────────────────────

export async function getApiKey(tenantId: string, keyId: string) {
  const apiKey = await prisma.apiKey.findUnique({
    where: { id: keyId },
    select: API_KEY_SELECT,
  });

  if (!apiKey || apiKey.tenantId !== tenantId) {
    throw new NotFoundError('ApiKey', keyId);
  }

  return serializeApiKey(apiKey);
}

// ─── Update API Key ────────────────────────────────────────────────────────────

export async function updateApiKey(
  tenantId: string,
  keyId: string,
  dto: UpdateApiKeyDto,
) {
  // Ensure the key exists and belongs to this tenant
  await getApiKey(tenantId, keyId);

  const updated = await prisma.apiKey.update({
    where: { id: keyId },
    data: {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.ipWhitelist !== undefined && { ipWhitelist: dto.ipWhitelist }),
    },
    select: API_KEY_SELECT,
  });

  logger.info({ tenantId, keyId }, 'API key updated');

  return serializeApiKey(updated);
}

// ─── Revoke API Key ────────────────────────────────────────────────────────────

export async function revokeApiKey(tenantId: string, keyId: string) {
  // Ensure the key exists and belongs to this tenant
  const existingKey = await prisma.apiKey.findUnique({
    where: { id: keyId },
    select: { id: true, tenantId: true, keyHash: true, revokedAt: true },
  });

  if (!existingKey || existingKey.tenantId !== tenantId) {
    throw new NotFoundError('ApiKey', keyId);
  }

  // Set revokedAt
  await prisma.apiKey.update({
    where: { id: keyId },
    data: { revokedAt: new Date() },
  });

  // Invalidate Redis cache so the key stops working immediately
  const cacheKey = REDIS_KEYS.API_KEY_CACHE(existingKey.keyHash);
  const redis = getRedis();
  await redis.del(cacheKey);

  logger.info({ tenantId, keyId }, 'API key revoked');
}
