#!/bin/bash
# Deploy Wazuh Agent to VM via SSH
# Security Master - Wazuh Agent Deployment Script (SSH Method)

set -euo pipefail

# Usage function
usage() {
    echo "Usage: $0 <vmid> <vm_name> <vm_ip> [ssh_user]"
    echo "Example: $0 310 k3s-master-vm 10.88.145.180 root"
    exit 1
}

# Check arguments
if [ $# -lt 3 ]; then
    usage
fi

VMID="$1"
VM_NAME="$2"
VM_IP="$3"
SSH_USER="${4:-root}"

# Wazuh Manager configuration
WAZUH_MANAGER_IP="10.88.145.181"
WAZUH_MANAGER_PORT="31514"
WAZUH_VERSION="4.7.1"
AGENT_NAME="${VM_NAME}-vm${VMID}"

# SSH options
SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10 -o BatchMode=yes"

echo "========================================="
echo "Deploying Wazuh Agent to VM ${VMID}"
echo "========================================="
echo "VM Name: ${VM_NAME}"
echo "VM IP: ${VM_IP}"
echo "SSH User: ${SSH_USER}"
echo "Agent Name: ${AGENT_NAME}"
echo "Wazuh Manager: ${WAZUH_MANAGER_IP}:${WAZUH_MANAGER_PORT}"
echo ""

# Test SSH connectivity
echo "Testing SSH connectivity..."
if ! ssh ${SSH_OPTS} ${SSH_USER}@${VM_IP} "echo 'SSH connection successful'" 2>/dev/null; then
    echo "ERROR: Cannot connect to ${VM_IP} via SSH"
    echo "Possible issues:"
    echo "  - VM is not accessible on the network"
    echo "  - SSH service is not running"
    echo "  - SSH key authentication is not configured"
    echo ""
    exit 1
fi

echo "SSH connection successful!"
echo ""

# Create deployment script
DEPLOY_SCRIPT=$(cat <<'EOFSCRIPT'
#!/bin/bash
set -e

echo "Installing Wazuh Agent..."

# Check if agent is already installed
if systemctl is-active --quiet wazuh-agent 2>/dev/null; then
    echo "Wazuh agent is already running. Stopping for reconfiguration..."
    systemctl stop wazuh-agent
fi

# Download Wazuh agent package
echo "Downloading Wazuh agent package..."
curl -s https://packages.wazuh.com/4.x/apt/pool/main/w/wazuh-agent/wazuh-agent_4.7.1-1_amd64.deb -o /tmp/wazuh-agent.deb

# Install the package
echo "Installing Wazuh agent..."
DEBIAN_FRONTEND=noninteractive dpkg -i /tmp/wazuh-agent.deb 2>/dev/null || apt-get install -f -y >/dev/null 2>&1

# Configure Wazuh agent
echo "Configuring Wazuh agent..."
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
echo "Setting agent name to: AGENT_NAME"
echo "AGENT_NAME" > /var/ossec/etc/agent-name

# Enable and start the service
echo "Starting Wazuh agent service..."
systemctl daemon-reload
systemctl enable wazuh-agent >/dev/null 2>&1
systemctl restart wazuh-agent

# Wait for service to start
sleep 5

# Check status
if systemctl is-active --quiet wazuh-agent; then
    echo "SUCCESS: Wazuh agent is running!"
    echo "Agent Name: AGENT_NAME"
    echo "Manager: WAZUH_MANAGER_IP:WAZUH_MANAGER_PORT"
    exit 0
else
    echo "ERROR: Wazuh agent failed to start"
    systemctl status wazuh-agent --no-pager || true
    exit 1
fi
EOFSCRIPT
)

# Replace placeholders in the script
DEPLOY_SCRIPT="${DEPLOY_SCRIPT//WAZUH_MANAGER_IP/$WAZUH_MANAGER_IP}"
DEPLOY_SCRIPT="${DEPLOY_SCRIPT//WAZUH_MANAGER_PORT/$WAZUH_MANAGER_PORT}"
DEPLOY_SCRIPT="${DEPLOY_SCRIPT//AGENT_NAME/$AGENT_NAME}"

echo "Deploying Wazuh agent via SSH..."

# Copy and execute the deployment script
echo "$DEPLOY_SCRIPT" | ssh ${SSH_OPTS} ${SSH_USER}@${VM_IP} "cat > /tmp/wazuh-install.sh && chmod +x /tmp/wazuh-install.sh && bash /tmp/wazuh-install.sh"

EXITCODE=$?

echo ""
if [ "$EXITCODE" = "0" ]; then
    echo "========================================="
    echo "SUCCESS: Wazuh agent deployed to VM ${VMID}"
    echo "========================================="
    echo "VM Name: ${VM_NAME}"
    echo "VM IP: ${VM_IP}"
    echo "Agent Name: ${AGENT_NAME}"
    echo "Manager: ${WAZUH_MANAGER_IP}:${WAZUH_MANAGER_PORT}"
    echo ""
    exit 0
else
    echo "========================================="
    echo "ERROR: Deployment failed on VM ${VMID}"
    echo "========================================="
    echo "Exit code: ${EXITCODE}"
    echo ""
    exit 1
fi
