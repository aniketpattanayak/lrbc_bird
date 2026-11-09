import type { FastifyInstance } from 'fastify';
import { authenticate, requireRole } from '../../middleware/authenticate';
import * as controller from './team.controller';

export async function teamRoutes(app: FastifyInstance): Promise<void> {
  app.get('/members', { preHandler: [authenticate], schema: { tags: ['Team'], summary: 'List team members', security: [{ BearerAuth: [] }] }, handler: controller.listMembersController });
  app.patch('/members/:memberId', { preHandler: [authenticate, requireRole('ADMIN')], schema: { tags: ['Team'], summary: 'Update member role', security: [{ BearerAuth: [] }] }, handler: controller.updateMemberRoleController });
  app.delete('/members/:memberId', { preHandler: [authenticate, requireRole('ADMIN')], schema: { tags: ['Team'], summary: 'Remove team member', security: [{ BearerAuth: [] }] }, handler: controller.removeMemberController });

  app.get('/invites', { preHandler: [authenticate], schema: { tags: ['Team'], summary: 'List pending invites', security: [{ BearerAuth: [] }] }, handler: controller.listInvitesController });
  app.post('/invites', { preHandler: [authenticate, requireRole('ADMIN')], config: { rateLimit: { max: 20, timeWindow: '1 hour' } }, schema: { tags: ['Team'], summary: 'Invite a team member', security: [{ BearerAuth: [] }] }, handler: controller.createInviteController });
  app.delete('/invites/:inviteId', { preHandler: [authenticate, requireRole('ADMIN')], schema: { tags: ['Team'], summary: 'Cancel a pending invite', security: [{ BearerAuth: [] }] }, handler: controller.cancelInviteController });

  // Public — the invitee doesn't have an account yet
  app.post('/invites/accept', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } }, schema: { tags: ['Team'], summary: 'Accept a team invite' }, handler: controller.acceptInviteController });
}
