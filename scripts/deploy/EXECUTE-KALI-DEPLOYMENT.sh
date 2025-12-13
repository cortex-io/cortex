#!/bin/bash
################################################################################
# Execute Kali Deployment Job - Multi-Method Deployment
#
# This script attempts multiple methods to deploy the Kali Job:
# 1. Direct kubectl (if configured)
# 2. SSH to K3s master (VM 310)
# 3. Proxmox API execution
#
# Choose the method based on your environment
################################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "=== Kali Linux Deployment Job Executor ==="
echo "Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo ""

# Configuration
K3S_MASTER_IP="10.88.140.20"  # VM 310 IP
K3S_MASTER_SSH="root@${K3S_MASTER_IP}"
JOB_MANIFEST="${CORTEX_ROOT}/k8s/jobs/kali-deployment-job.yaml"

# Method detection
METHOD="${1:-auto}"

detect_method() {
    echo "Detecting best deployment method..."

    # Check if kubectl is configured
    if command -v kubectl &> /dev/null; then
        if kubectl cluster-info &> /dev/null; then
            echo "Method: Direct kubectl (cluster accessible)"
            return 0
        fi
    fi

    # Check SSH connectivity
    if command -v ssh &> /dev/null; then
        if timeout 5 ssh -o ConnectTimeout=3 -o StrictHostKeyChecking=no "$K3S_MASTER_SSH" "echo ok" &> /dev/null; then
            echo "Method: SSH to K3s master"
            return 1
        fi
    fi

    echo "Method: Manual execution required"
    return 2
}

deploy_via_kubectl() {
    echo "=== Deploying via kubectl ==="

    # Verify namespace
    if ! kubectl get namespace cortex-system &> /dev/null; then
        echo "Creating cortex-system namespace..."
        kubectl create namespace cortex-system
    fi

    # Create secret if needed
    if ! kubectl get secret proxmox-credentials -n cortex-system &> /dev/null; then
        echo "Creating proxmox-credentials secret..."
        kubectl create secret generic proxmox-credentials \
            -n cortex-system \
            --from-literal=token='root@pam!cortex-deploy=15d84996-1afe-4c00-9e5c-c6c5aa12da33'
    fi

    # Apply manifest
    echo "Applying job manifest..."
    kubectl apply -f "$JOB_MANIFEST"

    echo ""
    echo "Job deployed successfully!"
    echo ""

    # Show status
    sleep 2
    kubectl get job,pod -n cortex-system -l app=kali-deployment

    echo ""
    echo "Monitor with: ${SCRIPT_DIR}/MONITOR-KALI-JOB.sh"
}

deploy_via_ssh() {
    echo "=== Deploying via SSH to K3s master ==="

    # Copy manifest to K3s master
    echo "Copying manifest to K3s master..."
    ssh "$K3S_MASTER_SSH" "mkdir -p /root/cortex/k8s/jobs"
    scp "$JOB_MANIFEST" "${K3S_MASTER_SSH}:/root/cortex/k8s/jobs/"

    # Execute deployment
    echo "Executing deployment on K3s master..."
    ssh "$K3S_MASTER_SSH" bash << 'REMOTE_SCRIPT'
set -e

echo "Creating namespace if needed..."
kubectl get namespace cortex-system &> /dev/null || \
    kubectl create namespace cortex-system

echo "Creating secret if needed..."
kubectl get secret proxmox-credentials -n cortex-system &> /dev/null || \
    kubectl create secret generic proxmox-credentials \
        -n cortex-system \
        --from-literal=token='root@pam!cortex-deploy=15d84996-1afe-4c00-9e5c-c6c5aa12da33'

echo "Deploying job..."
kubectl apply -f /root/cortex/k8s/jobs/kali-deployment-job.yaml

echo ""
echo "Job deployed!"
kubectl get job,pod -n cortex-system -l app=kali-deployment
REMOTE_SCRIPT

    echo ""
    echo "Deployment complete!"
    echo ""
    echo "Monitor remotely: ssh $K3S_MASTER_SSH 'kubectl logs -f -n cortex-system -l app=kali-deployment'"
}

show_manual_instructions() {
    echo "=== Manual Deployment Required ==="
    echo ""
    echo "No automatic deployment method available."
    echo ""
    echo "Please execute these steps manually on K3s master (VM 310):"
    echo ""
    echo "1. Copy the job manifest to K3s master:"
    echo "   scp ${JOB_MANIFEST} ${K3S_MASTER_SSH}:/root/cortex/k8s/jobs/"
    echo ""
    echo "2. SSH to K3s master:"
    echo "   ssh ${K3S_MASTER_SSH}"
    echo ""
    echo "3. Run the deployment script:"
    echo "   /root/cortex/scripts/deploy/DEPLOY-KALI-JOB-TO-K3S.sh"
    echo ""
    echo "Alternative: Apply manifest directly:"
    echo "   kubectl apply -f /root/cortex/k8s/jobs/kali-deployment-job.yaml"
    echo ""

    # Create deployment package
    PACKAGE_DIR="/tmp/kali-deployment-package"
    mkdir -p "$PACKAGE_DIR"

    cp "$JOB_MANIFEST" "$PACKAGE_DIR/"
    cp "${SCRIPT_DIR}/DEPLOY-KALI-JOB-TO-K3S.sh" "$PACKAGE_DIR/"
    cp "${SCRIPT_DIR}/MONITOR-KALI-JOB.sh" "$PACKAGE_DIR/"

    cat > "${PACKAGE_DIR}/README.txt" << 'README'
Kali Linux Deployment Package
==============================

Contents:
- kali-deployment-job.yaml: Kubernetes Job manifest
- DEPLOY-KALI-JOB-TO-K3S.sh: Automated deployment script
- MONITOR-KALI-JOB.sh: Monitoring script

Instructions:
1. Copy this directory to K3s master (VM 310)
2. Run: ./DEPLOY-KALI-JOB-TO-K3S.sh
3. Monitor: ./MONITOR-KALI-JOB.sh

Manual deployment:
  kubectl apply -f kali-deployment-job.yaml

Monitor manually:
  kubectl get job,pod -n cortex-system -l app=kali-deployment
  kubectl logs -f -n cortex-system <pod-name>
README

    tar czf /tmp/kali-deployment-package.tar.gz -C /tmp kali-deployment-package

    echo "Deployment package created: /tmp/kali-deployment-package.tar.gz"
    echo "Transfer to K3s master and extract: tar xzf kali-deployment-package.tar.gz"
}

# Main execution
case "$METHOD" in
    kubectl)
        deploy_via_kubectl
        ;;
    ssh)
        deploy_via_ssh
        ;;
    manual)
        show_manual_instructions
        ;;
    auto)
        detect_method
        case $? in
            0) deploy_via_kubectl ;;
            1) deploy_via_ssh ;;
            2) show_manual_instructions ;;
        esac
        ;;
    *)
        echo "Usage: $0 [kubectl|ssh|manual|auto]"
        exit 1
        ;;
esac

echo ""
echo "=== Deployment Process Complete ==="
