// ─── Billing & Plan Types ─────────────────────────────────────────────────────

export type BillingCycle = 'MONTHLY' | 'YEARLY';

export type SubscriptionStatus =
  | 'TRIALING'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'CANCELLED'
  | 'UNPAID'
  | 'INCOMPLETE';

export interface PlanFeatures {
  bulkMessaging: boolean;
  groups: boolean;
  buttons: boolean;
  lists: boolean;
  media: 'none' | 'images_only' | 'all';
  webhookRetries: number;
  priorityWebhooks: boolean;
  dedicatedWorker: boolean;
  ipWhitelist: boolean;
  sla: boolean;
  customWebhookRetryPolicy: boolean;
}

export interface Plan {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  priceMonthlyUsdCents: number;
  priceYearlyUsdCents: number;
  stripePriceIdMonthly: string | null;
  stripePriceIdYearly: string | null;
  maxInstances: number;
  maxMessagesPerMonth: number | null; // null = unlimited
  maxApiCallsPerMinute: number;
  messageRetentionDays: number;
  maxTeamMembers: number;
  storageGb: number;
  features: PlanFeatures;
  isActive: boolean;
  isPublic: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Subscription {
  id: string;
  tenantId: string;
  planId: string;
  stripeSubscriptionId: string;
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  cancelledAt: Date | null;
  trialStart: Date | null;
  trialEnd: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Invoice {
  id: string;
  tenantId: string;
  stripeInvoiceId: string;
  amountCents: number;
  currency: string;
  status: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  paidAt: Date | null;
  invoicePdfUrl: string | null;
  hostedInvoiceUrl: string | null;
  createdAt: Date;
}

export interface PaymentMethod {
  id: string;
  tenantId: string;
  stripePaymentMethodId: string;
  type: string;
  lastFour: string | null;
  brand: string | null;
  expMonth: number | null;
  expYear: number | null;
  isDefault: boolean;
  createdAt: Date;
}

// ─── Usage & Quota ────────────────────────────────────────────────────────

export interface UsageRecord {
  id: string;
  tenantId: string;
  instanceId: string | null;
  date: Date;
  messagesSent: number;
  messagesReceived: number;
  mediaSentBytes: bigint;
  mediaReceivedBytes: bigint;
  apiCalls: number;
  webhookDeliveries: number;
  webhookFailures: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantQuota {
  planId: string;
  planName: string;
  // Messages
  messagesUsed: number;
  messagesLimit: number | null;
  messagesPercent: number;
  // Instances
  instancesUsed: number;
  instancesLimit: number;
  // API calls
  apiCallsPerMinute: number;
  apiCallsLimit: number;
  // Storage
  storageUsedBytes: number;
  storageLimit: number;
  // Period
  periodStart: Date;
  periodEnd: Date;
}

// ─── Stripe webhook event types ───────────────────────────────────────────

export type StripeWebhookEventType =
  | 'checkout.session.completed'
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'
  | 'customer.subscription.trial_will_end'
  | 'invoice.payment_succeeded'
  | 'invoice.payment_failed'
  | 'invoice.upcoming'
  | 'invoice.finalized'
  | 'payment_method.attached'
  | 'payment_method.detached'
  | 'charge.dispute.created'
  | 'charge.dispute.closed';

// ─── Wallet (pay-as-you-go, Razorpay top-ups, per-message Meta cost deduction) ───

export type WalletTransactionType = 'TOPUP' | 'MESSAGE_CHARGE' | 'REFUND' | 'ADJUSTMENT';
export type WalletTransactionStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

export interface Wallet {
  id: string;
  tenantId: string;
  balancePaise: string; // serialized BigInt (paise; 100 paise = ₹1)
  currency: string;
  lowBalanceThresholdPaise: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WalletTransaction {
  id: string;
  walletId: string;
  tenantId: string;
  type: WalletTransactionType;
  status: WalletTransactionStatus;
  amountPaise: string;
  balanceAfterPaise: string | null;
  description: string | null;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  messageId: string | null;
  createdAt: Date;
}

export interface WalletSummary {
  balancePaise: string;
  balanceRupees: number;
  currency: string;
  lowBalanceThresholdPaise: string;
  isLowBalance: boolean;
}

export interface CreateTopupOrderResult {
  orderId: string;
  amountPaise: number;
  currency: string;
  razorpayKeyId: string;
}
