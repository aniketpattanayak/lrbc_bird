import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyMultipart from '@fastify/multipart';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyWebSocket from '@fastify/websocket';

import { getConfig } from '@wsaas/config';
import { createLogger } from '@wsaas/logger';
import { getRedis } from '@wsaas/redis';

import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { metricsPlugin } from './plugins/metrics';

// Route modules
import { authRoutes } from './modules/auth/auth.routes';
import { instanceRoutes } from './modules/instances/instances.routes';
import { messageRoutes } from './modules/messages/messages.routes';
import { messageListRoutes } from './modules/messages/messagesList.routes';
import { webhookRoutes } from './modules/webhooks/webhooks.routes';
import { billingRoutes } from './modules/billing/billing.routes';
import { walletRoutes } from './modules/wallet/wallet.routes';
import { apiKeyRoutes } from './modules/apiKeys/apiKeys.routes';
import { mediaRoutes } from './modules/media/media.routes';
import { teamRoutes } from './modules/team/team.routes';
import { usageRoutes } from './modules/usage/usage.routes';
import { tenantRoutes } from './modules/tenant/tenant.routes';
import { templateRoutes } from './modules/templates/templates.routes';
import { adminRoutes } from './modules/admin/admin.routes';
import { metaWebhookRoutes } from './modules/metaWebhook/metaWebhook.routes';

const logger = createLogger({ name: 'api' });

export async function buildApp(): Promise<FastifyInstance> {
  const config = getConfig();
  const isDev = config.NODE_ENV === 'development';

  const app = Fastify({
    // Use our Pino logger
    logger: {
      level: config.LOG_LEVEL,
      ...(isDev && {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        },
      }),
    },
    // Trust X-Forwarded-For from Nginx/Cloudflare
    trustProxy: true,
    // Attach request ID to every request for tracing
    genReqId: () => `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    requestIdHeader: 'x-request-id',
    // Close grace period: wait 30s for in-flight requests on shutdown
  });

  // ── Security Headers (Helmet) ──────────────────────────────────────────────
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: false, // Handled by Nginx for dashboard
    crossOriginEmbedderPolicy: false,
  });

  // ── CORS ──────────────────────────────────────────────────────────────────
  await app.register(fastifyCors, {
    origin: isDev
      ? true // Allow all in development
      : [
          config.APP_URL,
          config.LANDING_URL ?? '',
          config.ADMIN_URL ?? '',
        ].filter(Boolean),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-API-Key',
      'X-Request-ID',
      'X-Webhook-Signature',
    ],
    exposedHeaders: [
      'X-Request-ID',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'X-RateLimit-RetryAfter',
    ],
  });

  // ── Cookies ───────────────────────────────────────────────────────────────
  await app.register(fastifyCookie, {
    secret: config.JWT_REFRESH_SECRET, // Signs cookies
    hook: 'onRequest',
  });

  // ── Multipart (File uploads) ───────────────────────────────────────────────
  await app.register(fastifyMultipart, {
    limits: {
      fileSize: config.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
      files: 1, // One file per request
    },
  });

  // ── WebSocket ─────────────────────────────────────────────────────────────
  await app.register(fastifyWebSocket, {
    options: {
      maxPayload: 1048576, // 1MB
    },
  });

  // ── Rate Limiting (global default) ────────────────────────────────────────
  await app.register(fastifyRateLimit, {
    global: true,
    max: 200, // Global default — overridden per route
    timeWindow: '1 minute',
    redis: getRedis(),
    keyGenerator: (request) => {
      // Rate limit by API key if present, otherwise by IP
      const apiKey = request.headers['x-api-key'];
      if (apiKey && typeof apiKey === 'string') {
        return `apikey:${apiKey.slice(0, 20)}`; // Use prefix only, not full key
      }
      return request.ip;
    },
    errorResponseBuilder: (_request, context) => ({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
        details: {
          limit: context.max,
          remaining: 0,
          resetAt: new Date(Date.now() + context.ttl).toISOString(),
        },
      },
    }),
    addHeadersOnExceeding: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
    },
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },
  });

  // ── OpenAPI / Swagger Docs ─────────────────────────────────────────────────
  if (isDev) {
    await app.register(fastifySwagger, {
      openapi: {
        openapi: '3.0.0',
        info: {
          title: `${config.APP_NAME} API`,
          description: 'WhatsApp API Gateway — REST API Documentation',
          version: '1.0.0',
        },
        servers: [{ url: config.API_URL, description: 'API Server' }],
        components: {
          securitySchemes: {
            ApiKeyAuth: {
              type: 'apiKey',
              in: 'header',
              name: 'X-API-Key',
            },
            BearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
            },
          },
        },
        tags: [
          { name: 'Auth', description: 'Authentication endpoints' },
          { name: 'Instances', description: 'WhatsApp instance management' },
          { name: 'Messages', description: 'Send and receive messages' },
          { name: 'Webhooks', description: 'Webhook configuration' },
          { name: 'Billing', description: 'Subscription and billing' },
          { name: 'Wallet', description: 'Wallet balance and Razorpay top-ups' },
          { name: 'Usage', description: 'Usage metrics and quotas' },
          { name: 'Admin', description: 'Platform administration' },
        ],
      },
    });

    await app.register(fastifySwaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: true,
        persistAuthorization: true,
      },
    });
  }

  // ── Request Logging Middleware ────────────────────────────────────────────
  app.addHook('onRequest', requestLogger);

  // ── Metrics Plugin ────────────────────────────────────────────────────────
  await app.register(metricsPlugin);

  // ── Global Error Handler ──────────────────────────────────────────────────
  app.setErrorHandler(errorHandler as any);

  // ── Health Checks ─────────────────────────────────────────────────────────
  app.get(
    '/health',
    {
      schema: {
        description: 'Health check endpoint',
        tags: ['System'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              version: { type: 'string' },
              uptime: { type: 'number' },
              timestamp: { type: 'string' },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      return reply.send({
        status: 'ok',
        version: process.env['npm_package_version'] ?? '0.1.0',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      });
    },
  );

  // Deep health check — verifies DB and Redis connectivity
  app.get('/health/deep', async (_request, reply) => {
    const checks = {
      database: { status: 'ok', latencyMs: 0 },
      redis: { status: 'ok', latencyMs: 0 },
    };

    // Check database
    const dbStart = Date.now();
    try {
      const { prisma } = await import('@wsaas/database');
      await prisma.$queryRaw`SELECT 1`;
      checks.database.latencyMs = Date.now() - dbStart;
    } catch {
      checks.database.status = 'down';
    }

    // Check Redis
    const redisStart = Date.now();
    try {
      await getRedis().ping();
      checks.redis.latencyMs = Date.now() - redisStart;
    } catch {
      checks.redis.status = 'down';
    }

    const allOk = Object.values(checks).every((c) => c.status === 'ok');

    return reply.status(allOk ? 200 : 503).send({
      status: allOk ? 'ok' : 'degraded',
      services: checks,
      timestamp: new Date().toISOString(),
    });
  });

  // ── API Routes (registered per phase) ─────────────────────────────────────
  // All routes are prefixed with /v1
  // Routes are added as each phase is built

  // Phase 1 — Auth
  await app.register(authRoutes, { prefix: '/v1/auth' });

  // Phase 2 — Billing
  await app.register(billingRoutes, { prefix: '/v1/billing' });

  // Wallet — pay-as-you-go balance, Razorpay top-ups, per-message Meta cost deduction
  await app.register(walletRoutes, { prefix: '/v1/wallet' });

  // Phase 3 — Instances
  await app.register(instanceRoutes, { prefix: '/v1/instances' });

  // Phase 4 — Messages
  await app.register(messageRoutes, { prefix: '/v1/instances' });
  await app.register(messageListRoutes, { prefix: '/v1/messages' });

  // Phase 5 — Webhooks
  await app.register(webhookRoutes, { prefix: '/v1/webhooks' });

  // Phase 6 — API Keys & Teams
  await app.register(apiKeyRoutes, { prefix: '/v1/api-keys' });
  await app.register(teamRoutes, { prefix: '/v1/team' });

  // Phase 7 — Usage
  await app.register(usageRoutes, { prefix: '/v1/usage' });

  // Phase 8 — Media
  await app.register(mediaRoutes, { prefix: '/v1/media' });

  // Tenant settings + message templates
  await app.register(tenantRoutes, { prefix: '/v1/tenant' });
  await app.register(templateRoutes, { prefix: '/v1/templates' });

  // Phase 8 — Admin
  await app.register(adminRoutes, { prefix: '/v1/admin' });

  await app.register(metaWebhookRoutes, { prefix: '/v1/meta' });

  logger.info('✅ All plugins and routes registered');

  return app;
}
