FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache dumb-init vips-dev python3 make g++
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

FROM base AS deps
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY apps/dispatcher/package.json ./apps/dispatcher/
COPY apps/worker/package.json ./apps/worker/
COPY packages/config/package.json ./packages/config/
COPY packages/crypto/package.json ./packages/crypto/
COPY packages/database/package.json ./packages/database/
COPY packages/logger/package.json ./packages/logger/
COPY packages/meta-cloud-api/package.json ./packages/meta-cloud-api/
COPY packages/queue/package.json ./packages/queue/
COPY packages/redis/package.json ./packages/redis/
COPY packages/types/package.json ./packages/types/
COPY packages/utils/package.json ./packages/utils/
RUN npm ci

FROM deps AS builder
COPY apps/dispatcher ./apps/dispatcher
COPY apps/worker ./apps/worker
COPY packages ./packages
RUN npx prisma generate --schema=packages/database/prisma/schema.prisma
RUN npm run build -w packages/types \
    && npm run build -w packages/config \
    && npm run build -w packages/crypto \
    && npm run build -w packages/logger \
    && npm run build -w packages/redis \
    && npm run build -w packages/queue \
    && npm run build -w packages/meta-cloud-api \
    && npm run build -w packages/utils \
    && npm run build -w apps/dispatcher \
    && npm run build -w apps/worker

FROM base AS production-dispatcher
ENV NODE_ENV=production
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/apps/dispatcher/dist ./apps/dispatcher/dist
COPY --from=builder --chown=nodejs:nodejs /app/packages ./packages
COPY --from=builder --chown=nodejs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
USER nodejs
WORKDIR /app/apps/dispatcher
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/dispatcher.js"]

FROM base AS production-worker
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=2048"
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder --chown=nodejs:nodejs /app/packages ./packages
COPY --from=builder --chown=nodejs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
USER nodejs
WORKDIR /app/apps/worker
EXPOSE 3002
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/worker.js"]
