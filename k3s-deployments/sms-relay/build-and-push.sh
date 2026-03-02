#!/bin/bash
# Build and push SMS relay Docker image to local k3s registry

set -e

IMAGE_NAME="sms-relay"
IMAGE_TAG="latest"
REGISTRY="localhost:32000"

# Detect container tool
if command -v nerdctl &> /dev/null; then
    CTR="nerdctl"
elif command -v docker &> /dev/null; then
    CTR="docker"
elif command -v podman &> /dev/null; then
    CTR="podman"
else
    echo "Error: No container tool found (nerdctl, docker, or podman)"
    exit 1
fi

echo "Using container tool: $CTR"
echo "Building SMS relay image..."
$CTR build -t ${IMAGE_NAME}:${IMAGE_TAG} .

echo "Tagging for local registry..."
$CTR tag ${IMAGE_NAME}:${IMAGE_TAG} ${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}

echo "Pushing to local k3s registry..."
$CTR push ${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}

echo ""
echo "Image pushed successfully: ${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}"
echo ""
echo "Next steps:"
echo "1. Deploy to k8s: kubectl apply -f k8s/secret-prod.yaml && kubectl apply -k k8s/"
echo "2. Check logs: kubectl logs -f deployment/sms-relay"
echo "3. Configure Twilio webhook to your ingress URL"
