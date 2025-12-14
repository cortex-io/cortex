#!/bin/bash
# Wazuh Agent Standalone Installer
# This script can be executed directly on any target VM
# Security Master - Standalone Installation Script

set -e

# Configuration
WAZUH_MANAGER_IP="${WAZUH_MANAGER_IP:-10.88.145.181}"
WAZUH_MANAGER_PORT="${WAZUH_MANAGER_PORT:-31514}"
WAZUH_VERSION="4.7.1"

# Get VM information
HOSTNAME=$(hostname)
IP_ADDRESS=$(ip route get 1 | awk '{print $7;exit}' 2>/dev/null || echo "unknown")
AGENT_NAME="${AGENT_NAME:-${HOSTNAME}}"

echo "========================================="
echo "Wazuh Agent Standalone Installer"
echo "========================================="
echo "Host: ${HOSTNAME}"
echo "IP: ${IP_ADDRESS}"
echo "Agent Name: ${AGENT_NAME}"
echo "Wazuh Manager: ${WAZUH_MANAGER_IP}:${WAZUH_MANAGER_PORT}"
echo ""

# Check if running as root
if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: This script must be run as root"
    exit 1
fi

# Check if already installed
if systemctl is-active --quiet wazuh-agent 2>/dev/null; then
    echo "Wazuh agent is already running. Stopping for reconfiguration..."
    systemctl stop wazuh-agent
fi

# Download Wazuh agent package
echo "Downloading Wazuh agent ${WAZUH_VERSION}..."
curl -so /tmp/wazuh-agent.deb \
    "https://packages.wazuh.com/4.x/apt/pool/main/w/wazuh-agent/wazuh-agent_${WAZUH_VERSION}-1_amd64.deb"

if [ ! -f /tmp/wazuh-agent.deb ]; then
    echo "ERROR: Failed to download Wazuh agent package"
    exit 1
fi

# Install the package
echo "Installing Wazuh agent..."
export DEBIAN_FRONTEND=noninteractive
dpkg -i /tmp/wazuh-agent.deb 2>/dev/null || apt-get install -f -y >/dev/null 2>&1

# Configure Wazuh agent
echo "Configuring Wazuh agent..."
cat > /var/ossec/etc/ossec.conf <<EOF
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

  <wodle name="open-scap">
    <disabled>yes</disabled>
  </wodle>

  <wodle name="cis-cat">
    <disabled>yes</disabled>
  </wodle>

  <wodle name="syscollector">
    <disabled>no</disabled>
    <interval>1h</interval>
    <scan_on_start>yes</scan_on_start>
  </wodle>

  <wodle name="vulnerability-detector">
    <disabled>yes</disabled>
  </wodle>

  <sca>
    <enabled>yes</enabled>
    <scan_on_start>yes</scan_on_start>
    <interval>12h</interval>
    <skip_nfs>yes</skip_nfs>
  </sca>
</ossec_config>
EOF

# Set agent name
echo "Setting agent name to: ${AGENT_NAME}"
echo "${AGENT_NAME}" > /var/ossec/etc/agent-name

# Enable and start the service
echo "Starting Wazuh agent service..."
systemctl daemon-reload
systemctl enable wazuh-agent >/dev/null 2>&1
systemctl restart wazuh-agent

# Wait for service to start
sleep 5

# Check status
if systemctl is-active --quiet wazuh-agent; then
    echo ""
    echo "========================================="
    echo "SUCCESS: Wazuh Agent Installed!"
    echo "========================================="
    echo "Agent Name: ${AGENT_NAME}"
    echo "Manager: ${WAZUH_MANAGER_IP}:${WAZUH_MANAGER_PORT}"
    echo "Status: Running"
    echo ""

    # Display agent info
    echo "Agent Information:"
    /var/ossec/bin/wazuh-control info 2>/dev/null || echo "  (Agent info not available)"

    echo ""
    echo "Service Status:"
    systemctl status wazuh-agent --no-pager --lines=5 || true

    # Cleanup
    rm -f /tmp/wazuh-agent.deb

    exit 0
else
    echo ""
    echo "ERROR: Wazuh agent failed to start"
    echo ""
    systemctl status wazuh-agent --no-pager || true
    exit 1
fi
