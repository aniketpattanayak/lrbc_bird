# ═══════════════════════════════════════════════════════════════════════════════
# API Server Dockerfile — Multi-stage build
# ═══════════════════════════════════════════════════════════════════════════════

# ── Stage 1: Base ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
# Install dumb-init for proper signal handling in containers
RUN apk add --no-cache dumb-init
# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# ── Stage 2: Dependencies ─────────────────────────────────────────────────────
FROM base AS deps
# Copy workspace configuration
COPY package.json package-lock.json turbo.json ./
# Copy package manifests only (not source — for better layer caching)
COPY apps/api/package.json ./apps/api/
COPY packages/config/package.json ./packages/config/
COPY packages/crypto/package.json ./packages/crypto/
COPY packages/database/package.json ./packages/database/
COPY packages/logger/package.json ./packages/logger/
COPY packages/queue/package.json ./packages/queue/
COPY packages/redis/package.json ./packages/redis/
COPY packages/types/package.json ./packages/types/
COPY packages/utils/package.json ./packages/utils/
# Install all dependencies
RUN npm ci --ignore-scripts

# ── Stage 3: Build ────────────────────────────────────────────────────────────
FROM deps AS builder
# Copy all source code
COPY apps/api ./apps/api
COPY packages ./packages
# Copy Prisma schema for client generation
COPY packages/database/prisma ./packages/database/prisma
# Generate Prisma client
RUN npx prisma generate --schema=packages/database/prisma/schema.prisma
# Build TypeScript
RUN npm run build -w apps/api
# Build shared packages
RUN npm run build -w packages/types \
    && npm run build -w packages/config \
    && npm run build -w packages/crypto \
    && npm run build -w packages/logger \
    && npm run build -w packages/redis \
    && npm run build -w packages/queue \
    && npm run build -w packages/utils

# ── Stage 4: Production ───────────────────────────────────────────────────────
FROM base AS production
ENV NODE_ENV=production

# Copy only production dependencies
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=deps --chown=nodejs:nodejs /app/apps/api/node_modules ./apps/api/node_modules

# Copy built output
COPY --from=builder --chown=nodejs:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=nodejs:nodejs /app/packages ./packages
# Copy Prisma schema (needed at runtime for migrations check)
COPY --from=builder --chown=nodejs:nodejs /app/packages/database/prisma ./packages/database/prisma
# Copy generated Prisma client
COPY --from=builder --chown=nodejs:nodejs /app/node_modules/.prisma ./node_modules/.prisma

# Switch to non-root user
USER nodejs

WORKDIR /app/apps/api

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', r => process.exit(r.statusCode === 200 ? 0 : 1))"

EXPOSE 3001

# Use dumb-init to handle signals properly (PID 1 issue in Docker)
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]

# ── Stage 5: Development ──────────────────────────────────────────────────────
FROM deps AS development
ENV NODE_ENV=development
COPY apps/api ./apps/api
COPY packages ./packages
# Generate Prisma client
RUN npx prisma generate --schema=packages/database/prisma/schema.prisma
WORKDIR /app
CMD ["npm", "run", "dev", "-w", "apps/api"]
