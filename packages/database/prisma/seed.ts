import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  console.log('Seeding plans...');
  const plans = [
    { name: 'trial', displayName: 'Trial', description: 'Try free for 7 days', priceMonthlyUsdCents: 0, priceYearlyUsdCents: 0, maxInstances: 1, maxMessagesPerMonth: 1000, maxApiCallsPerMinute: 30, messageRetentionDays: 7, maxTeamMembers: 1, maxWebhookPerInstance: 1, storageGb: 0.5, isActive: true, isPublic: false, sortOrder: 0, features: { bulkMessaging: false, groups: false, buttons: false, lists: false, media: 'images_only', webhookRetries: 3, priorityWebhooks: false, dedicatedWorker: false, ipWhitelist: false, sla: false, customWebhookRetryPolicy: false, apiAccess: false, advancedAnalytics: false } },
    { name: 'starter', displayName: 'Starter', description: 'Perfect for small businesses', priceMonthlyUsdCents: 2900, priceYearlyUsdCents: 29000, maxInstances: 3, maxMessagesPerMonth: 10000, maxApiCallsPerMinute: 60, messageRetentionDays: 30, maxTeamMembers: 3, maxWebhookPerInstance: 3, storageGb: 5, isActive: true, isPublic: true, sortOrder: 1, features: { bulkMessaging: true, groups: true, buttons: true, lists: true, media: 'all', webhookRetries: 5, priorityWebhooks: false, dedicatedWorker: false, ipWhitelist: false, sla: false, customWebhookRetryPolicy: false, apiAccess: true, advancedAnalytics: false } },
    { name: 'business', displayName: 'Business', description: 'For growing businesses', priceMonthlyUsdCents: 9900, priceYearlyUsdCents: 99000, maxInstances: 10, maxMessagesPerMonth: 100000, maxApiCallsPerMinute: 300, messageRetentionDays: 90, maxTeamMembers: 10, maxWebhookPerInstance: 10, storageGb: 25, isActive: true, isPublic: true, sortOrder: 2, features: { bulkMessaging: true, groups: true, buttons: true, lists: true, media: 'all', webhookRetries: 7, priorityWebhooks: true, dedicatedWorker: false, ipWhitelist: true, sla: false, customWebhookRetryPolicy: false, apiAccess: true, advancedAnalytics: true } },
    { name: 'enterprise', displayName: 'Enterprise', description: 'Custom scale and SLAs', priceMonthlyUsdCents: 49900, priceYearlyUsdCents: 499000, maxInstances: 100, maxMessagesPerMonth: null, maxApiCallsPerMinute: 1000, messageRetentionDays: 365, maxTeamMembers: 100, maxWebhookPerInstance: 50, storageGb: 100, isActive: true, isPublic: true, sortOrder: 3, features: { bulkMessaging: true, groups: true, buttons: true, lists: true, media: 'all', webhookRetries: 10, priorityWebhooks: true, dedicatedWorker: true, ipWhitelist: true, sla: true, customWebhookRetryPolicy: true, apiAccess: true, advancedAnalytics: true } },
  ];
  for (const plan of plans) {
    const p = await prisma.plan.upsert({ where: { name: plan.name }, create: plan, update: plan });
    console.log(`  ✓ ${p.displayName}`);
  }
  console.log('\nSeeding system tenant + super admin...');
  await prisma.tenant.upsert({ where: { id: 'system-tenant-001' }, create: { id: 'system-tenant-001', name: 'System', email: 'system@whatsapp-saas.local', status: 'ACTIVE' }, update: {} });
  // Hashed with argon2id (not bcrypt) to match apps/api/src/modules/auth/auth.service.ts's
  // verification (argon2.verify) — a bcrypt hash here would never match at login.
  const argon2 = await import('argon2');
  const hash = await argon2.default.hash('ChangeMe123!', { type: argon2.default.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 });
  const u = await prisma.user.upsert({ where: { email: 'admin@whatsapp-saas.local' }, create: { tenantId: 'system-tenant-001', email: 'admin@whatsapp-saas.local', passwordHash: hash, role: 'OWNER', isSuperAdmin: true, firstName: 'Super', lastName: 'Admin', emailVerified: true, emailVerifiedAt: new Date() }, update: { isSuperAdmin: true, passwordHash: hash } });
  console.log(`  ✓ Super-admin: ${u.email}`);
  console.log('\n✅ Seed complete!');
  console.log('   Login: admin@whatsapp-saas.local / ChangeMe123!');
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
