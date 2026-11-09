// ─── Queue Names ──────────────────────────────────────────────────────────────

export const QUEUE_NAMES = {
  MESSAGE_OUTBOUND: 'message-outbound',
  MESSAGE_BULK: 'message-bulk',
  WEBHOOK_DELIVERY: 'webhook-delivery',
  SESSION_LIFECYCLE: 'session-lifecycle',
  EMAIL: 'email',
  USAGE_AGGREGATION: 'usage-aggregation',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ─── Job Names per Queue ──────────────────────────────────────────────────

export const JOB_NAMES = {
  // Message outbound queue
  SEND_TEXT: 'send-text',
  SEND_IMAGE: 'send-image',
  SEND_VIDEO: 'send-video',
  SEND_AUDIO: 'send-audio',
  SEND_DOCUMENT: 'send-document',
  SEND_LOCATION: 'send-location',
  SEND_CONTACT: 'send-contact',
  SEND_BUTTONS: 'send-buttons',
  SEND_LIST: 'send-list',
  SEND_REACTION: 'send-reaction',
  SEND_POLL: 'send-poll',

  // Bulk queue
  PROCESS_BULK_BATCH: 'process-bulk-batch',

  // Webhook queue
  DELIVER_WEBHOOK: 'deliver-webhook',

  // Session lifecycle
  START_SESSION: 'session-start',
  STOP_SESSION: 'session-stop',
  RESTART_SESSION: 'session-restart',

  // Email queue
  SEND_EMAIL: 'send-email',

  // Usage
  AGGREGATE_USAGE: 'aggregate-usage',
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

// ─── Job Priority Levels ──────────────────────────────────────────────────

export const JOB_PRIORITY = {
  CRITICAL: 1,
  HIGH: 2,
  NORMAL: 3,
  LOW: 4,
} as const;

// ─── Job Options Presets ──────────────────────────────────────────────────

export const JOB_OPTIONS = {
  MESSAGE: {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
  WEBHOOK: {
    attempts: 1,
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
  EMAIL: {
    attempts: 5,
    backoff: { type: 'exponential' as const, delay: 5000 },
    removeOnComplete: 50,
    removeOnFail: 200,
  },
  SESSION: {
    attempts: 1,
    removeOnComplete: 10,
    removeOnFail: 100,
  },
} as const;

// ─── Redis pub/sub channel names ──────────────────────────────────────────

export const REDIS_CHANNELS = {
  WORKER_COMMAND: (workerId: string) => `worker-cmd-${workerId}`,
  SESSION_STATUS: (tenantId: string) => `session-status-${tenantId}`,
  SESSION_QR: (instanceId: string) => `session-qr-${instanceId}`,
} as const;

// ─── Redis key patterns ───────────────────────────────────────────────────

export const REDIS_KEYS = {
  WORKER_HEARTBEAT: (workerId: string) => `worker-heartbeat-${workerId}`,
  WORKER_INFO: (workerId: string) => `worker-info-${workerId}`,
  ALL_WORKERS: () => `worker-all`,
  SESSION_STATUS: (instanceId: string) => `session-status-${instanceId}`,
  SESSION_WORKER: (instanceId: string) => `session-worker-${instanceId}`,
  RATE_LIMIT: (key: string) => `ratelimit-${key}`,
  MESSAGE_RATE: (instanceId: string) => `msgrate-${instanceId}`,
  USAGE_MESSAGES_SENT: (tenantId: string, date: string) => `usage-msg-sent-${tenantId}-${date}`,
  USAGE_MESSAGES_RECV: (tenantId: string, date: string) => `usage-msg-recv-${tenantId}-${date}`,
  USAGE_API_CALLS: (tenantId: string, date: string) => `usage-api-${tenantId}-${date}`,
  TENANT_QUOTA: (tenantId: string) => `quota-${tenantId}`,
  API_KEY_CACHE: (keyHash: string) => `apikey-${keyHash}`,
  IDEMPOTENCY: (key: string) => `idempotent-${key}`,
  QR_CODE: (instanceId: string) => `qr-${instanceId}`,
} as const;
