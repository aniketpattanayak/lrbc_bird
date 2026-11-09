import argon2 from 'argon2';
import * as OTPAuth from 'otpauth';
import { prisma } from '@wsaas/database';
import { getConfig } from '@wsaas/config';
import { createLogger } from '@wsaas/logger';
import { generateToken, hashToken, generateBackupCodes } from '@wsaas/crypto';
import { AuthError, ConflictError, NotFoundError, ValidationError } from '@wsaas/utils';
import type { PublicUser, PublicTenant } from '@wsaas/types';

import {
  generateAccessToken,
  generateRefreshToken,
  generateTempToken,
  verifyRefreshToken,
  getRefreshTokenExpiryDate,
} from '../../services/jwt.service';
import {
  sendVerificationEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  sendLoginAlertEmail,
} from '../../services/email.service';
import type {
  RegisterDto,
  LoginDto,
  Login2faDto,
  Login2faBackupDto,
  ResetPasswordDto,
  ChangePasswordDto,
  UpdateProfileDto,
  Verify2faSetupDto,
  Disable2faDto,
  DeleteAccountDto,
} from './auth.schema';

const logger = createLogger({ name: 'api:auth' });

// ─── Argon2 Configuration ─────────────────────────────────────────────────────
// These are deliberately strong — auth is a one-time operation per login
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536,   // 64 MB
  timeCost: 3,
  parallelism: 4,
};

// ─── Auth Response Types ──────────────────────────────────────────────────────

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface LoginResult {
  requires2FA: boolean;
  tempToken?: string;           // Set when 2FA required
  tokens?: AuthTokens;          // Set when login complete
  user?: PublicUser;
  tenant?: PublicTenant;
}

export interface DeviceInfo {
  ip: string;
  userAgent: string;
}

// ─── REGISTER ────────────────────────────────────────────────────────────────

export async function register(
  dto: RegisterDto,
  device: DeviceInfo,
): Promise<{ message: string }> {
  const config = getConfig();

  // Check registration is enabled
  if (!config.FEATURE_REGISTRATION_ENABLED) {
    throw new ValidationError('Registration is currently disabled');
  }

  // Check email not already registered
  const existing = await prisma.user.findUnique({
    where: { email: dto.email },
    select: { id: true, emailVerified: true },
  });

  if (existing) {
    // Don't reveal if verified or not — just say already exists
    throw new ConflictError(
      'An account with this email address already exists. Try signing in instead.',
    );
  }

  // Hash password
  const passwordHash = (await argon2.hash(dto.password, ARGON2_OPTIONS as any)) as unknown as string;

  // Trial end date
  const trialEndsAt = config.FEATURE_TRIAL_ENABLED
    ? new Date(Date.now() + config.TRIAL_DAYS * 24 * 60 * 60 * 1000)
    : null;

  // Get trial plan for new tenants
  const trialPlan = await prisma.plan.findUnique({ where: { name: 'trial' } });

  // Create tenant + user in a transaction
  const { user, tenant } = await prisma.$transaction(async (tx) => {
    // Create tenant first
    const newTenant = await tx.tenant.create({
      data: {
        name: `${dto.firstName} ${dto.lastName}`,
        email: dto.email,
        companyName: dto.companyName,
        timezone: dto.timezone,
        status: 'UNVERIFIED',
        trialEndsAt,
        currentPlanId: trialPlan?.id,
      },
    });

    // Create owner user
    const newUser = await tx.user.create({
      data: {
        tenantId: newTenant.id,
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: 'OWNER',
        emailVerified: false,
      },
    });

    // Generate email verification token
    const rawToken = generateToken(32);
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await tx.emailVerificationToken.create({
      data: {
        userId: newUser.id,
        tokenHash,
        expiresAt,
      },
    });

    logger.info({ userId: newUser.id, tenantId: newTenant.id }, 'New account registered');

    // Send verification email (fire and forget — don't block registration)
    const verificationUrl = `${config.APP_URL}/verify-email?token=${rawToken}`;
    void sendVerificationEmail({
      to: dto.email,
      firstName: dto.firstName,
      verificationUrl,
    });

    return { user: newUser, tenant: newTenant };
  });

  void user; // Suppress unused warning — user created in tx
  void tenant;

  return {
    message:
      'Account created! Please check your email to verify your address before signing in.',
  };
}

// ─── VERIFY EMAIL ────────────────────────────────────────────────────────────

export async function verifyEmail(token: string): Promise<{ message: string }> {
  const config = getConfig();
  const tokenHash = hashToken(token);

  const tokenRecord = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash },
  });

  if (!tokenRecord) {
    throw new AuthError('AUTH_TOKEN_INVALID', 'Invalid verification link. Please request a new one.');
  }

  if (tokenRecord.usedAt) {
    throw new AuthError('AUTH_TOKEN_INVALID', 'This verification link has already been used. Please sign in.');
  }

  if (tokenRecord.expiresAt < new Date()) {
    throw new AuthError('AUTH_TOKEN_INVALID', 'Verification link has expired. Please request a new one.');
  }

  // Mark token used + verify user + update tenant status in one transaction
  await prisma.$transaction(async (tx) => {
    // Mark token used
    await tx.emailVerificationToken.update({
      where: { id: tokenRecord.id },
      data: { usedAt: new Date() },
    });

    // Verify user
    const user = await tx.user.update({
      where: { id: tokenRecord.userId },
      data: {
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
      include: { tenant: true },
    });

    // Activate tenant trial (or active if no trial configured)
    const newStatus = config.FEATURE_TRIAL_ENABLED ? 'TRIAL' : 'ACTIVE';
    await tx.tenant.update({
      where: { id: user.tenantId },
      data: { status: newStatus },
    });

    logger.info({ userId: user.id, tenantId: user.tenantId }, 'Email verified');

    // Send welcome email
    void sendWelcomeEmail({
      to: user.email,
      firstName: user.firstName,
    });
  });

  return { message: 'Email verified! You can now sign in to your account.' };
}

// ─── RESEND VERIFICATION ──────────────────────────────────────────────────────

export async function resendVerification(email: string): Promise<void> {
  const config = getConfig();

  // Always return success to prevent email enumeration
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, firstName: true, emailVerified: true },
  });

  if (!user || user.emailVerified) {
    // Return silently — don't reveal account status
    return;
  }

  // Rate limit: max 3 tokens in last hour
  const recentTokens = await prisma.emailVerificationToken.count({
    where: {
      userId: user.id,
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
    },
  });

  if (recentTokens >= 3) {
    // Still return success — just don't send another email
    logger.warn({ userId: user.id }, 'Verification resend rate limited');
    return;
  }

  // Invalidate old tokens
  await prisma.emailVerificationToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() }, // Mark as "used" to invalidate
  });

  // Generate new token
  const rawToken = generateToken(32);
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await prisma.emailVerificationToken.create({
    data: { userId: user.id, tokenHash, expiresAt },
  });

  const verificationUrl = `${config.APP_URL}/verify-email?token=${rawToken}`;
  void sendVerificationEmail({
    to: email,
    firstName: user.firstName,
    verificationUrl,
  });
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────

export async function login(dto: LoginDto, device: DeviceInfo): Promise<LoginResult> {
  // Find user — include tenant for status check
  const user = await prisma.user.findUnique({
    where: { email: dto.email },
    include: {
      tenant: {
        include: { plan: true },
      },
    },
  });

  // ── Account not found ────────────────────────────────────────────────────
  if (!user || !user.passwordHash) {
    // Constant-time compare prevents timing attacks revealing email existence
    await argon2.verify('$argon2id$v=19$m=65536,t=3,p=4$fakehash', 'fakepw').catch(() => {});
    throw new AuthError('AUTH_INVALID_CREDENTIALS', 'Invalid email or password');
  }

  // ── Account locked ───────────────────────────────────────────────────────
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    throw new AuthError(
      'AUTH_ACCOUNT_LOCKED',
      `Account temporarily locked due to too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`,
    );
  }

  // ── Email not verified ───────────────────────────────────────────────────
  if (!user.emailVerified) {
    throw new AuthError(
      'AUTH_ACCOUNT_UNVERIFIED',
      'Please verify your email address before signing in. Check your inbox for the verification email.',
    );
  }

  // ── Verify password ──────────────────────────────────────────────────────
  const passwordValid = await argon2.verify(user.passwordHash, dto.password);

  if (!passwordValid) {
    // Increment failed login counter
    const newCount = user.failedLoginCount + 1;
    const lockedUntil = newCount >= 5
      ? new Date(Date.now() + 15 * 60 * 1000) // Lock for 15 minutes
      : null;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: newCount,
        lockedUntil,
      },
    });

    if (lockedUntil) {
      throw new AuthError(
        'AUTH_ACCOUNT_LOCKED',
        'Too many failed attempts. Account locked for 15 minutes.',
      );
    }

    const attemptsLeft = 5 - newCount;
    throw new AuthError(
      'AUTH_INVALID_CREDENTIALS',
      `Invalid email or password. ${attemptsLeft} attempt${attemptsLeft !== 1 ? 's' : ''} remaining before lockout.`,
    );
  }

  // ── Reset failed login count ─────────────────────────────────────────────
  if (user.failedLoginCount > 0 || user.lockedUntil) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  }

  // ── Account suspended ────────────────────────────────────────────────────
  if (user.tenant.status === 'SUSPENDED') {
    throw new AuthError(
      'AUTH_ACCOUNT_SUSPENDED',
      'Your account has been suspended. Please contact support.',
    );
  }

  if (user.tenant.status === 'DELETED') {
    throw new AuthError('AUTH_INVALID_CREDENTIALS', 'Invalid email or password');
  }

  // ── 2FA required ─────────────────────────────────────────────────────────
  if (user.twoFactorEnabled) {
    const tempToken = generateTempToken({ userId: user.id, tenantId: user.tenantId });
    return { requires2FA: true, tempToken };
  }

  // ── Complete login ────────────────────────────────────────────────────────
  const tokens = await createSession(user.id, user.tenantId, dto.rememberMe, device);

  // Detect new device for security alert
  if (user.lastLoginIp && user.lastLoginIp !== device.ip) {
    void sendLoginAlertEmail({
      to: user.email,
      firstName: user.firstName,
      ipAddress: device.ip,
      userAgent: device.userAgent,
      time: new Date(),
    });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date(), lastLoginIp: device.ip },
  });

  logger.info({ userId: user.id, tenantId: user.tenantId }, 'User logged in');

  return {
    requires2FA: false,
    tokens,
    user: toPublicUser(user),
    tenant: toPublicTenant(user.tenant),
  };
}

// ─── LOGIN 2FA ────────────────────────────────────────────────────────────────

export async function login2fa(dto: Login2faDto, device: DeviceInfo): Promise<LoginResult> {
  const { verifyTempToken } = await import('../../services/jwt.service');

  let payload;
  try {
    payload = verifyTempToken(dto.tempToken);
  } catch {
    throw new AuthError('AUTH_TOKEN_INVALID', 'Invalid or expired session. Please sign in again.');
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: { tenant: true },
  });

  if (!user || !user.twoFactorSecret) {
    throw new AuthError('AUTH_TOKEN_INVALID', 'Invalid session');
  }

  // Verify TOTP code
  const totp = new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(user.twoFactorSecret),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });

  const delta = totp.validate({ token: dto.code, window: 1 });

  if (delta === null) {
    throw new AuthError('AUTH_2FA_INVALID', 'Invalid authentication code. Please try again.');
  }

  const tokens = await createSession(user.id, user.tenantId, false, device);

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date(), lastLoginIp: device.ip },
  });

  logger.info({ userId: user.id }, '2FA login successful');

  return {
    requires2FA: false,
    tokens,
    user: toPublicUser(user),
    tenant: toPublicTenant(user.tenant),
  };
}

// ─── LOGIN 2FA WITH BACKUP CODE ───────────────────────────────────────────────

export async function login2faBackup(
  dto: Login2faBackupDto,
  device: DeviceInfo,
): Promise<LoginResult> {
  const { verifyTempToken } = await import('../../services/jwt.service');

  let payload;
  try {
    payload = verifyTempToken(dto.tempToken);
  } catch {
    throw new AuthError('AUTH_TOKEN_INVALID', 'Invalid or expired session. Please sign in again.');
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: { tenant: true },
  });

  if (!user) {
    throw new AuthError('AUTH_TOKEN_INVALID', 'Invalid session');
  }

  // Normalize backup code (remove dash, uppercase)
  const normalizedCode = dto.backupCode.replace('-', '').toUpperCase();
  const codeHash = hashToken(normalizedCode);

  // Check if code exists and mark it used
  const codeIndex = user.twoFactorBackupCodes.indexOf(codeHash);
  if (codeIndex === -1) {
    throw new AuthError('AUTH_2FA_INVALID', 'Invalid backup code');
  }

  // Remove the used backup code (one-time use)
  const updatedCodes = [...user.twoFactorBackupCodes];
  updatedCodes.splice(codeIndex, 1);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      twoFactorBackupCodes: updatedCodes,
      lastLoginAt: new Date(),
      lastLoginIp: device.ip,
    },
  });

  const tokens = await createSession(user.id, user.tenantId, false, device);

  logger.info({ userId: user.id }, '2FA backup code login successful');

  return {
    requires2FA: false,
    tokens,
    user: toPublicUser(user),
    tenant: toPublicTenant(user.tenant),
  };
}

// ─── REFRESH TOKEN ────────────────────────────────────────────────────────────

export async function refreshTokens(
  rawRefreshToken: string,
): Promise<{ accessToken: string; newRefreshToken: string; newRefreshTokenHash: string }> {
  // Verify JWT signature + expiry
  let payload;
  try {
    payload = verifyRefreshToken(rawRefreshToken);
  } catch {
    throw new AuthError('AUTH_TOKEN_INVALID', 'Invalid or expired session. Please sign in again.');
  }

  const tokenHash = hashToken(rawRefreshToken);

  // Look up session in DB
  const session = await prisma.userSession.findUnique({
    where: { refreshTokenHash: tokenHash },
    include: {
      user: {
        include: { tenant: true },
      },
    },
  });

  if (!session) {
    // Token not found — could be a reuse attempt (token already rotated)
    // Log for security monitoring
    logger.warn({ userId: payload.sub }, 'Refresh token reuse detected — possible token theft');
    // Revoke all sessions for this user as a precaution
    await prisma.userSession.updateMany({
      where: { userId: payload.sub },
      data: { revokedAt: new Date() },
    });
    throw new AuthError('AUTH_TOKEN_INVALID', 'Session invalid. Please sign in again.');
  }

  if (session.revokedAt) {
    throw new AuthError('AUTH_TOKEN_INVALID', 'Session has been revoked. Please sign in again.');
  }

  if (session.expiresAt < new Date()) {
    throw new AuthError('AUTH_TOKEN_INVALID', 'Session expired. Please sign in again.');
  }

  const { user } = session;

  // Check user/tenant still active
  if (user.tenant.status === 'SUSPENDED' || user.tenant.status === 'DELETED') {
    throw new AuthError('AUTH_ACCOUNT_SUSPENDED', 'Account suspended. Please contact support.');
  }

  // Rotate refresh token — invalidate old, create new
  const { token: newRefreshToken, tokenHash: newRefreshTokenHash } = generateRefreshToken({
    userId: user.id,
    tenantId: user.tenantId,
  });

  const newExpiresAt = new Date(session.expiresAt); // Keep same expiry window

  await prisma.$transaction([
    // Revoke old token
    prisma.userSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    }),
    // Create new session with rotated token
    prisma.userSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: newRefreshTokenHash,
        deviceInfo: session.deviceInfo as object,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        expiresAt: newExpiresAt,
      },
    }),
  ]);

  // Generate new access token
  const accessToken = generateAccessToken({
    userId: user.id,
    tenantId: user.tenantId,
    role: user.role,
    email: user.email,
  });

  return { accessToken, newRefreshToken, newRefreshTokenHash };
}

// ─── LOGOUT ───────────────────────────────────────────────────────────────────

export async function logout(refreshToken: string): Promise<void> {
  const tokenHash = hashToken(refreshToken);
  await prisma.userSession.updateMany({
    where: { refreshTokenHash: tokenHash },
    data: { revokedAt: new Date() },
  });
}

export async function logoutAll(userId: string): Promise<number> {
  const result = await prisma.userSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  logger.info({ userId, count: result.count }, 'All sessions revoked');
  return result.count;
}

// ─── FORGOT PASSWORD ─────────────────────────────────────────────────────────

export async function forgotPassword(email: string): Promise<void> {
  const config = getConfig();

  // Always return success — don't reveal if email exists
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, firstName: true, emailVerified: true },
  });

  if (!user || !user.emailVerified) return;

  // Rate limit: max 3 reset emails per hour per email
  const recentTokens = await prisma.passwordResetToken.count({
    where: {
      userId: user.id,
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
    },
  });

  if (recentTokens >= 3) {
    logger.warn({ userId: user.id }, 'Password reset rate limited');
    return;
  }

  // Invalidate existing tokens
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const rawToken = generateToken(32);
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt },
  });

  const resetUrl = `${config.APP_URL}/reset-password?token=${rawToken}`;
  void sendPasswordResetEmail({ to: email, firstName: user.firstName, resetUrl });
}

// ─── RESET PASSWORD ───────────────────────────────────────────────────────────

export async function resetPassword(dto: ResetPasswordDto): Promise<void> {
  const tokenHash = hashToken(dto.token);

  const tokenRecord = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
  });

  if (!tokenRecord) {
    throw new AuthError('AUTH_TOKEN_INVALID', 'Invalid or expired reset link. Please request a new one.');
  }

  if (tokenRecord.usedAt) {
    throw new AuthError('AUTH_TOKEN_INVALID', 'This reset link has already been used.');
  }

  if (tokenRecord.expiresAt < new Date()) {
    throw new AuthError('AUTH_TOKEN_INVALID', 'Reset link has expired. Please request a new one.');
  }

  const user = await prisma.user.findUnique({
    where: { id: tokenRecord.userId },
    select: { id: true, email: true, firstName: true },
  });

  if (!user) {
    throw new AuthError('AUTH_TOKEN_INVALID', 'Invalid reset link');
  }

  const newPasswordHash = (await argon2.hash(dto.password, ARGON2_OPTIONS as any)) as unknown as string;

  await prisma.$transaction([
    // Update password
    prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newPasswordHash,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    }),
    // Mark token used
    prisma.passwordResetToken.update({
      where: { id: tokenRecord.id },
      data: { usedAt: new Date() },
    }),
    // Revoke all sessions (security)
    prisma.userSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  void sendPasswordChangedEmail({ to: user.email, firstName: user.firstName });
  logger.info({ userId: user.id }, 'Password reset successfully');
}

// ─── CHANGE PASSWORD (authenticated) ─────────────────────────────────────────

export async function changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, firstName: true, passwordHash: true },
  });

  if (!user || !user.passwordHash) {
    throw new NotFoundError('User', userId);
  }

  const currentValid = await argon2.verify(user.passwordHash, dto.currentPassword);
  if (!currentValid) {
    throw new AuthError('AUTH_INVALID_CREDENTIALS', 'Current password is incorrect');
  }

  const newHash = (await argon2.hash(dto.newPassword, ARGON2_OPTIONS as any)) as unknown as string;

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    }),
    // Revoke all OTHER sessions (keep current)
    prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  void sendPasswordChangedEmail({ to: user.email, firstName: user.firstName });
  logger.info({ userId }, 'Password changed');
}

// ─── GET CURRENT USER ────────────────────────────────────────────────────────

export async function getCurrentUser(
  userId: string,
): Promise<{ user: PublicUser; tenant: PublicTenant }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { tenant: { include: { plan: true } } },
  });

  if (!user) throw new NotFoundError('User');

  return { user: toPublicUser(user), tenant: toPublicTenant(user.tenant) };
}

// ─── UPDATE PROFILE ───────────────────────────────────────────────────────────

export async function updateProfile(userId: string, dto: UpdateProfileDto): Promise<PublicUser> {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      firstName: dto.firstName,
      lastName: dto.lastName,
      ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
      ...(dto.companyName !== undefined && {
        tenant: { update: { companyName: dto.companyName } },
      }),
    },
  });

  if (dto.timezone) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user) {
      await prisma.tenant.update({
        where: { id: user.tenantId },
        data: { timezone: dto.timezone },
      });
    }
  }

  return toPublicUser(updated);
}

// ─── LIST SESSIONS ────────────────────────────────────────────────────────────

export async function listSessions(userId: string, currentTokenHash: string) {
  const sessions = await prisma.userSession.findMany({
    where: { userId, revokedAt: null, expiresAt: { gte: new Date() } },
    orderBy: { createdAt: 'desc' },
  });

  return sessions.map((s) => ({
    id: s.id,
    deviceInfo: s.deviceInfo,
    ipAddress: s.ipAddress,
    userAgent: s.userAgent,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    isCurrent: s.refreshTokenHash === currentTokenHash,
  }));
}

// ─── REVOKE SESSION ───────────────────────────────────────────────────────────

export async function revokeSession(sessionId: string, userId: string): Promise<void> {
  const session = await prisma.userSession.findUnique({
    where: { id: sessionId },
  });

  if (!session || session.userId !== userId) {
    throw new NotFoundError('Session');
  }

  await prisma.userSession.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });
}

// ─── 2FA SETUP ────────────────────────────────────────────────────────────────

export async function setup2fa(userId: string): Promise<{
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}> {
  const config = getConfig();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, twoFactorEnabled: true },
  });

  if (!user) throw new NotFoundError('User');
  if (user.twoFactorEnabled) {
    throw new ConflictError('2FA is already enabled on your account');
  }

  // Generate TOTP secret
  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({
    issuer: config.APP_NAME,
    label: user.email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  });

  const qrCodeUrl = totp.toString(); // otpauth:// URI for QR code generation
  const secretBase32 = secret.base32;

  // Generate backup codes
  const { plaintext: backupCodes, hashed: hashedCodes } = generateBackupCodes(10);

  // Store secret temporarily (not activated until verification)
  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorSecret: secretBase32,
      twoFactorBackupCodes: hashedCodes,
      // twoFactorEnabled stays false until verify2faSetup called
    },
  });

  return { secret: secretBase32, qrCodeUrl, backupCodes };
}

export async function verify2faSetup(
  userId: string,
  dto: Verify2faSetupDto,
): Promise<{ backupCodes: string[] }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorSecret: true, twoFactorEnabled: true, twoFactorBackupCodes: true },
  });

  if (!user || !user.twoFactorSecret) {
    throw new ValidationError('2FA setup not initiated. Please start the setup process again.');
  }

  if (user.twoFactorEnabled) {
    throw new ConflictError('2FA is already enabled');
  }

  const totp = new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(user.twoFactorSecret),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });

  const delta = totp.validate({ token: dto.code, window: 1 });
  if (delta === null) {
    throw new ValidationError('Invalid code. Please check your authenticator app and try again.');
  }

  // Activate 2FA
  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: true },
  });

  logger.info({ userId }, '2FA enabled');

  // Return unhashed backup codes (shown once)
  const { plaintext } = generateBackupCodes(10);

  // Store new hashed codes
  const { hashed } = generateBackupCodes(10);
  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorBackupCodes: hashed },
  });

  return { backupCodes: plaintext };
}

export async function disable2fa(userId: string, dto: Disable2faDto): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, twoFactorEnabled: true },
  });

  if (!user || !user.passwordHash) throw new NotFoundError('User');
  if (!user.twoFactorEnabled) {
    throw new ConflictError('2FA is not enabled on your account');
  }

  const valid = await argon2.verify(user.passwordHash, dto.password);
  if (!valid) {
    throw new AuthError('AUTH_INVALID_CREDENTIALS', 'Incorrect password');
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorBackupCodes: [],
    },
  });

  logger.info({ userId }, '2FA disabled');
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

async function createSession(
  userId: string,
  tenantId: string,
  rememberMe: boolean,
  device: DeviceInfo,
): Promise<AuthTokens> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, email: true },
  });

  if (!user) throw new NotFoundError('User');

  const accessToken = generateAccessToken({
    userId,
    tenantId,
    role: user.role,
    email: user.email,
  });

  const { token: refreshToken, tokenHash } = generateRefreshToken({ userId, tenantId });
  const expiresAt = getRefreshTokenExpiryDate(rememberMe);

  await prisma.userSession.create({
    data: {
      userId,
      refreshTokenHash: tokenHash,
      deviceInfo: {
        userAgent: device.userAgent,
        ip: device.ip,
      },
      ipAddress: device.ip,
      userAgent: device.userAgent,
      expiresAt,
    },
  });

  return { accessToken, refreshToken, expiresAt };
}

// Strip sensitive fields for API responses
function toPublicUser(user: {
  id: string;
  tenantId: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  lastLoginAt: Date | null;
  isSuperAdmin: boolean;
  createdAt: Date;
}): PublicUser {
  return {
    id: user.id,
    tenantId: user.tenantId,
    email: user.email,
    role: user.role as PublicUser['role'],
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl,
    emailVerified: user.emailVerified,
    twoFactorEnabled: user.twoFactorEnabled,
    lastLoginAt: user.lastLoginAt,
    isSuperAdmin: user.isSuperAdmin,
    createdAt: user.createdAt,
  };
}

function toPublicTenant(tenant: {
  id: string;
  name: string;
  email: string;
  companyName: string | null;
  timezone: string;
  status: string;
  trialEndsAt: Date | null;
  currentPlanId: string | null;
  createdAt: Date;
  whatsappMode?: string | null;
  modeLockedAt?: Date | null;
}): PublicTenant {
  return {
    id: tenant.id,
    name: tenant.name,
    email: tenant.email,
    companyName: tenant.companyName,
    timezone: tenant.timezone,
    status: tenant.status as PublicTenant['status'],
    trialEndsAt: tenant.trialEndsAt,
    currentPlanId: tenant.currentPlanId,
    createdAt: tenant.createdAt,
    whatsappMode: (tenant.whatsappMode ?? null) as PublicTenant['whatsappMode'],
    modeLockedAt: tenant.modeLockedAt ?? null,
  };
}

// ─── DELETE ACCOUNT ───────────────────────────────────────────────────────────

export async function deleteAccount(userId: string, dto: DeleteAccountDto): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) throw new NotFoundError('User');

  if (!user.passwordHash || !(await argon2.verify(user.passwordHash, dto.password))) {
    throw new AuthError('AUTH_INVALID_CREDENTIALS', 'Incorrect password');
  }

  if (user.role === 'OWNER') {
    const ownerCount = await prisma.user.count({
      where: { tenantId: user.tenantId, role: 'OWNER', deletedAt: null },
    });
    const memberCount = await prisma.user.count({
      where: { tenantId: user.tenantId, deletedAt: null },
    });
    if (ownerCount <= 1 && memberCount > 1) {
      throw new ConflictError(
        'Transfer ownership to another team member before deleting your account, or remove the rest of the team first.',
      );
    }
  }

  await prisma.$transaction([
    prisma.userSession.deleteMany({ where: { userId } }),
    prisma.user.update({ where: { id: userId }, data: { deletedAt: new Date() } }),
  ]);

  logger.info({ userId, tenantId: user.tenantId }, 'User account deleted');
}

