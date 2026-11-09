FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache dumb-init
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

FROM base AS deps
COPY package.json package-lock.json turbo.json ./
COPY apps/dashboard/package.json ./apps/dashboard/
COPY packages/types/package.json ./packages/types/
RUN npm ci

FROM deps AS builder
COPY apps/dashboard ./apps/dashboard
COPY packages/types ./packages/types
# Build shared types package first
RUN npm run build -w packages/types
# Build Next.js app
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w apps/dashboard

FROM base AS production
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Next.js standalone output — minimal production image
COPY --from=builder --chown=nodejs:nodejs /app/apps/dashboard/.next/standalone ./
COPY --from=builder --chown=nodejs:nodejs /app/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=builder --chown=nodejs:nodejs /app/apps/dashboard/public ./apps/dashboard/public

USER nodejs

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000', r => process.exit(r.statusCode < 500 ? 0 : 1))"

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/dashboard/server.js"]

FROM deps AS development
ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1
COPY apps/dashboard ./apps/dashboard
COPY packages/types ./packages/types
WORKDIR /app
CMD ["npm", "run", "dev", "-w", "apps/dashboard"]
