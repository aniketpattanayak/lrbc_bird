/**
 * Tracks consecutive webhook delivery failures per endpoint and raises a
 * platform alert once a tenant's endpoint crosses its failure threshold,
 * so support can reach out before the tenant notices they stopped getting
 * events.
 */
import { prisma } from '@wsaas/database';
import { createLogger } from '@wsaas/logger';

const logger = createLogger({ name: 'dispatcher:alerts' });

export async function recordDeliverySuccess(webhookConfigId: string): Promise<void> {
  await prisma.webhookConfig.update({
    where: { id: webhookConfigId },
    data: { consecutiveFails: 0, alertSent: false, lastSuccessAt: new Date() },
  });
}

export async function recordDeliveryFailure(webhookConfigId: string): Promise<void> {
  const config = await prisma.webhookConfig.update({
    where: { id: webhookConfigId },
    data: { consecutiveFails: { increment: 1 }, lastFailureAt: new Date() },
  });

  if (config.consecutiveFails >= config.failureThreshold && !config.alertSent) {
    await raiseFailureAlert(config.id, config.instanceId, config.url, config.consecutiveFails);
    await prisma.webhookConfig.update({ where: { id: config.id }, data: { alertSent: true } });
  }
}

async function raiseFailureAlert(
  webhookConfigId: string,
  instanceId: string,
  url: string,
  consecutiveFails: number,
): Promise<void> {
  logger.warn({ webhookConfigId, instanceId, url, consecutiveFails }, 'Webhook endpoint crossed failure threshold');

  try {
    await prisma.platformAlert.create({
      data: {
        type: 'webhook_failing',
        severity: 'WARNING',
        title: 'Webhook endpoint failing repeatedly',
        message: `Webhook delivery to ${url} (instance ${instanceId}) has failed ${consecutiveFails} times in a row.`,
        metadata: { webhookConfigId, instanceId, url, consecutiveFails },
      },
    });
  } catch (err) {
    logger.error({ err, webhookConfigId }, 'Failed to create platform alert for webhook failure');
  }
}
