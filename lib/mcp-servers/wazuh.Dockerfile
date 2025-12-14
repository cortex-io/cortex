# Wazuh MCP Server Dockerfile
# Multi-arch: amd64 + arm64
FROM node:20-alpine

LABEL org.opencontainers.image.title="Wazuh MCP Server"
LABEL org.opencontainers.image.description="MCP server for Wazuh SIEM integration"
LABEL org.opencontainers.image.source="https://github.com/ry-ops/cortex"
LABEL org.opencontainers.image.vendor="ry-ops"

# Install runtime dependencies
RUN apk add --no-cache \
    ca-certificates \
    && update-ca-certificates

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (production only)
RUN npm ci --only=production && npm cache clean --force

# Copy Wazuh MCP server files
COPY wazuh-server-http.js ./
COPY wazuh-server.js ./

# Create non-root user
RUN addgroup -g 1001 -S wazuh && \
    adduser -S -u 1001 -G wazuh wazuh && \
    chown -R wazuh:wazuh /app

USER wazuh

# Set environment variables
ENV NODE_ENV=production
ENV MCP_SERVER_TYPE=wazuh

# Expose MCP port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

# Run Wazuh MCP server
CMD ["node", "wazuh-server-http.js"]
