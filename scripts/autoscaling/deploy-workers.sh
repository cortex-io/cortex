#!/bin/bash
set -euo pipefail

# Deploy Cortex Workers (Deployments)
# Deploys all 4 worker types with 0 initial replicas (KEDA will manage scaling)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="${SCRIPT_DIR}/../../k8s"
NAMESPACE="cortex"

echo "=================================================="
echo "Deploying Cortex Workers"
echo "=================================================="

# Ensure namespace exists
kubectl create namespace ${NAMESPACE} --dry-run=client -o yaml | kubectl apply -f -

# Deploy worker deployments
echo ""
echo "Deploying worker deployments..."

WORKERS=(
  "implementation-worker-deployment.yaml"
  "security-worker-deployment.yaml"
  "analysis-worker-deployment.yaml"
  "scan-worker-deployment.yaml"
)

for worker_file in "${WORKERS[@]}"; do
  worker_name=$(echo ${worker_file} | sed 's/-deployment.yaml//')
  echo ""
  echo "Deploying ${worker_name}..."
  kubectl apply -f ${K8S_DIR}/workers/${worker_file}
done

# Wait a moment for deployments to be created
sleep 3

# Verify deployment
echo ""
echo "=================================================="
echo "Deployment Complete - Verification"
echo "=================================================="

echo ""
echo "Deployments:"
kubectl get deployments -n ${NAMESPACE} -l component=worker

echo ""
echo "Pods (should be 0 until KEDA is deployed):"
kubectl get pods -n ${NAMESPACE} -l component=worker

echo ""
echo "=================================================="
echo "Workers Deployed Successfully!"
echo "=================================================="
echo ""
echo "Note: Workers have 0 replicas and will not start until KEDA is deployed"
echo ""
echo "Next steps:"
echo "  1. Deploy KEDA: ./deploy-keda.sh"
echo "  2. Test autoscaling: ./test-autoscaling.sh"
echo ""
echo "To check worker configuration:"
echo "  kubectl describe deployment implementation-worker -n ${NAMESPACE}"
echo ""
