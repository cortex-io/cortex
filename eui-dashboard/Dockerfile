# Cortex Dashboard Dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files and all source code first
COPY package*.json ./
COPY . .

# Install dependencies (using --omit=dev instead of deprecated --only=production)
RUN npm ci --omit=dev && npm cache clean --force

# Expose dashboard port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Start dashboard server
CMD ["node", "server/index.js"]
