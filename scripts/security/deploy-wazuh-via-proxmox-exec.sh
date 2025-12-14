#!/bin/bash
# Deploy Wazuh Agent via Proxmox Task Execution
# Security Master - Wazuh Agent Deployment Script (Proxmox Exec Method)
# This uses Proxmox's task execution API to run commands directly

set -euo pipefail

# Usage function
usage() {
    echo "Usage: $0 <vmid> <vm_name> <vm_ip>"
    echo "Example: $0 310 k3s-master-vm 10.88.145.180"
    exit 1
}

# Check arguments
if [ $# -ne 3 ]; then
    usage
fi

VMID="$1"
VM_NAME="$2"
VM_IP="$3"

# Wazuh Manager configuration
WAZUH_MANAGER_IP="10.88.145.181"
WAZUH_MANAGER_PORT="31514"
WAZUH_VERSION="4.7.1"
AGENT_NAME="${VM_NAME}-vm${VMID}"

# Load environment variables
if [ -f "/Users/ryandahlberg/Projects/cortex/.env" ]; then
    source "/Users/ryandahlberg/Projects/cortex/.env"
else
    echo "ERROR: .env file not found"
    exit 1
fi

echo "========================================="
echo "Deploying Wazuh Agent to VM ${VMID}"
echo "========================================="
echo "VM Name: ${VM_NAME}"
echo "VM IP: ${VM_IP}"
echo "Agent Name: ${AGENT_NAME}"
echo "Wazuh Manager: ${WAZUH_MANAGER_IP}:${WAZUH_MANAGER_PORT}"
echo ""

# Create the Wazuh installation script
INSTALL_SCRIPT="#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive

# Check if already installed
if systemctl is-active --quiet wazuh-agent 2>/dev/null; then
    echo 'Wazuh agent already running. Reconfiguring...'
    systemctl stop wazuh-agent
fi

# Download and install
echo 'Downloading Wazuh agent...'
curl -so /tmp/wazuh-agent.deb https://packages.wazuh.com/4.x/apt/pool/main/w/wazuh-agent/wazuh-agent_${WAZUH_VERSION}-1_amd64.deb

echo 'Installing Wazuh agent...'
dpkg -i /tmp/wazuh-agent.deb 2>/dev/null || apt-get install -f -y >/dev/null 2>&1

# Configure
echo 'Configuring Wazuh agent...'
cat > /var/ossec/etc/ossec.conf <<'OSSECEOF'
<ossec_config>
  <client>
    <server>
      <address>${WAZUH_MANAGER_IP}</address>
      <port>${WAZUH_MANAGER_PORT}</port>
      <protocol>tcp</protocol>
    </server>
    <config-profile>debian, debian10</config-profile>
    <notify_time>10</notify_time>
    <time-reconnect>60</time-reconnect>
    <auto_restart>yes</auto_restart>
  </client>
  <client_buffer>
    <disabled>no</disabled>
    <queue_size>5000</queue_size>
    <events_per_second>500</events_per_second>
  </client_buffer>
  <logging>
    <log_format>plain</log_format>
  </logging>
</ossec_config>
OSSECEOF

# Set agent name
echo '${AGENT_NAME}' > /var/ossec/etc/agent-name

# Start service
echo 'Starting Wazuh agent...'
systemctl daemon-reload
systemctl enable wazuh-agent
systemctl restart wazuh-agent

sleep 5

if systemctl is-active --quiet wazuh-agent; then
    echo 'SUCCESS: Wazuh agent is running'
    exit 0
else
    echo 'ERROR: Wazuh agent failed to start'
    exit 1
fi
"

# Save script to temp file
TEMP_SCRIPT="/tmp/wazuh-install-${VMID}.sh"
echo "$INSTALL_SCRIPT" > "$TEMP_SCRIPT"

echo "Step 1: Creating installation task via Proxmox API..."

# Use Proxmox's vzdump feature to run a command (requires working network)
# Alternative: use the snapshot/exec feature
# Try using cloud-init if available

# First, let's try to check if the VM has cloud-init
VM_CONFIG=$(curl -k -s \
    -H "Authorization: PVEAPIToken=${PROXMOX_TOKEN}" \
    "${PROXMOX_API_BASE}/nodes/${PROXMOX_NODE}/qemu/${VMID}/config")

echo "VM Configuration retrieved"

# For now, let's create a script that can be manually executed
# or we need to use SSH with password auth

echo ""
echo "========================================="
echo "MANUAL DEPLOYMENT REQUIRED"
echo "========================================="
echo ""
echo "The Proxmox QEMU guest agent is not available and SSH key auth is not configured."
echo ""
echo "Please run the following command on VM ${VMID} (${VM_NAME}) at ${VM_IP}:"
echo ""
echo "bash <(cat <<'EOFINSTALL'"
echo "$INSTALL_SCRIPT"
echo "EOFINSTALL"
echo ")"
echo ""
echo "Or save this to a file and execute it:"
echo "  ${TEMP_SCRIPT}"
echo ""

# Let's try one more approach - using Proxmox's direct console execute
# This requires the VM to have a serial console configured

echo "Attempting automated deployment via Proxmox..."
echo ""

# Create a one-liner version of the install script
ONELINER=$(echo "$INSTALL_SCRIPT" | sed 's/"/\\"/g' | tr '\n' ' ' | sed 's/  */ /g')

# Try to execute via the Proxmox API (this may not work without guest agent)
TASK_RESULT=$(curl -k -s \
    -H "Authorization: PVEAPIToken=${PROXMOX_TOKEN}" \
    -X POST \
    "${PROXMOX_API_BASE}/nodes/${PROXMOX_NODE}/qemu/${VMID}/exec" \
    --data-urlencode "command=${ONELINER}" 2>&1 || echo "FAILED")

if echo "$TASK_RESULT" | grep -q "data"; then
    echo "Task submitted successfully"
    echo "$TASK_RESULT" | jq
else
    echo "Failed to submit task via Proxmox API"
    echo "Result: $TASK_RESULT"
    echo ""
    echo "Manual deployment required - see instructions above"
    exit 1
fi
