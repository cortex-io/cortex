# Cortex Multi-Stage Dockerfile
# Production-ready containerization for Cortex AI orchestration system
# Supports: amd64, arm64

# ============================================================================
# Stage 1: Builder - Install dependencies and prepare runtime
# ============================================================================
FROM node:20-alpine AS builder

# Build metadata
LABEL org.opencontainers.image.title="Cortex"
LABEL org.opencontainers.image.description="Self-improving AI development orchestration with Mixture of Experts"
LABEL org.opencontainers.image.vendor="ry-ops"
LABEL org.opencontainers.image.version="2.0.0"
LABEL org.opencontainers.image.source="https://github.com/ry-ops/cortex"

# Install build dependencies
RUN apk add --no-cache \
    bash \
    git \
    jq \
    curl \
    ca-certificates

# Set working directory
WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production --ignore-scripts && \
    npm cache clean --force

# ============================================================================
# Stage 2: Runtime - Minimal production image
# ============================================================================
FROM node:20-alpine

# Runtime metadata
LABEL maintainer="ry-ops"
LABEL org.opencontainers.image.title="Cortex Runtime"

# Install runtime dependencies
RUN apk add --no-cache \
    bash \
    jq \
    curl \
    ca-certificates \
    git \
    && rm -rf /var/cache/apk/*

# Create non-root user for security
# Use the existing node user (UID/GID 1000) from node:20-alpine base image

# Set working directory
WORKDIR /app

# Copy node_modules from builder stage
COPY --from=builder --chown=node:node /app/node_modules ./node_modules

# Copy application code
COPY --chown=node:node . .

# Create required directories with proper permissions
RUN mkdir -p \
    /app/coordination/tasks \
    /app/coordination/events \
    /app/coordination/metrics \
    /app/coordination/knowledge-base \
    /app/coordination/masters \
    /app/coordination/governance \
    /app/coordination/observability \
    /app/agents/logs \
    /app/data \
    && chown -R node:node /app

# Environment variables with sensible defaults
ENV NODE_ENV=production \
    CORTEX_HOME=/app \
    COORDINATION_DIR=/app/coordination \
    LOG_LEVEL=info \
    PORT=3000 \
    DASHBOARD_PORT=3001

# Expose ports
EXPOSE 3000 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# Switch to non-root user
USER node

# Volume mount points for persistence
VOLUME ["/app/coordination", "/app/agents/logs", "/app/data"]

# Default command - can be overridden
CMD ["bash", "-c", "scripts/daemon-control.sh start && tail -f /dev/null"]
