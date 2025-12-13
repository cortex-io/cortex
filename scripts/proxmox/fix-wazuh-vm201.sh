#!/bin/bash
# Cortex: Fix Wazuh Dashboard on VM 201 via Proxmox pve01

set -e

PROXMOX_HOST="10.88.140.164"
PROXMOX_PORT="8006"
PROXMOX_NODE="pve01"
PROXMOX_TOKEN="root@pam!n8n=b8cc165f-0153-43bb-a48a-5d7459587ca7"
WAZUH_VMID="201"

API_BASE="https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json"

echo "🚀 Cortex: Connecting to Proxmox pve01..."
echo "Target: VM ${WAZUH_VMID} (Wazuh Server)"
echo ""

# Function to call Proxmox API
api_call() {
    local method=$1
    local endpoint=$2
    local data=${3:-}

    if [ -n "$data" ]; then
        curl -k -s -X "$method" \
            -H "Authorization: PVEAPIToken=${PROXMOX_TOKEN}" \
            -H "Content-Type: application/x-www-form-urlencoded" \
            -d "$data" \
            "${API_BASE}${endpoint}"
    else
        curl -k -s -X "$method" \
            -H "Authorization: PVEAPIToken=${PROXMOX_TOKEN}" \
            "${API_BASE}${endpoint}"
    fi
}

# Check VM status
echo "📊 Checking VM ${WAZUH_VMID} status..."
VM_STATUS=$(api_call GET "/nodes/${PROXMOX_NODE}/qemu/${WAZUH_VMID}/status/current" | jq -r '.data.status // "unknown"')
echo "VM Status: ${VM_STATUS}"
echo ""

if [ "$VM_STATUS" != "running" ]; then
    echo "❌ VM ${WAZUH_VMID} is not running. Please start it first."
    exit 1
fi

# Get VM config to check if QEMU agent is available
echo "🔍 Checking QEMU agent availability..."
AGENT_STATUS=$(api_call GET "/nodes/${PROXMOX_NODE}/qemu/${WAZUH_VMID}/agent/ping" 2>/dev/null | jq -r '.data // "unavailable"')

if [ "$AGENT_STATUS" = "unavailable" ]; then
    echo "⚠️  QEMU agent not available on VM ${WAZUH_VMID}"
    echo ""
    echo "📋 Please use the Proxmox console instead:"
    echo "   1. Open https://${PROXMOX_HOST}:${PROXMOX_PORT}"
    echo "   2. Navigate to VM ${WAZUH_VMID}"
    echo "   3. Click 'Console'"
    echo "   4. Run the commands from the script below"
    echo ""
else
    echo "✅ QEMU agent available"
    echo ""
    echo "🔧 Executing Wazuh dashboard fix on VM ${WAZUH_VMID}..."

    # Execute the fix via QEMU agent
    FIX_SCRIPT='
    if [ -f /etc/debian_version ]; then
        apt-get update -qq && apt-get install -y wazuh-dashboard=4.14.1-1
    elif [ -f /etc/redhat-release ]; then
        yum clean all -q && yum install -y wazuh-dashboard-4.14.1-1
    fi
    systemctl restart wazuh-dashboard
    sleep 5
    systemctl is-active wazuh-dashboard
    '

    COMMAND_DATA="command=$(echo "$FIX_SCRIPT" | jq -sRr @uri)"
    RESULT=$(api_call POST "/nodes/${PROXMOX_NODE}/qemu/${WAZUH_VMID}/agent/exec" "$COMMAND_DATA")

    echo "✅ Fix executed on VM ${WAZUH_VMID}"
    echo "$RESULT" | jq '.'
fi

echo ""
echo "✅ Cortex task complete!"
