FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache dumb-init
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

FROM base AS deps
COPY package.json package-lock.json turbo.json ./
COPY apps/landing/package.json ./apps/landing/
RUN npm ci

FROM deps AS builder
COPY apps/landing ./apps/landing
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w apps/landing

FROM base AS production
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder --chown=nodejs:nodejs /app/apps/landing/.next/standalone ./
COPY --from=builder --chown=nodejs:nodejs /app/apps/landing/.next/static ./apps/landing/.next/static
COPY --from=builder --chown=nodejs:nodejs /app/apps/landing/public ./apps/landing/public
USER nodejs
EXPOSE 3002
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/landing/server.js"]

FROM deps AS development
ENV NODE_ENV=development
COPY apps/landing ./apps/landing
WORKDIR /app
CMD ["npm", "run", "dev", "-w", "apps/landing"]
