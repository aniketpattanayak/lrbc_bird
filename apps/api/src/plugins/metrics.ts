import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import client from 'prom-client';

/**
 * Prometheus metrics plugin.
 * Exposes /metrics endpoint for Prometheus scraping.
 * Tracks HTTP request counts, duration, and active connections.
 */
// Module-level singletons
let metricsInitialized = false;
let httpRequestTotal: client.Counter;
let httpRequestDuration: client.Histogram;
let httpActiveConnections: client.Gauge;
let authErrors: client.Counter;
let quotaExceeded: client.Counter;

function initMetrics() {
  if (metricsInitialized) return;
  metricsInitialized = true;
  client.collectDefaultMetrics({ prefix: 'wsaas_api_', labels: { app: 'api', env: process.env['NODE_ENV'] ?? 'development' } });
  httpRequestTotal = new client.Counter({ name: 'wsaas_api_http_requests_total', help: 'Total HTTP requests received', labelNames: ['method', 'route', 'status_code'] });
  httpRequestDuration = new client.Histogram({ name: 'wsaas_api_http_request_duration_seconds', help: 'HTTP request duration in seconds', labelNames: ['method', 'route', 'status_code'], buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5] });
  httpActiveConnections = new client.Gauge({ name: 'wsaas_api_active_connections', help: 'Number of active HTTP connections' });
  authErrors = new client.Counter({ name: 'wsaas_api_auth_errors_total', help: 'Total authentication errors', labelNames: ['code'] });
  quotaExceeded = new client.Counter({ name: 'wsaas_api_quota_exceeded_total', help: 'Total quota exceeded events', labelNames: ['tenant_id', 'quota_type'] });
}

export const metricsPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  initMetrics();

  // Track active connections
  app.addHook('onRequest', async () => {
    httpActiveConnections.inc();
  });

  app.addHook('onResponse', async (request, reply) => {
    httpActiveConnections.dec();

    const route = request.routerPath ?? request.url;
    const method = request.method;
    const statusCode = String(reply.statusCode);

    httpRequestTotal.inc({ method, route, status_code: statusCode });
    httpRequestDuration.observe(
      { method, route, status_code: statusCode },
      reply.elapsedTime / 1000,
    );
  });

  // Expose metrics endpoint — only accessible from internal network in production
  app.get(
    '/metrics',
    {
      schema: { hide: true }, // Don't show in Swagger docs
    },
    async (_request, reply) => {
      const metrics = await client.register.metrics();
      return reply
        .header('Content-Type', client.register.contentType)
        .send(metrics);
    },
  );

  // Export metric instances so other modules can use them
  app.decorate('metrics', {
    httpRequestTotal,
    httpRequestDuration,
    authErrors,
    quotaExceeded,
  });
};

// Type augmentation — makes app.metrics available with types
declare module 'fastify' {
  interface FastifyInstance {
    metrics: {
      httpRequestTotal: client.Counter;
      httpRequestDuration: client.Histogram;
      authErrors: client.Counter;
      quotaExceeded: client.Counter;
    };
  }
}
