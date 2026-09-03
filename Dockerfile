# ============================================
# Stage 1: Build
# ============================================
FROM node:24-alpine AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Install corepack and enable it
RUN npm install -g corepack@latest && corepack enable

WORKDIR /app

# Copy package files first (better layer caching)
COPY package.json pnpm-lock.yaml ./

# Install the exact pnpm version specified in package.json
RUN corepack install

# Install ALL dependencies (need devDeps for TypeScript)
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Copy source and build
COPY tsconfig.json ./
COPY src ./src

RUN pnpm build

# Install production deps in separate directory for clean copy
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

# ============================================
# Stage 2: Production (minimal alpine)
# ============================================
FROM node:24-alpine

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
