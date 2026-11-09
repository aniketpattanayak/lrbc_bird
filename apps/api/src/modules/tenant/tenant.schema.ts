import { z } from 'zod';

export const updateTenantSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  companyName: z.string().max(100).trim().nullable().optional(),
  timezone: z.string().min(1).max(64).optional(),
  logoUrl: z.string().url().nullable().optional(),
});
export type UpdateTenantDto = z.infer<typeof updateTenantSchema>;

export const notificationPrefsSchema = z.object({
  emailOnMessageFailed: z.boolean().optional(),
  emailOnWeeklyDigest: z.boolean().optional(),
  emailOnBillingIssue: z.boolean().optional(),
  emailOnTeamActivity: z.boolean().optional(),
  emailOnWebhookFailure: z.boolean().optional(),
});
export type NotificationPrefsDto = z.infer<typeof notificationPrefsSchema>;

export const setWhatsappModeSchema = z.object({
  mode: z.enum(['UNOFFICIAL', 'OFFICIAL']),
});
export type SetWhatsappModeDto = z.infer<typeof setWhatsappModeSchema>;
