-- ═══════════════════════════════════════════════════════════════════════════════
-- PostgreSQL Initialization Script
-- Runs once when container is first created
-- ═══════════════════════════════════════════════════════════════════════════════

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";       -- UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";         -- Cryptographic functions
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements"; -- Query performance tracking

-- Set timezone
ALTER DATABASE whatsapp_saas SET timezone TO 'UTC';

-- ─── Performance Settings ─────────────────────────────────────────────────────
-- These are appropriate for a development setup.
-- Production settings should be tuned based on available RAM.

-- Enable query plan caching
ALTER SYSTEM SET plan_cache_mode = 'auto';

-- Log slow queries (queries taking > 1 second)
ALTER SYSTEM SET log_min_duration_statement = 1000;

-- Connection limits
ALTER SYSTEM SET max_connections = 200;

-- ─── Create application user with limited permissions ─────────────────────────
-- In production, the app user should NOT have superuser privileges
-- This is handled by DATABASE_URL already using the 'wsaas' user
-- Just ensuring the user exists with proper grants
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'wsaas') THEN
    CREATE ROLE wsaas WITH LOGIN PASSWORD 'localdevpassword';
  END IF;
END
$$;

GRANT ALL PRIVILEGES ON DATABASE whatsapp_saas TO wsaas;
GRANT ALL ON SCHEMA public TO wsaas;

-- ─── Create test database ─────────────────────────────────────────────────────
-- Used by integration tests
SELECT 'CREATE DATABASE whatsapp_saas_test'
WHERE NOT EXISTS (
  SELECT FROM pg_database WHERE datname = 'whatsapp_saas_test'
)\gexec

GRANT ALL PRIVILEGES ON DATABASE whatsapp_saas_test TO wsaas;

-- ─── Comments ────────────────────────────────────────────────────────────────
COMMENT ON DATABASE whatsapp_saas IS 'WhatsApp SaaS Platform primary database';
