// ─── WhatsApp Instance Types ──────────────────────────────────────────────────

export type InstanceStatus =
  | 'INITIALIZING'
  | 'QR_PENDING'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'RECONNECTING'
  | 'BANNED'
  | 'LOGGED_OUT'
  | 'DELETED';

export interface Instance {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  phoneNumber: string | null;
  countryCode: string | null;
  displayName: string | null;
  profilePicUrl: string | null;
  status: InstanceStatus;
  workerId: string | null;
  proxyUrl: string | null;
  proxyType: string | null;
  autoReconnect: boolean;
  maxReconnectAttempts: number;
  reconnectCount: number;
  messageDelayMs: number;
  messageDelayJitter: number;
  connectedAt: Date | null;
  lastSeenAt: Date | null;
  disconnectedAt: Date | null;
  banDetectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface InstanceConnectionEvent {
  id: string;
  instanceId: string;
  event: ConnectionEventType;
  reason: string | null;
  errorCode: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export type ConnectionEventType =
  | 'connected'
  | 'disconnected'
  | 'banned'
  | 'qr_generated'
  | 'qr_scanned'
  | 'reconnect_attempt'
  | 'reconnect_failed'
  | 'logout';

export interface InstanceQrEvent {
  id: string;
  instanceId: string;
  qrData: string;
  generatedAt: Date;
  scannedAt: Date | null;
  expiredAt: Date;
}

// ─── Live status from Redis (faster than DB) ──────────────────────────────

export interface InstanceLiveStatus {
  instanceId: string;
  status: InstanceStatus;
  phoneNumber: string | null;
  displayName: string | null;
  workerId: string | null;
  connectedAt: string | null; // ISO string
  lastSeenAt: string | null;
  reconnectCount: number;
  lastHeartbeat: string | null;
}

// ─── Worker types ─────────────────────────────────────────────────────────

export type WorkerStatus = 'starting' | 'active' | 'draining' | 'stopped';

export interface Worker {
  id: string;
  hostname: string;
  ipAddress: string;
  port: number;
  status: WorkerStatus;
  sessionCount: number;
  maxSessions: number;
  memoryUsedMb: number;
  memoryLimitMb: number;
  cpuPercent: number;
  version: string;
  lastHeartbeatAt: Date;
  startedAt: Date;
}

// ─── Commands sent from API to Worker via Redis pub/sub ────────────────────

export type WorkerCommandType =
  | 'START_SESSION'
  | 'STOP_SESSION'
  | 'RESTART_SESSION'
  | 'LOGOUT_SESSION'
  | 'GET_QR';

export interface WorkerCommand {
  type: WorkerCommandType;
  instanceId: string;
  tenantId: string;
  payload?: Record<string, unknown>;
  requestId: string; // For correlation
}

// ─── Create/Update DTOs ───────────────────────────────────────────────────

export interface CreateInstanceDto {
  name: string;
  description?: string;
  proxyUrl?: string;
}

export interface UpdateInstanceDto {
  name?: string;
  description?: string;
  proxyUrl?: string | null;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  messageDelayMs?: number;
}
