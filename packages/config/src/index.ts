import { z } from 'zod';

// ─── Environment Variable Schema ──────────────────────────────────────────────
// All env vars are validated at startup. If any required var is missing,
// the process fails immediately with a clear error message.

const configSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  APP_NAME: z.string().default('WhatsPlatform'),
  APP_URL: z.string().url(),
  API_URL: z.string().url(),
  LANDING_URL: z.string().url().optional(),
  ADMIN_URL: z.string().url().optional(),

  // API Server
  API_PORT: z.coerce.number().int().positive().default(3001),
  API_HOST: z.string().default('0.0.0.0'),

  // Database
  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MIN: z.coerce.number().int().nonnegative().default(2),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_TLS: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  REDIS_KEY_PREFIX: z.string().default('wsaas:'),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT secret must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT refresh secret must be at least 32 characters'),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('30d'),
  JWT_ISSUER: z.string().default('whatsapp-saas-api'),

  // Admin JWT
  ADMIN_JWT_SECRET: z.string().min(32, 'Admin JWT secret must be at least 32 characters'),
  ADMIN_JWT_EXPIRY: z.string().default('4h'),

  // Encryption
  ENCRYPTION_MASTER_KEY: z
    .string()
    .length(64, 'Encryption master key must be 64 hex characters (32 bytes)'),
  ENCRYPTION_KEY_ID: z.string().default('key_v1'),

  // Internal service auth
  INTERNAL_API_SECRET: z.string().min(24, 'Internal API secret must be at least 24 characters'),

  // Stripe (optional until billing phase)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_TAX_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),

  // Razorpay (wallet top-ups for pay-as-you-go Meta per-message costs)
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  WALLET_MIN_TOPUP_PAISE: z.coerce.number().int().positive().default(10000), // ₹100 minimum top-up
  WALLET_MAX_TOPUP_PAISE: z.coerce.number().int().positive().default(10000000), // ₹1,00,000 max top-up per order

  // Email
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),
  EMAIL_REPLY_TO: z.string().email().optional(),
  EMAIL_FROM_NAME: z.string().default('WhatsPlatform'),

  // Storage
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_MEDIA: z.string().default('whatsapp-media'),
  R2_BUCKET_BACKUPS: z.string().default('whatsapp-backups'),
  R2_PUBLIC_URL: z.string().optional(),
  R2_ENDPOINT: z.string().optional(), // For local MinIO

  // Worker
  WORKER_ID: z.string().default('worker-1'),
  WORKER_MAX_SESSIONS: z.coerce.number().int().positive().default(100),
  WORKER_MEMORY_LIMIT_MB: z.coerce.number().int().positive().default(2048),
  WORKER_HEARTBEAT_INTERVAL_MS: z.coerce.number().int().positive().default(10000),
  WORKER_PORT: z.coerce.number().int().positive().default(3002),

  // Session safety
  DEFAULT_MESSAGE_DELAY_MS: z.coerce.number().int().nonnegative().default(1000),
  DEFAULT_MESSAGE_JITTER_MS: z.coerce.number().int().nonnegative().default(300),
  MAX_MESSAGES_PER_MINUTE: z.coerce.number().int().positive().default(30),
  MAX_MESSAGES_PER_DAY: z.coerce.number().int().positive().default(1000),
  RECONNECT_BASE_DELAY_MS: z.coerce.number().int().positive().default(5000),
  MAX_RECONNECT_ATTEMPTS: z.coerce.number().int().positive().default(5),
  QR_EXPIRY_SECONDS: z.coerce.number().int().positive().default(60),

  // Webhook dispatcher
  DISPATCHER_CONCURRENCY: z.coerce.number().int().positive().default(10),
  DISPATCHER_DEFAULT_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  DISPATCHER_MAX_RETRIES: z.coerce.number().int().positive().default(7),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_LOGIN_MAX: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_REGISTER_MAX: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_FORGOT_PASSWORD_MAX: z.coerce.number().int().positive().default(3),

  // Monitoring
  SENTRY_DSN: z.string().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  PROMETHEUS_PORT: z.coerce.number().int().positive().default(9090),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().url().optional(),

  // Feature flags
  FEATURE_REGISTRATION_ENABLED: z
    .string()
    .transform((v) => v !== 'false')
    .default('true'),
  FEATURE_GOOGLE_OAUTH_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  FEATURE_TRIAL_ENABLED: z
    .string()
    .transform((v) => v !== 'false')
    .default('true'),
  FEATURE_BULK_MESSAGING_ENABLED: z
    .string()
    .transform((v) => v !== 'false')
    .default('true'),
  FEATURE_GROUPS_ENABLED: z
    .string()
    .transform((v) => v !== 'false')
    .default('true'),
  FEATURE_PROXY_SUPPORT_ENABLED: z
    .string()
    .transform((v) => v !== 'false')
    .default('true'),

  // Business config
  TRIAL_DAYS: z.coerce.number().int().positive().default(7),
  TRIAL_MESSAGE_LIMIT: z.coerce.number().int().positive().default(100),
  DATA_RETENTION_DAYS_AFTER_CANCEL: z.coerce.number().int().positive().default(30),
  SUPPORT_EMAIL: z.string().email().default('support@example.com'),
  ABUSE_EMAIL: z.string().email().default('abuse@example.com'),
  SECURITY_EMAIL: z.string().email().default('security@example.com'),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().int().positive().default(50),
  MAX_API_KEYS_PER_TENANT: z.coerce.number().int().positive().default(10),
});

export type Config = z.infer<typeof configSchema>;

// ─── Config Singleton ─────────────────────────────────────────────────────────

let config: Config | null = null;

/**
 * Loads and validates configuration from environment variables.
 * Throws on the first call if any required variable is missing or invalid.
 * Returns the cached config on subsequent calls.
 */
export function getConfig(): Config {
  if (config) return config;

  const result = configSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `\n❌ Invalid environment configuration:\n${errors}\n\n` +
        `Check your .env file against .env.example for required variables.\n`,
    );
  }

  config = result.data;
  return config;
}

/**
 * Convenience helper — shorthand for getConfig()
 */
export const cfg = () => getConfig();

export { z };
