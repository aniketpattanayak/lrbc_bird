import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import * as controller from './tenant.controller';

export async function tenantRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', { preHandler: [authenticate], schema: { tags: ['Tenant'], summary: 'Get tenant profile', security: [{ BearerAuth: [] }] }, handler: controller.getTenantController });
  app.patch('/', { preHandler: [authenticate], schema: { tags: ['Tenant'], summary: 'Update tenant profile', security: [{ BearerAuth: [] }] }, handler: controller.updateTenantController });
  app.get('/notifications', { preHandler: [authenticate], schema: { tags: ['Tenant'], summary: 'Get notification preferences', security: [{ BearerAuth: [] }] }, handler: controller.getNotificationPrefsController });
  app.patch('/notifications', { preHandler: [authenticate], schema: { tags: ['Tenant'], summary: 'Update notification preferences', security: [{ BearerAuth: [] }] }, handler: controller.updateNotificationPrefsController });
  app.put('/whatsapp-mode', { preHandler: [authenticate], schema: { tags: ['Tenant'], summary: 'Lock WhatsApp mode (Unofficial/Baileys vs Official/Meta Cloud API)', security: [{ BearerAuth: [] }] }, handler: controller.setWhatsappModeController });
}
