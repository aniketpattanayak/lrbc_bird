// ─── Standard API Response Envelopes ─────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: true;
  requestId: string;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  requestId: string;
  error: ApiError;
}

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  success: true;
  requestId: string;
  data: T[];
  meta: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  hasNext: boolean;
  hasPrev: boolean;
  nextCursor?: string;
  prevCursor?: string;
}

export interface PaginationQuery {
  cursor?: string;
  limit?: number;
  page?: number;
}

// ─── Error Codes ──────────────────────────────────────────────────────────

export type ApiErrorCode =
  // Auth errors
  | 'AUTH_INVALID_KEY'
  | 'AUTH_KEY_REVOKED'
  | 'AUTH_KEY_EXPIRED'
  | 'AUTH_TOKEN_INVALID'
  | 'AUTH_TOKEN_EXPIRED'
  | 'AUTH_ACCOUNT_SUSPENDED'
  | 'AUTH_ACCOUNT_UNVERIFIED'
  | 'AUTH_PAYMENT_REQUIRED'
  | 'AUTH_INSUFFICIENT_ROLE'
  | 'AUTH_2FA_REQUIRED'
  | 'AUTH_2FA_INVALID'
  | 'AUTH_ACCOUNT_LOCKED'
  | 'AUTH_INVALID_CREDENTIALS'
  // Rate limit
  | 'RATE_LIMIT_EXCEEDED'
  | 'QUOTA_MESSAGES_EXCEEDED'
  | 'QUOTA_INSTANCES_EXCEEDED'
  | 'QUOTA_STORAGE_EXCEEDED'
  // Instance errors
  | 'INSTANCE_NOT_FOUND'
  | 'INSTANCE_NOT_OWNED'
  | 'INSTANCE_NOT_CONNECTED'
  | 'INSTANCE_QR_PENDING'
  | 'INSTANCE_BANNED'
  | 'INSTANCE_LIMIT_REACHED'
  | 'INSTANCE_INITIALIZING'
  | 'INSTANCE_RECONNECTING'
  // Message errors
  | 'INVALID_PHONE_NUMBER'
  | 'RECIPIENT_NOT_ON_WHATSAPP'
  | 'MESSAGE_TOO_LONG'
  | 'MESSAGE_NOT_FOUND'
  | 'MEDIA_TOO_LARGE'
  | 'MEDIA_TYPE_NOT_SUPPORTED'
  | 'MEDIA_NOT_FOUND'
  | 'MEDIA_UPLOAD_FAILED'
  | 'BULK_BATCH_TOO_LARGE'
  // Validation
  | 'VALIDATION_ERROR'
  | 'MISSING_REQUIRED_FIELD'
  | 'INVALID_FORMAT'
  // Billing
  | 'PLAN_NOT_FOUND'
  | 'SUBSCRIPTION_NOT_FOUND'
  | 'PAYMENT_METHOD_REQUIRED'
  | 'STRIPE_ERROR'
  // Webhook
  | 'WEBHOOK_NOT_CONFIGURED'
  | 'WEBHOOK_URL_INVALID'
  // General
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'FORBIDDEN'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE';

// ─── HTTP Status Code mapping ─────────────────────────────────────────────

export const ERROR_HTTP_STATUS: Record<ApiErrorCode, number> = {
  AUTH_INVALID_KEY: 401,
  AUTH_KEY_REVOKED: 401,
  AUTH_KEY_EXPIRED: 401,
  AUTH_TOKEN_INVALID: 401,
  AUTH_TOKEN_EXPIRED: 401,
  AUTH_ACCOUNT_SUSPENDED: 403,
  AUTH_ACCOUNT_UNVERIFIED: 403,
  AUTH_PAYMENT_REQUIRED: 402,
  AUTH_INSUFFICIENT_ROLE: 403,
  AUTH_2FA_REQUIRED: 403,
  AUTH_2FA_INVALID: 401,
  AUTH_ACCOUNT_LOCKED: 429,
  AUTH_INVALID_CREDENTIALS: 401,
  RATE_LIMIT_EXCEEDED: 429,
  QUOTA_MESSAGES_EXCEEDED: 429,
  QUOTA_INSTANCES_EXCEEDED: 429,
  QUOTA_STORAGE_EXCEEDED: 429,
  INSTANCE_NOT_FOUND: 404,
  INSTANCE_NOT_OWNED: 403,
  INSTANCE_NOT_CONNECTED: 409,
  INSTANCE_QR_PENDING: 409,
  INSTANCE_BANNED: 409,
  INSTANCE_LIMIT_REACHED: 429,
  INSTANCE_INITIALIZING: 409,
  INSTANCE_RECONNECTING: 409,
  INVALID_PHONE_NUMBER: 422,
  RECIPIENT_NOT_ON_WHATSAPP: 422,
  MESSAGE_TOO_LONG: 422,
  MESSAGE_NOT_FOUND: 404,
  MEDIA_TOO_LARGE: 422,
  MEDIA_TYPE_NOT_SUPPORTED: 422,
  MEDIA_NOT_FOUND: 404,
  MEDIA_UPLOAD_FAILED: 500,
  BULK_BATCH_TOO_LARGE: 422,
  VALIDATION_ERROR: 422,
  MISSING_REQUIRED_FIELD: 422,
  INVALID_FORMAT: 422,
  PLAN_NOT_FOUND: 404,
  SUBSCRIPTION_NOT_FOUND: 404,
  PAYMENT_METHOD_REQUIRED: 402,
  STRIPE_ERROR: 502,
  WEBHOOK_NOT_CONFIGURED: 409,
  WEBHOOK_URL_INVALID: 422,
  NOT_FOUND: 404,
  CONFLICT: 409,
  FORBIDDEN: 403,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

// ─── Health check ─────────────────────────────────────────────────────────

export interface HealthCheckResponse {
  status: 'ok' | 'degraded' | 'down';
  version: string;
  uptime: number;
  timestamp: string;
  services: {
    database: ServiceHealth;
    redis: ServiceHealth;
    queue: ServiceHealth;
  };
}

export interface ServiceHealth {
  status: 'ok' | 'degraded' | 'down';
  latencyMs?: number;
  error?: string;
}
