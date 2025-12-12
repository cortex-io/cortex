#!/bin/bash
set -euo pipefail

# Deploy KEDA ScaledObjects
# Configures auto-scaling for all worker types

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="${SCRIPT_DIR}/../../k8s"
NAMESPACE="cortex"

echo "=================================================="
echo "Deploying KEDA ScaledObjects"
echo "=================================================="

# Verify KEDA is installed
if ! kubectl get crd scaledobjects.keda.sh &> /dev/null; then
  echo "ERROR: KEDA is not installed!"
  echo "Please run: ${SCRIPT_DIR}/../k3s/install-keda.sh"
  exit 1
fi

echo "KEDA is installed - proceeding with ScaledObject deployment"

# Deploy ScaledObjects
echo ""
echo "Deploying ScaledObjects..."

SCALEDOBJECTS=(
  "implementation-worker-scaledobject.yaml"
  "security-worker-scaledobject.yaml"
  "analysis-worker-scaledobject.yaml"
  "scan-worker-scaledobject.yaml"
)

for scaledobject_file in "${SCALEDOBJECTS[@]}"; do
  scaledobject_name=$(echo ${scaledobject_file} | sed 's/-scaledobject.yaml//')
  echo ""
  echo "Deploying ${scaledobject_name} ScaledObject..."
  kubectl apply -f ${K8S_DIR}/autoscaling/${scaledobject_file}
done

# Wait a moment for ScaledObjects to be created
sleep 5

# Verify deployment
echo ""
echo "=================================================="
echo "Deployment Complete - Verification"
echo "=================================================="

echo ""
echo "ScaledObjects:"
kubectl get scaledobjects -n ${NAMESPACE}

echo ""
echo "HPAs (created by KEDA):"
kubectl get hpa -n ${NAMESPACE}

echo ""
echo "Current worker replicas:"
kubectl get deployments -n ${NAMESPACE} -l component=worker

echo ""
echo "=================================================="
echo "KEDA ScaledObjects Deployed Successfully!"
echo "=================================================="
echo ""
echo "Workers will now scale based on task queue depth:"
echo "  - Min replicas: 0 (scale to zero when idle)"
echo "  - Max replicas: 50 per worker type"
echo "  - Threshold: 2 tasks per worker"
echo "  - Poll interval: 15 seconds"
echo "  - Cooldown: 5 minutes"
echo ""
echo "Next steps:"
echo "  1. Test autoscaling: ./test-autoscaling.sh"
echo ""
echo "To monitor scaling events:"
echo "  kubectl get hpa -n ${NAMESPACE} -w"
echo "  kubectl get pods -n ${NAMESPACE} -l component=worker -w"
echo ""
echo "To check ScaledObject details:"
echo "  kubectl describe scaledobject implementation-worker-scaler -n ${NAMESPACE}"
echo ""
