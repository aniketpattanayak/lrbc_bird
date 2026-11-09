import { z } from 'zod';

export const createInstanceSchema = z
  .object({
    displayName: z.string().min(1, 'Display name is required').max(50).trim(),
    description: z.string().max(500).optional(),
    proxyUrl: z.string().url().optional(),
    connectionMode: z.enum(['UNOFFICIAL', 'OFFICIAL']).default('UNOFFICIAL'),
    metaPhoneNumberId: z.string().min(1).optional(),
    metaAccessToken: z.string().min(1).optional(),
    metaWabaId: z.string().min(1).optional(),
    metaWebhookVerifyToken: z.string().min(1).optional(),
    // The Meta app's App Secret — used to verify the HMAC signature Meta
    // attaches to every inbound webhook call, proving it really came from
    // Meta. Found under the Meta app's Settings → Basic → App Secret.
    metaAppSecret: z.string().min(1).optional(),
  })
  .refine(
    (dto) =>
      dto.connectionMode !== 'OFFICIAL' ||
      (dto.metaPhoneNumberId && dto.metaAccessToken && dto.metaWabaId && dto.metaWebhookVerifyToken && dto.metaAppSecret),
    {
      message: 'Meta Phone Number ID, Access Token, WABA ID, Webhook Verify Token, and App Secret are all required for an Official (Meta Cloud API) instance',
      path: ['metaPhoneNumberId'],
    },
  );

export type CreateInstanceDto = z.infer<typeof createInstanceSchema>;

export const updateInstanceSchema = z.object({
  displayName: z.string().min(1).max(50).trim().optional(),
  description: z.string().max(500).optional(),
  proxyUrl: z.string().url().nullable().optional(),
  autoReconnect: z.boolean().optional(),
  maxReconnectAttempts: z.number().int().min(0).max(20).optional(),
  messageDelayMs: z.number().int().min(0).optional(),
});

export type UpdateInstanceDto = z.infer<typeof updateInstanceSchema>;
