# ============================================
# Stage 1: Build
# ============================================
FROM node:22-alpine AS builder

RUN npm install -g pnpm

WORKDIR /app

# Copy package files first (better layer caching)
COPY package.json pnpm-lock.yaml* ./

# Install ALL dependencies (need devDeps for TypeScript)
RUN pnpm install --frozen-lockfile || pnpm install

# Copy source and build
COPY tsconfig.json ./
COPY src ./src

RUN pnpm build

# Install production deps in separate directory for clean copy
RUN pnpm install --prod --frozen-lockfile || pnpm install --prod

# ============================================
# Stage 2: Production (minimal alpine)
# ============================================
FROM node:22-alpine

# Install curl for healthchecks
RUN apk add --no-cache curl ca-certificates

WORKDIR /app

# Copy production node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy compiled JavaScript
COPY --from=builder /app/dist ./dist

# Copy package.json for module resolution
COPY package.json ./

# Create data directory for test files
RUN mkdir -p ./data

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATA_DIR=/app/data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

ARG BUILD_VERSION=1.0.0
ENV BUILD_VERSION=${BUILD_VERSION}

CMD ["node", "dist/index.js"]
