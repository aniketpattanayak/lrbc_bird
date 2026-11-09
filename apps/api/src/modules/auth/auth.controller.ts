import type { FastifyRequest, FastifyReply } from 'fastify';
import { getConfig } from '@wsaas/config';
import { hashToken } from '@wsaas/crypto';
import { validateBody } from '../../utils/zodToJsonSchema';

import * as authService from './auth.service';
import type {
  RegisterDto,
  LoginDto,
  Login2faDto,
  Login2faBackupDto,
  VerifyEmailDto,
  ResendVerificationDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  UpdateProfileDto,
  Verify2faSetupDto,
  Disable2faDto,
  DeleteAccountDto,
} from './auth.schema';
import { resetPasswordSchema } from './auth.schema';

// ─── Cookie Configuration ─────────────────────────────────────────────────────

function getRefreshTokenCookieOptions(expiresAt: Date) {
  const config = getConfig();
  const isProd = config.NODE_ENV === 'production';

  return {
    httpOnly: true,           // JS cannot read this cookie
    secure: isProd,           // HTTPS only in production
    sameSite: 'lax' as const, // CSRF protection
    path: '/',         // Only sent to auth endpoints
    expires: expiresAt,
  };
}

function clearRefreshTokenCookie(reply: FastifyReply): void {
  void reply.clearCookie('refreshToken', { path: '/v1/auth' });
}

// ─── Device info from request ─────────────────────────────────────────────────

function getDeviceInfo(request: FastifyRequest) {
  return {
    ip: request.ip,
    userAgent: request.headers['user-agent'] ?? 'unknown',
  };
}

// ─── Controllers ──────────────────────────────────────────────────────────────

export async function registerController(
  request: FastifyRequest<{ Body: RegisterDto }>,
  reply: FastifyReply,
) {
  const result = await authService.register(request.body, getDeviceInfo(request));
  return reply.status(201).send({ success: true, requestId: request.id, data: result });
}

export async function verifyEmailController(
  request: FastifyRequest<{ Body: VerifyEmailDto }>,
  reply: FastifyReply,
) {
  const result = await authService.verifyEmail(request.body.token);
  return reply.send({ success: true, requestId: request.id, data: result });
}

export async function resendVerificationController(
  request: FastifyRequest<{ Body: ResendVerificationDto }>,
  reply: FastifyReply,
) {
  await authService.resendVerification(request.body.email);
  // Always return success — don't reveal email existence
  return reply.send({
    success: true,
    requestId: request.id,
    data: { message: 'If an unverified account exists, a new verification email has been sent.' },
  });
}

export async function loginController(
  request: FastifyRequest<{ Body: LoginDto }>,
  reply: FastifyReply,
) {
  const result = await authService.login(request.body, getDeviceInfo(request));

  if (result.requires2FA) {
    return reply.send({
      success: true,
      requestId: request.id,
      data: { requires2FA: true, tempToken: result.tempToken },
    });
  }

  // Set refresh token in httpOnly cookie
  if (result.tokens) {
    void reply.setCookie(
      'refreshToken',
      result.tokens.refreshToken,
      getRefreshTokenCookieOptions(result.tokens.expiresAt),
    );
  }

  return reply.send({
    success: true,
    requestId: request.id,
    data: {
      requires2FA: false,
      accessToken: result.tokens?.accessToken,
      user: result.user,
      tenant: result.tenant,
    },
  });
}

export async function login2faController(
  request: FastifyRequest<{ Body: Login2faDto }>,
  reply: FastifyReply,
) {
  const result = await authService.login2fa(request.body, getDeviceInfo(request));

  if (result.tokens) {
    void reply.setCookie(
      'refreshToken',
      result.tokens.refreshToken,
      getRefreshTokenCookieOptions(result.tokens.expiresAt),
    );
  }

  return reply.send({
    success: true,
    requestId: request.id,
    data: {
      accessToken: result.tokens?.accessToken,
      user: result.user,
      tenant: result.tenant,
    },
  });
}

export async function login2faBackupController(
  request: FastifyRequest<{ Body: Login2faBackupDto }>,
  reply: FastifyReply,
) {
  const result = await authService.login2faBackup(request.body, getDeviceInfo(request));

  if (result.tokens) {
    void reply.setCookie(
      'refreshToken',
      result.tokens.refreshToken,
      getRefreshTokenCookieOptions(result.tokens.expiresAt),
    );
  }

  return reply.send({
    success: true,
    requestId: request.id,
    data: {
      accessToken: result.tokens?.accessToken,
      user: result.user,
      tenant: result.tenant,
    },
  });
}

export async function refreshController(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const refreshToken = request.cookies['refreshToken'];

  if (!refreshToken) {
    return reply.status(401).send({
      success: false,
      requestId: request.id,
      error: { code: 'AUTH_TOKEN_INVALID', message: 'No refresh token provided' },
    });
  }

  const { accessToken, newRefreshToken, newRefreshTokenHash } =
    await authService.refreshTokens(refreshToken);

  // Rotate the cookie
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  void reply.setCookie(
    'refreshToken',
    newRefreshToken,
    getRefreshTokenCookieOptions(expiresAt),
  );

  void newRefreshTokenHash; // Used internally

  return reply.send({
    success: true,
    requestId: request.id,
    data: { accessToken },
  });
}

export async function logoutController(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const refreshToken = request.cookies['refreshToken'];
  if (refreshToken) {
    await authService.logout(refreshToken);
  }
  clearRefreshTokenCookie(reply);
  return reply.send({ success: true, requestId: request.id, data: { message: 'Logged out' } });
}

export async function logoutAllController(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const userId = (request as FastifyRequest & { userId: string }).userId;
  const count = await authService.logoutAll(userId);
  clearRefreshTokenCookie(reply);
  return reply.send({
    success: true,
    requestId: request.id,
    data: { message: `Signed out from ${count} device${count !== 1 ? 's' : ''}` },
  });
}

export async function forgotPasswordController(
  request: FastifyRequest<{ Body: ForgotPasswordDto }>,
  reply: FastifyReply,
) {
  await authService.forgotPassword(request.body.email);
  return reply.send({
    success: true,
    requestId: request.id,
    data: { message: 'If an account with that email exists, a reset link has been sent.' },
  });
}

export async function resetPasswordController(
  request: FastifyRequest<{ Body: ResetPasswordDto }>,
  reply: FastifyReply,
) {
  const body = validateBody(resetPasswordSchema, request.body);
  await authService.resetPassword(body);
  return reply.send({
    success: true,
    requestId: request.id,
    data: { message: 'Password reset successfully. You can now sign in with your new password.' },
  });
}

export async function getMeController(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const userId = (request as FastifyRequest & { userId: string }).userId;
  const result = await authService.getCurrentUser(userId);
  return reply.send({ success: true, requestId: request.id, data: result });
}

export async function updateProfileController(
  request: FastifyRequest<{ Body: UpdateProfileDto }>,
  reply: FastifyReply,
) {
  const userId = (request as FastifyRequest & { userId: string }).userId;
  const user = await authService.updateProfile(userId, request.body);
  return reply.send({ success: true, requestId: request.id, data: { user } });
}

export async function changePasswordController(
  request: FastifyRequest<{ Body: ChangePasswordDto }>,
  reply: FastifyReply,
) {
  const userId = (request as FastifyRequest & { userId: string }).userId;
  await authService.changePassword(userId, request.body);
  clearRefreshTokenCookie(reply);
  return reply.send({
    success: true,
    requestId: request.id,
    data: { message: 'Password changed successfully. Please sign in again.' },
  });
}

export async function listSessionsController(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const userId = (request as FastifyRequest & { userId: string }).userId;
  const currentRefreshToken = request.cookies['refreshToken'] ?? '';
  const currentTokenHash = currentRefreshToken ? hashToken(currentRefreshToken) : '';

  const sessions = await authService.listSessions(userId, currentTokenHash);
  return reply.send({ success: true, requestId: request.id, data: sessions });
}

export async function revokeSessionController(
  request: FastifyRequest<{ Params: { sessionId: string } }>,
  reply: FastifyReply,
) {
  const userId = (request as FastifyRequest & { userId: string }).userId;
  await authService.revokeSession(request.params.sessionId, userId);
  return reply.send({
    success: true,
    requestId: request.id,
    data: { message: 'Session revoked' },
  });
}

export async function setup2faController(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const userId = (request as FastifyRequest & { userId: string }).userId;
  const result = await authService.setup2fa(userId);
  return reply.send({ success: true, requestId: request.id, data: result });
}

export async function verify2faSetupController(
  request: FastifyRequest<{ Body: Verify2faSetupDto }>,
  reply: FastifyReply,
) {
  const userId = (request as FastifyRequest & { userId: string }).userId;
  const result = await authService.verify2faSetup(userId, request.body);
  return reply.send({ success: true, requestId: request.id, data: result });
}

export async function disable2faController(
  request: FastifyRequest<{ Body: Disable2faDto }>,
  reply: FastifyReply,
) {
  const userId = (request as FastifyRequest & { userId: string }).userId;
  await authService.disable2fa(userId, request.body);
  return reply.send({ success: true, requestId: request.id, data: { message: '2FA disabled' } });
}

export async function deleteAccountController(
  request: FastifyRequest<{ Body: DeleteAccountDto }>,
  reply: FastifyReply,
) {
  const userId = (request as FastifyRequest & { userId: string }).userId;
  await authService.deleteAccount(userId, request.body);
  clearRefreshTokenCookie(reply);
  return reply.send({ success: true, requestId: request.id, data: { message: 'Account deleted' } });
}

