import { prisma } from '@wsaas/database';
import { getMessageOutboundQueue } from '@wsaas/queue';
import { NotFoundError } from '@wsaas/utils';
import { REDIS_KEYS, JOB_NAMES, type MessageType, type MessageContent } from '@wsaas/types';
import { createLogger } from '@wsaas/logger';
import { randomUUID } from 'crypto';
import type { SendTextDto, SendImageDto, SendDocumentDto, SendLocationDto } from './messages.schema';

const logger = createLogger({ name: 'api:messages' });

async function getConnectedInstance(tenantId: string, instanceId: string) {
  const instance = await prisma.instance.findUnique({
    where: { id: instanceId },
    select: { id: true, tenantId: true, status: true, deletedAt: true },
  });

  if (!instance || instance.tenantId !== tenantId || instance.deletedAt) {
    throw new NotFoundError('Instance', instanceId);
  }

  if (instance.status !== 'CONNECTED') {
    const err = new Error(`Instance is not connected (status: ${instance.status})`);
    (err as any).statusCode = 422;
    (err as any).code = 'INSTANCE_NOT_CONNECTED';
    throw err;
  }

  return instance;
}

async function queueMessage(
  tenantId: string,
  instanceId: string,
  type: MessageType,
  to: string,
  content: MessageContent,
  jobName: string,
) {
  const messageId = randomUUID();
  const idempotencyKey = randomUUID();

  // WhatsApp JIDs are bare MSISDN digits (no '+', spaces, or dashes) — normalize
  // here so every downstream consumer (DB, queue payload, Baileys JID) agrees.
  const normalizedTo = to.includes('@') ? to : to.replace(/[^\d]/g, '');

  // Save to DB
  await prisma.message.create({
    data: {
      id: messageId,
      tenantId,
      instanceId,
      direction: 'OUTBOUND',
      type,
      status: 'QUEUED',
      toNumber: normalizedTo,
      content: content as any,
      queuedAt: new Date(),
    },
  });

  // Enqueue
  const queue = getMessageOutboundQueue();
  await queue.add(jobName, {
    messageId,
    instanceId,
    tenantId,
    type,
    to: normalizedTo,
    content,
    idempotencyKey,
  });

  logger.info({ tenantId, instanceId, messageId, type }, 'Message queued');

  return { messageId, status: 'QUEUED' };
}

export async function sendText(tenantId: string, instanceId: string, dto: SendTextDto) {
  await getConnectedInstance(tenantId, instanceId);
  return queueMessage(tenantId, instanceId, 'TEXT', dto.to, { text: dto.message, linkPreview: dto.linkPreview }, JOB_NAMES.SEND_TEXT);
}

export async function sendImage(tenantId: string, instanceId: string, dto: SendImageDto) {
  await getConnectedInstance(tenantId, instanceId);
  return queueMessage(tenantId, instanceId, 'IMAGE', dto.to, { mediaUrl: dto.mediaUrl, caption: dto.caption }, JOB_NAMES.SEND_IMAGE);
}

export async function sendDocument(tenantId: string, instanceId: string, dto: SendDocumentDto) {
  await getConnectedInstance(tenantId, instanceId);
  return queueMessage(tenantId, instanceId, 'DOCUMENT', dto.to, { mediaUrl: dto.mediaUrl, filename: dto.filename, caption: dto.caption }, JOB_NAMES.SEND_DOCUMENT);
}

export async function sendLocation(tenantId: string, instanceId: string, dto: SendLocationDto) {
  await getConnectedInstance(tenantId, instanceId);
  return queueMessage(tenantId, instanceId, 'LOCATION', dto.to, { latitude: dto.latitude, longitude: dto.longitude, name: dto.name, address: dto.address }, JOB_NAMES.SEND_LOCATION);
}

export async function getMessageStatus(tenantId: string, messageId: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, tenantId: true, status: true, whatsappMessageId: true, type: true, toNumber: true, sentAt: true, failedAt: true, errorMessage: true, createdAt: true },
  });

  if (!message || message.tenantId !== tenantId) {
    throw new NotFoundError('Message', messageId);
  }

  return message;
}

// ─── Tenant-wide message listing (dashboard "Messages" page) ──────────────

export interface ListMessagesFilters {
  page: number;
  limit: number;
  instanceId?: string;
  type?: string;
  status?: string;
  direction?: string;
  search?: string;
  from?: Date;
  to?: Date;
}

export async function listMessages(tenantId: string, filters: ListMessagesFilters) {
  const where: Record<string, unknown> = { tenantId };
  if (filters.instanceId) where['instanceId'] = filters.instanceId;
  if (filters.type) where['type'] = filters.type;
  if (filters.status) where['status'] = filters.status;
  if (filters.direction) where['direction'] = filters.direction;
  if (filters.from || filters.to) {
    where['createdAt'] = {
      ...(filters.from && { gte: filters.from }),
      ...(filters.to && { lte: filters.to }),
    };
  }
  if (filters.search) {
    where['OR'] = [
      { toNumber: { contains: filters.search } },
      { fromNumber: { contains: filters.search } },
    ];
  }

  const [messages, total] = await Promise.all([
    prisma.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
      include: { instance: { select: { name: true } } },
    }),
    prisma.message.count({ where }),
  ]);

  return {
    data: messages.map((m) => ({ ...m, instanceName: m.instance.name })),
    meta: {
      page: filters.page,
      limit: filters.limit,
      total,
      hasNext: filters.page * filters.limit < total,
      hasPrev: filters.page > 1,
    },
  };
}

export async function getConversation(tenantId: string, instanceId: string, phoneNumber: string, limit = 100) {
  await getConnectedInstanceOrAny(tenantId, instanceId);

  const messages = await prisma.message.findMany({
    where: {
      tenantId,
      instanceId,
      OR: [{ toNumber: phoneNumber }, { fromNumber: phoneNumber }],
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  return messages;
}

async function getConnectedInstanceOrAny(tenantId: string, instanceId: string) {
  const instance = await prisma.instance.findUnique({ where: { id: instanceId }, select: { id: true, tenantId: true, deletedAt: true } });
  if (!instance || instance.tenantId !== tenantId || instance.deletedAt) {
    throw new NotFoundError('Instance', instanceId);
  }
  return instance;
}
