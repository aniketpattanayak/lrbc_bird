FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache dumb-init
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

FROM base AS deps
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY apps/dispatcher/package.json ./apps/dispatcher/
COPY packages/config/package.json ./packages/config/
COPY packages/database/package.json ./packages/database/
COPY packages/logger/package.json ./packages/logger/
COPY packages/queue/package.json ./packages/queue/
COPY packages/redis/package.json ./packages/redis/
COPY packages/types/package.json ./packages/types/
COPY packages/utils/package.json ./packages/utils/
RUN npm ci

FROM deps AS builder
COPY apps/dispatcher ./apps/dispatcher
COPY packages ./packages
RUN npx prisma generate --schema=packages/database/prisma/schema.prisma
RUN npm run build -w packages/types \
    && npm run build -w packages/config \
    && npm run build -w packages/logger \
    && npm run build -w packages/redis \
    && npm run build -w packages/queue \
    && npm run build -w packages/utils \
    && npm run build -w apps/dispatcher

FROM base AS production
ENV NODE_ENV=production
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/apps/dispatcher/dist ./apps/dispatcher/dist
COPY --from=builder --chown=nodejs:nodejs /app/packages ./packages
COPY --from=builder --chown=nodejs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
USER nodejs
WORKDIR /app/apps/dispatcher
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/dispatcher.js"]
