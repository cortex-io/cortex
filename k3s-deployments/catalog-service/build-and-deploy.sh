#!/bin/bash
#
# Build and Deploy Cortex Catalog Service to K3s
#

set -e

echo "🚀 Building and Deploying Cortex Catalog Service"
echo ""

# Build Docker image
echo "📦 Building Docker image..."
docker build -t catalog-service:2.0.0 .

# Tag for k3s
echo "🏷️  Tagging image for k3s..."
docker tag catalog-service:2.0.0 localhost:5000/catalog-service:2.0.0

# Push to k3s registry (if running local registry)
if docker ps | grep -q registry:2; then
  echo "📤 Pushing to local registry..."
  docker push localhost:5000/catalog-service:2.0.0
else
  echo "⚠️  Local registry not running, using local image only"
fi

# Deploy to k3s
echo "☸️  Deploying to K3s..."
kubectl apply -f catalog-deployment.yaml

# Wait for deployment
echo "⏳ Waiting for deployment to be ready..."
kubectl wait --for=condition=available --timeout=60s deployment/catalog-api -n catalog-system

# Get service info
echo ""
echo "✅ Deployment complete!"
echo ""
echo "📊 Service Status:"
kubectl get pods -n catalog-system
echo ""
kubectl get svc -n catalog-system
echo ""

# Show access info
CLUSTER_IP=$(kubectl get svc catalog-api -n catalog-system -o jsonpath='{.spec.clusterIP}')
echo "🌐 Catalog API:"
echo "   Cluster IP: http://$CLUSTER_IP:3000"
echo "   GraphQL: http://$CLUSTER_IP:3000/graphql"
echo "   Stats: http://$CLUSTER_IP:3000/api/stats"
echo ""
echo "🔍 Discovery CronJob:"
kubectl get cronjob -n catalog-system
echo ""

# Port forward instructions
echo "💡 To access from your machine:"
echo "   kubectl port-forward -n catalog-system svc/catalog-api 3000:3000"
echo ""
