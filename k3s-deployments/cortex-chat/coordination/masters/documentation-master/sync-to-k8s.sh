#!/bin/bash
# Sync Documentation Master scripts to Kubernetes ConfigMaps

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAMESPACE="cortex"

echo "Syncing Documentation Master to Kubernetes..."
echo "=============================================="

# Update documentation-master-code configmap with master.sh
echo "Updating documentation-master-code configmap..."
kubectl create configmap documentation-master-code \
  --from-file=master.sh="${SCRIPT_DIR}/master.sh" \
  --namespace="${NAMESPACE}" \
  --dry-run=client -o yaml | kubectl apply -f -

# Update documentation-master-lib configmap with all lib scripts
echo "Updating documentation-master-lib configmap..."
kubectl create configmap documentation-master-lib \
  --from-file=crawler.sh="${SCRIPT_DIR}/lib/crawler.sh" \
  --from-file=indexer.sh="${SCRIPT_DIR}/lib/indexer.sh" \
  --from-file=learner.sh="${SCRIPT_DIR}/lib/learner.sh" \
  --from-file=knowledge-graph.sh="${SCRIPT_DIR}/lib/knowledge-graph.sh" \
  --from-file=query-handler.sh="${SCRIPT_DIR}/lib/query-handler.sh" \
  --from-file=evolution-tracker.sh="${SCRIPT_DIR}/lib/evolution-tracker.sh" \
  --namespace="${NAMESPACE}" \
  --dry-run=client -o yaml | kubectl apply -f -

# Update documentation-master-config configmap
echo "Updating documentation-master-config configmap..."
kubectl create configmap documentation-master-config \
  --from-file=sources.json="${SCRIPT_DIR}/config/sources.json" \
  --from-file=crawl-policy.json="${SCRIPT_DIR}/config/crawl-policy.json" \
  --from-file=resource-limits.json="${SCRIPT_DIR}/config/resource-limits.json" \
  --from-file=learning-policy.json="${SCRIPT_DIR}/config/learning-policy.json" \
  --namespace="${NAMESPACE}" \
  --dry-run=client -o yaml | kubectl apply -f -

# Update documentation-master-workers configmap
echo "Updating documentation-master-workers configmap..."
kubectl create configmap documentation-master-workers \
  --from-file=crawler-worker.sh="${SCRIPT_DIR}/workers/crawler-worker.sh" \
  --from-file=indexer-worker.sh="${SCRIPT_DIR}/workers/indexer-worker.sh" \
  --from-file=learner-worker.sh="${SCRIPT_DIR}/workers/learner-worker.sh" \
  --namespace="${NAMESPACE}" \
  --dry-run=client -o yaml | kubectl apply -f -

echo ""
echo "ConfigMaps updated successfully!"
echo ""
echo "To restart the deployment and pick up changes:"
echo "  kubectl rollout restart deployment/documentation-master -n ${NAMESPACE}"
echo ""
echo "To view logs:"
echo "  kubectl logs -n ${NAMESPACE} deployment/documentation-master -f"
echo ""
echo "To check status:"
echo "  kubectl exec -n ${NAMESPACE} deployment/documentation-master -- /app/master.sh status"
