import { z } from 'zod';

export const sendTextSchema = z.object({
  to: z.string().min(7).max(20),
  message: z.string().min(1).max(4096),
  quotedMessageId: z.string().optional(),
  linkPreview: z.boolean().default(true),
});

export const sendImageSchema = z.object({
  to: z.string().min(7).max(20),
  mediaUrl: z.string().url(),
  caption: z.string().max(1024).optional(),
  quotedMessageId: z.string().optional(),
});

export const sendDocumentSchema = z.object({
  to: z.string().min(7).max(20),
  mediaUrl: z.string().url(),
  filename: z.string().optional(),
  caption: z.string().max(1024).optional(),
});

export const sendLocationSchema = z.object({
  to: z.string().min(7).max(20),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  name: z.string().optional(),
  address: z.string().optional(),
});

export type SendTextDto = z.infer<typeof sendTextSchema>;
export type SendImageDto = z.infer<typeof sendImageSchema>;
export type SendDocumentDto = z.infer<typeof sendDocumentSchema>;
export type SendLocationDto = z.infer<typeof sendLocationSchema>;
