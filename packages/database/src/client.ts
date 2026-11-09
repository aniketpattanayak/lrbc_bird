import { PrismaClient } from '@prisma/client';

// ─── Singleton pattern for Prisma Client ──────────────────────────────────────
// In development, Next.js hot-reloading creates new module instances on each
// change. Without this pattern, you'd exhaust the database connection pool.
// In production there's only one instance so the global isn't needed,
// but it doesn't hurt to have it.

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env['NODE_ENV'] === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
    errorFormat: 'pretty',
  });

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────
// Register once per process to avoid multiple registrations
if (typeof process !== 'undefined') {
  process.on('beforeExit', async () => {
    await prisma.$disconnect();
  });
}

export { PrismaClient };
export * from '@prisma/client';
