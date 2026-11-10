FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache dumb-init
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

FROM base AS deps
# Copy only what's inside apps/dispatcher (this IS the build context)
COPY package.json ./
COPY package-lock.json ./

RUN npm ci --ignore-scripts

FROM deps AS builder
COPY src ./src
COPY tsconfig.json ./
COPY tsconfig.tsbuildinfo* ./
RUN npm run build

FROM base AS production
ENV NODE_ENV=production
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
USER nodejs
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/dispatcher.js"]
