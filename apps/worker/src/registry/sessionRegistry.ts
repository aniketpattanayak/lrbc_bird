/**
 * Session-to-worker mapping.
 *
 * The API needs to know which worker owns a given instance's live session
 * (e.g. to proxy a "get current QR" request, or to route a lifecycle
 * command). We record that mapping in Redis, keyed by instanceId.
 */
import { getRedis } from '@wsaas/redis';
import { REDIS_KEYS } from '@wsaas/types';
import { getConfig } from '@wsaas/config';

const SESSION_WORKER_TTL_SECONDS = 60 * 60 * 24; // refreshed on every reconnect; generous ceiling

export async function claimSession(instanceId: string): Promise<void> {
  const redis = getRedis();
  const workerId = getConfig().WORKER_ID;
  await redis.setex(REDIS_KEYS.SESSION_WORKER(instanceId), SESSION_WORKER_TTL_SECONDS, workerId);
}

export async function releaseSession(instanceId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(REDIS_KEYS.SESSION_WORKER(instanceId));
}

export async function getSessionWorker(instanceId: string): Promise<string | null> {
  const redis = getRedis();
  return redis.get(REDIS_KEYS.SESSION_WORKER(instanceId));
}
