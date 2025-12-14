#!/bin/bash
#
# Test Wazuh -> n8n Integration
#

set -euo pipefail

source /Users/ryandahlberg/Projects/cortex/.env
K3S_SSH="ssh -o StrictHostKeyChecking=no root@${K3S_MASTER_IP}"

echo "Testing Wazuh -> n8n Integration..."
echo ""

# 1. Send test alert to n8n webhook directly
echo "1. Testing n8n webhook endpoint..."
WEBHOOK_TEST=$($K3S_SSH "kubectl run webhook-test-$RANDOM --image=curlimages/curl:latest --rm -i --restart=Never -- curl -X POST -H 'Content-Type: application/json' -d '{
  \"timestamp\": \"2024-01-01T12:00:00Z\",
  \"rule\": {
    \"id\": \"5710\",
    \"description\": \"Test Alert - SSH authentication success\",
    \"level\": 7,
    \"groups\": [\"authentication_success\", \"syslog\", \"sshd\"]
  },
  \"agent\": {
    \"id\": \"001\",
    \"name\": \"test-agent\",
    \"ip\": \"10.0.0.1\"
  },
  \"full_log\": \"Jan 01 12:00:00 test sshd[12345]: Accepted password for user from 10.0.0.1 port 22 ssh2\"
}' http://n8n.n8n.svc.cluster.local:5678/webhook/wazuh-alerts" 2>&1)

echo "Response: $WEBHOOK_TEST"
echo ""

# 2. Check n8n workflow executions
echo "2. Checking n8n workflow executions..."
echo "   Access n8n UI to view executions:"
echo "   kubectl port-forward -n n8n svc/n8n 5678:5678"
echo "   Then open: http://localhost:5678/workflows"
echo ""

# 3. Generate real Wazuh alert (requires agent)
echo "3. To generate a real Wazuh alert:"
echo "   a) Install Wazuh agent on a test system"
echo "   b) Trigger a security event (e.g., failed SSH login)"
echo "   c) Check Wazuh Dashboard for the alert"
echo "   d) Verify the alert appears in n8n executions"
echo ""

# 4. Check Wazuh Manager logs
echo "4. Checking Wazuh Manager logs for integration errors..."
WAZUH_POD=$($K3S_SSH "kubectl get pod -n wazuh -l app=wazuh-manager -o jsonpath='{.items[0].metadata.name}'")
echo "Pod: $WAZUH_POD"
$K3S_SSH "kubectl logs -n wazuh $WAZUH_POD --tail=50 | grep -i 'integration\|webhook\|n8n' || echo 'No integration logs found'"
echo ""

echo "Integration test complete!"
