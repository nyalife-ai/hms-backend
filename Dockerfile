################################################################################
# Dockerfile
#
# PURPOSE:
# Multi-stage build for a NestJS API.
# Optimized for small image size, security (non-root user, no shell tools),
# fast cached builds, and correct signal handling (dumb-init as PID 1).
#
# USAGE:
#   docker build -t api:latest --target production .
################################################################################

# ============================================================================
# STAGE 1: Dependencies
# Install only production dependencies to cache this layer effectively.
# ============================================================================
FROM node:26-alpine AS deps
WORKDIR /app

RUN corepack enable
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production=true --ignore-scripts

# ============================================================================
# STAGE 2: Builder
# Install all dependencies (including dev) and compile TypeScript.
# ============================================================================
FROM node:26-alpine AS builder
WORKDIR /app

RUN corepack enable
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --ignore-scripts

# nest-cli.json and tsconfig.build.json are required by 'nest build'
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY prisma ./prisma
COPY src ./src

# Generate the ORM client before compiling.
# (Remove this line if the project does not use Prisma.)
RUN yarn prisma generate

RUN yarn build

# ============================================================================
# STAGE 3: Production
# Lean runtime image with compiled output and production dependencies only.
# ============================================================================
FROM node:26-alpine AS production
WORKDIR /app

# OCI image metadata (populated further by docker/metadata-action in CI)
LABEL org.opencontainers.image.title="api" \
      org.opencontainers.image.description="Generic NestJS API service" \
      org.opencontainers.image.licenses="UNLICENSED"

# Security: create a dedicated non-root user and group.
# dumb-init runs as PID 1 to forward signals (SIGTERM) correctly for
# graceful shutdown — critical for zero-downtime deploys and K8s.
RUN addgroup -S api && adduser -S api -G api \
    && apk add --no-cache dumb-init

# Copy compiled output from builder and production deps from deps stage
COPY --from=builder --chown=api:api /app/dist ./dist
COPY --from=deps --chown=api:api /app/node_modules ./node_modules
# Copy the generated ORM client (built with dev deps in the builder stage).
# (Remove these two lines if the project does not use Prisma.)
COPY --from=builder --chown=api:api /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=api:api /app/node_modules/@prisma ./node_modules/@prisma
COPY --chown=api:api package.json ./

# Create and set permissions for the logs directory
RUN mkdir -p /app/logs && chown api:api /app/logs

# Switch to non-root user
USER api

ENV NODE_ENV=production \
    PORT=3000

EXPOSE 3000

# Healthcheck without curl/wget: uses the Node runtime already in the image,
# keeping the attack surface minimal. Path matches the public health endpoint.
# (In Kubernetes, prefer liveness/readiness probes; this serves Docker/Compose.)
HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=30s \
  CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||3000)+'/public/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
