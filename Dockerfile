# Build stage
FROM node:22-alpine AS builder

# Install pnpm
# corepack activates the pnpm version pinned in package.json's packageManager
RUN corepack enable

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the application (skip DTS for Docker)
ENV SKIP_DTS=true
RUN pnpm build

# Production stage
FROM node:22-alpine

# Install pnpm
# corepack activates the pnpm version pinned in package.json's packageManager
RUN corepack enable

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built application from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Switch to non-root user
USER nodejs

# Expose port for HTTP server
EXPOSE 3000

# Run the MCP server (defaults to HTTP on port 3000)
CMD ["node", "dist/index.js"]
