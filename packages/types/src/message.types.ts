// ─── Message Types ────────────────────────────────────────────────────────────

export type MessageDirection = 'INBOUND' | 'OUTBOUND';

export type MessageStatus =
  | 'QUEUED'
  | 'SENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'READ'
  | 'FAILED'
  | 'DELETED';

export type MessageType =
  | 'TEXT'
  | 'IMAGE'
  | 'VIDEO'
  | 'AUDIO'
  | 'DOCUMENT'
  | 'LOCATION'
  | 'CONTACT'
  | 'STICKER'
  | 'BUTTONS'
  | 'LIST'
  | 'REACTION'
  | 'POLL'
  | 'TEMPLATE'
  | 'UNKNOWN';

// ─── Message Content shapes per type ─────────────────────────────────────

export interface TextContent {
  text: string;
  linkPreview?: boolean;
  mentions?: string[];
}

export interface MediaContent {
  mediaId?: string;
  mediaUrl?: string;
  caption?: string;
  mimeType?: string;
  filename?: string;
  filesize?: number;
}

export interface ImageContent extends MediaContent {
  width?: number;
  height?: number;
}

export interface VideoContent extends MediaContent {
  duration?: number;
  width?: number;
  height?: number;
}

export interface AudioContent extends MediaContent {
  duration?: number;
  ptt?: boolean; // push-to-talk (voice note)
}

export interface DocumentContent extends MediaContent {
  pageCount?: number;
}

export interface LocationContent {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export interface ContactContent {
  contacts: Array<{
    name: string;
    phone: string;
    email?: string;
    organization?: string;
  }>;
}

export interface ButtonsContent {
  text: string;
  footer?: string;
  buttons: Array<{
    id: string;
    text: string;
  }>;
}

export interface ListContent {
  title: string;
  text: string;
  footer?: string;
  buttonText: string;
  sections: Array<{
    title: string;
    rows: Array<{
      id: string;
      title: string;
      description?: string;
    }>;
  }>;
}

export interface ReactionContent {
  targetMessageId: string;
  emoji: string;
}

export interface PollContent {
  question: string;
  options: string[];
  multiSelect: boolean;
}

export type MessageContent =
  | TextContent
  | ImageContent
  | VideoContent
  | AudioContent
  | DocumentContent
  | LocationContent
  | ContactContent
  | ButtonsContent
  | ListContent
  | ReactionContent
  | PollContent;

// ─── Full message record ──────────────────────────────────────────────────

export interface Message {
  id: string;
  tenantId: string;
  instanceId: string;
  whatsappMessageId: string | null;
  direction: MessageDirection;
  type: MessageType;
  status: MessageStatus;
  toNumber: string | null;
  fromNumber: string | null;
  content: MessageContent;
  mediaId: string | null;
  quotedMessageId: string | null;
  isGroupMessage: boolean;
  groupId: string | null;
  batchId: string | null;
  retryCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  queuedAt: Date | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
  failedAt: Date | null;
  createdAt: Date;
}

// ─── Bulk batch ───────────────────────────────────────────────────────────

export interface BulkBatch {
  id: string;
  tenantId: string;
  instanceId: string;
  totalMessages: number;
  sentCount: number;
  failedCount: number;
  pendingCount: number;
  status: 'processing' | 'completed' | 'failed' | 'paused';
  delayMs: number;
  stopOnError: boolean;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Queue job payloads ───────────────────────────────────────────────────

export interface SendMessageJobPayload {
  messageId: string;
  instanceId: string;
  tenantId: string;
  type: MessageType;
  to: string;
  content: MessageContent;
  mediaId?: string;
  quotedMessageId?: string;
  idempotencyKey: string;
}

export interface BulkBatchJobPayload {
  batchId: string;
  instanceId: string;
  tenantId: string;
}

// ─── API request DTOs ─────────────────────────────────────────────────────

export interface SendTextDto {
  to: string;
  message: string;
  quotedMessageId?: string;
  mentions?: string[];
  linkPreview?: boolean;
}

export interface SendMediaDto {
  to: string;
  mediaId?: string;
  mediaUrl?: string;
  mediaBase64?: string;
  caption?: string;
  quotedMessageId?: string;
}

export interface SendLocationDto {
  to: string;
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export interface SendButtonsDto {
  to: string;
  text: string;
  footer?: string;
  buttons: Array<{ id: string; text: string }>;
}

export interface BulkSendDto {
  messages: Array<{
    to: string;
    message: string;
    variables?: Record<string, string>;
  }>;
  delay?: number;
  stopOnError?: boolean;
}
