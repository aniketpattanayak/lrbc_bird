import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type WASocket,
} from '@whiskeysockets/baileys';
import { prisma } from '@wsaas/database';
import { createLogger } from '@wsaas/logger';
import * as fs from 'fs';
import * as path from 'path';
import { handleConnectionUpdate, handleIncomingMessage, handleMessageUpdates } from '../handlers';
import { releaseSession } from '../registry/sessionRegistry';

const logger = createLogger({ name: 'worker:session' });

const AUTH_DIR = process.env['SESSION_AUTH_DIR'] ?? '/tmp/whatsapp-sessions';
const RECONNECT_DELAY_MS = 5000;

export class Session {
  public socket: WASocket | null = null;
  public status: string = 'INITIALIZING';

  constructor(
    public readonly instanceId: string,
    public readonly tenantId: string,
  ) {}
}

export class SessionManager {
  private sessions = new Map<string, Session>();

  async initialize() {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    // Load instances assigned to this worker from DB
    const instances = await prisma.instance.findMany({
      where: { deletedAt: null, status: { in: ['CONNECTED', 'DISCONNECTED', 'QR_PENDING', 'RECONNECTING'] } },
      select: { id: true, tenantId: true, workerId: true },
    });

    const workerId = process.env['WORKER_ID'] ?? 'worker-1';
    for (const inst of instances) {
      if (!inst.workerId || inst.workerId === workerId) {
        await this.startSession(inst.id, inst.tenantId);
      }
    }
  }

  async startSession(instanceId: string, tenantId: string): Promise<void> {
    if (this.sessions.has(instanceId)) {
      logger.info({ instanceId }, 'Session already running');
      return;
    }

    const session = new Session(instanceId, tenantId);
    this.sessions.set(instanceId, session);

    logger.info({ instanceId }, 'Starting WhatsApp session');
    await this.connect(session);
  }

  async stopSession(instanceId: string): Promise<void> {
    const session = this.sessions.get(instanceId);
    if (!session) return;
    session.socket?.end(undefined);
    this.sessions.delete(instanceId);
    await releaseSession(instanceId);
    await this.updateStatus(instanceId, 'DISCONNECTED');
    logger.info({ instanceId }, 'Session stopped');
  }

  getSession(instanceId: string): Session | undefined {
    return this.sessions.get(instanceId);
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  async drainAll(): Promise<void> {
    for (const [id] of this.sessions) {
      await this.stopSession(id);
    }
  }

  private async connect(session: Session): Promise<void> {
    const { instanceId, tenantId } = session;
    const authDir = path.join(AUTH_DIR, instanceId);
    fs.mkdirSync(authDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger as any),
      },
      printQRInTerminal: false,
      logger: logger as any,
      browser: ['WhatsApp SaaS', 'Chrome', '1.0.0'],
    });

    session.socket = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      void handleConnectionUpdate(sock, instanceId, tenantId, update, {
        scheduleReconnect: () => {
          setTimeout(() => void this.connect(session), RECONNECT_DELAY_MS);
        },
        removeSession: () => {
          this.sessions.delete(instanceId);
        },
      }).catch((err) => logger.error({ err, instanceId }, 'Error handling connection update'));
    });

    sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        void handleIncomingMessage(sock, msg, tenantId, instanceId).catch((err) =>
          logger.error({ err, instanceId }, 'Error handling incoming message'),
        );
      }
    });

    sock.ev.on('messages.update', (updates) => {
      void handleMessageUpdates(updates, tenantId, instanceId).catch((err) =>
        logger.error({ err, instanceId }, 'Error handling message status update'),
      );
    });
  }

  private async updateStatus(instanceId: string, status: string): Promise<void> {
    try {
      await prisma.instance.update({
        where: { id: instanceId },
        data: { status: status as any },
      });
    } catch (err) {
      logger.error({ instanceId, status, err }, 'Failed to update instance status');
    }
  }
}
