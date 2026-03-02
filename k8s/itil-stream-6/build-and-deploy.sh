#!/bin/bash
# Build and Deploy ITIL Stream 6 Components

set -e

NAMESPACE="cortex-governance"
BASE_DIR="/Users/ryandahlberg/Projects/cortex/k8s/itil-stream-6"

echo "=== ITIL Stream 6 - Advanced Integration & Automation ==="
echo "Building and deploying 4 components..."
echo ""

# Create namespace
echo "Creating namespace..."
kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

# Component 1: Governance Validator
echo "Building Governance Validator..."
cat > /tmp/governance-build.yaml <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: governance-builder
  namespace: $NAMESPACE
spec:
  containers:
  - name: builder
    image: python:3.11-slim
    command: ["/bin/sh", "-c", "sleep 3600"]
  restartPolicy: Never
EOF

kubectl apply -f /tmp/governance-build.yaml
kubectl wait --for=condition=Ready pod/governance-builder -n $NAMESPACE --timeout=60s 2>/dev/null || true

# Copy files to builder pod
kubectl cp "$BASE_DIR/governance/governance-validator.py" $NAMESPACE/governance-builder:/tmp/

# Create the image as a ConfigMap deployment instead
echo "Deploying Governance Validator as ConfigMap-based deployment..."
kubectl create configmap governance-validator-code \
  --from-file=governance-validator.py="$BASE_DIR/governance/governance-validator.py" \
  -n $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

# Component 2: Risk Authorizer
echo "Deploying Risk Authorizer as ConfigMap-based deployment..."
kubectl create configmap risk-authorizer-code \
  --from-file=risk-authorizer.py="$BASE_DIR/risk-auth/risk-authorizer.py" \
  -n $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

# Component 3: Value Chain Orchestrator
echo "Deploying Value Chain Orchestrator as ConfigMap-based deployment..."
kubectl create configmap value-chain-code \
  --from-file=value-chain-orchestrator.py="$BASE_DIR/value-chain/value-chain-orchestrator.py" \
  -n $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

# Component 4: Integration Platform
echo "Deploying Integration Platform as ConfigMap-based deployment..."
kubectl create configmap integration-platform-code \
  --from-file=integration-hub.py="$BASE_DIR/integration-platform/integration-hub.py" \
  -n $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

# Clean up builder pod
kubectl delete pod governance-builder -n $NAMESPACE --ignore-not-found=true

echo ""
echo "ConfigMaps created. Now deploying services..."

# Deploy all services
kubectl apply -f "$BASE_DIR/all-services.yaml"

echo ""
echo "=== Deployment Complete ==="
echo "Namespace: $NAMESPACE"
echo ""
echo "Services:"
echo "  - governance-validator"
echo "  - risk-authorizer"
echo "  - value-chain-orchestrator"
echo "  - integration-platform"
echo ""
echo "Check status with: kubectl get pods -n $NAMESPACE"
