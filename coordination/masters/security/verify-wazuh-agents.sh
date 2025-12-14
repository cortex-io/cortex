#!/bin/bash
# Verify Wazuh Agent Deployments
# Security Master - Verification Script

set -e

WAZUH_MANAGER_IP="10.88.145.181"
WAZUH_MANAGER_PORT="55000"
WAZUH_MANAGER_USER="${WAZUH_USER:-admin}"
WAZUH_MANAGER_PASS="${WAZUH_PASS:-SecurePass}"

echo "========================================="
echo "Wazuh Agent Verification"
echo "========================================="
echo "Manager: ${WAZUH_MANAGER_IP}:${WAZUH_MANAGER_PORT}"
echo ""

# Query all agents
echo "Querying registered agents..."
echo ""

AGENTS=$(curl -k -s -u "${WAZUH_MANAGER_USER}:${WAZUH_MANAGER_PASS}" \
    "https://${WAZUH_MANAGER_IP}:${WAZUH_MANAGER_PORT}/agents?pretty=true&limit=100")

if echo "$AGENTS" | jq -e '.data.total_affected_items' >/dev/null 2>&1; then
    TOTAL=$(echo "$AGENTS" | jq -r '.data.total_affected_items')
    echo "Total agents registered: ${TOTAL}"
    echo ""

    if [ "$TOTAL" -gt 0 ]; then
        echo "Agent Details:"
        echo "$AGENTS" | jq -r '.data.affected_items[] | "  [\(.id)] \(.name) - \(.ip) - Status: \(.status)"'
    fi
else
    echo "ERROR: Failed to query agents"
    echo "$AGENTS"
    exit 1
fi

echo ""
echo "Verification complete!"
