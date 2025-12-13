#!/usr/bin/env bash
################################################################################
# Cortex: Deploy to VM 310 via Proxmox QEMU Guest Agent API
# Using exec approach since file-write stores base64 literally
################################################################################

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

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

VMID=310

# Helper function to execute command and get output
exec_and_wait() {
    local desc="$1"
    shift
    local cmd_parts=("$@")

    log_info "$desc"

    # Build curl command with data-urlencode for each part
    local curl_cmd="curl -s -k -H \"Authorization: ${AUTH_HEADER}\" -X POST \"${BASE_URL}/nodes/${PROXMOX_NODE}/qemu/${VMID}/agent/exec\""

    for part in "${cmd_parts[@]}"; do
        curl_cmd="$curl_cmd --data-urlencode \"command=$part\""
    done

    local response
    response=$(eval "$curl_cmd")

    if echo "$response" | grep -q '"pid"'; then
        local pid
        pid=$(echo "$response" | grep -o '"pid":[0-9]*' | cut -d':' -f2)

        # Wait for completion
        for i in {1..20}; do
            sleep 1
            local status
            status=$(curl -s -k -H "Authorization: ${AUTH_HEADER}" \
                "${BASE_URL}/nodes/${PROXMOX_NODE}/qemu/${VMID}/agent/exec-status?pid=${pid}")

            if echo "$status" | grep -q '"exited":1'; then
                local exitcode
                exitcode=$(echo "$status" | grep -o '"exitcode":[0-9]*' | cut -d':' -f2)

                # Decode output if present
                if echo "$status" | grep -q '"out-data"'; then
                    local outdata
                    outdata=$(echo "$status" | grep -o '"out-data":"[^"]*"' | cut -d'"' -f4)
                    if [ -n "$outdata" ]; then
                        echo "$outdata" | base64 -d 2>/dev/null || true
                    fi
                fi

                if echo "$status" | grep -q '"err-data"'; then
                    local errdata
                    errdata=$(echo "$status" | grep -o '"err-data":"[^"]*"' | cut -d'"' -f4)
                    if [ -n "$errdata" ]; then
                        echo "STDERR:" >&2
                        echo "$errdata" | base64 -d 2>/dev/null || true
                    fi
                fi

                return "$exitcode"
            fi
        done

        log_warn "Command timed out"
        return 1
    else
        log_error "Failed to execute: $response"
        return 1
    fi
}

log_section "Cortex Deployment to VM 310 via Proxmox QEMU Guest Agent"

# Test guest agent
log_info "Testing QEMU Guest Agent..."
AGENT_INFO=$(curl -s -k -H "Authorization: ${AUTH_HEADER}" \
    "${BASE_URL}/nodes/${PROXMOX_NODE}/qemu/${VMID}/agent/info")

if echo "$AGENT_INFO" | grep -q '"data"'; then
    log_info "✅ Guest agent is responsive!"
else
    log_error "❌ Guest agent not available"
    exit 1
fi

# Deploy Cortex using direct kubectl commands
log_section "Deploying Cortex to K3s Cluster"

log_info "Step 1: Apply Cortex deployment manifest"
if exec_and_wait "Applying manifest..." \
    /usr/local/bin/kubectl apply -f https://raw.githubusercontent.com/ry-ops/cortex/docker-container/k8s/cortex-complete-deployment.yaml; then
    log_info "✅ Manifest applied"
else
    log_error "❌ Failed to apply manifest"
    exit 1
fi

log_info "Step 2: Create cortex-credentials secret"

# Create the secret using kubectl - break it into parts to avoid quoting issues
SECRET_CMD='kubectl create secret generic cortex-credentials --namespace=cortex-system --from-literal=anthropic-api-key="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" --from-literal=github-token="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" --dry-run=client -o yaml | kubectl apply -f -'

if exec_and_wait "Creating secrets..." /bin/bash -c "$SECRET_CMD"; then
    log_info "✅ Secrets created"
else
    log_warn "⚠️  Secrets may already exist (this is OK)"
fi

log_info "Waiting 15 seconds for pods to initialize..."
sleep 15

log_section "Verifying Deployment"

log_info "Checking pods in cortex-system namespace:"
exec_and_wait "Getting pods..." /usr/local/bin/kubectl get pods -n cortex-system -o wide || true

echo ""
log_info "Checking services in cortex-system namespace:"
exec_and_wait "Getting services..." /usr/local/bin/kubectl get svc -n cortex-system || true

echo ""
log_info "Checking deployment status:"
exec_and_wait "Getting deployments..." /usr/local/bin/kubectl get deployments -n cortex-system || true

log_section "✅ Cortex Deployment Complete!"

echo ""
echo "To get the dashboard URL, run one of:"
echo "  kubectl get svc -n cortex-system dashboard-service"
echo "  kubectl get ingress -n cortex-system"
echo ""
echo "Or access via NodePort on the K3s master node IP"
echo ""

exit 0
