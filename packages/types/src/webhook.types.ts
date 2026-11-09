// ─── Webhook Event Types ──────────────────────────────────────────────────────

export type WebhookEventType =
  // Session events
  | 'session.qr_generated'
  | 'session.connected'
  | 'session.disconnected'
  | 'session.reconnecting'
  | 'session.banned'
  | 'session.logged_out'
  // Message events
  | 'message.received'
  | 'message.sent'
  | 'message.delivered'
  | 'message.read'
  | 'message.failed'
  | 'message.deleted'
  | 'message.reaction'
  // Call events
  | 'call.incoming'
  | 'call.rejected'
  // Group events
  | 'group.created'
  | 'group.joined'
  | 'group.left'
  | 'group.participant_added'
  | 'group.participant_removed'
  | 'group.subject_changed';

export type WebhookDeliveryStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'DEAD_LETTER';

// ─── Webhook Config ───────────────────────────────────────────────────────

export interface WebhookConfig {
  id: string;
  instanceId: string;
  url: string;
  secretPrefix: string; // Last 4 chars for display
  events: WebhookEventType[];
  isEnabled: boolean;
  maxRetries: number;
  timeoutSeconds: number;
  customHeaders: Record<string, string> | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Webhook Event Payloads ───────────────────────────────────────────────

export interface WebhookEventEnvelope<T = unknown> {
  id: string;               // Unique event ID — use for idempotency on your side
  apiVersion: string;       // '2025-01' — for future versioning
  event: WebhookEventType;
  instanceId: string;
  timestamp: string;        // ISO 8601
  data: T;
}

// Session event data
export interface SessionQrData {
  qrCode: string;           // Base64 QR image
  expiresAt: string;
}

export interface SessionConnectedData {
  phoneNumber: string;
  displayName: string;
  platform: string;
}

export interface SessionDisconnectedData {
  reason: string;
  errorCode?: string;
  willReconnect: boolean;
}

// Message event data
export interface MessageReceivedData {
  messageId: string;
  from: string;
  fromName: string | null;
  to: string;
  type: string;
  timestamp: string;
  isGroup: boolean;
  groupId: string | null;
  groupName: string | null;
  content: Record<string, unknown>;
  quotedMessage: QuotedMessageData | null;
  media: MediaData | null;
}

export interface MessageStatusData {
  messageId: string;
  whatsappMessageId: string;
  status: string;
  by: string;
  at: string;
}

export interface QuotedMessageData {
  id: string;
  from: string;
  type: string;
  content: Record<string, unknown>;
}

export interface MediaData {
  url: string;       // Signed URL to download from your storage
  mimeType: string;
  filename: string | null;
  filesize: number;
}

// ─── Delivery record ──────────────────────────────────────────────────────

export interface WebhookDelivery {
  id: string;
  eventId: string;
  instanceId: string;
  attemptNumber: number;
  status: WebhookDeliveryStatus;
  httpStatusCode: number | null;
  responseBody: string | null;
  errorMessage: string | null;
  latencyMs: number | null;
  attemptedAt: Date;
  nextRetryAt: Date | null;
}

// ─── Queue job payload ────────────────────────────────────────────────────

export interface WebhookDeliveryJobPayload {
  eventId: string;
  instanceId: string;
  tenantId: string;
  attemptNumber: number;
}

// ─── API DTOs ─────────────────────────────────────────────────────────────

export interface UpsertWebhookDto {
  url: string;
  events: WebhookEventType[];
  maxRetries?: number;
  timeoutSeconds?: number;
  customHeaders?: Record<string, string>;
}
