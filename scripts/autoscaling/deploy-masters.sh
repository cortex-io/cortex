#!/bin/bash
set -euo pipefail

# Deploy Cortex Masters (StatefulSets)
# Deploys all 5 masters in order with readiness checks

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="${SCRIPT_DIR}/../../k8s"
NAMESPACE="cortex"

echo "=================================================="
echo "Deploying Cortex Masters"
echo "=================================================="

# Ensure namespace exists
echo "Creating namespace: ${NAMESPACE}"
kubectl create namespace ${NAMESPACE} --dry-run=client -o yaml | kubectl apply -f -

# Deploy ConfigMaps first
echo ""
echo "Step 1: Deploying ConfigMaps..."
kubectl apply -f ${K8S_DIR}/config/

# Deploy shared storage
echo ""
echo "Step 2: Deploying shared storage..."
kubectl apply -f ${K8S_DIR}/storage/cortex-coordination-pvc.yaml
kubectl apply -f ${K8S_DIR}/storage/cortex-task-queue-pvc.yaml

# Wait for PVCs to be bound
echo "Waiting for PVCs to be bound..."
kubectl wait --for=condition=Bound pvc/cortex-coordination -n ${NAMESPACE} --timeout=60s || true
kubectl wait --for=condition=Bound pvc/cortex-task-queue -n ${NAMESPACE} --timeout=60s || true

# Deploy services
echo ""
echo "Step 3: Deploying services..."
kubectl apply -f ${K8S_DIR}/services/

# Deploy masters in order
echo ""
echo "Step 4: Deploying masters..."

MASTERS=(
  "coordinator-master-statefulset.yaml"
  "development-master-statefulset.yaml"
  "security-master-statefulset.yaml"
  "cicd-master-statefulset.yaml"
  "inventory-master-statefulset.yaml"
)

for master_file in "${MASTERS[@]}"; do
  master_name=$(echo ${master_file} | sed 's/-statefulset.yaml//')
  echo ""
  echo "Deploying ${master_name}..."
  kubectl apply -f ${K8S_DIR}/masters/${master_file}

  # Wait for StatefulSet to be ready
  echo "Waiting for ${master_name} to be ready..."
  kubectl rollout status statefulset/${master_name} -n ${NAMESPACE} --timeout=300s || {
    echo "WARNING: ${master_name} did not become ready in time"
    echo "Check logs: kubectl logs -n ${NAMESPACE} ${master_name}-0"
  }
done

# Verify deployment
echo ""
echo "=================================================="
echo "Deployment Complete - Verification"
echo "=================================================="

echo ""
echo "StatefulSets:"
kubectl get statefulsets -n ${NAMESPACE}

echo ""
echo "Pods:"
kubectl get pods -n ${NAMESPACE} -l component=master

echo ""
echo "Services:"
kubectl get services -n ${NAMESPACE}

echo ""
echo "PVCs:"
kubectl get pvc -n ${NAMESPACE}

echo ""
echo "=================================================="
echo "Masters Deployed Successfully!"
echo "=================================================="
echo ""
echo "Next steps:"
echo "  1. Deploy workers: ./deploy-workers.sh"
echo "  2. Deploy KEDA: ./deploy-keda.sh"
echo "  3. Test autoscaling: ./test-autoscaling.sh"
echo ""
echo "To check master logs:"
echo "  kubectl logs -n ${NAMESPACE} coordinator-master-0 -f"
echo "  kubectl logs -n ${NAMESPACE} development-master-0 -f"
echo ""
echo "To access Cortex API:"
echo "  kubectl get nodes -o wide  # Get node IP"
echo "  curl http://<node-ip>:30001/health"
echo ""
