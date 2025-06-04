# Multi-stage Docker build for Namada RPC Proxy

# Stage 1: Build dependencies
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Add metadata
LABEL maintainer="Namada RPC Proxy Team"
LABEL description="Multi-chain RPC proxy and load balancer for Namada networks"
LABEL version="1.0.0"

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Stage 2: Production runtime
FROM node:18-alpine AS runtime

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S namada -u 1001

# Set working directory
WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache \
    dumb-init \
    curl \
    && rm -rf /var/cache/apk/*

# Copy node_modules from builder stage
COPY --from=builder --chown=namada:nodejs /app/node_modules ./node_modules

# Copy application code
COPY --chown=namada:nodejs src/ ./src/
COPY --chown=namada:nodejs package*.json ./
COPY --chown=namada:nodejs config.env.example ./

# Create logs directory
RUN mkdir -p logs && chown namada:nodejs logs

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001
ENV LOG_LEVEL=info

# Expose port
EXPOSE 3001

# Switch to non-root user
USER namada

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health/live || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "src/index.js"] 