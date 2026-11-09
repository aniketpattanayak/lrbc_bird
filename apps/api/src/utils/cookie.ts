import type { FastifyReply } from 'fastify';

export function setRefreshTokenCookie(reply: FastifyReply, token: string, expiresAt: Date) {
  void reply.setCookie('refreshToken', token, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export function clearRefreshTokenCookie(reply: FastifyReply) {
  void reply.clearCookie('refreshToken', { path: '/' });
}
