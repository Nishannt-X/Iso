# Multi-stage Dockerfile for Company A Kochi Tour Operator
# Runtime requires Node >= 22.13 (for node:sqlite built-in support)

FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Copy dependency manifests and install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code and build
COPY tsconfig.json tsconfig.build.json ./
COPY src/ ./src/
RUN npm run build

# Production image
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data

# Create data directory for SQLite persistence and set permissions
RUN mkdir -p /app/data && chown -R node:node /app

# Copy built artifacts and dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Persistent volume for SQLite database
VOLUME ["/app/data"]

USER node
EXPOSE 3000

CMD ["node", "dist/server.js"]

