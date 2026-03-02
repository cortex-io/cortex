#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# K3s master node (update if needed)
K3S_NODE="k3s-master01"
K3S_USER="ryan"
REMOTE_DIR="/tmp/youtube-ingestion-build"

echo "=== YouTube Ingestion Service - Remote Build ==="
echo "Building on K3s node: $K3S_NODE"
echo "Project directory: $PROJECT_DIR"

# Step 1: Copy files to K3s node
echo ""
echo "Step 1: Copying files to K3s node..."
ssh ${K3S_USER}@${K3S_NODE} "mkdir -p ${REMOTE_DIR}"
rsync -avz --delete \
  --exclude=node_modules \
  --exclude=.git \
  --exclude=data \
  --exclude=k8s \
  ${PROJECT_DIR}/ ${K3S_USER}@${K3S_NODE}:${REMOTE_DIR}/

# Step 2: Build image on K3s node
echo ""
echo "Step 2: Building Docker image on K3s node..."
ssh ${K3S_USER}@${K3S_NODE} "cd ${REMOTE_DIR} && sudo k3s ctr images import --all-platforms - < <(sudo docker build -t localhost/youtube-ingestion:latest . -q && sudo docker save localhost/youtube-ingestion:latest) 2>/dev/null || sudo nerdctl -n k8s.io build -t localhost/youtube-ingestion:latest ."

# Step 3: Restart deployment
echo ""
echo "Step 3: Restarting deployment..."
kubectl rollout restart deployment/youtube-ingestion -n cortex
kubectl rollout status deployment/youtube-ingestion -n cortex --timeout=300s

# Step 4: Cleanup
echo ""
echo "Step 4: Cleaning up remote build directory..."
ssh ${K3S_USER}@${K3S_NODE} "rm -rf ${REMOTE_DIR}"

echo ""
echo "=== Build and Deploy Complete ==="
kubectl get pods -n cortex -l app=youtube-ingestion
