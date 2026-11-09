import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import { prisma } from '@wsaas/database';
import * as adminService from './admin.service';

async function requireSuperAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: request.userId },
    select: { isSuperAdmin: true },
  });
  if (!user?.isSuperAdmin) {
    return reply.code(403).send({
      success: false,
      requestId: request.id,
      error: { code: 'FORBIDDEN', message: 'Super admin access required' },
    });
  }
}

export async function adminRoutes(app: FastifyInstance) {
  const preHandler = [authenticate, requireSuperAdmin];

  // Every handler below returns the raw service result, which Fastify would
  // otherwise serialize as-is. The dashboard's API client expects the
  // standard { success, requestId, data } envelope (see apiFetch/handleResponse
  // in apps/dashboard/src/lib/api.ts) and treats anything without
  // success: true as a thrown error — so every admin endpoint must wrap its
  // result or the dashboard silently discards the response.

  // ── Stats ──────────────────────────────────────────────────────────────────
  app.get('/stats', { preHandler }, async (request) => {
    const data = await adminService.getPlatformStats();
    return { success: true, requestId: request.id, data };
  });

  // ── Tenants ────────────────────────────────────────────────────────────────
  app.get('/tenants', { preHandler }, async (request) => {
    const { search, status, limit = '50', offset = '0' } = request.query as any;
    const data = await adminService.listTenants({
      search,
      status,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
    return { success: true, requestId: request.id, data };
  });

  app.get('/tenants/:tenantId', { preHandler }, async (request) => {
    const { tenantId } = request.params as any;
    const data = await adminService.getTenant(tenantId);
    return { success: true, requestId: request.id, data };
  });

  app.patch('/tenants/:tenantId', { preHandler }, async (request) => {
    const { tenantId } = request.params as any;
    const { status } = request.body as any;
    const data = await adminService.updateTenantStatus(tenantId, status, request.userId);
    return { success: true, requestId: request.id, data };
  });

  app.put('/tenants/:tenantId/whatsapp-mode', { preHandler }, async (request) => {
    const { tenantId } = request.params as any;
    const { mode, force } = request.body as any;
    const data = await adminService.setTenantWhatsappModeOverride(tenantId, mode, Boolean(force), request.userId);
    return { success: true, requestId: request.id, data };
  });

  // ── Plans ──────────────────────────────────────────────────────────────────
  app.get('/plans', { preHandler }, async (request) => {
    const data = await adminService.listAllPlans();
    return { success: true, requestId: request.id, data };
  });

  app.post('/plans', { preHandler }, async (request) => {
    const data = await adminService.createPlan(request.body as any);
    return { success: true, requestId: request.id, data };
  });

  app.patch('/plans/:planId', { preHandler }, async (request) => {
    const { planId } = request.params as any;
    const data = await adminService.updatePlan(planId, request.body as any);
    return { success: true, requestId: request.id, data };
  });

  app.delete('/plans/:planId', { preHandler }, async (request) => {
    const { planId } = request.params as any;
    const data = await adminService.softDeletePlan(planId);
    return { success: true, requestId: request.id, data };
  });
}
