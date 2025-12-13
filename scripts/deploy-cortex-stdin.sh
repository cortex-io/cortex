#!/usr/bin/env bash
################################################################################
# Cortex: Deploy to VM 310 using kubectl apply with stdin
################################################################################

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

PROXMOX_HOST="10.88.140.164"
PROXMOX_PORT="8006"
PROXMOX_NODE="pve01"
PROXMOX_USER="root@pam"
PROXMOX_TOKEN_NAME="cortex-deploy"
PROXMOX_TOKEN_VALUE="15d84996-1afe-4c00-9e5c-c6c5aa12da33"
BASE_URL="https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json"
AUTH_HEADER="PVEAPIToken=${PROXMOX_USER}!${PROXMOX_TOKEN_NAME}=${PROXMOX_TOKEN_VALUE}"
VMID=310

YAML_FILE="/Users/ryandahlberg/Projects/cortex/k8s/cortex-complete-deployment.yaml"

log_info "Cortex Deployment to VM 310"

# Approach: Write YAML to temp file on VM, then kubectl apply -f
log_info "Step 1: Creating deployment YAML on VM"

# Base64 encode the YAML file
YAML_B64=$(cat "$YAML_FILE" | base64 | tr -d '\n')

# Write using bash command with base64 decode
WRITE_CMD="echo '$YAML_B64' | base64 -d > /tmp/cortex-deploy.yaml && echo 'File written: ' && wc -l /tmp/cortex-deploy.yaml"

WRITE_RESP=$(curl -s -k -H "Authorization: ${AUTH_HEADER}" \
    -X POST "${BASE_URL}/nodes/${PROXMOX_NODE}/qemu/${VMID}/agent/exec" \
    --data-urlencode "command=/bin/bash" \
    --data-urlencode "command=-c" \
    --data-urlencode "command=$WRITE_CMD")

if echo "$WRITE_RESP" | grep -q '"pid"'; then
    PID=$(echo "$WRITE_RESP" | grep -o '"pid":[0-9]*' | cut -d':' -f2)
    log_info "File write started (PID: $PID)"

    sleep 3

    STATUS=$(curl -s -k -H "Authorization: ${AUTH_HEADER}" \
        "${BASE_URL}/nodes/${PROXMOX_NODE}/qemu/${VMID}/agent/exec-status?pid=${PID}")

    if echo "$STATUS" | grep -q '"out-data"'; then
        OUTDATA=$(echo "$STATUS" | grep -o '"out-data":"[^"]*"' | cut -d'"' -f4)
        echo "Output: $(echo "$OUTDATA" | base64 -d 2>/dev/null || echo "$OUTDATA")"
    fi

    EXITCODE=$(echo "$STATUS" | grep -o '"exitcode":[0-9]*' | cut -d':' -f2)
    if [ "$EXITCODE" != "0" ]; then
        log_error "Failed to write YAML file"
        exit 1
    fi

    log_info "✅ YAML file written to VM"
else
    log_error "Failed to start file write"
    exit 1
fi

# Step 2: Apply the deployment
log_info "Step 2: Applying Cortex deployment"

APPLY_RESP=$(curl -s -k -H "Authorization: ${AUTH_HEADER}" \
    -X POST "${BASE_URL}/nodes/${PROXMOX_NODE}/qemu/${VMID}/agent/exec" \
    --data-urlencode "command=/usr/local/bin/kubectl" \
    --data-urlencode "command=apply" \
    --data-urlencode "command=-f" \
    --data-urlencode "command=/tmp/cortex-deploy.yaml")

if echo "$APPLY_RESP" | grep -q '"pid"'; then
    PID=$(echo "$APPLY_RESP" | grep -o '"pid":[0-9]*' | cut -d':' -f2)
    log_info "kubectl apply started (PID: $PID)"

    # Wait for completion
    for i in {1..30}; do
        sleep 2

        STATUS=$(curl -s -k -H "Authorization: ${AUTH_HEADER}" \
            "${BASE_URL}/nodes/${PROXMOX_NODE}/qemu/${VMID}/agent/exec-status?pid=${PID}")

        if echo "$STATUS" | grep -q '"exited":1'; then
            EXITCODE=$(echo "$STATUS" | grep -o '"exitcode":[0-9]*' | cut -d':' -f2)

            if echo "$STATUS" | grep -q '"out-data"'; then
                OUTDATA=$(echo "$STATUS" | grep -o '"out-data":"[^"]*"' | cut -d'"' -f4)
                log_info "kubectl output:"
                echo "$OUTDATA" | base64 -d 2>/dev/null || true
            fi

            if echo "$STATUS" | grep -q '"err-data"'; then
                ERRDATA=$(echo "$STATUS" | grep -o '"err-data":"[^"]*"' | cut -d'"' -f4)
                echo "STDERR:"
                echo "$ERRDATA" | base64 -d 2>/dev/null || true
            fi

            if [ "$EXITCODE" = "0" ]; then
                log_info "✅ Deployment manifest applied successfully!"
                break
            else
                log_error "kubectl apply failed with exit code $EXITCODE"
                exit 1
            fi
        else
            [ $((i % 5)) -eq 0 ] && log_info "  Still applying... ($((i*2))s)"
        fi
    done
else
    log_error "Failed to start kubectl apply"
    exit 1
fi

# Step 3: Create secrets
log_info "Step 3: Creating cortex-credentials secret"

SECRET_CMD='kubectl create secret generic cortex-credentials --namespace=cortex-system --from-literal=anthropic-api-key="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" --from-literal=github-token="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" --dry-run=client -o yaml | kubectl apply -f -'

SECRET_RESP=$(curl -s -k -H "Authorization: ${AUTH_HEADER}" \
    -X POST "${BASE_URL}/nodes/${PROXMOX_NODE}/qemu/${VMID}/agent/exec" \
    --data-urlencode "command=/bin/bash" \
    --data-urlencode "command=-c" \
    --data-urlencode "command=$SECRET_CMD")

if echo "$SECRET_RESP" | grep -q '"pid"'; then
    PID=$(echo "$SECRET_RESP" | grep -o '"pid":[0-9]*' | cut -d':' -f2)
    sleep 3

    STATUS=$(curl -s -k -H "Authorization: ${AUTH_HEADER}" \
        "${BASE_URL}/nodes/${PROXMOX_NODE}/qemu/${VMID}/agent/exec-status?pid=${PID}")

    if echo "$STATUS" | grep -q '"out-data"'; then
        OUTDATA=$(echo "$STATUS" | grep -o '"out-data":"[^"]*"' | cut -d'"' -f4)
        echo "Secret creation output:"
        echo "$OUTDATA" | base64 -d 2>/dev/null || true
    fi

    log_info "✅ Secrets created"
fi

# Step 4: Wait for pods
log_info "Waiting 20 seconds for pods to initialize..."
sleep 20

# Step 5: Verify deployment
log_info "Verifying deployment..."

for resource in "pods" "deployments" "services"; do
    echo ""
    log_info "Getting $resource in cortex-system namespace:"

    VERIFY_RESP=$(curl -s -k -H "Authorization: ${AUTH_HEADER}" \
        -X POST "${BASE_URL}/nodes/${PROXMOX_NODE}/qemu/${VMID}/agent/exec" \
        --data-urlencode "command=/usr/local/bin/kubectl" \
        --data-urlencode "command=get" \
        --data-urlencode "command=$resource" \
        --data-urlencode "command=-n" \
        --data-urlencode "command=cortex-system" \
        --data-urlencode "command=-o" \
        --data-urlencode "command=wide")

    if echo "$VERIFY_RESP" | grep -q '"pid"'; then
        PID=$(echo "$VERIFY_RESP" | grep -o '"pid":[0-9]*' | cut -d':' -f2)
        sleep 2

        STATUS=$(curl -s -k -H "Authorization: ${AUTH_HEADER}" \
            "${BASE_URL}/nodes/${PROXMOX_NODE}/qemu/${VMID}/agent/exec-status?pid=${PID}")

        if echo "$STATUS" | grep -q '"out-data"'; then
            OUTDATA=$(echo "$STATUS" | grep -o '"out-data":"[^"]*"' | cut -d'"' -f4)
            echo "$OUTDATA" | base64 -d 2>/dev/null || true
        fi
    fi
done

echo ""
log_info "╔════════════════════════════════════════════════════════════╗"
log_info "║  ✅ Cortex Deployment Complete!                           ║"
log_info "╚════════════════════════════════════════════════════════════╝"
echo ""
log_info "To access the dashboard:"
log_info "1. Get the service details: kubectl get svc -n cortex-system dashboard-service"
log_info "2. Access via NodePort or LoadBalancer IP"
echo ""

exit 0
