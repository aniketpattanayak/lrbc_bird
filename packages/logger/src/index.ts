import pino, { type Logger, type LoggerOptions } from 'pino';

// ─── Logger Factory ───────────────────────────────────────────────────────────

export interface CreateLoggerOptions {
  name: string;           // App name: 'api' | 'worker' | 'dispatcher'
  level?: string;         // 'debug' | 'info' | 'warn' | 'error'
  pretty?: boolean;       // Pretty print in development
}

export function createLogger(options: CreateLoggerOptions): Logger {
  const level = options.level ?? process.env['LOG_LEVEL'] ?? 'info';
  const isDev = process.env['NODE_ENV'] === 'development';
  const usePretty = options.pretty ?? isDev;

  const pinoOptions: LoggerOptions = {
    name: options.name,
    level,
    // Redact sensitive fields — never log these
    redact: {
      paths: [
        'password',
        'passwordHash',
        'apiKey',
        'token',
        'secret',
        'refreshToken',
        'accessToken',
        'authorization',
        'cookie',
        'credentialsEncrypted',
        '*.password',
        '*.passwordHash',
        '*.apiKey',
        '*.token',
        '*.secret',
        '*.refreshToken',
        '*.accessToken',
        'req.headers.authorization',
        'req.headers.cookie',
      ],
      censor: '[REDACTED]',
    },
    // Serialize errors properly
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
    },
    // Standard fields on every log line
    base: {
      app: options.name,
      env: process.env['NODE_ENV'] ?? 'development',
      pid: process.pid,
    },
    // ISO timestamp
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (usePretty) {
    return pino({
      ...pinoOptions,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname,app,env',
          messageFormat: '[{name}] {msg}',
        },
      },
    });
  }

  return pino(pinoOptions);
}

// ─── Default logger for packages that need one ────────────────────────────────
export const logger = createLogger({ name: 'app' });

export type { Logger };
export { pino };
