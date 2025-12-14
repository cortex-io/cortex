#!/bin/bash
# Deploy Wazuh Agents to All Infrastructure VMs via SSH
# Security Master - Mass Deployment Script (SSH Method)

set -euo pipefail

SCRIPT_DIR="/Users/ryandahlberg/Projects/cortex/scripts/security"
LOG_DIR="/Users/ryandahlberg/Projects/cortex/coordination/masters/security/logs"
TIMESTAMP=$(date -u +%Y%m%d-%H%M%S)
DEPLOYMENT_LOG="${LOG_DIR}/wazuh-ssh-deployment-${TIMESTAMP}.log"

# Create log directory
mkdir -p "$LOG_DIR"

echo "=========================================" | tee -a "$DEPLOYMENT_LOG"
echo "Wazuh Agent Mass Deployment (SSH)" | tee -a "$DEPLOYMENT_LOG"
echo "=========================================" | tee -a "$DEPLOYMENT_LOG"
echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)" | tee -a "$DEPLOYMENT_LOG"
echo "Log: ${DEPLOYMENT_LOG}" | tee -a "$DEPLOYMENT_LOG"
echo "" | tee -a "$DEPLOYMENT_LOG"

# Define all VMs to deploy to
# Format: "VMID VM_NAME VM_IP SSH_USER"
declare -a VMS=(
    # K3s Cluster (VLAN 145)
    "310 k3s-master-vm 10.88.145.180 root"
    "311 k3s-worker-1-vm 10.88.145.181 root"
    "312 k3s-worker-2-vm 10.88.145.182 root"

    # Kali Sentinel Forge (VLAN 150)
    "900 red-kali-server 10.88.150.2 root"
    "901 blue-kali-server 10.88.150.3 root"
    "902 purple-kali-server 10.88.150.4 root"
    "903 green-kali-server 10.88.150.5 root"

    # Infrastructure
    "200 claude-code-agent 10.88.140.200 root"
)

TOTAL_VMS=${#VMS[@]}
SUCCESS_COUNT=0
FAILED_COUNT=0

echo "Total VMs to deploy: ${TOTAL_VMS}" | tee -a "$DEPLOYMENT_LOG"
echo "" | tee -a "$DEPLOYMENT_LOG"

# Array to store background process IDs
declare -a PIDS=()
declare -a VM_IDS=()

# Deploy to all VMs in parallel
for vm_config in "${VMS[@]}"; do
    read -r VMID VM_NAME VM_IP SSH_USER <<< "$vm_config"

    echo "Starting deployment to VM ${VMID} (${VM_NAME}) at ${VM_IP}..." | tee -a "$DEPLOYMENT_LOG"

    # Run deployment in background
    {
        "${SCRIPT_DIR}/deploy-wazuh-agent-ssh.sh" "$VMID" "$VM_NAME" "$VM_IP" "$SSH_USER" \
            > "${LOG_DIR}/deploy-ssh-${VMID}-${TIMESTAMP}.log" 2>&1
        echo $? > "${LOG_DIR}/deploy-ssh-${VMID}-${TIMESTAMP}.exitcode"
    } &

    PIDS+=($!)
    VM_IDS+=("$VMID:$VM_NAME")
done

echo "" | tee -a "$DEPLOYMENT_LOG"
echo "All deployment processes started. Waiting for completion..." | tee -a "$DEPLOYMENT_LOG"
echo "" | tee -a "$DEPLOYMENT_LOG"

# Wait for all background processes to complete
for i in "${!PIDS[@]}"; do
    PID="${PIDS[$i]}"
    VM_INFO="${VM_IDS[$i]}"

    wait "$PID" || true

    VMID="${VM_INFO%%:*}"
    VM_NAME="${VM_INFO#*:}"

    # Read exit code
    EXITCODE=$(cat "${LOG_DIR}/deploy-ssh-${VMID}-${TIMESTAMP}.exitcode" 2>/dev/null || echo "1")

    if [ "$EXITCODE" = "0" ]; then
        echo "✓ VM ${VMID} (${VM_NAME}): SUCCESS" | tee -a "$DEPLOYMENT_LOG"
        ((SUCCESS_COUNT++))
    else
        echo "✗ VM ${VMID} (${VM_NAME}): FAILED (exit code: ${EXITCODE})" | tee -a "$DEPLOYMENT_LOG"
        ((FAILED_COUNT++))
    fi
done

echo "" | tee -a "$DEPLOYMENT_LOG"
echo "=========================================" | tee -a "$DEPLOYMENT_LOG"
echo "Deployment Summary" | tee -a "$DEPLOYMENT_LOG"
echo "=========================================" | tee -a "$DEPLOYMENT_LOG"
echo "Total VMs: ${TOTAL_VMS}" | tee -a "$DEPLOYMENT_LOG"
echo "Successful: ${SUCCESS_COUNT}" | tee -a "$DEPLOYMENT_LOG"
echo "Failed: ${FAILED_COUNT}" | tee -a "$DEPLOYMENT_LOG"

# Calculate success rate (macOS compatible)
if [ "$TOTAL_VMS" -gt 0 ]; then
    SUCCESS_RATE=$((SUCCESS_COUNT * 100 / TOTAL_VMS))
    echo "Success Rate: ${SUCCESS_RATE}%" | tee -a "$DEPLOYMENT_LOG"
fi

echo "" | tee -a "$DEPLOYMENT_LOG"

if [ "$FAILED_COUNT" -eq 0 ]; then
    echo "Status: ALL DEPLOYMENTS SUCCESSFUL" | tee -a "$DEPLOYMENT_LOG"
    echo "" | tee -a "$DEPLOYMENT_LOG"

    # Create success marker
    touch "${LOG_DIR}/deployment-ssh-${TIMESTAMP}.success"

    echo "Detailed logs available at:" | tee -a "$DEPLOYMENT_LOG"
    echo "  ${LOG_DIR}/deploy-ssh-*-${TIMESTAMP}.log" | tee -a "$DEPLOYMENT_LOG"
    echo "" | tee -a "$DEPLOYMENT_LOG"

    exit 0
else
    echo "Status: SOME DEPLOYMENTS FAILED" | tee -a "$DEPLOYMENT_LOG"
    echo "" | tee -a "$DEPLOYMENT_LOG"
    echo "Check individual logs in: ${LOG_DIR}" | tee -a "$DEPLOYMENT_LOG"

    # List failed deployments
    echo "" | tee -a "$DEPLOYMENT_LOG"
    echo "Failed deployments:" | tee -a "$DEPLOYMENT_LOG"
    for vm_config in "${VMS[@]}"; do
        read -r VMID VM_NAME VM_IP SSH_USER <<< "$vm_config"
        EXITCODE=$(cat "${LOG_DIR}/deploy-ssh-${VMID}-${TIMESTAMP}.exitcode" 2>/dev/null || echo "1")
        if [ "$EXITCODE" != "0" ]; then
            echo "  - VM ${VMID} (${VM_NAME}): ${LOG_DIR}/deploy-ssh-${VMID}-${TIMESTAMP}.log" | tee -a "$DEPLOYMENT_LOG"
        fi
    done

    exit 1
fi
