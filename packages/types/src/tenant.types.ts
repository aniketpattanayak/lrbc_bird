// ─── Tenant & User Types ──────────────────────────────────────────────────────

export type TenantStatus =
  | 'UNVERIFIED'
  | 'TRIAL'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'SUSPENDED'
  | 'CANCELLED'
  | 'DELETED';

export type UserRole = 'OWNER' | 'ADMIN' | 'DEVELOPER' | 'VIEWER';

export interface Tenant {
  id: string;
  name: string;
  email: string;
  companyName: string | null;
  timezone: string;
  countryCode: string | null;
  status: TenantStatus;
  trialEndsAt: Date | null;
  stripeCustomerId: string | null;
  currentPlanId: string | null;
  metadata: Record<string, unknown> | null;
  whatsappMode: 'UNOFFICIAL' | 'OFFICIAL' | null;
  modeLockedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface User {
  id: string;
  tenantId: string;
  email: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  emailVerifiedAt: Date | null;
  twoFactorEnabled: boolean;
  lastLoginAt: Date | null;
  lastLoginIp: string | null;
  isSuperAdmin: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface UserSession {
  id: string;
  userId: string;
  deviceInfo: DeviceInfo;
  ipAddress: string;
  userAgent: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface DeviceInfo {
  browser?: string;
  os?: string;
  device?: string;
}

export interface TeamInvite {
  id: string;
  tenantId: string;
  invitedById: string;
  email: string;
  role: UserRole;
  acceptedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
}

// ─── Safe public versions (no sensitive fields) ────────────────────────────

export type PublicUser = Pick<
  User,
  | 'id'
  | 'tenantId'
  | 'email'
  | 'role'
  | 'firstName'
  | 'lastName'
  | 'avatarUrl'
  | 'emailVerified'
  | 'twoFactorEnabled'
  | 'lastLoginAt'
  | 'isSuperAdmin'
  | 'createdAt'
>;

export type PublicTenant = Pick<
  Tenant,
  | 'id'
  | 'name'
  | 'email'
  | 'companyName'
  | 'timezone'
  | 'status'
  | 'trialEndsAt'
  | 'currentPlanId'
  | 'createdAt'
  | 'whatsappMode'
  | 'modeLockedAt'
>;

// ─── Auth context attached to every request ────────────────────────────────

export interface AuthContext {
  tenant: PublicTenant;
  user: PublicUser;
  apiKeyId?: string; // Set when request uses API key instead of JWT
}
