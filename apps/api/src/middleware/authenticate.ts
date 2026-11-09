import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { prisma } from '@wsaas/database';
import { getRedis, getJson, setJson } from '@wsaas/redis';
import { hashApiKey } from '@wsaas/crypto';
import { createLogger } from '@wsaas/logger';
import { REDIS_KEYS } from '@wsaas/types';

import { verifyAccessToken } from '../services/jwt.service';

const logger = createLogger({ name: 'api:auth' });

// API key cache TTL: 5 minutes
// Avoids DB hit on every API request — invalidated on key revocation
const API_KEY_CACHE_TTL = 300;

// ─── Auth Context ─────────────────────────────────────────────────────────────
// Attached to the FastifyRequest object for downstream handlers

export interface AuthContext {
  userId: string;
  tenantId: string;
  role: string;
  email: string;
  apiKeyId?: string;
}

// Extend FastifyRequest with auth properties
declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
    tenantId: string;
    userRole: string;
    userEmail: string;
    apiKeyId?: string;
  }
}

// ─── Authenticate Middleware ──────────────────────────────────────────────────

/**
 * Validates the request's authentication.
 * Accepts either:
 *   - Bearer <JWT access token> in Authorization header
 *   - X-API-Key: wapi_live_... header
 *
 * On success: attaches userId, tenantId, userRole to request
 * On failure: returns 401 immediately
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers['authorization'];
  const apiKeyHeader = request.headers['x-api-key'];

  // ── Try API key first (most common for programmatic access) ───────────────
  if (apiKeyHeader && typeof apiKeyHeader === 'string' && apiKeyHeader.startsWith('wapi_')) {
    try {
      await authenticateWithApiKey(request, apiKeyHeader);
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid API key';
      void reply.status(401).send({
        success: false,
        requestId: request.id,
        error: { code: 'AUTH_INVALID_KEY', message },
      });
      return;
    }
  }

  // ── Try JWT Bearer token (dashboard / web sessions) ───────────────────────
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      authenticateWithJWT(request, token);
      return;
    } catch (err) {
      const code = err instanceof Error && err.message === 'ACCESS_TOKEN_EXPIRED'
        ? 'AUTH_TOKEN_EXPIRED'
        : 'AUTH_TOKEN_INVALID';
      void reply.status(401).send({
        success: false,
        requestId: request.id,
        error: { code, message: 'Authentication required' },
      });
      return;
    }
  }

  // ── No credentials provided ───────────────────────────────────────────────
  void reply.status(401).send({
    success: false,
    requestId: request.id,
    error: {
      code: 'AUTH_INVALID_KEY',
      message: 'Authentication required. Provide a Bearer token or X-API-Key header.',
    },
  });
}

// ─── JWT Authentication ───────────────────────────────────────────────────────

function authenticateWithJWT(request: FastifyRequest, token: string): void {
  const payload = verifyAccessToken(token); // Throws on invalid/expired

  request.userId = payload.sub;
  request.tenantId = payload.tid;
  request.userRole = payload.role;
  request.userEmail = payload.email;
}

// ─── API Key Authentication ───────────────────────────────────────────────────

async function authenticateWithApiKey(
  request: FastifyRequest,
  rawApiKey: string,
): Promise<void> {
  const keyHash = hashApiKey(rawApiKey);
  const cacheKey = REDIS_KEYS.API_KEY_CACHE(keyHash);

  // ── Check Redis cache first ────────────────────────────────────────────────
  const redis = getRedis();
  const cached = await getJson<ApiKeyCacheEntry>(redis, cacheKey);

  if (cached) {
    if (cached.revoked) {
      throw new Error('API key has been revoked');
    }

    applyApiKeyContext(request, cached);

    // Update usage count async (don't await — keep request fast)
    void updateApiKeyUsage(cached.keyId, request.ip);
    return;
  }

  // ── Cache miss — query database ───────────────────────────────────────────
  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash },
    include: {
      tenant: {
        select: {
          id: true,
          status: true,
          currentPlanId: true,
        },
      },
    },
  });

  if (!apiKey) {
    // Cache the miss to prevent DB hammering with invalid keys
    await setJson(redis, cacheKey, { revoked: true }, 60); // 1 minute cache
    throw new Error('Invalid API key');
  }

  if (apiKey.revokedAt) {
    await setJson(redis, cacheKey, { revoked: true }, API_KEY_CACHE_TTL);
    throw new Error('API key has been revoked');
  }

  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    throw new Error('API key has expired');
  }

  // Check tenant account status
  const { tenant } = apiKey;
  if (tenant.status === 'SUSPENDED') {
    throw new Error('Account suspended. Please contact support.');
  }
  if (tenant.status === 'DELETED' || tenant.status === 'UNVERIFIED') {
    throw new Error('Invalid API key');
  }

  // Check IP whitelist if configured
  if (apiKey.ipWhitelist.length > 0) {
    const clientIp = request.ip;
    const allowed = isIpAllowed(clientIp, apiKey.ipWhitelist);
    if (!allowed) {
      logger.warn(
        { ip: clientIp, keyId: apiKey.id, tenantId: apiKey.tenantId },
        'API request from unauthorized IP',
      );
      throw new Error('Request from unauthorized IP address');
    }
  }

  // Build cache entry for future requests
  const cacheEntry: ApiKeyCacheEntry = {
    keyId: apiKey.id,
    tenantId: apiKey.tenantId,
    revoked: false,
    planId: tenant.currentPlanId ?? null,
    accountStatus: tenant.status,
  };

  await setJson(redis, cacheKey, cacheEntry, API_KEY_CACHE_TTL);

  applyApiKeyContext(request, cacheEntry);

  // Get the owner's details for role context
  const owner = await prisma.user.findFirst({
    where: { tenantId: apiKey.tenantId, role: 'OWNER' },
    select: { id: true, role: true, email: true },
  });

  if (owner) {
    request.userId = owner.id;
    request.userRole = owner.role;
    request.userEmail = owner.email;
  }

  void updateApiKeyUsage(apiKey.id, request.ip);
}

interface ApiKeyCacheEntry {
  keyId: string;
  tenantId: string;
  revoked: boolean;
  planId: string | null;
  accountStatus: string;
}

function applyApiKeyContext(request: FastifyRequest, entry: ApiKeyCacheEntry): void {
  request.tenantId = entry.tenantId;
  request.apiKeyId = entry.keyId;
  // userId and userRole set separately from DB
}

async function updateApiKeyUsage(keyId: string, ip: string): Promise<void> {
  try {
    await prisma.apiKey.update({
      where: { id: keyId },
      data: {
        lastUsedAt: new Date(),
        lastUsedIp: ip,
        usageCount: { increment: 1 },
      },
    });
  } catch (err) {
    logger.warn({ err, keyId }, 'Failed to update API key usage');
  }
}

// ─── IP Whitelist Check ───────────────────────────────────────────────────────

function isIpAllowed(clientIp: string, whitelist: string[]): boolean {
  // Simple exact match + basic CIDR support
  for (const entry of whitelist) {
    if (entry === clientIp) return true;

    // Basic CIDR check (for /24, /16, etc.)
    if (entry.includes('/')) {
      if (cidrContains(entry, clientIp)) return true;
    }
  }
  return false;
}

function cidrContains(cidr: string, ip: string): boolean {
  try {
    const [range, bitsStr] = cidr.split('/');
    if (!range || !bitsStr) return false;
    const bits = parseInt(bitsStr, 10);
    const mask = ~(Math.pow(2, 32 - bits) - 1);

    const ipNum = ipToInt(ip);
    const rangeNum = ipToInt(range);

    return (ipNum & mask) === (rangeNum & mask);
  } catch {
    return false;
  }
}

function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

// ─── Role-Based Access Control ────────────────────────────────────────────────

const ROLE_HIERARCHY: Record<string, number> = {
  VIEWER: 0,
  DEVELOPER: 1,
  ADMIN: 2,
  OWNER: 3,
};

/**
 * Creates a middleware that requires the user to have at least the given role.
 * Use after authenticate middleware.
 */
export function requireRole(minRole: string) {
  return function (
    request: FastifyRequest,
    reply: FastifyReply,
    done: HookHandlerDoneFunction,
  ): void {
    const userRoleLevel = ROLE_HIERARCHY[request.userRole] ?? -1;
    const requiredLevel = ROLE_HIERARCHY[minRole] ?? 999;

    if (userRoleLevel < requiredLevel) {
      void reply.status(403).send({
        success: false,
        requestId: request.id,
        error: {
          code: 'AUTH_INSUFFICIENT_ROLE',
          message: `This action requires ${minRole} role or higher`,
        },
      });
      return;
    }

    done();
  };
}
