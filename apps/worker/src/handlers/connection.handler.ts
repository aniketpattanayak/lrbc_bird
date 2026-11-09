/**
 * Connection lifecycle handling: QR generation, connect/disconnect, ban
 * detection, and the webhook + Redis/DB bookkeeping that goes with each.
 */
import type { WASocket, ConnectionState } from '@whiskeysockets/baileys';
import * as qrcode from 'qrcode';
import { prisma } from '@wsaas/database';
import { getRedis } from '@wsaas/redis';
import { createLogger } from '@wsaas/logger';
import { REDIS_KEYS, REDIS_CHANNELS } from '@wsaas/types';
import type {
  SessionQrData,
  SessionConnectedData,
  SessionDisconnectedData,
} from '@wsaas/types';
import { classifyDisconnect, markInstanceBanned } from '../safety/banDetection';
import { claimSession, releaseSession } from '../registry/sessionRegistry';
import { emitWebhookEvent } from './webhookEmitter';

const logger = createLogger({ name: 'worker:connection-handler' });

export interface ConnectionHandlerCallbacks {
  scheduleReconnect: () => void;
  removeSession: () => void;
}

export async function handleConnectionUpdate(
  sock: WASocket,
  instanceId: string,
  tenantId: string,
  update: Partial<ConnectionState>,
  callbacks: ConnectionHandlerCallbacks,
): Promise<void> {
  const { connection, lastDisconnect, qr } = update;
  const redis = getRedis();

  if (qr) {
    logger.info({ instanceId }, 'QR code generated');
    const qrBase64 = await qrcode.toDataURL(qr);
    const expiresAt = new Date(Date.now() + 60_000);

    await redis.setex(REDIS_KEYS.QR_CODE(instanceId), 60, qrBase64);
    await redis.publish(REDIS_CHANNELS.SESSION_QR(instanceId), JSON.stringify({ instanceId, qr: qrBase64 }));

    await prisma.instance.update({ where: { id: instanceId }, data: { status: 'QR_PENDING', lastQrAt: new Date() } });
    await prisma.instanceQrEvent.create({ data: { instanceId, qrData: qrBase64, expiredAt: expiresAt } });
    await prisma.instanceConnectionEvent.create({ data: { instanceId, event: 'qr_generated' } });

    const data: SessionQrData = { qrCode: qrBase64, expiresAt: expiresAt.toISOString() };
    await emitWebhookEvent(tenantId, instanceId, 'session.qr_generated', data);
  }

  if (connection === 'close') {
    const { classification, statusCode } = classifyDisconnect(lastDisconnect?.error);
    logger.info({ instanceId, statusCode, classification }, 'Connection closed');

    await releaseSession(instanceId);

    if (classification === 'banned') {
      await markInstanceBanned(instanceId, `statusCode=${statusCode}`);
      callbacks.removeSession();

      const data: SessionDisconnectedData = { reason: 'banned', errorCode: String(statusCode), willReconnect: false };
      await emitWebhookEvent(tenantId, instanceId, 'session.banned', data);
      return;
    }

    if (classification === 'logged_out') {
      await prisma.instance.update({ where: { id: instanceId }, data: { status: 'LOGGED_OUT' } });
      await prisma.instanceConnectionEvent.create({
        data: { instanceId, event: 'disconnected', reason: 'logged_out', errorCode: String(statusCode) },
      });
      callbacks.removeSession();

      const data: SessionDisconnectedData = { reason: 'logged_out', errorCode: String(statusCode), willReconnect: false };
      await emitWebhookEvent(tenantId, instanceId, 'session.logged_out', data);
      return;
    }

    // Transient disconnect — reconnect.
    await prisma.instance.update({
      where: { id: instanceId },
      data: { status: 'RECONNECTING', disconnectedAt: new Date(), reconnectCount: { increment: 1 } },
    });
    await prisma.instanceConnectionEvent.create({
      data: { instanceId, event: 'reconnect_attempt', errorCode: statusCode ? String(statusCode) : null },
    });

    const data: SessionDisconnectedData = {
      reason: 'connection_closed',
      errorCode: statusCode ? String(statusCode) : undefined,
      willReconnect: true,
    };
    await emitWebhookEvent(tenantId, instanceId, 'session.reconnecting', data);

    callbacks.scheduleReconnect();
  }

  if (connection === 'open') {
    logger.info({ instanceId }, 'WhatsApp connected');

    const phoneNumber = sock.user?.id?.split(':')[0] ?? null;
    const displayName = sock.user?.name ?? null;

    await prisma.instance.update({
      where: { id: instanceId },
      data: {
        status: 'CONNECTED',
        phoneNumber,
        displayName,
        connectedAt: new Date(),
        lastSeenAt: new Date(),
        reconnectCount: 0,
      },
    });
    await prisma.instanceConnectionEvent.create({ data: { instanceId, event: 'connected' } });
    await claimSession(instanceId);

    await redis.set(
      REDIS_KEYS.SESSION_STATUS(instanceId),
      JSON.stringify({ instanceId, status: 'CONNECTED', phoneNumber, displayName }),
    );
    await redis.publish(
      REDIS_CHANNELS.SESSION_STATUS(tenantId),
      JSON.stringify({ instanceId, status: 'CONNECTED', phoneNumber, displayName }),
    );

    const data: SessionConnectedData = {
      phoneNumber: phoneNumber ?? '',
      displayName: displayName ?? '',
      platform: 'whatsapp-web',
    };
    await emitWebhookEvent(tenantId, instanceId, 'session.connected', data);
  }
}
