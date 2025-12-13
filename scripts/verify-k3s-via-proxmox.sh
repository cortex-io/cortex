#!/usr/bin/env bash
################################################################################
# Cortex K3s Pod Verification via Proxmox API
# Uses Proxmox QEMU exec API to run kubectl commands on K3s VM
################################################################################

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $*"; }
log_section() { echo -e "\n${BLUE}======================================================================${NC}\n  $*\n${BLUE}======================================================================${NC}"; }

# Proxmox configuration
PROXMOX_HOST="10.88.140.164"
PROXMOX_PORT="8006"
PROXMOX_NODE="pve01"
PROXMOX_VMID="310"
API_TOKEN="root@pam!cortex-deploy=15d84996-1afe-4c00-9e5c-c6c5aa12da33"

# K3s configuration
NAMESPACE="cortex-system"
EXPECTED_PODS=5
LOADBALANCER_IP="10.88.145.201"

# Expected pods
declare -a EXPECTED_POD_NAMES=(
  "coordinator-master"
  "development-master"
  "security-master"
  "cicd-master"
  "dashboard"
)

# Function to execute command on K3s VM via Proxmox API
proxmox_exec() {
    local command="$1"

    # URL encode the command
    local encoded_command
    encoded_command=$(printf '%s' "$command" | jq -sRr @uri)

    # Execute via Proxmox API
    curl -k -s \
        -H "Authorization: PVEAPIToken=${API_TOKEN}" \
        -X POST \
        "https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json/nodes/${PROXMOX_NODE}/qemu/${PROXMOX_VMID}/agent/exec" \
        -d "command=${encoded_command}" \
        2>&1
}

# Function to get exec status
proxmox_exec_status() {
    local pid="$1"

    curl -k -s \
        -H "Authorization: PVEAPIToken=${API_TOKEN}" \
        "https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json/nodes/${PROXMOX_NODE}/qemu/${PROXMOX_VMID}/agent/exec-status?pid=${pid}" \
        2>&1
}

log_section "Cortex K3s Pod Verification via Proxmox API"

# Check Proxmox node availability
log_info "Checking Proxmox node availability..."
NODE_CHECK=$(curl -k -s -H "Authorization: PVEAPIToken=${API_TOKEN}" \
    "https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json/nodes" 2>&1)

if echo "$NODE_CHECK" | grep -q "pve01"; then
    log_success "Proxmox node 'pve01' is available"
elif echo "$NODE_CHECK" | grep -q "pve"; then
    PROXMOX_NODE="pve"
    log_success "Proxmox node 'pve' is available (adjusted node name)"
else
    log_error "Cannot find Proxmox node. Available nodes:"
    echo "$NODE_CHECK" | jq -r '.data[]?.node // empty' 2>/dev/null || echo "Failed to parse nodes"

    # Try to extract actual node name
    ACTUAL_NODE=$(echo "$NODE_CHECK" | jq -r '.data[0].node // empty' 2>/dev/null)
    if [ -n "$ACTUAL_NODE" ]; then
        PROXMOX_NODE="$ACTUAL_NODE"
        log_warn "Using detected node: $PROXMOX_NODE"
    else
        log_error "Cannot determine Proxmox node name"
        exit 1
    fi
fi

# Check VM status
log_section "Checking K3s VM Status (VMID: $PROXMOX_VMID)"
VM_STATUS=$(curl -k -s -H "Authorization: PVEAPIToken=${API_TOKEN}" \
    "https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json/nodes/${PROXMOX_NODE}/qemu/${PROXMOX_VMID}/status/current" 2>&1)

if echo "$VM_STATUS" | grep -q '"status":"running"'; then
    log_success "VM ${PROXMOX_VMID} is running"

    # Extract VM details
    VM_NAME=$(echo "$VM_STATUS" | jq -r '.data.name // "unknown"' 2>/dev/null)
    VM_CPUS=$(echo "$VM_STATUS" | jq -r '.data.cpus // "unknown"' 2>/dev/null)
    VM_MEM=$(echo "$VM_STATUS" | jq -r '.data.mem // "unknown"' 2>/dev/null)
    VM_MAXMEM=$(echo "$VM_STATUS" | jq -r '.data.maxmem // "unknown"' 2>/dev/null)

    log_info "  Name: $VM_NAME"
    log_info "  CPUs: $VM_CPUS"
    log_info "  Memory: $(numfmt --to=iec $VM_MEM 2>/dev/null || echo $VM_MEM) / $(numfmt --to=iec $VM_MAXMEM 2>/dev/null || echo $VM_MAXMEM)"
else
    log_error "VM ${PROXMOX_VMID} is not running or not found"
    echo "$VM_STATUS" | jq '.' 2>/dev/null || echo "$VM_STATUS"
    exit 1
fi

# Check QEMU guest agent
log_section "Checking QEMU Guest Agent"
AGENT_INFO=$(curl -k -s -H "Authorization: PVEAPIToken=${API_TOKEN}" \
    "https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json/nodes/${PROXMOX_NODE}/qemu/${PROXMOX_VMID}/agent/info" 2>&1)

if echo "$AGENT_INFO" | grep -q '"version"'; then
    log_success "QEMU Guest Agent is running"
else
    log_error "QEMU Guest Agent is not running - cannot execute commands remotely"
    log_info "Please ensure qemu-guest-agent is installed and running on VM $PROXMOX_VMID"
    exit 1
fi

# Get pod status
log_section "Checking Pod Status in '$NAMESPACE' Namespace"

log_info "Executing: kubectl get pods -n $NAMESPACE -o wide"

# Execute kubectl command
EXEC_RESULT=$(curl -k -s \
    -H "Authorization: PVEAPIToken=${API_TOKEN}" \
    -X POST \
    "https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json/nodes/${PROXMOX_NODE}/qemu/${PROXMOX_VMID}/agent/exec" \
    -d "command=kubectl get pods -n ${NAMESPACE} -o wide" 2>&1)

if echo "$EXEC_RESULT" | grep -q '"pid"'; then
    PID=$(echo "$EXEC_RESULT" | jq -r '.data.pid // empty' 2>/dev/null)
    log_info "Command submitted (PID: $PID)"

    # Wait for command to complete
    sleep 2

    # Get command output
    EXEC_OUTPUT=$(curl -k -s \
        -H "Authorization: PVEAPIToken=${API_TOKEN}" \
        "https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json/nodes/${PROXMOX_NODE}/qemu/${PROXMOX_VMID}/agent/exec-status?pid=${PID}" 2>&1)

    if echo "$EXEC_OUTPUT" | grep -q '"out-data"'; then
        POD_OUTPUT=$(echo "$EXEC_OUTPUT" | jq -r '.data["out-data"] // empty' 2>/dev/null | base64 -d 2>/dev/null || echo "")

        if [ -n "$POD_OUTPUT" ]; then
            echo ""
            echo "$POD_OUTPUT"
            echo ""
        else
            log_warn "No pod output received (namespace may be empty or pods not created)"
        fi
    else
        log_error "Failed to get command output"
        echo "$EXEC_OUTPUT" | jq '.' 2>/dev/null || echo "$EXEC_OUTPUT"
    fi
else
    log_error "Failed to execute kubectl command"
    echo "$EXEC_RESULT" | jq '.' 2>/dev/null || echo "$EXEC_RESULT"
fi

# Count running pods
log_section "Verifying Pod Status"

# Execute: kubectl get pods -n cortex-system --field-selector=status.phase=Running --no-headers
RUNNING_CMD=$(curl -k -s \
    -H "Authorization: PVEAPIToken=${API_TOKEN}" \
    -X POST \
    "https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json/nodes/${PROXMOX_NODE}/qemu/${PROXMOX_VMID}/agent/exec" \
    -d "command=kubectl get pods -n ${NAMESPACE} --field-selector=status.phase=Running --no-headers | wc -l" 2>&1)

if echo "$RUNNING_CMD" | grep -q '"pid"'; then
    PID=$(echo "$RUNNING_CMD" | jq -r '.data.pid // empty' 2>/dev/null)
    sleep 2

    RUNNING_OUTPUT=$(curl -k -s \
        -H "Authorization: PVEAPIToken=${API_TOKEN}" \
        "https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json/nodes/${PROXMOX_NODE}/qemu/${PROXMOX_VMID}/agent/exec-status?pid=${PID}" 2>&1)

    RUNNING_COUNT=$(echo "$RUNNING_OUTPUT" | jq -r '.data["out-data"] // empty' 2>/dev/null | base64 -d 2>/dev/null | tr -d ' \n' || echo "0")

    log_info "Running pods: ${RUNNING_COUNT}/${EXPECTED_PODS}"

    if [ "$RUNNING_COUNT" -eq "$EXPECTED_PODS" ]; then
        log_success "All $EXPECTED_PODS pods are Running!"
    elif [ "$RUNNING_COUNT" -gt 0 ]; then
        log_warn "Only $RUNNING_COUNT out of $EXPECTED_PODS pods are running"
    else
        log_error "No pods are running"
    fi
fi

# Check each expected pod
log_section "Verifying Expected Pods"
echo ""

for pod_name in "${EXPECTED_POD_NAMES[@]}"; do
    POD_CMD=$(curl -k -s \
        -H "Authorization: PVEAPIToken=${API_TOKEN}" \
        -X POST \
        "https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json/nodes/${PROXMOX_NODE}/qemu/${PROXMOX_VMID}/agent/exec" \
        -d "command=kubectl get pods -n ${NAMESPACE} -l app=${pod_name} -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo NotFound" 2>&1)

    if echo "$POD_CMD" | grep -q '"pid"'; then
        PID=$(echo "$POD_CMD" | jq -r '.data.pid // empty' 2>/dev/null)
        sleep 1

        POD_STATUS_OUTPUT=$(curl -k -s \
            -H "Authorization: PVEAPIToken=${API_TOKEN}" \
            "https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json/nodes/${PROXMOX_NODE}/qemu/${PROXMOX_VMID}/agent/exec-status?pid=${PID}" 2>&1)

        POD_STATUS=$(echo "$POD_STATUS_OUTPUT" | jq -r '.data["out-data"] // empty' 2>/dev/null | base64 -d 2>/dev/null | tr -d '\n' || echo "Unknown")

        if [ "$POD_STATUS" = "Running" ]; then
            log_success "$pod_name: $POD_STATUS"
        elif [ "$POD_STATUS" = "NotFound" ]; then
            log_error "$pod_name: Not Found"
        else
            log_warn "$pod_name: $POD_STATUS"
        fi
    fi
done

echo ""

# Check services
log_section "Checking Services"

SVC_CMD=$(curl -k -s \
    -H "Authorization: PVEAPIToken=${API_TOKEN}" \
    -X POST \
    "https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json/nodes/${PROXMOX_NODE}/qemu/${PROXMOX_VMID}/agent/exec" \
    -d "command=kubectl get services -n ${NAMESPACE} -o wide" 2>&1)

if echo "$SVC_CMD" | grep -q '"pid"'; then
    PID=$(echo "$SVC_CMD" | jq -r '.data.pid // empty' 2>/dev/null)
    sleep 2

    SVC_OUTPUT=$(curl -k -s \
        -H "Authorization: PVEAPIToken=${API_TOKEN}" \
        "https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json/nodes/${PROXMOX_NODE}/qemu/${PROXMOX_VMID}/agent/exec-status?pid=${PID}" 2>&1)

    SERVICES=$(echo "$SVC_OUTPUT" | jq -r '.data["out-data"] // empty' 2>/dev/null | base64 -d 2>/dev/null || echo "")

    if [ -n "$SERVICES" ]; then
        echo ""
        echo "$SERVICES"
        echo ""
    fi
fi

# Check LoadBalancer IP
log_section "Checking LoadBalancer Configuration"

LB_CMD=$(curl -k -s \
    -H "Authorization: PVEAPIToken=${API_TOKEN}" \
    -X POST \
    "https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json/nodes/${PROXMOX_NODE}/qemu/${PROXMOX_VMID}/agent/exec" \
    -d "command=kubectl get service dashboard -n ${NAMESPACE} -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo NotAssigned" 2>&1)

if echo "$LB_CMD" | grep -q '"pid"'; then
    PID=$(echo "$LB_CMD" | jq -r '.data.pid // empty' 2>/dev/null)
    sleep 2

    LB_OUTPUT=$(curl -k -s \
        -H "Authorization: PVEAPIToken=${API_TOKEN}" \
        "https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json/nodes/${PROXMOX_NODE}/qemu/${PROXMOX_VMID}/agent/exec-status?pid=${PID}" 2>&1)

    LB_IP=$(echo "$LB_OUTPUT" | jq -r '.data["out-data"] // empty' 2>/dev/null | base64 -d 2>/dev/null | tr -d '\n' || echo "NotAssigned")

    if [ "$LB_IP" != "NotAssigned" ] && [ -n "$LB_IP" ]; then
        log_success "LoadBalancer IP assigned: $LB_IP"

        if [ "$LB_IP" = "$LOADBALANCER_IP" ]; then
            log_success "LoadBalancer IP matches expected: $LOADBALANCER_IP"
        else
            log_warn "LoadBalancer IP differs from expected. Got: $LB_IP, Expected: $LOADBALANCER_IP"
        fi
    else
        log_warn "LoadBalancer IP not yet assigned"
    fi
fi

# Test dashboard accessibility (from local machine)
log_section "Testing Dashboard Accessibility"

if command -v curl >/dev/null 2>&1; then
    if curl -s --connect-timeout 5 "http://${LOADBALANCER_IP}" >/dev/null 2>&1; then
        log_success "Dashboard is accessible at http://${LOADBALANCER_IP}"
    else
        log_warn "Dashboard is not accessible at http://${LOADBALANCER_IP}"
        log_info "This may be due to network routing or the service not being ready yet"
    fi
else
    log_warn "curl not available - skipping dashboard accessibility test"
fi

# Generate deployment verification report
log_section "Generating Deployment Verification Report"

REPORT_FILE="/Users/ryandahlberg/Projects/cortex/coordination/k3s-deployment-verification-$(date +%Y%m%d-%H%M%S).json"

cat > "$REPORT_FILE" <<EOF
{
  "verification_id": "k3s-verify-$(date +%Y%m%d-%H%M%S)",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "proxmox": {
    "host": "$PROXMOX_HOST",
    "node": "$PROXMOX_NODE",
    "vmid": "$PROXMOX_VMID",
    "vm_name": "$VM_NAME",
    "vm_status": "running"
  },
  "k3s_cluster": {
    "namespace": "$NAMESPACE",
    "expected_pods": $EXPECTED_PODS,
    "running_pods": ${RUNNING_COUNT:-0},
    "loadbalancer_ip": "${LB_IP:-NotAssigned}",
    "expected_loadbalancer_ip": "$LOADBALANCER_IP"
  },
  "pod_verification": {
    "coordinator_master": "$(kubectl get pods -n $NAMESPACE -l app=coordinator-master -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo 'Unknown')",
    "development_master": "$(kubectl get pods -n $NAMESPACE -l app=development-master -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo 'Unknown')",
    "security_master": "$(kubectl get pods -n $NAMESPACE -l app=security-master -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo 'Unknown')",
    "cicd_master": "$(kubectl get pods -n $NAMESPACE -l app=cicd-master -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo 'Unknown')",
    "dashboard": "$(kubectl get pods -n $NAMESPACE -l app=dashboard -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo 'Unknown')"
  },
  "verification_method": "proxmox_api_qemu_exec",
  "status": "$([ ${RUNNING_COUNT:-0} -eq $EXPECTED_PODS ] && echo 'complete' || echo 'partial')"
}
EOF

log_success "Verification report saved to: $REPORT_FILE"

# Overall status
log_section "Deployment Verification Summary"
echo ""

if [ "${RUNNING_COUNT:-0}" -eq "$EXPECTED_PODS" ]; then
    log_success "ALL PODS ARE RUNNING SUCCESSFULLY!"
    log_success "Deployment Status: COMPLETE"
    exit 0
elif [ "${RUNNING_COUNT:-0}" -gt 0 ]; then
    log_warn "PARTIAL DEPLOYMENT"
    log_warn "${RUNNING_COUNT:-0} out of $EXPECTED_PODS pods are running"
    log_info "Waiting for remaining pods to start..."
    exit 2
else
    log_error "NO PODS ARE RUNNING"
    log_error "Deployment Status: FAILED"
    log_info "Check that manifests were applied and images are available in GHCR"
    exit 1
fi
