import { z } from 'zod';

export const createApiKeySchema = z.object({
  name: z.string().min(1, 'Name is required').max(50).trim(),
  environment: z.enum(['LIVE', 'SANDBOX']).default('LIVE'),
  permissions: z.array(z.string()).default([]),
  ipWhitelist: z.array(z.string()).default([]),
  expiresAt: z.string().datetime({ message: 'expiresAt must be a valid ISO 8601 date string' }).optional(),
});

export type CreateApiKeyDto = z.infer<typeof createApiKeySchema>;

export const updateApiKeySchema = z.object({
  name: z.string().min(1).max(50).trim().optional(),
  ipWhitelist: z.array(z.string()).optional(),
});

export type UpdateApiKeyDto = z.infer<typeof updateApiKeySchema>;
