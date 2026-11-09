import type { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';

import { createLogger } from '@wsaas/logger';
import { isAppError } from '@wsaas/utils';
import type { ApiErrorCode } from '@wsaas/types';

const logger = createLogger({ name: 'api:error' });

/**
 * Global Fastify error handler.
 *
 * Converts all errors into our standard API error response format:
 * { success: false, requestId: string, error: { code, message, details } }
 *
 * IMPORTANT: Never expose internal details (stack traces, DB errors, file paths)
 * in production responses. Log the full error internally.
 */
export function errorHandler(
  error: FastifyError | Error | unknown,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const requestId = request.id;
  const isDev = process.env['NODE_ENV'] === 'development';

  // ── Our own AppError (operational, expected) ───────────────────────────────
  if (isAppError(error)) {
    if (error.statusCode >= 500) {
      logger.error(
        { err: error, requestId, path: request.url },
        'Internal application error',
      );
    } else {
      logger.warn(
        { code: error.code, requestId, path: request.url },
        error.message,
      );
    }

    void reply.status(error.statusCode).send({
      success: false,
      requestId,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details && { details: error.details }),
        ...(isDev && { stack: error.stack }),
      },
    });
    return;
  }

  // ── Zod validation error ───────────────────────────────────────────────────
  if (error instanceof ZodError) {
    const details = error.issues.reduce<Record<string, string>>((acc, issue) => {
      const path = issue.path.join('.');
      acc[path] = issue.message;
      return acc;
    }, {});

    void reply.status(422).send({
      success: false,
      requestId,
      error: {
        code: 'VALIDATION_ERROR' as ApiErrorCode,
        message: 'Request validation failed',
        details,
      },
    });
    return;
  }

  // ── Fastify built-in errors ───────────────────────────────────────────────
  const fastifyError = error as FastifyError;

  if (fastifyError.statusCode) {
    // Fastify-generated errors (route not found, method not allowed, etc.)
    const statusCode = fastifyError.statusCode;

    if (statusCode === 404) {
      void reply.status(404).send({
        success: false,
        requestId,
        error: {
          code: 'NOT_FOUND' as ApiErrorCode,
          message: `Route ${request.method} ${request.url} not found`,
        },
      });
      return;
    }

    if (statusCode === 405) {
      void reply.status(405).send({
        success: false,
        requestId,
        error: {
          code: 'NOT_FOUND' as ApiErrorCode,
          message: 'Method not allowed',
        },
      });
      return;
    }

    if (statusCode === 413) {
      void reply.status(413).send({
        success: false,
        requestId,
        error: {
          code: 'MEDIA_TOO_LARGE' as ApiErrorCode,
          message: 'Request body too large',
          details: { maxSizeMb: process.env['MAX_UPLOAD_SIZE_MB'] ?? '50' },
        },
      });
      return;
    }

    if (statusCode === 429) {
      void reply.status(429).send({
        success: false,
        requestId,
        error: {
          code: 'RATE_LIMIT_EXCEEDED' as ApiErrorCode,
          message: 'Too many requests. Please slow down.',
        },
      });
      return;
    }

    // Other Fastify errors
    logger.warn({ err: error, requestId }, 'Fastify error');
    void reply.status(statusCode).send({
      success: false,
      requestId,
      error: {
        code: 'INTERNAL_ERROR' as ApiErrorCode,
        message: isDev ? fastifyError.message : 'An error occurred',
      },
    });
    return;
  }

  // ── Unknown/unexpected error ───────────────────────────────────────────────
  // These are bugs — log them with full context for debugging
  logger.error(
    {
      err: error,
      requestId,
      method: request.method,
      url: request.url,
      headers: request.headers,
    },
    'Unexpected error',
  );

  void reply.status(500).send({
    success: false,
    requestId,
    error: {
      code: 'INTERNAL_ERROR' as ApiErrorCode,
      message: 'An unexpected error occurred. Our team has been notified.',
      ...(isDev && {
        details: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      }),
    },
  });
}
