#!/bin/bash
################################################################################
# Deploy Kali Linux Extraction Job to K3s Cluster
#
# This script deploys a Kubernetes Job that will:
# 1. Download Kali Linux QEMU image (if not exists)
# 2. Extract .7z archive to .qcow2
# 3. Import to VMs 900-903 via Proxmox API
# 4. Configure boot order and start VMs
#
# Execution: Run this on K3s master (VM 310) or with kubectl configured
################################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "=== Deploying Kali Linux Extraction Job to K3s ==="
echo "Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo ""

# Verify kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo "ERROR: kubectl not found"
    exit 1
fi

# Check cluster connectivity
echo "Testing cluster connectivity..."
if ! kubectl cluster-info &> /dev/null; then
    echo "ERROR: Cannot connect to K3s cluster"
    echo "Ensure KUBECONFIG is set or kubectl is configured"
    exit 1
fi

echo "Connected to cluster:"
kubectl cluster-info | head -1
echo ""

# Verify namespace exists
echo "Verifying cortex-system namespace..."
if ! kubectl get namespace cortex-system &> /dev/null; then
    echo "Creating cortex-system namespace..."
    kubectl create namespace cortex-system
fi

# Check if secret exists
echo "Checking Proxmox credentials secret..."
if ! kubectl get secret proxmox-credentials -n cortex-system &> /dev/null; then
    echo "Creating proxmox-credentials secret..."
    kubectl create secret generic proxmox-credentials \
        -n cortex-system \
        --from-literal=token='root@pam!cortex-deploy=15d84996-1afe-4c00-9e5c-c6c5aa12da33'
    echo "Secret created"
else
    echo "Secret already exists"
fi
echo ""

# Deploy the Job
JOB_MANIFEST="${CORTEX_ROOT}/k8s/jobs/kali-deployment-job.yaml"

if [ ! -f "$JOB_MANIFEST" ]; then
    echo "ERROR: Job manifest not found at $JOB_MANIFEST"
    exit 1
fi

echo "Deploying Kali deployment job..."
kubectl apply -f "$JOB_MANIFEST"
echo ""

# Wait for job to start
echo "Waiting for job to create pod..."
sleep 3

# Get pod name
POD=$(kubectl get pods -n cortex-system -l app=kali-deployment \
    --sort-by=.metadata.creationTimestamp \
    -o jsonpath='{.items[-1].metadata.name}' 2>/dev/null || echo "")

if [ -z "$POD" ]; then
    echo "WARNING: No pod found yet"
    echo "Check manually with: kubectl get pods -n cortex-system -l app=kali-deployment"
    exit 0
fi

echo "Pod created: $POD"
echo ""

# Show initial status
echo "=== Initial Job Status ==="
kubectl get job kali-deployment -n cortex-system
echo ""

echo "=== Pod Status ==="
kubectl get pod "$POD" -n cortex-system
echo ""

# Stream logs
echo "=== Streaming Pod Logs (Ctrl+C to stop) ==="
echo "Following logs for pod: $POD"
echo "---"
kubectl logs -f "$POD" -n cortex-system &
LOGS_PID=$!

# Wait for completion (max 10 minutes)
echo ""
echo "Waiting for job completion (timeout: 10 minutes)..."
if kubectl wait --for=condition=complete --timeout=600s job/kali-deployment -n cortex-system 2>/dev/null; then
    echo ""
    echo "=== Job Completed Successfully ==="
    kill $LOGS_PID 2>/dev/null || true
else
    echo ""
    echo "=== Job Status Check ==="
    kubectl get job kali-deployment -n cortex-system

    # Check for failures
    FAILED=$(kubectl get job kali-deployment -n cortex-system -o jsonpath='{.status.failed}' 2>/dev/null || echo "0")
    if [ "$FAILED" != "0" ]; then
        echo "WARNING: Job has $FAILED failed attempts"
        echo ""
        echo "=== Pod Events ==="
        kubectl get events -n cortex-system --field-selector involvedObject.name=$POD --sort-by='.lastTimestamp'
    fi

    kill $LOGS_PID 2>/dev/null || true
fi

# Final status
echo ""
echo "=== Final Status ==="
kubectl get job kali-deployment -n cortex-system -o wide
echo ""

echo "=== Verification Commands ==="
echo "View logs:    kubectl logs -n cortex-system $POD"
echo "Job details:  kubectl describe job kali-deployment -n cortex-system"
echo "Delete job:   kubectl delete job kali-deployment -n cortex-system"
echo ""

echo "=== Deployment Complete ==="
echo "Next: Verify VMs 900-903 have Kali images imported via Proxmox UI"
