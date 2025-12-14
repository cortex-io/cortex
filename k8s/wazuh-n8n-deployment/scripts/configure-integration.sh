#!/bin/bash
#
# Wazuh + n8n Integration Configuration Script
# Sets up webhook integration between Wazuh and n8n
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Load environment
if [ -f "/Users/ryandahlberg/Projects/cortex/.env" ]; then
    source /Users/ryandahlberg/Projects/cortex/.env
    log_info "Loaded environment variables"
else
    log_error ".env file not found"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOYMENT_DIR="$(dirname "$SCRIPT_DIR")"
K3S_SSH="ssh -o StrictHostKeyChecking=no root@${K3S_MASTER_IP}"

#############################################
# 1. CREATE N8N WEBHOOK WORKFLOW
#############################################

log_info "Step 1: Creating n8n webhook workflow for Wazuh alerts..."

# Create workflow JSON
cat > /tmp/wazuh-webhook-workflow.json <<'WORKFLOW_EOF'
{
  "name": "Wazuh Alert Handler",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "wazuh-alerts",
        "responseMode": "responseNode",
        "options": {}
      },
      "id": "webhook-node",
      "name": "Wazuh Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 1,
      "position": [250, 300],
      "webhookId": "wazuh-alerts"
    },
    {
      "parameters": {
        "conditions": {
          "string": [
            {
              "value1": "={{$json.rule.level}}",
              "operation": "largerEqual",
              "value2": "7"
            }
          ]
        }
      },
      "id": "filter-node",
      "name": "Filter High Severity",
      "type": "n8n-nodes-base.if",
      "typeVersion": 1,
      "position": [450, 300]
    },
    {
      "parameters": {
        "functionCode": "// Extract and format Wazuh alert data\nconst alert = items[0].json;\n\nreturn {\n  json: {\n    timestamp: alert.timestamp,\n    agent: {\n      id: alert.agent?.id,\n      name: alert.agent?.name,\n      ip: alert.agent?.ip\n    },\n    rule: {\n      id: alert.rule?.id,\n      description: alert.rule?.description,\n      level: alert.rule?.level,\n      groups: alert.rule?.groups\n    },\n    data: {\n      srcip: alert.data?.srcip,\n      dstip: alert.data?.dstip,\n      srcport: alert.data?.srcport,\n      dstport: alert.data?.dstport\n    },\n    full_log: alert.full_log,\n    severity: alert.rule?.level >= 12 ? 'CRITICAL' : alert.rule?.level >= 7 ? 'HIGH' : 'MEDIUM'\n  }\n};"
      },
      "id": "process-node",
      "name": "Process Alert",
      "type": "n8n-nodes-base.function",
      "typeVersion": 1,
      "position": [650, 300]
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={{ { \"status\": \"received\", \"alert_id\": $json.rule.id, \"timestamp\": $now } }}"
      },
      "id": "response-node",
      "name": "Webhook Response",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1,
      "position": [850, 300]
    }
  ],
  "connections": {
    "Wazuh Webhook": {
      "main": [
        [
          {
            "node": "Filter High Severity",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Filter High Severity": {
      "main": [
        [
          {
            "node": "Process Alert",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Process Alert": {
      "main": [
        [
          {
            "node": "Webhook Response",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  },
  "active": true,
  "settings": {},
  "versionId": "1"
}
WORKFLOW_EOF

log_info "Workflow template created. To import:"
echo "   1. Port-forward n8n: kubectl port-forward -n n8n svc/n8n 5678:5678"
echo "   2. Access n8n at http://localhost:5678"
echo "   3. Import workflow from: /tmp/wazuh-webhook-workflow.json"
echo ""
echo "   Or use n8n API (if credentials configured):"
echo "   curl -X POST http://localhost:5678/api/v1/workflows \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d @/tmp/wazuh-webhook-workflow.json"
echo ""

#############################################
# 2. CONFIGURE WAZUH INTEGRATION
#############################################

log_info "Step 2: Configuring Wazuh webhook integration..."

# Create ossec.conf integration snippet
cat > /tmp/wazuh-integration.xml <<'INTEGRATION_EOF'
<integration>
  <name>custom-webhook</name>
  <hook_url>http://n8n.n8n.svc.cluster.local:5678/webhook/wazuh-alerts</hook_url>
  <level>7</level>
  <alert_format>json</alert_format>
  <options>{"Content-Type": "application/json"}</options>
</integration>
INTEGRATION_EOF

log_info "Wazuh integration configuration created at /tmp/wazuh-integration.xml"
log_info "To apply to Wazuh Manager:"
echo ""
echo "   # Method 1: Via kubectl exec"
echo "   kubectl exec -n wazuh \$(kubectl get pod -n wazuh -l app=wazuh-manager -o jsonpath='{.items[0].metadata.name}') -- bash -c \\"
echo "     'cat >> /var/ossec/etc/ossec.conf <<EOF"
cat /tmp/wazuh-integration.xml
echo "EOF'"
echo ""
echo "   # Method 2: Create ConfigMap and mount"
echo "   kubectl create configmap -n wazuh wazuh-integration --from-file=/tmp/wazuh-integration.xml"
echo "   # Then update deployment to mount this config"
echo ""

#############################################
# 3. CREATE TESTING SCRIPT
#############################################

log_info "Step 3: Creating integration test script..."

cat > "$DEPLOYMENT_DIR/scripts/test-integration.sh" <<'TEST_EOF'
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
TEST_EOF

chmod +x "$DEPLOYMENT_DIR/scripts/test-integration.sh"
log_success "Integration test script created at $DEPLOYMENT_DIR/scripts/test-integration.sh"

#############################################
# 4. CREATE MCP TEST SCRIPT
#############################################

log_info "Step 4: Creating MCP server test script..."

cat > "$DEPLOYMENT_DIR/scripts/test-mcp-servers.sh" <<'MCP_TEST_EOF'
#!/bin/bash
#
# Test MCP Servers
#

set -euo pipefail

source /Users/ryandahlberg/Projects/cortex/.env
K3S_SSH="ssh -o StrictHostKeyChecking=no root@${K3S_MASTER_IP}"

echo "Testing MCP Servers..."
echo ""

# Test Wazuh MCP Server
echo "1. Testing Wazuh MCP Server..."
echo "   Health check:"
WAZUH_MCP_HEALTH=$($K3S_SSH "kubectl run wazuh-mcp-test-$RANDOM --image=curlimages/curl:latest --rm -i --restart=Never -- curl -s http://wazuh-mcp-server.mcp.svc.cluster.local:3000/health" 2>&1)
echo "   $WAZUH_MCP_HEALTH"
echo ""

# Test n8n MCP Server
echo "2. Testing n8n MCP Server..."
echo "   Health check:"
N8N_MCP_HEALTH=$($K3S_SSH "kubectl run n8n-mcp-test-$RANDOM --image=curlimages/curl:latest --rm -i --restart=Never -- curl -s http://n8n-mcp-server.mcp.svc.cluster.local:3001/health" 2>&1)
echo "   $N8N_MCP_HEALTH"
echo ""

# Test MCP list-tools endpoint
echo "3. Testing MCP tools endpoints..."
echo "   Wazuh MCP tools:"
$K3S_SSH "kubectl run wazuh-tools-test-$RANDOM --image=curlimages/curl:latest --rm -i --restart=Never -- curl -s http://wazuh-mcp-server.mcp.svc.cluster.local:3000/list-tools" 2>&1 || echo "   (endpoint may not be available)"
echo ""
echo "   n8n MCP tools:"
$K3S_SSH "kubectl run n8n-tools-test-$RANDOM --image=curlimages/curl:latest --rm -i --restart=Never -- curl -s http://n8n-mcp-server.mcp.svc.cluster.local:3001/list-tools" 2>&1 || echo "   (endpoint may not be available)"
echo ""

# Check MCP server logs
echo "4. Checking MCP server logs..."
echo "   Wazuh MCP Server:"
WAZUH_MCP_POD=$($K3S_SSH "kubectl get pod -n mcp -l app=wazuh-mcp-server -o jsonpath='{.items[0].metadata.name}'")
$K3S_SSH "kubectl logs -n mcp $WAZUH_MCP_POD --tail=20" 2>&1
echo ""
echo "   n8n MCP Server:"
N8N_MCP_POD=$($K3S_SSH "kubectl get pod -n mcp -l app=n8n-mcp-server -o jsonpath='{.items[0].metadata.name}'")
$K3S_SSH "kubectl logs -n mcp $N8N_MCP_POD --tail=20" 2>&1
echo ""

echo "MCP server tests complete!"
MCP_TEST_EOF

chmod +x "$DEPLOYMENT_DIR/scripts/test-mcp-servers.sh"
log_success "MCP test script created at $DEPLOYMENT_DIR/scripts/test-mcp-servers.sh"

#############################################
# 5. CREATE INTEGRATION GUIDE
#############################################

log_info "Step 5: Creating integration guide..."

cat > "$DEPLOYMENT_DIR/INTEGRATION-GUIDE.md" <<'GUIDE_EOF'
# Wazuh + n8n + MCP Integration Guide

## Overview

This guide walks through configuring and testing the complete integration between Wazuh, n8n, and MCP servers.

## Architecture

```
┌─────────────┐        ┌─────────────┐        ┌─────────────┐
│   Wazuh     │        │     n8n     │        │ MCP Servers │
│   Manager   │───────>│  Webhook    │<───────│  (Query)    │
│  (Alerts)   │ HTTP   │ (Process)   │  API   │             │
└─────────────┘        └─────────────┘        └─────────────┘
       │                      │                       │
       │                      │                       │
       v                      v                       v
  Wazuh Indexer         PostgreSQL            Wazuh API / n8n API
```

## Prerequisites

1. All pods running in wazuh, n8n, and mcp namespaces
2. kubectl access to K3s cluster
3. Network connectivity between services

## Step 1: Verify Deployment

Run the verification script:

```bash
./scripts/verify-deployment.sh
```

This checks:
- Pod status in all namespaces
- StatefulSet readiness
- Service endpoints
- Basic connectivity

Review the generated report in `verification/`.

## Step 2: Configure n8n Webhook

### Option A: Manual Configuration (Recommended for first time)

1. **Port-forward n8n:**
   ```bash
   kubectl port-forward -n n8n svc/n8n 5678:5678
   ```

2. **Access n8n UI:**
   Open http://localhost:5678 in your browser

3. **Create new workflow:**
   - Click "Add workflow"
   - Name it "Wazuh Alert Handler"

4. **Add Webhook node:**
   - Add node → Trigger → Webhook
   - HTTP Method: POST
   - Path: `wazuh-alerts`
   - Save

5. **Add Filter node:**
   - Add node → Flow → IF
   - Condition: `{{ $json.rule.level }} >= 7`

6. **Add Function node for processing:**
   - Add node → Data transformation → Function
   - Paste the code from `/tmp/wazuh-webhook-workflow.json`

7. **Activate workflow:**
   - Toggle "Active" switch

8. **Copy webhook URL:**
   The URL will be: `http://n8n.n8n.svc.cluster.local:5678/webhook/wazuh-alerts`

### Option B: Import from JSON

```bash
# Import the pre-configured workflow
cat /tmp/wazuh-webhook-workflow.json
# Copy the content and import via n8n UI
```

## Step 3: Configure Wazuh Integration

### Apply Integration Configuration

1. **Get Wazuh Manager pod name:**
   ```bash
   kubectl get pods -n wazuh -l app=wazuh-manager
   ```

2. **Edit ossec.conf:**
   ```bash
   kubectl exec -n wazuh <wazuh-manager-pod> -it -- vi /var/ossec/etc/ossec.conf
   ```

3. **Add integration block before `</ossec_config>`:**
   ```xml
   <integration>
     <name>custom-webhook</name>
     <hook_url>http://n8n.n8n.svc.cluster.local:5678/webhook/wazuh-alerts</hook_url>
     <level>7</level>
     <alert_format>json</alert_format>
   </integration>
   ```

4. **Restart Wazuh Manager:**
   ```bash
   kubectl rollout restart deployment -n wazuh wazuh-manager
   ```

5. **Verify integration loaded:**
   ```bash
   kubectl logs -n wazuh <wazuh-manager-pod> | grep -i integration
   ```

## Step 4: Test Integration

### Test 1: Direct Webhook Test

```bash
./scripts/test-integration.sh
```

This sends a test alert directly to the n8n webhook.

### Test 2: Generate Real Wazuh Alert

1. **Install Wazuh agent on a test system:**
   ```bash
   # On Ubuntu/Debian
   curl -s https://packages.wazuh.com/key/GPG-KEY-WAZUH | apt-key add -
   echo "deb https://packages.wazuh.com/4.x/apt/ stable main" > /etc/apt/sources.list.d/wazuh.list
   apt update && apt install wazuh-agent
   ```

2. **Configure agent to connect to Wazuh Manager:**
   ```bash
   # Edit /var/ossec/etc/ossec.conf
   <client>
     <server>
       <address>10.88.145.181</address>  # K3s worker1 IP
       <port>31514</port>
       <protocol>tcp</protocol>
     </server>
   </client>
   ```

3. **Start agent:**
   ```bash
   systemctl start wazuh-agent
   ```

4. **Trigger a test alert:**
   ```bash
   # Failed SSH login (generates level 5 alert)
   ssh invalid-user@localhost

   # Or trigger a higher severity alert
   # Multiple failed logins (generates level 10 alert)
   for i in {1..5}; do ssh invalid-user@localhost; done
   ```

5. **Check n8n executions:**
   - Go to n8n UI → Executions
   - Look for successful webhook executions

## Step 5: Test MCP Servers

Run the MCP test script:

```bash
./scripts/test-mcp-servers.sh
```

This tests:
- Health endpoints
- Tool listing endpoints
- MCP server logs

### Manual MCP Testing

1. **Test Wazuh MCP Server:**
   ```bash
   kubectl run curl-test --image=curlimages/curl:latest --rm -i --restart=Never -- \
     curl http://wazuh-mcp-server.mcp.svc.cluster.local:3000/health
   ```

2. **Test n8n MCP Server:**
   ```bash
   kubectl run curl-test --image=curlimages/curl:latest --rm -i --restart=Never -- \
     curl http://n8n-mcp-server.mcp.svc.cluster.local:3001/health
   ```

## Step 6: Verify End-to-End Flow

Complete verification checklist:

- [ ] Wazuh Manager is running
- [ ] n8n workflow is active
- [ ] Webhook URL is reachable from Wazuh namespace
- [ ] Test webhook receives and processes alerts
- [ ] Real Wazuh alerts trigger webhook
- [ ] n8n executions show successful processing
- [ ] MCP servers are healthy and reachable
- [ ] MCP servers can query Wazuh and n8n APIs

## Troubleshooting

### Webhook Not Receiving Alerts

1. **Check Wazuh Manager logs:**
   ```bash
   kubectl logs -n wazuh <wazuh-manager-pod> | grep -i integration
   ```

2. **Verify network connectivity:**
   ```bash
   kubectl exec -n wazuh <wazuh-manager-pod> -- curl -v http://n8n.n8n.svc.cluster.local:5678/webhook/wazuh-alerts
   ```

3. **Check n8n webhook logs:**
   ```bash
   kubectl logs -n n8n <n8n-pod> | grep webhook
   ```

### n8n Workflow Not Executing

1. **Verify workflow is active:**
   - Check n8n UI → Workflows → Active toggle

2. **Check webhook path:**
   - Must match: `/webhook/wazuh-alerts`

3. **Test webhook manually:**
   ```bash
   curl -X POST http://localhost:5678/webhook/wazuh-alerts \
     -H 'Content-Type: application/json' \
     -d '{"test": "alert"}'
   ```

### MCP Servers Not Responding

1. **Check pod status:**
   ```bash
   kubectl get pods -n mcp
   ```

2. **Check logs:**
   ```bash
   kubectl logs -n mcp <mcp-pod>
   ```

3. **Verify service endpoints:**
   ```bash
   kubectl get endpoints -n mcp
   ```

## Access URLs

### Internal (within cluster)

- **Wazuh Manager API:** http://wazuh-manager.wazuh.svc.cluster.local:55000
- **Wazuh Indexer:** https://wazuh-indexer.wazuh.svc.cluster.local:9200
- **n8n:** http://n8n.n8n.svc.cluster.local:5678
- **Wazuh MCP:** http://wazuh-mcp-server.mcp.svc.cluster.local:3000
- **n8n MCP:** http://n8n-mcp-server.mcp.svc.cluster.local:3001

### External (NodePort/Port-forward)

- **Wazuh Dashboard:** https://10.88.145.180:30561 (check with `kubectl get svc -n wazuh wazuh-dashboard`)
- **n8n:** http://localhost:5678 (via port-forward)

## Security Considerations

1. **Webhook Authentication:** Consider adding authentication to n8n webhooks
2. **HTTPS:** Use TLS for production deployments
3. **Network Policies:** Restrict traffic between namespaces
4. **Secrets Rotation:** Regularly rotate credentials in secrets

## Next Steps

1. Configure additional n8n workflows for alert processing
2. Set up notification channels (Slack, email, etc.)
3. Create custom Wazuh rules for specific security events
4. Configure RBAC for n8n access
5. Set up monitoring and alerting for the integration
6. Document custom use cases and workflows

## References

- [Wazuh Documentation](https://documentation.wazuh.com/)
- [n8n Documentation](https://docs.n8n.io/)
- [Wazuh Integration Guide](https://documentation.wazuh.com/current/user-manual/manager/manual-integration.html)
GUIDE_EOF

log_success "Integration guide created at $DEPLOYMENT_DIR/INTEGRATION-GUIDE.md"

#############################################
# FINISH
#############################################

echo ""
log_success "Integration configuration complete!"
echo ""
echo "Files created:"
echo "  - /tmp/wazuh-webhook-workflow.json (n8n workflow)"
echo "  - /tmp/wazuh-integration.xml (Wazuh config)"
echo "  - $DEPLOYMENT_DIR/scripts/test-integration.sh"
echo "  - $DEPLOYMENT_DIR/scripts/test-mcp-servers.sh"
echo "  - $DEPLOYMENT_DIR/INTEGRATION-GUIDE.md"
echo ""
echo "Next steps:"
echo "  1. Review the integration guide: $DEPLOYMENT_DIR/INTEGRATION-GUIDE.md"
echo "  2. Import n8n workflow from /tmp/wazuh-webhook-workflow.json"
echo "  3. Apply Wazuh integration configuration"
echo "  4. Run test scripts to verify integration"
echo ""
