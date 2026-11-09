import argon2 from 'argon2';
import { prisma } from '@wsaas/database';
import { NotFoundError, ValidationError, ConflictError } from '@wsaas/utils';
import { generateToken, hashToken } from '@wsaas/crypto';
import { createLogger } from '@wsaas/logger';
import { sendEmail } from '../../services/email.service';
import { getConfig } from '@wsaas/config';
import type { InviteMemberDto, UpdateMemberRoleDto, AcceptInviteDto } from './team.schema';

const logger = createLogger({ name: 'api:team' });

const MEMBER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  role: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

const INVITE_EXPIRY_DAYS = 7;

// ─── Members ────────────────────────────────────────────────────────────────

export async function listMembers(tenantId: string) {
  return prisma.user.findMany({
    where: { tenantId, deletedAt: null },
    select: MEMBER_SELECT,
    orderBy: { createdAt: 'asc' },
  });
}

export async function updateMemberRole(
  tenantId: string,
  memberId: string,
  requestingUserId: string,
  dto: UpdateMemberRoleDto,
) {
  const member = await prisma.user.findUnique({ where: { id: memberId } });
  if (!member || member.tenantId !== tenantId || member.deletedAt) {
    throw new NotFoundError('Team member', memberId);
  }

  if (member.role === 'OWNER' && dto.role !== 'OWNER' && memberId === requestingUserId) {
    const ownerCount = await prisma.user.count({ where: { tenantId, role: 'OWNER', deletedAt: null } });
    if (ownerCount <= 1) {
      throw new ValidationError('Cannot change role: at least one owner is required');
    }
  }

  const updated = await prisma.user.update({
    where: { id: memberId },
    data: { role: dto.role },
    select: MEMBER_SELECT,
  });

  logger.info({ tenantId, memberId, role: dto.role }, 'Team member role updated');
  return updated;
}

export async function removeMember(tenantId: string, memberId: string, requestingUserId: string) {
  const member = await prisma.user.findUnique({ where: { id: memberId } });
  if (!member || member.tenantId !== tenantId || member.deletedAt) {
    throw new NotFoundError('Team member', memberId);
  }

  if (memberId === requestingUserId) {
    throw new ValidationError('You cannot remove yourself from the team');
  }

  if (member.role === 'OWNER') {
    const ownerCount = await prisma.user.count({ where: { tenantId, role: 'OWNER', deletedAt: null } });
    if (ownerCount <= 1) {
      throw new ValidationError('Cannot remove the last owner of the team');
    }
  }

  await prisma.user.update({ where: { id: memberId }, data: { deletedAt: new Date() } });
  logger.info({ tenantId, memberId }, 'Team member removed');
}

// ─── Invites ────────────────────────────────────────────────────────────────

export async function listInvites(tenantId: string) {
  return prisma.teamInvite.findMany({
    where: { tenantId, acceptedAt: null, expiresAt: { gt: new Date() } },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      createdAt: true,
      invitedBy: { select: { firstName: true, lastName: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createInvite(tenantId: string, invitedById: string, dto: InviteMemberDto) {
  const existingUser = await prisma.user.findFirst({ where: { tenantId, email: dto.email, deletedAt: null } });
  if (existingUser) {
    throw new ConflictError('This person is already a member of your team');
  }

  const existingInvite = await prisma.teamInvite.findFirst({
    where: { tenantId, email: dto.email, acceptedAt: null, expiresAt: { gt: new Date() } },
  });
  if (existingInvite) {
    throw new ConflictError('An invite has already been sent to this email');
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, include: { plan: true } });
  const memberCount = await prisma.user.count({ where: { tenantId, deletedAt: null } });
  if (tenant?.plan && memberCount >= tenant.plan.maxTeamMembers) {
    throw new ValidationError('Team member limit reached for your plan');
  }

  const rawToken = generateToken(32);
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const invite = await prisma.teamInvite.create({
    data: { tenantId, invitedById, email: dto.email, role: dto.role, tokenHash, expiresAt },
  });

  const config = getConfig();
  const inviteUrl = `${config.APP_URL}/invite?token=${rawToken}`;
  await sendEmail({
    to: dto.email,
    subject: `You've been invited to join ${tenant?.name ?? 'a team'} on ${config.APP_NAME}`,
    html: `<p>You've been invited to join <strong>${tenant?.name ?? 'a team'}</strong> as ${dto.role.toLowerCase()}.</p><p><a href="${inviteUrl}">Accept invite</a></p><p>This link expires in ${INVITE_EXPIRY_DAYS} days.</p>`,
  });

  logger.info({ tenantId, email: dto.email, role: dto.role }, 'Team invite created');

  return { id: invite.id, email: invite.email, role: invite.role, expiresAt: invite.expiresAt };
}

export async function cancelInvite(tenantId: string, inviteId: string) {
  const invite = await prisma.teamInvite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.tenantId !== tenantId) {
    throw new NotFoundError('Invite', inviteId);
  }
  await prisma.teamInvite.delete({ where: { id: inviteId } });
  logger.info({ tenantId, inviteId }, 'Team invite cancelled');
}

export async function acceptInvite(dto: AcceptInviteDto) {
  const tokenHash = hashToken(dto.token);
  const invite = await prisma.teamInvite.findUnique({ where: { tokenHash } });

  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    throw new ValidationError('This invite link is invalid or has expired');
  }

  const existingUser = await prisma.user.findUnique({ where: { email: invite.email } });
  if (existingUser) {
    throw new ConflictError('An account with this email already exists. Please log in instead.');
  }

  const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        tenantId: invite.tenantId,
        email: invite.email,
        passwordHash,
        role: invite.role,
        firstName: dto.firstName,
        lastName: dto.lastName,
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
      select: MEMBER_SELECT,
    });
    await tx.teamInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
    return created;
  });

  logger.info({ tenantId: invite.tenantId, userId: user.id }, 'Team invite accepted');
  return user;
}
