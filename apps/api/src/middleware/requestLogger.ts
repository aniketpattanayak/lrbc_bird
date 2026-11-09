import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { createLogger } from '@wsaas/logger';

const logger = createLogger({ name: 'api:request' });

// Paths that don't need to be logged (health checks spam logs)
const SILENT_PATHS = new Set(['/health', '/metrics', '/favicon.ico']);

/**
 * Request logging hook — attaches to onRequest lifecycle.
 * Logs method, path, IP, and request ID.
 * Response time is logged by Fastify's built-in request.log.
 */
export function requestLogger(
  request: FastifyRequest,
  _reply: FastifyReply,
  done: HookHandlerDoneFunction,
): void {
  if (SILENT_PATHS.has(request.routerPath ?? request.url)) {
    done();
    return;
  }

  logger.info(
    {
      requestId: request.id,
      method: request.method,
      url: request.url,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    },
    'Incoming request',
  );

  done();
}
