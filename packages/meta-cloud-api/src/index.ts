/**
 * Thin client for the Meta WhatsApp Cloud API (Graph API).
 * Shared between apps/api (credential validation, template submission,
 * webhook signature verification) and apps/worker (actually sending
 * messages for Official/Meta Cloud API instances).
 *
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 */
import { createHmac, timingSafeEqual } from 'crypto';

const GRAPH_API_VERSION = process.env['META_GRAPH_API_VERSION'] ?? 'v21.0';
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export class MetaApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly metaErrorCode?: number,
    public readonly metaErrorSubcode?: number,
    public readonly fbtraceId?: string,
  ) {
    super(message);
    this.name = 'MetaApiError';
  }
}

interface MetaErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

async function metaFetch<T>(
  path: string,
  accessToken: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${GRAPH_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const body = (await res.json().catch(() => ({}))) as T & MetaErrorBody;

  if (!res.ok) {
    const err = body.error;
    throw new MetaApiError(
      err?.message ?? `Meta API request failed with status ${res.status}`,
      res.status,
      err?.code,
      err?.error_subcode,
      err?.fbtrace_id,
    );
  }

  return body;
}

// ─── Credential Validation ─────────────────────────────────────────────────

export interface PhoneNumberInfo {
  id: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating?: string;
}

/**
 * Confirms the given phoneNumberId is real and the access token can read it.
 * Used when a tenant creates an Official instance, so bad credentials fail
 * at creation time instead of silently "succeeding" and failing on first send.
 */
export async function verifyPhoneNumber(
  phoneNumberId: string,
  accessToken: string,
): Promise<PhoneNumberInfo> {
  return metaFetch<PhoneNumberInfo>(
    `/${phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating`,
    accessToken,
  );
}

// ─── Sending Messages ───────────────────────────────────────────────────────

export interface MetaSendResult {
  messageId: string;
  waId: string;
}

function parseSendResponse(body: {
  messages?: { id: string }[];
  contacts?: { wa_id: string }[];
}): MetaSendResult {
  const messageId = body.messages?.[0]?.id;
  const waId = body.contacts?.[0]?.wa_id;
  if (!messageId) {
    throw new MetaApiError('Meta API did not return a message id', 502);
  }
  return { messageId, waId: waId ?? '' };
}

export async function sendTextMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  text: string,
  previewUrl = false,
): Promise<MetaSendResult> {
  const body = await metaFetch<{ messages?: { id: string }[]; contacts?: { wa_id: string }[] }>(
    `/${phoneNumberId}/messages`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body: text, preview_url: previewUrl },
      }),
    },
  );
  return parseSendResponse(body);
}

export async function sendImageMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  mediaUrl: string,
  caption?: string,
): Promise<MetaSendResult> {
  const body = await metaFetch<{ messages?: { id: string }[]; contacts?: { wa_id: string }[] }>(
    `/${phoneNumberId}/messages`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'image',
        image: { link: mediaUrl, caption },
      }),
    },
  );
  return parseSendResponse(body);
}

export async function sendDocumentMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  mediaUrl: string,
  filename?: string,
  caption?: string,
): Promise<MetaSendResult> {
  const body = await metaFetch<{ messages?: { id: string }[]; contacts?: { wa_id: string }[] }>(
    `/${phoneNumberId}/messages`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'document',
        document: { link: mediaUrl, filename, caption },
      }),
    },
  );
  return parseSendResponse(body);
}

export async function sendLocationMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  latitude: number,
  longitude: number,
  name?: string,
): Promise<MetaSendResult> {
  const body = await metaFetch<{ messages?: { id: string }[]; contacts?: { wa_id: string }[] }>(
    `/${phoneNumberId}/messages`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'location',
        location: { latitude, longitude, name },
      }),
    },
  );
  return parseSendResponse(body);
}

export interface TemplateComponent {
  type: 'header' | 'body' | 'button';
  parameters: Array<{ type: string; text?: string; [key: string]: unknown }>;
}

export async function sendTemplateMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  templateName: string,
  languageCode: string,
  components?: TemplateComponent[],
): Promise<MetaSendResult> {
  const body = await metaFetch<{ messages?: { id: string }[]; contacts?: { wa_id: string }[] }>(
    `/${phoneNumberId}/messages`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          ...(components ? { components } : {}),
        },
      }),
    },
  );
  return parseSendResponse(body);
}

// ─── Template Submission (real Meta approval, not simulated) ──────────────

export interface SubmitTemplateInput {
  name: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  language: string;
  components: Array<{
    type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
    format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
    text?: string;
    buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>;
  }>;
}

export interface MetaTemplateSubmitResult {
  id: string;
  status: string; // typically "PENDING" immediately after submission
  category: string;
}

export async function submitTemplateToMeta(
  wabaId: string,
  accessToken: string,
  template: SubmitTemplateInput,
): Promise<MetaTemplateSubmitResult> {
  return metaFetch<MetaTemplateSubmitResult>(`/${wabaId}/message_templates`, accessToken, {
    method: 'POST',
    body: JSON.stringify(template),
  });
}

export interface MetaTemplateStatus {
  id: string;
  name: string;
  status: 'APPROVED' | 'REJECTED' | 'PENDING' | 'PAUSED' | 'DISABLED';
  category: string;
  rejected_reason?: string;
}

/**
 * Looks up a submitted template's current real review status from Meta.
 * Call this to poll/refresh rather than trusting a cached local value —
 * Meta's review can take anywhere from minutes to ~48 hours.
 */
export async function getTemplateStatus(
  wabaId: string,
  accessToken: string,
  templateName: string,
): Promise<MetaTemplateStatus | null> {
  const result = await metaFetch<{ data: MetaTemplateStatus[] }>(
    `/${wabaId}/message_templates?name=${encodeURIComponent(templateName)}`,
    accessToken,
  );
  return result.data?.[0] ?? null;
}

export async function deleteTemplateFromMeta(
  wabaId: string,
  accessToken: string,
  templateName: string,
): Promise<void> {
  await metaFetch(`/${wabaId}/message_templates?name=${encodeURIComponent(templateName)}`, accessToken, {
    method: 'DELETE',
  });
}

// ─── Inbound Webhooks ───────────────────────────────────────────────────────

/**
 * Verifies the X-Hub-Signature-256 header Meta sends with every webhook
 * POST, proving the payload actually came from Meta and wasn't forged.
 * rawBody MUST be the exact, unparsed request body bytes/string — signature
 * verification fails silently-wrong if you verify against a re-serialized
 * JSON.stringify(parsedBody) instead.
 */
export function verifyWebhookSignature(
  appSecret: string,
  rawBody: string,
  signatureHeader: string | undefined,
): boolean {
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  const provided = signatureHeader.slice('sha256='.length);

  const expectedBuf = Buffer.from(expected, 'hex');
  const providedBuf = Buffer.from(provided, 'hex');
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

export interface WebhookInboundMessage {
  phoneNumberId: string;
  from: string;
  waMessageId: string;
  timestamp: string;
  type: string;
  text?: string;
  mediaId?: string;
  mediaMimeType?: string;
  mediaCaption?: string;
  mediaFilename?: string;
  latitude?: number;
  longitude?: number;
  locationName?: string;
  contactsPushName?: string;
}

export interface WebhookStatusUpdate {
  phoneNumberId: string;
  waMessageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipientId: string;
  errorMessage?: string;
}

export interface ParsedWebhookPayload {
  messages: WebhookInboundMessage[];
  statuses: WebhookStatusUpdate[];
}

/**
 * Parses Meta's webhook POST body (the `entry[].changes[].value` structure)
 * into our normalized shapes. A single webhook call can carry several
 * messages and/or status updates at once — both arrays may be non-empty,
 * or both empty (e.g. for account-level events we don't act on).
 */
export function parseWebhookPayload(body: unknown): ParsedWebhookPayload {
  const messages: WebhookInboundMessage[] = [];
  const statuses: WebhookStatusUpdate[] = [];

  const entries = (body as { entry?: unknown[] })?.entry;
  if (!Array.isArray(entries)) return { messages, statuses };

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes;
    if (!Array.isArray(changes)) continue;

    for (const change of changes) {
      const value = (change as { value?: any })?.value;
      if (!value) continue;

      const phoneNumberId = value.metadata?.phone_number_id as string | undefined;
      if (!phoneNumberId) continue;

      for (const msg of (value.messages ?? []) as any[]) {
        const parsed: WebhookInboundMessage = {
          phoneNumberId,
          from: msg.from,
          waMessageId: msg.id,
          timestamp: msg.timestamp,
          type: msg.type,
          contactsPushName: value.contacts?.[0]?.profile?.name,
        };
        if (msg.type === 'text') parsed.text = msg.text?.body;
        if (msg.type === 'image') {
          parsed.mediaId = msg.image?.id;
          parsed.mediaMimeType = msg.image?.mime_type;
          parsed.mediaCaption = msg.image?.caption;
        }
        if (msg.type === 'document') {
          parsed.mediaId = msg.document?.id;
          parsed.mediaMimeType = msg.document?.mime_type;
          parsed.mediaCaption = msg.document?.caption;
          parsed.mediaFilename = msg.document?.filename;
        }
        if (msg.type === 'audio') {
          parsed.mediaId = msg.audio?.id;
          parsed.mediaMimeType = msg.audio?.mime_type;
        }
        if (msg.type === 'video') {
          parsed.mediaId = msg.video?.id;
          parsed.mediaMimeType = msg.video?.mime_type;
          parsed.mediaCaption = msg.video?.caption;
        }
        if (msg.type === 'location') {
          parsed.latitude = msg.location?.latitude;
          parsed.longitude = msg.location?.longitude;
          parsed.locationName = msg.location?.name;
        }
        messages.push(parsed);
      }

      for (const status of (value.statuses ?? []) as any[]) {
        statuses.push({
          phoneNumberId,
          waMessageId: status.id,
          status: status.status,
          timestamp: status.timestamp,
          recipientId: status.recipient_id,
          errorMessage: status.errors?.[0]?.message,
        });
      }
    }
  }

  return { messages, statuses };
}

/**
 * Downloads inbound media from Meta: GET /{mediaId} returns a short-lived
 * signed `url`, which must then be fetched with the same access token.
 */
export async function downloadMetaMedia(
  mediaId: string,
  accessToken: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const meta = await metaFetch<{ url: string; mime_type: string }>(`/${mediaId}`, accessToken);
  const res = await fetch(meta.url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    throw new MetaApiError(`Failed to download media ${mediaId}`, res.status);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, mimeType: meta.mime_type };
}
