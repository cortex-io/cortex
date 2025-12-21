#!/usr/bin/env bash
# Notify Cortex cluster instances about a new pending task

set -euo pipefail

TASK_FILE="${1:-coordination/tasks/pending/fix-k3s-master03-ip.json}"
TASK_ID=$(jq -r '.id' "$TASK_FILE")
TASK_TITLE=$(jq -r '.title' "$TASK_FILE")

echo "=============================================================="
echo "Notifying Cortex Cluster: New Task Available"
echo "=============================================================="
echo ""
echo "Task ID: $TASK_ID"
echo "Title: $TASK_TITLE"
echo "File: $TASK_FILE"
echo ""

# Check if we can reach the K3s cluster
if ! ssh k3s@10.88.145.190 "kubectl get pods -n cortex -l app=cortex" >/dev/null 2>&1; then
    echo "ERROR: Cannot reach K3s cluster"
    exit 1
fi

echo "Cortex instances running in cluster:"
ssh k3s@10.88.145.190 "kubectl get pods -n cortex -l app=cortex -o wide"
echo ""

# Get list of running Cortex pods
CORTEX_PODS=$(ssh k3s@10.88.145.190 "kubectl get pods -n cortex -l app=cortex -o jsonpath='{.items[*].metadata.name}'")

echo "Task specification has been created at:"
echo "  $TASK_FILE"
echo ""
echo "The task is now in the pending queue and will be picked up by"
echo "the next available Cortex instance that polls the task queue."
echo ""

# Check if there's a shared filesystem or API endpoint for task notification
echo "Options to notify Cortex instances:"
echo ""
echo "1. File-based (if using shared volume):"
echo "   - Task file already created in pending directory"
echo "   - Cortex instances should poll: coordination/tasks/pending/"
echo ""
echo "2. API-based (if Cortex exposes task API):"
for pod in $CORTEX_PODS; do
    echo "   - kubectl exec -n cortex $pod -- curl -X POST http://localhost:8080/api/tasks/notify"
done
echo ""
echo "3. Direct exec (trigger task pickup):"
for pod in $CORTEX_PODS; do
    echo "   - kubectl exec -n cortex $pod -- /path/to/task-processor --task-id $TASK_ID"
done
echo ""

echo "Task delegated! The Cortex cluster will process this task."
echo ""
echo "To monitor task status:"
echo "  watch cat $TASK_FILE | jq '.status'"
