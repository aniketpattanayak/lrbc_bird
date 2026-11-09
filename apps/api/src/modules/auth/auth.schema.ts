import { z } from 'zod';

// ─── Password Rules ────────────────────────────────────────────────────────────
// Enforced consistently on register + reset
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be less than 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

// ─── Registration ──────────────────────────────────────────────────────────────
export const registerSchema = z.object({
  firstName: z.string().min(1, 'First name required').max(50).trim(),
  lastName: z.string().min(1, 'Last name required').max(50).trim(),
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  password: passwordSchema,
  companyName: z.string().max(100).trim().optional(),
  timezone: z.string().default('UTC'),
  acceptedTerms: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the Terms of Service' }),
  }),
});

export type RegisterDto = z.infer<typeof registerSchema>;

// ─── Login ────────────────────────────────────────────────────────────────────
export const loginSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1, 'Password required'),
  rememberMe: z.boolean().default(false),
});

export type LoginDto = z.infer<typeof loginSchema>;

// ─── 2FA Login (second step) ──────────────────────────────────────────────────
export const login2faSchema = z.object({
  tempToken: z.string().min(1, 'Temporary token required'),
  code: z
    .string()
    .length(6, 'TOTP code must be 6 digits')
    .regex(/^\d{6}$/, 'TOTP code must be numeric'),
});

export type Login2faDto = z.infer<typeof login2faSchema>;

// ─── 2FA with backup code ─────────────────────────────────────────────────────
export const login2faBackupSchema = z.object({
  tempToken: z.string().min(1),
  backupCode: z.string().regex(/^[A-F0-9]{4}-[A-F0-9]{4}$/, 'Invalid backup code format'),
});

export type Login2faBackupDto = z.infer<typeof login2faBackupSchema>;

// ─── Email verification ───────────────────────────────────────────────────────
export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Verification token required'),
});

export type VerifyEmailDto = z.infer<typeof verifyEmailSchema>;

// ─── Resend verification ──────────────────────────────────────────────────────
export const resendVerificationSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
});

export type ResendVerificationDto = z.infer<typeof resendVerificationSchema>;

// ─── Forgot password ──────────────────────────────────────────────────────────
export const forgotPasswordSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
});

export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;

// ─── Reset password ───────────────────────────────────────────────────────────
export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, 'Reset token required'),
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;

// ─── Change password (authenticated) ─────────────────────────────────────────
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password required'),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'New password must be different from current password',
    path: ['newPassword'],
  });

export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;

// ─── Profile update ───────────────────────────────────────────────────────────
export const updateProfileSchema = z.object({
  firstName: z.string().min(1).max(50).trim().optional(),
  lastName: z.string().min(1).max(50).trim().optional(),
  companyName: z.string().max(100).trim().optional(),
  timezone: z.string().optional(),
  avatarUrl: z.string().url().nullable().optional(),
});

export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;

// ─── Delete account ───────────────────────────────────────────────────────────
export const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Password required to delete your account'),
});

export type DeleteAccountDto = z.infer<typeof deleteAccountSchema>;

// ─── 2FA Setup Verification ───────────────────────────────────────────────────
export const verify2faSetupSchema = z.object({
  code: z
    .string()
    .length(6, 'TOTP code must be 6 digits')
    .regex(/^\d{6}$/, 'TOTP code must be numeric'),
});

export type Verify2faSetupDto = z.infer<typeof verify2faSetupSchema>;

// ─── Disable 2FA ─────────────────────────────────────────────────────────────
export const disable2faSchema = z.object({
  password: z.string().min(1, 'Password required to disable 2FA'),
});

export type Disable2faDto = z.infer<typeof disable2faSchema>;

// ─── Google OAuth ─────────────────────────────────────────────────────────────
export const googleCallbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().optional(),
});
