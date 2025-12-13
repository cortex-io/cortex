FROM node:20-alpine

# Install kubectl for K8s CLI operations (optional but useful for debugging)
RUN apk add --no-cache curl && \
    curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" && \
    chmod +x kubectl && \
    mv kubectl /usr/local/bin/

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY k3s-server-http.js ./

# Create non-root user
RUN addgroup -g 1001 -S mcp && \
    adduser -S -u 1001 -G mcp mcp && \
    mkdir -p /home/mcp/.kube && \
    chown -R mcp:mcp /app /home/mcp

USER mcp

# Expose HTTP port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "k3s-server-http.js"]
