# WhatsPlatform — WhatsApp API Gateway SaaS

A self-serve SaaS platform that provides an unofficial WhatsApp API gateway.
Customers sign up, pay, connect their WhatsApp numbers, and use the REST API
to send and receive messages from their own applications.

---

## Architecture Overview

```
┌──────────────┐    ┌────────────────┐    ┌──────────────────┐
│  Landing     │    │   Dashboard    │    │   Admin Panel    │
│  (Next.js)   │    │   (Next.js)    │    │   (Next.js)      │
└──────────────┘    └───────┬────────┘    └────────┬─────────┘
                            │                       │
                    ┌───────▼───────────────────────▼─────────┐
                    │          API Gateway (Fastify)           │
                    │  Auth │ Instances │ Messages │ Billing   │
                    └───────┬───────────────────────┬──────────┘
                            │                       │
                    ┌───────▼──────┐    ┌──────────▼──────────┐
                    │ Redis (Queue │    │   PostgreSQL          │
                    │  + State)    │    │   (Primary DB)        │
                    └───────┬──────┘    └───────────────────────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
      ┌───────▼──────┐      │    ┌────────▼────────┐
      │Session Worker│      │    │Webhook Dispatcher│
      │(Baileys x N) │      │    │(HTTP Delivery)   │
      └───────┬──────┘      │    └─────────────────┘
              │             │
              ▼             ▼
        WhatsApp      Tenant Servers
         Servers      (Webhook URLs)
```

## Monorepo Structure

```
whatsapp-saas/
├── apps/
│   ├── api/          Fastify REST API + WebSocket (port 3001)
│   ├── worker/       Baileys WhatsApp session workers (port 3002)
│   ├── dispatcher/   Webhook delivery engine
│   ├── dashboard/    Next.js tenant dashboard (port 3000)
│   ├── admin/        Next.js admin panel (port 3003)
│   └── landing/      Next.js marketing site (port 3002)
│
└── packages/
    ├── types/        Shared TypeScript types
    ├── database/     Prisma schema + client
    ├── redis/        Redis client + helpers
    ├── queue/        BullMQ queue definitions
    ├── crypto/       Encryption + hashing utilities
    ├── logger/       Pino logger factory
    ├── config/       Environment variable validation
    └── utils/        Shared utilities (phone, errors)
```

---

## Quick Start (Local Development)

### Prerequisites

- **Node.js** 20+ — [nodejs.org](https://nodejs.org)
- **Docker** + **Docker Compose** — [docs.docker.com](https://docs.docker.com)
- **Git**

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/whatsapp-saas.git
cd whatsapp-saas
```

### 2. Run the setup script

```bash
bash scripts/setup.sh
```

This will:
- Check prerequisites
- Create `.env` from `.env.example`
- Install npm dependencies
- Start Docker services (PostgreSQL, Redis, MinIO, Mailhog)
- Run database migrations
- Seed initial data (plans, dev admin user)

### 3. Fill in required secrets

Open `.env` and fill in the values marked `CHANGE_ME`:

```bash
# Generate secrets:
openssl rand -hex 32   # For JWT secrets and ENCRYPTION_MASTER_KEY
openssl rand -hex 24   # For INTERNAL_API_SECRET
```

### 4. Start development servers

```bash
npm run dev
```

All apps start in watch mode:

| Service | URL |
|---|---|
| API | http://localhost:3001 |
| API Docs (Swagger) | http://localhost:3001/docs |
| Dashboard | http://localhost:3000 |
| Landing Page | http://localhost:3002 |
| Admin Panel | http://localhost:3003 |
| Mailhog (Email UI) | http://localhost:8025 |
| MinIO Console | http://localhost:9001 |
| Bull Board (Queues) | http://localhost:3010 |
| Redis Commander | http://localhost:8081 |

---

## Development Workflow

### Running individual apps

```bash
npm run dev -w apps/api        # API only
npm run dev -w apps/worker     # Worker only
npm run dev -w apps/dashboard  # Dashboard only
```

### Database operations

```bash
npm run db:migrate:dev          # Create + run new migration
npm run db:studio               # Open Prisma Studio (visual DB editor)
npm run db:seed                 # Re-seed the database
npm run db:reset                # Reset DB and re-seed (destructive)
```

### Type checking

```bash
npm run typecheck               # Check all packages
npm run typecheck -w apps/api   # Check specific app
```

### Testing

```bash
npm run test                    # All tests
npm run test:unit               # Unit tests only
npm run test:integration        # Integration tests (requires DB + Redis)
```

### Linting + Formatting

```bash
npm run lint                    # ESLint all packages
npm run format                  # Prettier format all files
npm run format:check            # Check formatting (CI)
```

---

## Environment Variables

All environment variables are documented in `.env.example`.

Key groups:
- **JWT_*** — Authentication tokens (generate with `openssl rand -hex 32`)
- **ENCRYPTION_MASTER_KEY** — Encrypts WhatsApp credentials at rest (32 bytes/64 hex chars)
- **STRIPE_*** — Payment processing (Phase 2)
- **RESEND_*** — Email delivery
- **R2_*** — Media file storage (Cloudflare R2 or local MinIO)
- **WORKER_*** — Session worker configuration
- **FEATURE_*** — Feature flags for gradual rollout

---

## Phase Build Plan

| Phase | Description | Status |
|---|---|---|
| 0 | Foundation, monorepo, shared packages | ✅ Complete |
| 1 | Authentication (register, login, 2FA, JWT) | 🔄 Next |
| 2 | Plans, billing, Stripe integration | ⏳ Pending |
| 3 | WhatsApp session engine (Baileys) | ⏳ Pending |
| 4 | Messaging API (all message types) | ⏳ Pending |
| 5 | Webhook dispatch engine | ⏳ Pending |
| 6 | API keys + team management | ⏳ Pending |
| 7 | Usage analytics + notifications | ⏳ Pending |
| 8 | Admin panel | ⏳ Pending |
| 9 | Security hardening + monitoring | ⏳ Pending |
| 10 | Landing page + docs + launch prep | ⏳ Pending |

---

## Tech Stack

| Layer | Technology |
|---|---|
| API | Fastify 4 + TypeScript |
| WhatsApp Engine | Baileys (multi-device protocol) |
| Dashboard | Next.js 14 + Tailwind CSS + shadcn/ui |
| Database | PostgreSQL 16 + Prisma ORM |
| Cache + Queues | Redis 7 + BullMQ |
| Media Storage | Cloudflare R2 (S3-compatible) |
| Payments | Stripe (Phase 2) |
| Email | Resend + React Email |
| Monitoring | Prometheus + Grafana + Sentry |
| Deployment | Docker + Hetzner VPS |

---

## Security Notes

- **Never commit `.env`** — it contains real secrets
- **Never log API keys** — the logger has automatic redaction
- **Encryption key backup** — `ENCRYPTION_MASTER_KEY` loss = unrecoverable session data
- **API keys** are hashed with SHA-256 before storage — shown only once at creation
- **Passwords** use Argon2id — never stored in plaintext
- **WhatsApp credentials** — encrypted with AES-256-GCM at rest

---

## Contributing

1. Create a feature branch from `develop`
2. Make your changes
3. Ensure `npm run typecheck && npm run lint && npm run test` all pass
4. Submit a PR to `develop`

All PRs require CI to pass before merge.

---

## Support

- Documentation: http://localhost:3001/docs (development)
- Issues: GitHub Issues
- Security: security@yourdomain.com
# lrbc_bird
