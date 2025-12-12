#!/bin/bash
set -euo pipefail

# KEDA Installation Script for K3s
# Installs KEDA 2.12+ for auto-scaling Cortex workers

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEDA_VERSION="${KEDA_VERSION:-2.14.0}"  # Latest stable as of Dec 2025
KEDA_NAMESPACE="keda"

echo "=================================================="
echo "KEDA Installation for Cortex Auto-Scaling"
echo "=================================================="
echo "Version: ${KEDA_VERSION}"
echo "Namespace: ${KEDA_NAMESPACE}"
echo ""

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo "ERROR: kubectl not found. Please install kubectl first."
    exit 1
fi

# Check if Helm is available
if ! command -v helm &> /dev/null; then
    echo "Helm not found. Installing Helm..."
    curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
fi

echo "Step 1: Adding KEDA Helm repository..."
helm repo add kedacore https://kedacore.github.io/charts
helm repo update

echo ""
echo "Step 2: Creating KEDA namespace..."
kubectl create namespace ${KEDA_NAMESPACE} --dry-run=client -o yaml | kubectl apply -f -

echo ""
echo "Step 3: Installing KEDA operator..."
helm upgrade --install keda kedacore/keda \
  --namespace ${KEDA_NAMESPACE} \
  --version ${KEDA_VERSION} \
  --set podAnnotations."prometheus\.io/scrape"="true" \
  --set podAnnotations."prometheus\.io/port"="8080" \
  --set podAnnotations."prometheus\.io/path"="/metrics" \
  --set resources.operator.limits.cpu="1000m" \
  --set resources.operator.limits.memory="1000Mi" \
  --set resources.operator.requests.cpu="100m" \
  --set resources.operator.requests.memory="100Mi" \
  --set resources.metricServer.limits.cpu="1000m" \
  --set resources.metricServer.limits.memory="1000Mi" \
  --set resources.metricServer.requests.cpu="100m" \
  --set resources.metricServer.requests.memory="100Mi" \
  --wait

echo ""
echo "Step 4: Verifying KEDA installation..."

# Wait for KEDA operator to be ready
echo "Waiting for KEDA operator..."
kubectl rollout status deployment/keda-operator -n ${KEDA_NAMESPACE} --timeout=300s

echo "Waiting for KEDA metrics server..."
kubectl rollout status deployment/keda-operator-metrics-apiserver -n ${KEDA_NAMESPACE} --timeout=300s

echo ""
echo "Step 5: Checking KEDA components..."
kubectl get pods -n ${KEDA_NAMESPACE}

echo ""
echo "Step 6: Verifying KEDA API resources..."
kubectl api-resources | grep keda || echo "WARNING: KEDA CRDs not found yet"

echo ""
echo "Step 7: Testing KEDA installation..."
if kubectl get crd scaledobjects.keda.sh &> /dev/null; then
    echo "✓ ScaledObject CRD installed"
else
    echo "✗ ScaledObject CRD not found"
    exit 1
fi

if kubectl get crd scaledjobs.keda.sh &> /dev/null; then
    echo "✓ ScaledJob CRD installed"
else
    echo "✗ ScaledJob CRD not found"
    exit 1
fi

echo ""
echo "=================================================="
echo "KEDA Installation Complete!"
echo "=================================================="
echo ""
echo "Next Steps:"
echo "1. Deploy worker Deployments: kubectl apply -f k8s/workers/"
echo "2. Deploy KEDA ScaledObjects: kubectl apply -f k8s/keda/"
echo "3. Deploy masters: kubectl apply -f k8s/masters/"
echo ""
echo "To verify KEDA is working:"
echo "  kubectl get scaledobjects -n cortex"
echo "  kubectl get hpa -n cortex"
echo ""
echo "To monitor KEDA operator logs:"
echo "  kubectl logs -f -n ${KEDA_NAMESPACE} -l app=keda-operator"
echo ""
