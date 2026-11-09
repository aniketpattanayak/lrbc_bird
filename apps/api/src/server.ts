import * as dotenv from 'dotenv';
dotenv.config();

import { getConfig } from '@wsaas/config';
import { createLogger } from '@wsaas/logger';
import { disconnectRedis } from '@wsaas/redis';
import { closeAllQueues } from '@wsaas/queue';
import { buildApp } from './app';

const logger = createLogger({ name: 'api' });

async function main() {
  const config = getConfig();
  logger.info({ env: config.NODE_ENV, port: config.API_PORT }, 'Starting API server...');

  // Test DB with raw pg
  try {
    const { Client } = await import('pg');
    const client = new Client({ connectionString: config.DATABASE_URL });
    await client.connect();
    await client.query('SELECT 1');
    await client.end();
    logger.info('Database connected');
  } catch (err) {
    logger.fatal({ err }, 'Failed to connect to database. Exiting.');
    process.exit(1);
  }

  // Test Redis
  try {
    const { getRedis } = await import('@wsaas/redis');
    const redis = getRedis();
    await redis.connect();
    await redis.ping();
    logger.info('Redis connected');
  } catch (err) {
    logger.fatal({ err }, 'Failed to connect to Redis. Exiting.');
    process.exit(1);
  }

  const app = await buildApp();

  try {
    const address = await app.listen({ port: config.API_PORT, host: config.API_HOST });
    logger.info({ address }, '🚀 API server listening');
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  await Promise.all([disconnectRedis(), closeAllQueues()]);
  process.exit(0);
});
process.on('SIGINT', async () => {
  await Promise.all([disconnectRedis(), closeAllQueues()]);
  process.exit(0);
});
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection');
  if (process.env['NODE_ENV'] === 'development') process.exit(1);
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});

void main();
