# syntax = docker/dockerfile:1

# ---------------------------------------------------------------
# Production Dockerfile for LifeTime backend
# ---------------------------------------------------------------
# This is optimized for Fly.io but works on any Docker platform.
# Uses Alpine Linux for a small image size.
# ---------------------------------------------------------------

FROM node:22-alpine

# Install openssl required by Prisma Client
RUN apk add --no-cache openssl

WORKDIR /app

# Copy dependency manifests first (better Docker layer caching)
COPY package*.json ./

# Install all dependencies (including devDeps needed for tsc build)
RUN npm ci

# Copy prisma schema and source code
COPY prisma ./prisma
COPY src ./src
COPY public ./public
COPY tsconfig.json ./

# Generate Prisma client FIRST so tsc can type-check with full types
RUN npx prisma generate

# Build TypeScript AFTER Prisma types are available
RUN npm run build

# Remove dev dependencies to reduce final image size
RUN npm prune --production

# Ensure upload directories exist (ephemeral on Fly.io unless you add a volume)
RUN mkdir -p uploads

# Expose the port Fly.io (and local) expects
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Health check used by Fly.io to ensure the machine is ready
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["node", "dist/index.js"]
