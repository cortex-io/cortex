#!/bin/bash
################################################################################
# Monitor Kali Deployment Job
# Real-time monitoring of Kali extraction and deployment progress
################################################################################

set -euo pipefail

echo "=== Kali Deployment Job Monitor ==="
echo "Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo ""

# Verify kubectl
if ! command -v kubectl &> /dev/null; then
    echo "ERROR: kubectl not found"
    exit 1
fi

# Check connectivity
if ! kubectl cluster-info &> /dev/null; then
    echo "ERROR: Cannot connect to K3s cluster"
    exit 1
fi

echo "=== Job Status ==="
if kubectl get job kali-deployment -n cortex-system &> /dev/null; then
    kubectl get job kali-deployment -n cortex-system -o wide
    echo ""

    # Get job details
    STATUS=$(kubectl get job kali-deployment -n cortex-system -o json)
    SUCCEEDED=$(echo "$STATUS" | jq -r '.status.succeeded // 0')
    FAILED=$(echo "$STATUS" | jq -r '.status.failed // 0')
    ACTIVE=$(echo "$STATUS" | jq -r '.status.active // 0')

    echo "Job Metrics:"
    echo "  Active:    $ACTIVE"
    echo "  Succeeded: $SUCCEEDED"
    echo "  Failed:    $FAILED"
    echo ""
else
    echo "Job not found - not yet deployed"
    exit 0
fi

# Get pods
echo "=== Pods ==="
PODS=$(kubectl get pods -n cortex-system -l app=kali-deployment \
    -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || echo "")

if [ -z "$PODS" ]; then
    echo "No pods found for this job"
    exit 0
fi

echo "Found pods: $PODS"
echo ""

# Show status for each pod
for POD in $PODS; do
    echo "=== Pod: $POD ==="
    kubectl get pod "$POD" -n cortex-system
    echo ""

    PHASE=$(kubectl get pod "$POD" -n cortex-system -o jsonpath='{.status.phase}')

    if [ "$PHASE" == "Running" ] || [ "$PHASE" == "Succeeded" ]; then
        echo "Latest logs:"
        kubectl logs --tail=20 "$POD" -n cortex-system 2>/dev/null || echo "No logs available"
    elif [ "$PHASE" == "Failed" ]; then
        echo "Pod failed! Full logs:"
        kubectl logs "$POD" -n cortex-system 2>/dev/null || echo "No logs available"
        echo ""
        echo "Pod events:"
        kubectl get events -n cortex-system --field-selector involvedObject.name=$POD \
            --sort-by='.lastTimestamp' 2>/dev/null || echo "No events"
    else
        echo "Pod status: $PHASE"
    fi
    echo ""
done

# Show recent events
echo "=== Recent Events ==="
kubectl get events -n cortex-system --sort-by='.lastTimestamp' | tail -10

echo ""
echo "=== Monitoring Commands ==="
echo "Stream logs:  kubectl logs -f -n cortex-system <pod-name>"
echo "Watch status: watch kubectl get job,pod -n cortex-system -l app=kali-deployment"
echo "Delete job:   kubectl delete job kali-deployment -n cortex-system"
