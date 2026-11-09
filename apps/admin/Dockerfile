FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache dumb-init
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

FROM base AS deps
COPY package.json package-lock.json turbo.json ./
COPY apps/admin/package.json ./apps/admin/
COPY packages/types/package.json ./packages/types/
RUN npm ci

FROM deps AS builder
COPY apps/admin ./apps/admin
COPY packages/types ./packages/types
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w packages/types
RUN npm run build -w apps/admin

FROM base AS production
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder --chown=nodejs:nodejs /app/apps/admin/.next/standalone ./
COPY --from=builder --chown=nodejs:nodejs /app/apps/admin/.next/static ./apps/admin/.next/static

USER nodejs
EXPOSE 3003

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/admin/server.js"]

FROM deps AS development
ENV NODE_ENV=development
COPY apps/admin ./apps/admin
COPY packages/types ./packages/types
WORKDIR /app
CMD ["npm", "run", "dev", "-w", "apps/admin"]
