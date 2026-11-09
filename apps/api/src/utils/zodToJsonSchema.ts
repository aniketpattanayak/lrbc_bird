import { z } from 'zod';

export function zodToJsonSchema(schema: z.ZodTypeAny): object {
  return { type: 'object', additionalProperties: true };
}

export function validateBody<T>(schema: z.ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const { ValidationError } = require('@wsaas/utils') as typeof import('@wsaas/utils');
    const details = result.error.issues.reduce<Record<string, string>>((acc, issue) => {
      const path = issue.path.join('.') || 'body';
      acc[path] = issue.message;
      return acc;
    }, {});
    throw new ValidationError('Request validation failed', details);
  }
  return result.data;
}

export function validateQuery<T>(schema: z.ZodSchema<T>, query: unknown): T {
  const result = schema.safeParse(query);
  if (!result.success) {
    const { ValidationError } = require('@wsaas/utils') as typeof import('@wsaas/utils');
    const details = result.error.issues.reduce<Record<string, string>>((acc, issue) => {
      const path = issue.path.join('.') || 'query';
      acc[path] = issue.message;
      return acc;
    }, {});
    throw new ValidationError('Query validation failed', details);
  }
  return result.data;
}
