import type { FastifyRequest, FastifyReply } from 'fastify';
import { validateBody } from '../../utils/zodToJsonSchema';
import { inviteMemberSchema, updateMemberRoleSchema, acceptInviteSchema } from './team.schema';
import * as teamService from './team.service';

export async function listMembersController(request: FastifyRequest, reply: FastifyReply) {
  const data = await teamService.listMembers(request.tenantId);
  return reply.send({ success: true, requestId: request.id, data });
}

export async function updateMemberRoleController(
  request: FastifyRequest<{ Params: { memberId: string } }>,
  reply: FastifyReply,
) {
  const body = validateBody(updateMemberRoleSchema, request.body);
  const data = await teamService.updateMemberRole(request.tenantId, request.params.memberId, request.userId, body);
  return reply.send({ success: true, requestId: request.id, data });
}

export async function removeMemberController(
  request: FastifyRequest<{ Params: { memberId: string } }>,
  reply: FastifyReply,
) {
  await teamService.removeMember(request.tenantId, request.params.memberId, request.userId);
  return reply.send({ success: true, requestId: request.id, data: { message: 'Member removed' } });
}

export async function listInvitesController(request: FastifyRequest, reply: FastifyReply) {
  const data = await teamService.listInvites(request.tenantId);
  return reply.send({ success: true, requestId: request.id, data });
}

export async function createInviteController(request: FastifyRequest, reply: FastifyReply) {
  const body = validateBody(inviteMemberSchema, request.body);
  const data = await teamService.createInvite(request.tenantId, request.userId, body);
  return reply.status(201).send({ success: true, requestId: request.id, data });
}

export async function cancelInviteController(
  request: FastifyRequest<{ Params: { inviteId: string } }>,
  reply: FastifyReply,
) {
  await teamService.cancelInvite(request.tenantId, request.params.inviteId);
  return reply.send({ success: true, requestId: request.id, data: { message: 'Invite cancelled' } });
}

export async function acceptInviteController(request: FastifyRequest, reply: FastifyReply) {
  const body = validateBody(acceptInviteSchema, request.body);
  const data = await teamService.acceptInvite(body);
  return reply.status(201).send({ success: true, requestId: request.id, data });
}
