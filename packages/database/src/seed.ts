import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // ─── Plans ───────────────────────────────────────────────────────────────────

  const trialPlan = await prisma.plan.upsert({
    where: { name: 'trial' },
    update: {},
    create: {
      name: 'trial',
      displayName: 'Free Trial',
      description: 'Try the platform free for 7 days',
      priceMonthlyUsdCents: 0,
      priceYearlyUsdCents: 0,
      maxInstances: 1,
      maxMessagesPerMonth: 100,
      maxApiCallsPerMinute: 10,
      messageRetentionDays: 1,
      maxTeamMembers: 1,
      storageGb: 0.1,
      isActive: true,
      isPublic: false, // Not shown on pricing page
      sortOrder: 0,
      features: {
        bulkMessaging: false,
        groups: false,
        buttons: false,
        lists: false,
        media: 'none',
        webhookRetries: 3,
        priorityWebhooks: false,
        dedicatedWorker: false,
        ipWhitelist: false,
        sla: false,
        customWebhookRetryPolicy: false,
      },
    },
  });

  const starterPlan = await prisma.plan.upsert({
    where: { name: 'starter' },
    update: {},
    create: {
      name: 'starter',
      displayName: 'Starter',
      description: 'Perfect for individuals and small projects',
      priceMonthlyUsdCents: 2900,   // $29/month
      priceYearlyUsdCents: 29000,   // $290/year (2 months free)
      stripePriceIdMonthly: process.env['STRIPE_PRICE_STARTER_MONTHLY'] ?? '',
      stripePriceIdYearly: process.env['STRIPE_PRICE_STARTER_YEARLY'] ?? '',
      maxInstances: 1,
      maxMessagesPerMonth: 5000,
      maxApiCallsPerMinute: 60,
      messageRetentionDays: 7,
      maxTeamMembers: 1,
      storageGb: 1,
      isActive: true,
      isPublic: true,
      sortOrder: 1,
      features: {
        bulkMessaging: false,
        groups: false,
        buttons: false,
        lists: false,
        media: 'images_only',
        webhookRetries: 5,
        priorityWebhooks: false,
        dedicatedWorker: false,
        ipWhitelist: false,
        sla: false,
        customWebhookRetryPolicy: false,
      },
    },
  });

  const businessPlan = await prisma.plan.upsert({
    where: { name: 'business' },
    update: {},
    create: {
      name: 'business',
      displayName: 'Business',
      description: 'For growing businesses and teams',
      priceMonthlyUsdCents: 7900,   // $79/month
      priceYearlyUsdCents: 79000,   // $790/year (2 months free)
      stripePriceIdMonthly: process.env['STRIPE_PRICE_BUSINESS_MONTHLY'] ?? '',
      stripePriceIdYearly: process.env['STRIPE_PRICE_BUSINESS_YEARLY'] ?? '',
      maxInstances: 5,
      maxMessagesPerMonth: 25000,
      maxApiCallsPerMinute: 300,
      messageRetentionDays: 30,
      maxTeamMembers: 5,
      storageGb: 10,
      isActive: true,
      isPublic: true,
      sortOrder: 2,
      features: {
        bulkMessaging: true,
        groups: true,
        buttons: true,
        lists: true,
        media: 'all',
        webhookRetries: 7,
        priorityWebhooks: false,
        dedicatedWorker: false,
        ipWhitelist: false,
        sla: false,
        customWebhookRetryPolicy: false,
      },
    },
  });

  const enterprisePlan = await prisma.plan.upsert({
    where: { name: 'enterprise' },
    update: {},
    create: {
      name: 'enterprise',
      displayName: 'Enterprise',
      description: 'For large teams with advanced needs',
      priceMonthlyUsdCents: 24900,  // $249/month
      priceYearlyUsdCents: 249000,  // $2490/year (2 months free)
      stripePriceIdMonthly: process.env['STRIPE_PRICE_ENTERPRISE_MONTHLY'] ?? '',
      stripePriceIdYearly: process.env['STRIPE_PRICE_ENTERPRISE_YEARLY'] ?? '',
      maxInstances: 25,
      maxMessagesPerMonth: null,    // Unlimited
      maxApiCallsPerMinute: 1000,
      messageRetentionDays: 90,
      maxTeamMembers: 25,
      storageGb: 100,
      isActive: true,
      isPublic: true,
      sortOrder: 3,
      features: {
        bulkMessaging: true,
        groups: true,
        buttons: true,
        lists: true,
        media: 'all',
        webhookRetries: 10,
        priorityWebhooks: true,
        dedicatedWorker: true,
        ipWhitelist: true,
        sla: true,
        customWebhookRetryPolicy: true,
      },
    },
  });

  console.log('✅ Plans created:', {
    trial: trialPlan.id,
    starter: starterPlan.id,
    business: businessPlan.id,
    enterprise: enterprisePlan.id,
  });

  // ─── Admin User ───────────────────────────────────────────────────────────────
  // Only create in development
  if (process.env['NODE_ENV'] === 'development') {
    // Import argon2 only for seeding — it's available in the API app
    // For seed purposes we use a pre-computed hash of 'admin123'
    // In production, create admin users through a secure CLI command
    const adminUser = await prisma.adminUser.upsert({
      where: { email: 'admin@localhost.dev' },
      update: {},
      create: {
        email: 'admin@localhost.dev',
        // This is the hash for 'admin123' — CHANGE IN PRODUCTION
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$placeholder_hash_change_in_production',
        name: 'Dev Admin',
        role: 'SUPER_ADMIN',
        twoFactorEnabled: false, // Disabled for local dev only
        isActive: true,
      },
    });
    console.log('✅ Admin user created:', adminUser.email);
    console.log('⚠️  Default password is admin123 — CHANGE IN PRODUCTION');
  }

  // ─── System Config ────────────────────────────────────────────────────────────
  const configs = [
    {
      key: 'maintenance_mode',
      value: false,
      description: 'When true, API returns 503 to all non-admin requests',
    },
    {
      key: 'maintenance_message',
      value: 'We are performing scheduled maintenance. We will be back shortly.',
      description: 'Message shown during maintenance mode',
    },
    {
      key: 'registration_enabled',
      value: true,
      description: 'When false, new registrations are blocked',
    },
    {
      key: 'trial_enabled',
      value: true,
      description: 'When false, new users must subscribe immediately',
    },
  ];

  for (const config of configs) {
    await prisma.systemConfig.upsert({
      where: { key: config.key },
      update: {},
      create: config,
    });
  }

  console.log('✅ System config seeded');
  console.log('🎉 Database seed complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
