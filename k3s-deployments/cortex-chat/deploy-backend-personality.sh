#!/bin/bash
set -e

echo "================================================"
echo "Deploying Cortex Chat Backend with Personality Support"
echo "================================================"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Registry
REGISTRY="10.43.170.72:5000"
IMAGE_NAME="cortex-chat-backend"
IMAGE_TAG="latest"
FULL_IMAGE="${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}"

echo -e "${BLUE}Step 1: Building backend image${NC}"
cd /Users/ryandahlberg/Projects/cortex/k3s-deployments/cortex-chat/backend-simple

# Build using Docker
docker build -t ${FULL_IMAGE} .

echo -e "${BLUE}Step 2: Pushing to local registry${NC}"
docker push ${FULL_IMAGE}

echo -e "${GREEN}Backend image pushed successfully!${NC}"

echo -e "${BLUE}Step 3: Restarting cortex-chat deployment${NC}"
kubectl rollout restart deployment/cortex-chat -n cortex-chat

echo -e "${BLUE}Step 4: Waiting for rollout to complete${NC}"
kubectl rollout status deployment/cortex-chat -n cortex-chat --timeout=120s

echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}Backend deployment complete!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo -e "${YELLOW}New Backend Features:${NC}"
echo "  - Personality mode support (Rick & Morty, Pirate, Robot, Formal, Scientific)"
echo "  - Cluster health endpoint (/api/cluster-health)"
echo "  - Enhanced system prompts based on personality"
echo ""
