# =============================================================================
# Stage 1: Install dependencies
# =============================================================================
FROM node:20-alpine AS deps
WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json ./

# Copy workspace package.json files for dependency resolution
COPY apps/api/package.json ./apps/api/
COPY packages/config/package.json ./packages/config/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/psp-adapters/package.json ./packages/psp-adapters/

# Install all workspace dependencies (needed for build)
RUN npm ci

# =============================================================================
# Stage 2: Build
# =============================================================================
FROM node:20-alpine AS builder
WORKDIR /app

# Copy node_modules from deps stage (npm workspaces hoists to root)
COPY --from=deps /app/node_modules ./node_modules

# Copy source files
COPY package.json ./
COPY apps/api/ ./apps/api/
COPY packages/ ./packages/

# Build internal packages first, then the API
RUN npm run build --workspace=@vima/config --if-present && \
    npm run build --workspace=@vima/shared-types --if-present && \
    npm run build --workspace=@vima/psp-adapters --if-present && \
    npm run build --workspace=@vima/api

# =============================================================================
# Stage 3: Production runner
# =============================================================================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install only production dependencies
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/config/package.json ./packages/config/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/psp-adapters/package.json ./packages/psp-adapters/

RUN npm ci --omit=dev

# Copy built API output
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Copy package sources (referenced via "main": "./src/index.ts" in dev)
COPY --from=builder /app/packages/config/src ./packages/config/src
COPY --from=builder /app/packages/shared-types/src ./packages/shared-types/src
COPY --from=builder /app/packages/psp-adapters/src ./packages/psp-adapters/src

# Copy drizzle migrations and config for runtime migration
COPY apps/api/drizzle ./apps/api/drizzle
COPY apps/api/drizzle.config.ts ./apps/api/drizzle.config.ts

# Copy entrypoint script
COPY docker/scripts/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["./entrypoint.sh"]
