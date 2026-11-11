FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache dumb-init vips-dev python3 make g++
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

FROM base AS deps
COPY package.json package-lock.json turbo.json ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/config/package.json ./packages/config/
COPY packages/crypto/package.json ./packages/crypto/
COPY packages/database/package.json ./packages/database/
COPY packages/logger/package.json ./packages/logger/
COPY packages/queue/package.json ./packages/queue/
COPY packages/redis/package.json ./packages/redis/
COPY packages/types/package.json ./packages/types/
COPY packages/utils/package.json ./packages/utils/
RUN npm ci

FROM deps AS builder
COPY apps/worker ./apps/worker
COPY packages ./packages
COPY packages/database/prisma ./packages/database/prisma
RUN npx prisma generate --schema=packages/database/prisma/schema.prisma
RUN npm run build -w packages/types \
    && npm run build -w packages/config \
    && npm run build -w packages/crypto \
    && npm run build -w packages/logger \
    && npm run build -w packages/database \
    && npm run build -w packages/redis \
    && npm run build -w packages/queue \
    && npm run build -w packages/utils \
    && npm run build -w apps/worker

FROM base AS production
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=2048"

COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder --chown=nodejs:nodejs /app/packages ./packages
COPY --from=builder --chown=nodejs:nodejs /app/node_modules/.prisma ./node_modules/.prisma

USER nodejs
WORKDIR /app/apps/worker

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.WORKER_PORT || 3002) + '/health', r => process.exit(r.statusCode === 200 ? 0 : 1))"

EXPOSE 3002
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/worker.js"]
