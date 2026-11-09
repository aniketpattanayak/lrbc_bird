import { z } from 'zod';

const EVENT_TYPES = [
  'session.qr_generated', 'session.connected', 'session.disconnected', 'session.reconnecting',
  'session.banned', 'session.logged_out',
  'message.received', 'message.sent', 'message.delivered', 'message.read', 'message.failed',
  'message.deleted', 'message.reaction',
  'call.incoming', 'call.rejected',
  'group.created', 'group.joined', 'group.left', 'group.participant_added', 'group.participant_removed', 'group.subject_changed',
] as const;

export const createWebhookSchema = z.object({
  instanceId: z.string().uuid(),
  url: z.string().url(),
  events: z.array(z.enum(EVENT_TYPES)).min(1, 'Select at least one event'),
  timeoutSeconds: z.number().int().min(1).max(30).optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
  customHeaders: z.record(z.string()).optional(),
});
export type CreateWebhookDto = z.infer<typeof createWebhookSchema>;

export const updateWebhookSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(z.enum(EVENT_TYPES)).min(1).optional(),
  isEnabled: z.boolean().optional(),
  timeoutSeconds: z.number().int().min(1).max(30).optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
  customHeaders: z.record(z.string()).optional(),
});
export type UpdateWebhookDto = z.infer<typeof updateWebhookSchema>;
