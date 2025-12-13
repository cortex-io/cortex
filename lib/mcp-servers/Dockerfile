FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY *.js ./

# Create non-root user
RUN addgroup -g 1001 -S mcp && \
    adduser -S -u 1001 -G mcp mcp && \
    chown -R mcp:mcp /app

# Switch to non-root user
USER mcp

# Expose port for HTTP/SSE transport
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Default to Wazuh MCP server
CMD ["node", "wazuh-server-http.js"]
