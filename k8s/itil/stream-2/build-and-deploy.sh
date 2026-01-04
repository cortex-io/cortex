#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Building ITIL Stream 2 - SLA & Availability Management"
echo "======================================================"

# Build SLA Predictor
echo ""
echo "Building SLA Predictor..."
cd sla-management
cp ../requirements.txt .
docker build -t sla-predictor:latest .
rm requirements.txt
cd ..

# Build Business Metrics Collector
echo ""
echo "Building Business Metrics Collector..."
cd business-metrics
cp ../requirements.txt .
docker build -t business-metrics-collector:latest .
rm requirements.txt
cd ..

# Build Availability Risk Engine
echo ""
echo "Building Availability Risk Engine..."
cd availability-risk
cp ../requirements.txt .
docker build -t availability-risk-engine:latest .
rm requirements.txt
cd ..

echo ""
echo "Deploying to Kubernetes..."
echo "======================================================"

# Create namespace
kubectl apply -f namespace.yaml

# Deploy components
kubectl apply -f sla-management/deployment.yaml
kubectl apply -f business-metrics/deployment.yaml
kubectl apply -f availability-risk/deployment.yaml

# Deploy ServiceMonitors
kubectl apply -f servicemonitor.yaml

echo ""
echo "Waiting for deployments to be ready..."
kubectl wait --for=condition=available --timeout=300s \
  deployment/sla-predictor \
  deployment/business-metrics-collector \
  deployment/availability-risk-engine \
  -n cortex-itil-stream2

echo ""
echo "======================================================"
echo "Deployment complete!"
echo ""
echo "Services:"
echo "  - SLA Predictor:              http://sla-predictor.cortex-itil-stream2.svc.cluster.local:8000"
echo "  - Business Metrics Collector: http://business-metrics-collector.cortex-itil-stream2.svc.cluster.local:8001"
echo "  - Availability Risk Engine:   http://availability-risk-engine.cortex-itil-stream2.svc.cluster.local:8002"
echo ""
echo "To check status:"
echo "  kubectl get pods -n cortex-itil-stream2"
echo "  kubectl logs -f deployment/sla-predictor -n cortex-itil-stream2"
echo ""
