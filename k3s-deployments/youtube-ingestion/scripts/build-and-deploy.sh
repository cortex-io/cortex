#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== YouTube Ingestion Service - Build and Deploy ==="
echo "Project directory: $PROJECT_DIR"

# Build Docker image
echo ""
echo "Step 1: Building Docker image..."
cd "$PROJECT_DIR"
docker build -t localhost:5000/youtube-ingestion:latest .

# Push to local registry
echo ""
echo "Step 2: Pushing to local registry..."
docker push localhost:5000/youtube-ingestion:latest

# Apply Kubernetes manifests
echo ""
echo "Step 3: Applying Kubernetes manifests..."

# Create namespace if it doesn't exist
kubectl create namespace cortex --dry-run=client -o yaml | kubectl apply -f -

# Apply PVC first
kubectl apply -f k8s/pvc.yaml

# Apply service
kubectl apply -f k8s/service.yaml

# Apply deployment
kubectl apply -f k8s/deployment.yaml

# Apply ingress (optional)
kubectl apply -f k8s/ingress.yaml

echo ""
echo "Step 4: Waiting for deployment to be ready..."
kubectl rollout status deployment/youtube-ingestion -n cortex --timeout=300s

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Service Status:"
kubectl get pods -n cortex -l app=youtube-ingestion
echo ""
echo "Service URL (internal): http://youtube-ingestion.cortex.svc.cluster.local:8080"
echo "Health Check: http://youtube-ingestion.cortex.svc.cluster.local:8080/health"
echo ""
echo "Test the service:"
echo "  kubectl port-forward -n cortex svc/youtube-ingestion 8080:8080"
echo "  curl http://localhost:8080/health"
echo ""
