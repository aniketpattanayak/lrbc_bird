import type { FastifyInstance } from 'fastify';

import { authenticate } from '../../middleware/authenticate';
import * as controller from './auth.controller';
import {
  registerSchema,
  loginSchema,
  login2faSchema,
  login2faBackupSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  updateProfileSchema,
  deleteAccountSchema,
  verify2faSetupSchema,
  disable2faSchema,
} from './auth.schema';
import { zodToJsonSchema } from '../../utils/zodToJsonSchema';

export async function authRoutes(app: FastifyInstance): Promise<void> {

  // ── REGISTRATION ───────────────────────────────────────────────────────────

  app.post('/register', {
    config: {
      rateLimit: { max: 5, timeWindow: '1 hour' },
    },
    schema: {
      tags: ['Auth'],
      summary: 'Register a new account',
      body: zodToJsonSchema(registerSchema),
    },
    handler: controller.registerController,
  });

  app.post('/verify-email', {
    config: {
      rateLimit: { max: 20, timeWindow: '15 minutes' },
    },
    schema: {
      tags: ['Auth'],
      summary: 'Verify email address with token',
      body: zodToJsonSchema(verifyEmailSchema),
    },
    handler: controller.verifyEmailController,
  });

  app.post('/resend-verification', {
    config: {
      rateLimit: { max: 3, timeWindow: '1 hour' },
    },
    schema: {
      tags: ['Auth'],
      summary: 'Resend email verification',
      body: zodToJsonSchema(resendVerificationSchema),
    },
    handler: controller.resendVerificationController,
  });

  // ── LOGIN ──────────────────────────────────────────────────────────────────

  app.post('/login', {
    config: {
      rateLimit: { max: 10, timeWindow: '15 minutes' },
    },
    schema: {
      tags: ['Auth'],
      summary: 'Sign in with email and password',
      body: zodToJsonSchema(loginSchema),
    },
    handler: controller.loginController,
  });

  app.post('/login/2fa', {
    config: {
      rateLimit: { max: 10, timeWindow: '15 minutes' },
    },
    schema: {
      tags: ['Auth'],
      summary: 'Complete login with TOTP code',
      body: zodToJsonSchema(login2faSchema),
    },
    handler: controller.login2faController,
  });

  app.post('/login/2fa/backup', {
    config: {
      rateLimit: { max: 5, timeWindow: '1 hour' },
    },
    schema: {
      tags: ['Auth'],
      summary: 'Complete login with backup code',
      body: zodToJsonSchema(login2faBackupSchema),
    },
    handler: controller.login2faBackupController,
  });

  // ── SESSION MANAGEMENT ─────────────────────────────────────────────────────

  app.post('/refresh', {
    config: {
      rateLimit: { max: 60, timeWindow: '15 minutes' },
    },
    schema: {
      tags: ['Auth'],
      summary: 'Refresh access token using refresh token cookie',
    },
    handler: controller.refreshController,
  });

  app.post('/logout', {
    config: {
      rateLimit: { max: 20, timeWindow: '15 minutes' },
    },
    schema: {
      tags: ['Auth'],
      summary: 'Sign out of current session',
    },
    handler: controller.logoutController,
  });

  app.post('/logout-all', {
    preHandler: [authenticate],
    config: {
      rateLimit: { max: 10, timeWindow: '15 minutes' },
    },
    schema: {
      tags: ['Auth'],
      summary: 'Sign out of all sessions',
      security: [{ BearerAuth: [] }],
    },
    handler: controller.logoutAllController,
  });

  // ── PASSWORD MANAGEMENT ────────────────────────────────────────────────────

  app.post('/forgot-password', {
    config: {
      rateLimit: { max: 3, timeWindow: '1 hour' },
    },
    schema: {
      tags: ['Auth'],
      summary: 'Request password reset email',
      body: zodToJsonSchema(forgotPasswordSchema),
    },
    handler: controller.forgotPasswordController,
  });

  app.post('/reset-password', {
    config: {
      rateLimit: { max: 5, timeWindow: '1 hour' },
    },
    schema: {
      tags: ['Auth'],
      summary: 'Reset password with token from email',
      body: zodToJsonSchema(resetPasswordSchema),
    },
    handler: controller.resetPasswordController,
  });

  app.post('/change-password', {
    preHandler: [authenticate],
    config: {
      rateLimit: { max: 5, timeWindow: '1 hour' },
    },
    schema: {
      tags: ['Auth'],
      summary: 'Change password (authenticated)',
      security: [{ BearerAuth: [] }],
      body: zodToJsonSchema(changePasswordSchema),
    },
    handler: controller.changePasswordController,
  });

  // ── PROFILE ────────────────────────────────────────────────────────────────

  app.get('/me', {
    preHandler: [authenticate],
    schema: {
      tags: ['Auth'],
      summary: 'Get current user and tenant',
      security: [{ BearerAuth: [] }],
    },
    handler: controller.getMeController,
  });

  app.patch('/profile', {
    preHandler: [authenticate],
    schema: {
      tags: ['Auth'],
      summary: 'Update profile',
      security: [{ BearerAuth: [] }],
      body: zodToJsonSchema(updateProfileSchema),
    },
    handler: controller.updateProfileController,
  });

  app.delete('/me', {
    preHandler: [authenticate],
    schema: {
      tags: ['Auth'],
      summary: 'Delete current user account',
      security: [{ BearerAuth: [] }],
      body: zodToJsonSchema(deleteAccountSchema),
    },
    handler: controller.deleteAccountController,
  });

  // ── SESSION LIST ───────────────────────────────────────────────────────────

  app.get('/sessions', {
    preHandler: [authenticate],
    schema: {
      tags: ['Auth'],
      summary: 'List active sessions',
      security: [{ BearerAuth: [] }],
    },
    handler: controller.listSessionsController,
  });

  app.delete('/sessions/:sessionId', {
    preHandler: [authenticate],
    schema: {
      tags: ['Auth'],
      summary: 'Revoke a specific session',
      security: [{ BearerAuth: [] }],
      params: {
        type: 'object',
        properties: { sessionId: { type: 'string' } },
        required: ['sessionId'],
      },
    },
    handler: controller.revokeSessionController,
  });

  // ── 2FA MANAGEMENT ─────────────────────────────────────────────────────────

  app.post('/2fa/setup', {
    preHandler: [authenticate],
    config: {
      rateLimit: { max: 5, timeWindow: '1 hour' },
    },
    schema: {
      tags: ['Auth'],
      summary: 'Initialize 2FA setup — returns QR code and backup codes',
      security: [{ BearerAuth: [] }],
    },
    handler: controller.setup2faController,
  });

  app.post('/2fa/verify-setup', {
    preHandler: [authenticate],
    config: {
      rateLimit: { max: 10, timeWindow: '1 hour' },
    },
    schema: {
      tags: ['Auth'],
      summary: 'Verify TOTP code to activate 2FA',
      security: [{ BearerAuth: [] }],
      body: zodToJsonSchema(verify2faSetupSchema),
    },
    handler: controller.verify2faSetupController,
  });

  app.delete('/2fa', {
    preHandler: [authenticate],
    config: {
      rateLimit: { max: 5, timeWindow: '1 hour' },
    },
    schema: {
      tags: ['Auth'],
      summary: 'Disable 2FA — requires current password',
      security: [{ BearerAuth: [] }],
      body: zodToJsonSchema(disable2faSchema),
    },
    handler: controller.disable2faController,
  });
}
