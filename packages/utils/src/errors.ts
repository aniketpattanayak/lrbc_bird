import type { ApiErrorCode } from '@wsaas/types';

// ─── Base Application Error ───────────────────────────────────────────────────

export class AppError extends Error {
  public readonly code: ApiErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  public isOperational: boolean;

  constructor(
    code: ApiErrorCode,
    message: string,
    statusCode: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true; // Operational errors are expected and handled gracefully

    // Maintain proper prototype chain in transpiled TypeScript
    Object.setPrototypeOf(this, new.target.prototype);

    // Capture clean stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

// ─── Specific Error Classes ───────────────────────────────────────────────────

export class AuthError extends AppError {
  constructor(code: ApiErrorCode, message: string, details?: Record<string, unknown>) {
    super(code, message, 401, details);
    this.name = 'AuthError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super('FORBIDDEN', message, 403);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} with id '${id}' not found` : `${resource} not found`;
    super('NOT_FOUND', message, 404);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, 422, details);
    this.name = 'ValidationError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('CONFLICT', message, 409, details);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends AppError {
  public readonly retryAfter: number;

  constructor(message: string, retryAfter: number) {
    super('RATE_LIMIT_EXCEEDED', message, 429, { retryAfter });
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class QuotaExceededError extends AppError {
  constructor(quotaType: 'messages' | 'instances' | 'storage', details?: Record<string, unknown>) {
    const codes: Record<typeof quotaType, ApiErrorCode> = {
      messages: 'QUOTA_MESSAGES_EXCEEDED',
      instances: 'QUOTA_INSTANCES_EXCEEDED',
      storage: 'QUOTA_STORAGE_EXCEEDED',
    };
    const messages: Record<typeof quotaType, string> = {
      messages: 'Monthly message quota exceeded. Upgrade your plan to continue sending.',
      instances: 'Instance limit reached. Upgrade your plan to add more instances.',
      storage: 'Storage quota exceeded. Delete unused media or upgrade your plan.',
    };
    super(codes[quotaType], messages[quotaType], 429, details);
    this.name = 'QuotaExceededError';
  }
}

export class InstanceError extends AppError {
  constructor(
    code: ApiErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    const statusMap: Partial<Record<ApiErrorCode, number>> = {
      INSTANCE_NOT_FOUND: 404,
      INSTANCE_NOT_OWNED: 403,
      INSTANCE_NOT_CONNECTED: 409,
      INSTANCE_QR_PENDING: 409,
      INSTANCE_BANNED: 409,
      INSTANCE_LIMIT_REACHED: 429,
      INSTANCE_INITIALIZING: 409,
      INSTANCE_RECONNECTING: 409,
    };
    super(code, message, statusMap[code] ?? 400, details);
    this.name = 'InstanceError';
  }
}

export class PaymentRequiredError extends AppError {
  constructor(message = 'This action requires an active subscription') {
    super('AUTH_PAYMENT_REQUIRED', message, 402);
    this.name = 'PaymentRequiredError';
  }
}

export class InternalError extends AppError {
  constructor(message = 'An unexpected error occurred') {
    super('INTERNAL_ERROR', message, 500);
    this.name = 'InternalError';
    this.isOperational = false; // Not operational — needs investigation
  }
}

// ─── Error Type Guards ────────────────────────────────────────────────────────

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function isOperationalError(error: unknown): boolean {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
}
