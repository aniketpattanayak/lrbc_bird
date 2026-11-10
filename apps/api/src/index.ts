/**
 * Vercel serverless entry point.
 * Vercel requires a default export of a handler function (or a Fastify/Express app).
 * We build the Fastify app and export it; Vercel wraps it via @vercel/node.
 */
import 'dotenv/config';
import { buildApp } from './app';

let appPromise: ReturnType<typeof buildApp> | null = null;

function getApp() {
  if (!appPromise) {
    appPromise = buildApp();
  }
  return appPromise;
}

export default async function handler(req: any, res: any) {
  const app = await getApp();
  await app.ready();
  app.server.emit('request', req, res);
}
