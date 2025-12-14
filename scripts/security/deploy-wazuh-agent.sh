#!/bin/bash
# Deploy Wazuh Agent to VM via Proxmox API
# Security Master - Wazuh Agent Deployment Script

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

# Create deployment script for the VM
DEPLOY_SCRIPT=$(cat <<'EOFSCRIPT'
#!/bin/bash
set -e

echo "Installing Wazuh Agent..."

# Download Wazuh agent package
curl -s https://packages.wazuh.com/4.x/apt/pool/main/w/wazuh-agent/wazuh-agent_4.7.1-1_amd64.deb -o /tmp/wazuh-agent.deb

# Install the package
DEBIAN_FRONTEND=noninteractive dpkg -i /tmp/wazuh-agent.deb || apt-get install -f -y

# Configure Wazuh agent
cat > /var/ossec/etc/ossec.conf <<'EOF'
<ossec_config>
  <client>
    <server>
      <address>WAZUH_MANAGER_IP</address>
      <port>WAZUH_MANAGER_PORT</port>
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
EOF

# Set agent name
echo "AGENT_NAME" > /var/ossec/etc/agent-name

# Enable and start the service
systemctl daemon-reload
systemctl enable wazuh-agent
systemctl restart wazuh-agent

# Wait for service to start
sleep 5

# Check status
systemctl status wazuh-agent --no-pager || true

echo "Wazuh agent installation complete!"
echo "Agent Name: AGENT_NAME"
echo "Manager: WAZUH_MANAGER_IP:WAZUH_MANAGER_PORT"

# Check connection
if systemctl is-active --quiet wazuh-agent; then
    echo "Status: Running"
else
    echo "Status: Failed to start"
    exit 1
fi
EOFSCRIPT
)

# Replace placeholders in the script
DEPLOY_SCRIPT="${DEPLOY_SCRIPT//WAZUH_MANAGER_IP/$WAZUH_MANAGER_IP}"
DEPLOY_SCRIPT="${DEPLOY_SCRIPT//WAZUH_MANAGER_PORT/$WAZUH_MANAGER_PORT}"
DEPLOY_SCRIPT="${DEPLOY_SCRIPT//AGENT_NAME/$AGENT_NAME}"

# Save script to temp file
TEMP_SCRIPT="/tmp/wazuh-deploy-${VMID}.sh"
echo "$DEPLOY_SCRIPT" > "$TEMP_SCRIPT"

echo "Deploying via Proxmox API..."
echo "Step 1: Uploading deployment script to VM..."

# Execute the deployment script on the VM via Proxmox API
curl -k -s \
    -H "Authorization: PVEAPIToken=${PROXMOX_TOKEN}" \
    -X POST \
    "${PROXMOX_API_BASE}/nodes/${PROXMOX_NODE}/qemu/${VMID}/agent/exec" \
    -d "command=[\"bash\",\"-c\",\"cat > /tmp/wazuh-install.sh && chmod +x /tmp/wazuh-install.sh\"]" \
    --data-urlencode "input-data@${TEMP_SCRIPT}" > /tmp/upload-result-${VMID}.json

UPLOAD_PID=$(jq -r '.data.pid' /tmp/upload-result-${VMID}.json)
echo "Upload PID: ${UPLOAD_PID}"

# Wait for upload to complete
sleep 2

echo "Step 2: Executing installation script..."

# Execute the installation script
EXEC_RESULT=$(curl -k -s \
    -H "Authorization: PVEAPIToken=${PROXMOX_TOKEN}" \
    -X POST \
    "${PROXMOX_API_BASE}/nodes/${PROXMOX_NODE}/qemu/${VMID}/agent/exec" \
    -d 'command=["bash","/tmp/wazuh-install.sh"]')

EXEC_PID=$(echo "$EXEC_RESULT" | jq -r '.data.pid')
echo "Execution PID: ${EXEC_PID}"

# Wait for installation to complete
echo "Waiting for installation to complete..."
sleep 15

# Get execution status
echo "Step 3: Checking installation status..."
STATUS_RESULT=$(curl -k -s \
    -H "Authorization: PVEAPIToken=${PROXMOX_TOKEN}" \
    "${PROXMOX_API_BASE}/nodes/${PROXMOX_NODE}/qemu/${VMID}/agent/exec-status?pid=${EXEC_PID}")

echo "Installation result:"
echo "$STATUS_RESULT" | jq -r '.data | "Exit Code: \(.exitcode)\nOutput:\n\(.outdata)"'

EXITCODE=$(echo "$STATUS_RESULT" | jq -r '.data.exitcode')

# Cleanup temp files
rm -f "$TEMP_SCRIPT" /tmp/upload-result-${VMID}.json

echo ""
if [ "$EXITCODE" = "0" ]; then
    echo "SUCCESS: Wazuh agent deployed to VM ${VMID} (${VM_NAME})"
    echo "Agent Name: ${AGENT_NAME}"
    echo ""
    exit 0
else
    echo "ERROR: Wazuh agent deployment failed on VM ${VMID}"
    echo "Exit code: ${EXITCODE}"
    echo ""
    exit 1
fi
