#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# WhatsPlatform — Local Development Setup
# Run: bash scripts/setup.sh
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[✓]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error()   { echo -e "${RED}[✗]${NC} $1"; }

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  WhatsPlatform — Development Environment Setup"
echo "═══════════════════════════════════════════════════════"
echo ""

# ── Check prerequisites ────────────────────────────────────────────────────────

log_info "Checking prerequisites..."

check_command() {
  if ! command -v "$1" &> /dev/null; then
    log_error "$1 is required but not installed."
    echo "  Install: $2"
    exit 1
  fi
  log_success "$1 found: $(command -v "$1")"
}

check_command "node" "https://nodejs.org (v20+)"
check_command "npm" "Comes with Node.js"
check_command "docker" "https://docs.docker.com/get-docker/"
check_command "docker" "https://docs.docker.com/compose/install/"

# Check Node version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  log_error "Node.js 20+ required. Current version: $(node --version)"
  echo "  Use nvm: nvm install 20 && nvm use 20"
  exit 1
fi
log_success "Node.js version: $(node --version)"

# ── Environment file ───────────────────────────────────────────────────────────

log_info "Setting up environment file..."

if [ ! -f ".env" ]; then
  cp .env.example .env
  log_success ".env created from .env.example"
  log_warn "⚠️  Review .env and fill in required values before starting!"
  echo ""
  echo "  Required values to fill in:"
  echo "  - JWT_ACCESS_SECRET (run: openssl rand -hex 32)"
  echo "  - JWT_REFRESH_SECRET (run: openssl rand -hex 32)"
  echo "  - ADMIN_JWT_SECRET (run: openssl rand -hex 32)"
  echo "  - ENCRYPTION_MASTER_KEY (run: openssl rand -hex 32)"
  echo "  - INTERNAL_API_SECRET (run: openssl rand -hex 24)"
  echo ""
else
  log_warn ".env already exists — skipping (delete it to regenerate)"
fi

# ── Install dependencies ───────────────────────────────────────────────────────

log_info "Installing npm dependencies..."
npm ci
log_success "Dependencies installed"

# ── Start Docker services ──────────────────────────────────────────────────────

log_info "Starting Docker services (PostgreSQL, Redis, MinIO, Mailhog)..."
docker compose up -d postgres redis mailhog minio

# Wait for PostgreSQL to be ready
log_info "Waiting for PostgreSQL to be ready..."
MAX_TRIES=30
TRIES=0
until docker compose exec postgres pg_isready -U wsaas -d whatsapp_saas &> /dev/null; do
  TRIES=$((TRIES + 1))
  if [ $TRIES -ge $MAX_TRIES ]; then
    log_error "PostgreSQL failed to start after ${MAX_TRIES} seconds"
    exit 1
  fi
  sleep 1
done
log_success "PostgreSQL ready"

# Wait for Redis
log_info "Waiting for Redis to be ready..."
TRIES=0
until docker compose exec redis redis-cli -a localdevpassword ping &> /dev/null; do
  TRIES=$((TRIES + 1))
  if [ $TRIES -ge $MAX_TRIES ]; then
    log_error "Redis failed to start"
    exit 1
  fi
  sleep 1
done
log_success "Redis ready"

# Start remaining services
docker compose up -d

# ── Run database migrations ────────────────────────────────────────────────────

log_info "Running database migrations..."
npm run db:migrate:dev
log_success "Migrations complete"

# ── Generate Prisma client ─────────────────────────────────────────────────────

log_info "Generating Prisma client..."
npm run db:generate
log_success "Prisma client generated"

# ── Seed database ─────────────────────────────────────────────────────────────

log_info "Seeding database with initial data (plans, admin user)..."
npm run db:seed
log_success "Database seeded"

# ── Generate secrets if .env has placeholders ─────────────────────────────────

log_info "Checking for placeholder secrets in .env..."

generate_secret_hint() {
  echo "  Run: openssl rand -hex 32"
  echo "  And paste the result into .env for $1"
}

if grep -q "CHANGE_ME" .env 2>/dev/null; then
  log_warn "⚠️  Your .env still has placeholder values!"
  echo ""
  echo "  Generate secrets with these commands:"
  echo "  JWT_ACCESS_SECRET:    $(openssl rand -hex 32 2>/dev/null || echo 'openssl rand -hex 32')"
  echo "  JWT_REFRESH_SECRET:   $(openssl rand -hex 32 2>/dev/null || echo 'openssl rand -hex 32')"
  echo "  ADMIN_JWT_SECRET:     $(openssl rand -hex 32 2>/dev/null || echo 'openssl rand -hex 32')"
  echo "  ENCRYPTION_MASTER_KEY: $(openssl rand -hex 32 2>/dev/null || echo 'openssl rand -hex 32')"
  echo "  INTERNAL_API_SECRET:  $(openssl rand -hex 24 2>/dev/null || echo 'openssl rand -hex 24')"
  echo ""
fi

# ── Summary ────────────────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════"
echo -e "  ${GREEN}✅ Setup complete!${NC}"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "  Services running:"
echo "  • PostgreSQL:     localhost:5432"
echo "  • PgBouncer:      localhost:6432"
echo "  • Redis:          localhost:6379"
echo "  • MinIO:          http://localhost:9000 (API)"
echo "                    http://localhost:9001 (Console)"
echo "  • Mailhog:        http://localhost:8025 (Email UI)"
echo "  • Bull Board:     http://localhost:3010 (Queue UI)"
echo "  • Redis Cmdr:     http://localhost:8081"
echo ""
echo "  To start development servers:"
echo "  npm run dev"
echo ""
echo "  Services will start at:"
echo "  • API:            http://localhost:3001"
echo "  • Dashboard:      http://localhost:3000"
echo "  • Landing:        http://localhost:3002"
echo "  • Admin:          http://localhost:3003"
echo "  • API Docs:       http://localhost:3001/docs"
echo ""
echo "  Default dev admin: admin@localhost.dev"
echo "  Password: Change immediately — see seed.ts"
echo ""
