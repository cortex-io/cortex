#!/bin/bash
set -e

echo "============================================================"
echo "Cortex Redis Queue System Deployment"
echo "============================================================"

NAMESPACE="cortex"
WORKER_CODE_FILE="./worker/worker.js"
SCANNER_CODE_FILE="../cortex-governance/shadow-ai-scanner.js"
POLICIES_FILE="../cortex-governance/policies.json"

# Step 1: Deploy Redis infrastructure
echo ""
echo "[1/7] Deploying Redis infrastructure..."
kubectl apply -f redis-pvc.yaml
kubectl apply -f redis-deployment.yaml
kubectl apply -f redis-service.yaml

echo "Waiting for Redis to be ready..."
kubectl wait --for=condition=ready pod -l app=redis-queue -n $NAMESPACE --timeout=120s

# Step 2: Deploy tasks PVC
echo ""
echo "[2/7] Deploying tasks PVC..."
kubectl apply -f tasks-pvc.yaml

# Step 3: Create worker ConfigMap from actual code
echo ""
echo "[3/7] Creating worker ConfigMap..."
kubectl create configmap worker-code \
  --from-file=worker.js=$WORKER_CODE_FILE \
  -n $NAMESPACE \
  --dry-run=client -o yaml | kubectl apply -f -

# Step 4: Build worker image with Kaniko
echo ""
echo "[4/7] Building worker image with Kaniko..."
kubectl apply -f kaniko-worker-build.yaml

echo "Waiting for Kaniko build to complete..."
kubectl wait --for=condition=complete job/kaniko-worker-build -n $NAMESPACE --timeout=300s || {
  echo "Build failed or timed out. Checking logs:"
  kubectl logs -n $NAMESPACE job/kaniko-worker-build --tail=50
  exit 1
}

echo "Worker image built successfully!"

# Step 5: Deploy worker pool
echo ""
echo "[5/7] Deploying worker pool..."
kubectl apply -f worker-deployment.yaml
kubectl apply -f worker-hpa.yaml

echo "Waiting for at least 1 worker to be ready..."
kubectl wait --for=condition=ready pod -l app=cortex-queue-worker -n $NAMESPACE --timeout=120s || {
  echo "Warning: Workers not ready yet. Check status with: kubectl get pods -n cortex"
}

# Step 6: Deploy governance system
echo ""
echo "[6/7] Deploying Shadow AI Scanner..."

# Create scanner ConfigMaps
if [ -f "$SCANNER_CODE_FILE" ]; then
  kubectl create configmap scanner-code \
    --from-file=shadow-ai-scanner.js=$SCANNER_CODE_FILE \
    -n $NAMESPACE \
    --dry-run=client -o yaml | kubectl apply -f -
fi

if [ -f "$POLICIES_FILE" ]; then
  kubectl create configmap governance-policies \
    --from-file=policies.json=$POLICIES_FILE \
    -n $NAMESPACE \
    --dry-run=client -o yaml | kubectl apply -f -
fi

# Deploy scanner CronJob
kubectl apply -f ../cortex-governance/scanner-cronjob.yaml

# Step 7: System status
echo ""
echo "[7/7] Checking system status..."
echo ""
echo "Redis Status:"
kubectl get pods -n $NAMESPACE -l app=redis-queue
echo ""
echo "Worker Status:"
kubectl get pods -n $NAMESPACE -l app=cortex-queue-worker
echo ""
echo "Queue Depths:"
REDIS_POD=$(kubectl get pod -n $NAMESPACE -l app=redis-queue -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n $NAMESPACE $REDIS_POD -- redis-cli LLEN cortex:queue:critical | awk '{print "  Critical: " $0}'
kubectl exec -n $NAMESPACE $REDIS_POD -- redis-cli LLEN cortex:queue:high | awk '{print "  High: " $0}'
kubectl exec -n $NAMESPACE $REDIS_POD -- redis-cli LLEN cortex:queue:medium | awk '{print "  Medium: " $0}'
kubectl exec -n $NAMESPACE $REDIS_POD -- redis-cli LLEN cortex:queue:low | awk '{print "  Low: " $0}'

echo ""
echo "============================================================"
echo "Deployment Complete!"
echo "============================================================"
echo ""
echo "Next Steps:"
echo "  1. Update cortex-orchestrator to use Redis (rebuild image)"
echo "  2. Test queue system: kubectl exec -n cortex \$REDIS_POD -- redis-cli LPUSH cortex:queue:medium '{\"id\":\"test-1\"}'"
echo "  3. Monitor workers: kubectl logs -n cortex -l app=cortex-queue-worker -f"
echo "  4. Check queue status via API: curl http://cortex-orchestrator.cortex/api/queue/status"
echo ""
