#!/usr/bin/env bash
################################################################################
# Cortex: Deploy to VM 310 (k3s-master-vm) via Proxmox QEMU Guest Agent API
#
# Based on research:
# - Proxmox 8+ requires command parameter as array format
# - Each command argument must be passed separately using --data-urlencode
# - Alternative: file-write + exec approach for complex commands
################################################################################

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_section() { echo -e "\n${GREEN}======================================================================${NC}\n  $*\n${GREEN}======================================================================${NC}"; }

# Proxmox API configuration
PROXMOX_HOST="10.88.140.164"
PROXMOX_PORT="8006"
PROXMOX_NODE="pve01"
PROXMOX_USER="root@pam"
PROXMOX_TOKEN_NAME="cortex-deploy"
PROXMOX_TOKEN_VALUE="15d84996-1afe-4c00-9e5c-c6c5aa12da33"

BASE_URL="https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json"
AUTH_HEADER="PVEAPIToken=${PROXMOX_USER}!${PROXMOX_TOKEN_NAME}=${PROXMOX_TOKEN_VALUE}"

# VM Configuration
VMID=310

# Deployment script content
DEPLOYMENT_SCRIPT='#!/bin/bash
set -e

echo "=== Cortex Deployment to K3s Cluster ==="

# Apply the Cortex deployment
kubectl apply -f https://raw.githubusercontent.com/ry-ops/cortex/docker-container/k8s/cortex-complete-deployment.yaml

# Create secrets
kubectl create secret generic cortex-credentials \
  --namespace=cortex-system \
  --from-literal=anthropic-api-key="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" \
  --from-literal=github-token="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" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "=== Deployment Complete ==="
echo "Waiting for pods to start..."
sleep 10

kubectl get pods -n cortex-system
kubectl get svc -n cortex-system

echo "=== Dashboard URL ==="
kubectl get svc -n cortex-system dashboard-service -o jsonpath="{.status.loadBalancer.ingress[0].ip}" 2>/dev/null || echo "NodePort mode - use node IP"
'

log_section "Cortex Deployment to VM 310 via Proxmox QEMU Guest Agent"

# Test guest agent
log_info "Testing QEMU Guest Agent..."
AGENT_INFO=$(curl -s -k -H "Authorization: ${AUTH_HEADER}" \
    "${BASE_URL}/nodes/${PROXMOX_NODE}/qemu/${VMID}/agent/info")

if echo "$AGENT_INFO" | grep -q '"data"'; then
    log_info "✅ Guest agent is responsive!"
    echo "$AGENT_INFO" | grep -o '"version":"[^"]*"' || true
else
    log_error "❌ Guest agent not available"
    echo "$AGENT_INFO"
    exit 1
fi

# Test simple command first
log_section "Testing Simple Command: whoami"

WHOAMI_RESPONSE=$(curl -s -k -H "Authorization: ${AUTH_HEADER}" \
    -X POST "${BASE_URL}/nodes/${PROXMOX_NODE}/qemu/${VMID}/agent/exec" \
    --data-urlencode "command=/usr/bin/whoami")

log_info "Response: $WHOAMI_RESPONSE"

if echo "$WHOAMI_RESPONSE" | grep -q '"pid"'; then
    PID=$(echo "$WHOAMI_RESPONSE" | grep -o '"pid":[0-9]*' | cut -d':' -f2)
    log_info "✅ Command executed! PID: $PID"

    sleep 2

    STATUS=$(curl -s -k -H "Authorization: ${AUTH_HEADER}" \
        "${BASE_URL}/nodes/${PROXMOX_NODE}/qemu/${VMID}/agent/exec-status?pid=${PID}")

    log_info "Status: $STATUS"

    # Decode base64 output if present
    if echo "$STATUS" | grep -q '"out-data"'; then
        OUTDATA=$(echo "$STATUS" | grep -o '"out-data":"[^"]*"' | cut -d'"' -f4)
        if [ -n "$OUTDATA" ]; then
            echo "Output: $(echo "$OUTDATA" | base64 -d 2>/dev/null || echo "$OUTDATA")"
        fi
    fi
else
    log_warn "Command may have failed, but continuing..."
fi

# Test kubectl access
log_section "Testing kubectl access"

KUBECTL_RESPONSE=$(curl -s -k -H "Authorization: ${AUTH_HEADER}" \
    -X POST "${BASE_URL}/nodes/${PROXMOX_NODE}/qemu/${VMID}/agent/exec" \
    --data-urlencode "command=/usr/local/bin/kubectl" \
    --data-urlencode "command=get" \
    --data-urlencode "command=nodes")

log_info "kubectl test response: $KUBECTL_RESPONSE"

# Main deployment using file-write approach
log_section "MAIN DEPLOYMENT: Using file-write-exec approach"

SCRIPT_PATH="/tmp/deploy-cortex.sh"

# Step 1: Write script file
log_info "Step 1: Writing deployment script to ${SCRIPT_PATH}"

# According to Proxmox docs, content should be base64 encoded
ENCODED_SCRIPT=$(echo -n "$DEPLOYMENT_SCRIPT" | base64 | tr -d '\n')

# Note: The Proxmox API requires base64 content but without the urlencode wrapper
WRITE_RESPONSE=$(curl -s -k -H "Authorization: ${AUTH_HEADER}" \
    -H "Content-Type: application/json" \
    -X POST "${BASE_URL}/nodes/${PROXMOX_NODE}/qemu/${VMID}/agent/file-write" \
    -d "{\"file\":\"${SCRIPT_PATH}\",\"content\":\"${ENCODED_SCRIPT}\"}")

log_info "Write response: $WRITE_RESPONSE"

if echo "$WRITE_RESPONSE" | grep -q '"data"'; then
    log_info "✅ Script written successfully"
else
    log_error "❌ Failed to write script"
    exit 1
fi

# Step 2: Make executable
log_info "Step 2: Making script executable"

CHMOD_RESPONSE=$(curl -s -k -H "Authorization: ${AUTH_HEADER}" \
    -X POST "${BASE_URL}/nodes/${PROXMOX_NODE}/qemu/${VMID}/agent/exec" \
    --data-urlencode "command=/bin/chmod" \
    --data-urlencode "command=+x" \
    --data-urlencode "command=${SCRIPT_PATH}")

log_info "chmod response: $CHMOD_RESPONSE"

sleep 1

# Step 3: Execute script
log_info "Step 3: Executing deployment script"

EXEC_RESPONSE=$(curl -s -k -H "Authorization: ${AUTH_HEADER}" \
    -X POST "${BASE_URL}/nodes/${PROXMOX_NODE}/qemu/${VMID}/agent/exec" \
    --data-urlencode "command=/bin/bash" \
    --data-urlencode "command=${SCRIPT_PATH}")

log_info "Exec response: $EXEC_RESPONSE"

if echo "$EXEC_RESPONSE" | grep -q '"pid"'; then
    DEPLOY_PID=$(echo "$EXEC_RESPONSE" | grep -o '"pid":[0-9]*' | cut -d':' -f2)
    log_info "✅ Deployment script executing! PID: $DEPLOY_PID"

    # Monitor execution
    log_info "Monitoring execution (60 seconds)..."

    for i in {1..12}; do
        sleep 5

        STATUS=$(curl -s -k -H "Authorization: ${AUTH_HEADER}" \
            "${BASE_URL}/nodes/${PROXMOX_NODE}/qemu/${VMID}/agent/exec-status?pid=${DEPLOY_PID}")

        if echo "$STATUS" | grep -q '"exited":1'; then
            log_section "Execution Complete"

            EXITCODE=$(echo "$STATUS" | grep -o '"exitcode":[0-9]*' | cut -d':' -f2)
            log_info "Exit code: $EXITCODE"

            # Decode and display output
            if echo "$STATUS" | grep -q '"out-data"'; then
                OUTDATA=$(echo "$STATUS" | grep -o '"out-data":"[^"]*"' | cut -d'"' -f4)
                if [ -n "$OUTDATA" ]; then
                    log_section "STDOUT"
                    echo "$OUTDATA" | base64 -d 2>/dev/null || echo "$OUTDATA"
                fi
            fi

            if echo "$STATUS" | grep -q '"err-data"'; then
                ERRDATA=$(echo "$STATUS" | grep -o '"err-data":"[^"]*"' | cut -d'"' -f4)
                if [ -n "$ERRDATA" ]; then
                    log_section "STDERR"
                    echo "$ERRDATA" | base64 -d 2>/dev/null || echo "$ERRDATA"
                fi
            fi

            if [ "$EXITCODE" = "0" ]; then
                log_info "✅ Deployment completed successfully!"

                # Verify deployment
                log_section "Verifying Deployment"
                sleep 10

                VERIFY_RESPONSE=$(curl -s -k -H "Authorization: ${AUTH_HEADER}" \
                    -X POST "${BASE_URL}/nodes/${PROXMOX_NODE}/qemu/${VMID}/agent/exec" \
                    --data-urlencode "command=/usr/local/bin/kubectl" \
                    --data-urlencode "command=get" \
                    --data-urlencode "command=pods" \
                    --data-urlencode "command=-n" \
                    --data-urlencode "command=cortex-system")

                if echo "$VERIFY_RESPONSE" | grep -q '"pid"'; then
                    VERIFY_PID=$(echo "$VERIFY_RESPONSE" | grep -o '"pid":[0-9]*' | cut -d':' -f2)
                    sleep 3

                    VERIFY_STATUS=$(curl -s -k -H "Authorization: ${AUTH_HEADER}" \
                        "${BASE_URL}/nodes/${PROXMOX_NODE}/qemu/${VMID}/agent/exec-status?pid=${VERIFY_PID}")

                    if echo "$VERIFY_STATUS" | grep -q '"out-data"'; then
                        VERIFY_OUT=$(echo "$VERIFY_STATUS" | grep -o '"out-data":"[^"]*"' | cut -d'"' -f4)
                        log_section "Pods in cortex-system namespace"
                        echo "$VERIFY_OUT" | base64 -d 2>/dev/null || echo "$VERIFY_OUT"
                    fi
                fi

                log_section "✅ Cortex Deployment Complete!"
                echo ""
                echo "Next steps:"
                echo "1. Check pod status: kubectl get pods -n cortex-system"
                echo "2. Get dashboard URL: kubectl get svc -n cortex-system"
                echo "3. Access dashboard via the service endpoint"
                echo ""

                exit 0
            else
                log_error "❌ Deployment failed with exit code $EXITCODE"
                exit 1
            fi
        else
            log_info "  [$((i*5))s] Script still running..."
        fi
    done

    log_warn "⚠️  Script still running after 60 seconds"
    log_info "Check status manually: kubectl get pods -n cortex-system"
    exit 0

else
    log_error "❌ Failed to execute deployment script"
    echo "$EXEC_RESPONSE"
    exit 1
fi
