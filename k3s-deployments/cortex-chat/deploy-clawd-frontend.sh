#!/bin/bash
set -e

echo "================================================"
echo "Deploying Cortex Chat with Clawd Frontend"
echo "================================================"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Registry
REGISTRY="10.43.170.72:5000"
IMAGE_NAME="cortex-chat-frontend-clawd"
IMAGE_TAG="latest"
FULL_IMAGE="${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}"

echo -e "${BLUE}Step 1: Building Docker image locally${NC}"
cd /Users/ryandahlberg/Projects/cortex/k3s-deployments/cortex-chat/frontend-redesign

# Create temporary Dockerfile
cat > Dockerfile.clawd <<'EOF'
FROM nginx:alpine

# Copy the Clawd HTML as index.html
COPY index-clawd.html /usr/share/nginx/html/index.html

# Configure nginx
RUN echo 'server { \
    listen 3000; \
    server_name _; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"; \
        add_header Pragma "no-cache"; \
        add_header Expires "0"; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
EOF

echo -e "${BLUE}Step 2: Building image with Docker${NC}"
docker build -f Dockerfile.clawd -t ${FULL_IMAGE} .

echo -e "${BLUE}Step 3: Pushing to local registry${NC}"
docker push ${FULL_IMAGE}

echo -e "${GREEN}Frontend image pushed successfully!${NC}"

echo -e "${BLUE}Step 4: Restarting cortex-chat deployment${NC}"
kubectl rollout restart deployment/cortex-chat -n cortex-chat

echo -e "${BLUE}Step 5: Waiting for rollout to complete${NC}"
kubectl rollout status deployment/cortex-chat -n cortex-chat --timeout=120s

echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}Deployment complete!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo "Access Cortex Chat at: https://chat.ry-ops.dev"
echo ""
echo -e "${YELLOW}New Features:${NC}"
echo "  - Clawd the Robot mascot with animations"
echo "  - Dark theme with coral accents"
echo "  - Personality selector (Rick & Morty, Pirate, Robot modes!)"
echo "  - System alerts banner (cluster health monitoring)"
echo "  - Plus button toolbox menu"
echo "  - Personalized greeting"
echo ""

# Cleanup
rm -f Dockerfile.clawd
