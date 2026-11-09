import jwt from 'jsonwebtoken';
import { getConfig } from '@wsaas/config';
import { generateToken, hashToken } from '@wsaas/crypto';
import { createLogger } from '@wsaas/logger';

const logger = createLogger({ name: 'api:jwt' });

// ─── Token Payload Types ──────────────────────────────────────────────────────

export interface AccessTokenPayload {
  sub: string;        // userId
  tid: string;        // tenantId
  role: string;       // UserRole
  email: string;
  iss: string;
  iat: number;
  exp: number;
}

export interface RefreshTokenPayload {
  sub: string;        // userId
  tid: string;        // tenantId
  jti: string;        // unique token ID (used for revocation)
  iss: string;
  iat: number;
  exp: number;
}

// Temporary token for 2FA second-step (short-lived)
export interface TempTokenPayload {
  sub: string;        // userId
  tid: string;        // tenantId
  purpose: '2fa';
  iss: string;
  iat: number;
  exp: number;
}

// Admin JWT payload (separate secret)
export interface AdminTokenPayload {
  sub: string;        // adminUserId
  role: string;       // AdminRole
  iss: string;
  iat: number;
  exp: number;
}

// ─── Token Generation ─────────────────────────────────────────────────────────

export function generateAccessToken(payload: {
  userId: string;
  tenantId: string;
  role: string;
  email: string;
}): string {
  const config = getConfig();

  return jwt.sign(
    {
      sub: payload.userId,
      tid: payload.tenantId,
      role: payload.role,
      email: payload.email,
      iss: config.JWT_ISSUER,
    },
    config.JWT_ACCESS_SECRET,
    { expiresIn: config.JWT_ACCESS_EXPIRY as any },
  );
}

export function generateRefreshToken(payload: {
  userId: string;
  tenantId: string;
}): { token: string; tokenHash: string; jti: string } {
  const config = getConfig();
  const jti = generateToken(16); // Unique token ID for revocation

  const token = jwt.sign(
    {
      sub: payload.userId,
      tid: payload.tenantId,
      jti,
      iss: config.JWT_ISSUER,
    },
    config.JWT_REFRESH_SECRET,
    { expiresIn: config.JWT_REFRESH_EXPIRY as any },
  );

  const tokenHash = hashToken(token);
  return { token, tokenHash, jti };
}

// Short-lived token used between step 1 and step 2 of 2FA login
export function generateTempToken(payload: {
  userId: string;
  tenantId: string;
}): string {
  const config = getConfig();

  return jwt.sign(
    {
      sub: payload.userId,
      tid: payload.tenantId,
      purpose: '2fa',
      iss: config.JWT_ISSUER,
    },
    config.JWT_ACCESS_SECRET,
    { expiresIn: '10m' as any }, // Only valid for 10 minutes
  );
}

export function generateAdminToken(payload: {
  adminId: string;
  role: string;
}): string {
  const config = getConfig();

  return jwt.sign(
    {
      sub: payload.adminId,
      role: payload.role,
      iss: 'wsaas-admin',
    },
    config.ADMIN_JWT_SECRET,
    { expiresIn: config.ADMIN_JWT_EXPIRY as any },
  );
}

// ─── Token Verification ───────────────────────────────────────────────────────

export function verifyAccessToken(token: string): AccessTokenPayload {
  const config = getConfig();
  try {
    return jwt.verify(token, config.JWT_ACCESS_SECRET) as AccessTokenPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new Error('ACCESS_TOKEN_EXPIRED');
    }
    throw new Error('ACCESS_TOKEN_INVALID');
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const config = getConfig();
  try {
    return jwt.verify(token, config.JWT_REFRESH_SECRET) as RefreshTokenPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new Error('REFRESH_TOKEN_EXPIRED');
    }
    throw new Error('REFRESH_TOKEN_INVALID');
  }
}

export function verifyTempToken(token: string): TempTokenPayload {
  const config = getConfig();
  try {
    const payload = jwt.verify(token, config.JWT_ACCESS_SECRET) as TempTokenPayload;
    if (payload.purpose !== '2fa') {
      throw new Error('TEMP_TOKEN_INVALID');
    }
    return payload;
  } catch {
    throw new Error('TEMP_TOKEN_INVALID');
  }
}

export function verifyAdminToken(token: string): AdminTokenPayload {
  const config = getConfig();
  try {
    return jwt.verify(token, config.ADMIN_JWT_SECRET) as AdminTokenPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new Error('ADMIN_TOKEN_EXPIRED');
    }
    throw new Error('ADMIN_TOKEN_INVALID');
  }
}

// ─── Token Expiry Helpers ─────────────────────────────────────────────────────

export function getRefreshTokenExpiryDate(rememberMe: boolean): Date {
  // Normal: 30 days, Remember Me: 90 days
  const days = rememberMe ? 90 : 30;
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

export function parseExpiryToMs(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match || !match[1] || !match[2]) {
    logger.warn({ expiry }, 'Could not parse expiry string, defaulting to 15 minutes');
    return 15 * 60 * 1000;
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return value * (multipliers[unit] ?? 60000);
}
