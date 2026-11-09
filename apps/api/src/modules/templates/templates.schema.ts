import { z } from 'zod';

const buttonSchema = z.object({
  type: z.enum(['QUICK_REPLY', 'URL', 'PHONE_NUMBER']),
  text: z.string().min(1).max(25),
  value: z.string().max(255).optional(), // URL or phone number, depending on type
});

export const createTemplateSchema = z.object({
  name: z.string().min(1).max(60).regex(/^[a-z0-9_]+$/, 'Use lowercase letters, numbers, and underscores only').trim(),
  category: z.enum(['UTILITY', 'MARKETING', 'AUTHENTICATION']),
  language: z.string().min(2).max(10).default('en'),
  headerType: z.enum(['NONE', 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT']).default('NONE'),
  headerContent: z.string().max(60).optional(),
  body: z.string().min(1).max(1024),
  footer: z.string().max(60).optional(),
  buttons: z.array(buttonSchema).max(3).default([]),
});
export type CreateTemplateDto = z.infer<typeof createTemplateSchema>;

export const updateTemplateSchema = createTemplateSchema.partial();
export type UpdateTemplateDto = z.infer<typeof updateTemplateSchema>;
