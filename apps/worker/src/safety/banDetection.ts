/**
 * Ban / restriction detection.
 *
 * Baileys surfaces a WhatsApp ban as a connection close with statusCode 401
 * (unauthorized / logged out elsewhere) or via explicit `connectionReplaced` /
 * `banned` boom reasons. We classify the disconnect reason so SessionManager
 * can decide whether to mark the instance BANNED (stop retrying) vs a normal
 * reconnect.
 */
import { DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { prisma } from '@wsaas/database';
import { createLogger } from '@wsaas/logger';

const logger = createLogger({ name: 'worker:ban-detection' });

export type DisconnectClassification = 'reconnect' | 'logged_out' | 'banned';

export function classifyDisconnect(error: unknown): {
  classification: DisconnectClassification;
  statusCode: number | undefined;
} {
  const statusCode = (error as Boom)?.output?.statusCode;

  if (statusCode === DisconnectReason.loggedOut) {
    return { classification: 'logged_out', statusCode };
  }

  // Baileys doesn't have a dedicated "banned" DisconnectReason, but WhatsApp
  // returns 403 Forbidden (via connectionReplaced/forbidden boom) when the
  // account has been banned server-side.
  if (statusCode === 403) {
    return { classification: 'banned', statusCode };
  }

  return { classification: 'reconnect', statusCode };
}

export async function markInstanceBanned(instanceId: string, reason: string): Promise<void> {
  logger.warn({ instanceId, reason }, 'Instance appears to be banned by WhatsApp');

  await prisma.instance.update({
    where: { id: instanceId },
    data: { status: 'BANNED', banDetectedAt: new Date() },
  });

  await prisma.instanceConnectionEvent.create({
    data: { instanceId, event: 'banned', reason },
  });
}
