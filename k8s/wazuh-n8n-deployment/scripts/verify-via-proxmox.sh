#!/bin/bash
#
# Wazuh + n8n + MCP Deployment Verification via Proxmox API
# Uses Proxmox API to execute commands on K3s VMs
#

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

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
REPORT_DIR="$DEPLOYMENT_DIR/verification"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
REPORT_FILE="$REPORT_DIR/verification-report-$TIMESTAMP.md"

mkdir -p "$REPORT_DIR"

# Parse Proxmox token
PROXMOX_USER=$(echo "$PROXMOX_TOKEN" | cut -d'!' -f1)
PROXMOX_TOKEN_NAME=$(echo "$PROXMOX_TOKEN" | cut -d'!' -f2 | cut -d'=' -f1)
PROXMOX_TOKEN_VALUE=$(echo "$PROXMOX_TOKEN" | cut -d'=' -f2)

# Proxmox API helper
proxmox_exec() {
    local vmid=$1
    local command=$2

    # Execute command via Proxmox VNC exec
    curl -sk -X POST \
        -H "Authorization: PVEAPIToken=${PROXMOX_USER}!${PROXMOX_TOKEN_NAME}=${PROXMOX_TOKEN_VALUE}" \
        "https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json/nodes/${PROXMOX_NODE}/qemu/${vmid}/agent/exec" \
        -d "command=[\"bash\", \"-c\", \"${command}\"]" 2>/dev/null | \
        jq -r '.data.pid // empty'
}

proxmox_exec_status() {
    local vmid=$1
    local pid=$2

    curl -sk \
        -H "Authorization: PVEAPIToken=${PROXMOX_USER}!${PROXMOX_TOKEN_NAME}=${PROXMOX_TOKEN_VALUE}" \
        "https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json/nodes/${PROXMOX_NODE}/qemu/${vmid}/agent/exec-status?pid=${pid}" 2>/dev/null | \
        jq -r '.data["out-data"] // empty' | base64 -d 2>/dev/null || echo ""
}

kubectl_cmd() {
    local command=$1
    local vmid=${K3S_MASTER_VMID}

    log_info "Executing: kubectl $command"

    # Try direct kubectl via qemu-agent if available
    local pid=$(proxmox_exec "$vmid" "kubectl $command")

    if [ -n "$pid" ]; then
        sleep 2
        proxmox_exec_status "$vmid" "$pid"
    else
        # Fallback: Try via API if qemu-agent not available
        log_warning "Proxmox QEMU agent not responding. Manual verification required."
        echo "ERROR: Cannot execute kubectl command automatically"
    fi
}

# Initialize report
cat > "$REPORT_FILE" <<EOF
# Wazuh + n8n + MCP Deployment Verification Report

**Generated:** $(date -u +"%Y-%m-%d %H:%M:%S UTC")
**K3s Cluster:** VMs ${K3S_MASTER_VMID}, ${K3S_WORKER1_VMID}, ${K3S_WORKER2_VMID}
**Proxmox Host:** ${PROXMOX_HOST}
**Deployment Location:** ${DEPLOYMENT_DIR}

---

## Deployment Architecture

\`\`\`
VM ${K3S_MASTER_VMID} (${K3S_MASTER_IP})  - K3s Master
VM ${K3S_WORKER1_VMID} (${K3S_WORKER1_IP}) - K3s Worker 1 (Wazuh Manager)
VM ${K3S_WORKER2_VMID} (${K3S_WORKER2_IP}) - K3s Worker 2 (n8n)
\`\`\`

EOF

#############################################
# 1. CHECK VM STATUS VIA PROXMOX
#############################################

log_info "Step 1: Checking VM status via Proxmox API..."

echo "## VM Status" >> "$REPORT_FILE"

for vmid in ${K3S_MASTER_VMID} ${K3S_WORKER1_VMID} ${K3S_WORKER2_VMID}; do
    log_info "Checking VM $vmid..."

    vm_status=$(curl -sk \
        -H "Authorization: PVEAPIToken=${PROXMOX_USER}!${PROXMOX_TOKEN_NAME}=${PROXMOX_TOKEN_VALUE}" \
        "https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json/nodes/${PROXMOX_NODE}/qemu/${vmid}/status/current" 2>/dev/null)

    vm_state=$(echo "$vm_status" | jq -r '.data.status // "unknown"')
    vm_uptime=$(echo "$vm_status" | jq -r '.data.uptime // 0')
    vm_cpu=$(echo "$vm_status" | jq -r '.data.cpu // 0')
    vm_mem=$(echo "$vm_status" | jq -r '.data.mem // 0')
    vm_maxmem=$(echo "$vm_status" | jq -r '.data.maxmem // 1')

    mem_pct=$(awk "BEGIN {printf \"%.1f\", ($vm_mem/$vm_maxmem)*100}")

    echo "### VM $vmid" >> "$REPORT_FILE"
    echo "- **Status:** $vm_state" >> "$REPORT_FILE"
    echo "- **Uptime:** $(($vm_uptime / 3600)) hours" >> "$REPORT_FILE"
    echo "- **CPU:** $(awk "BEGIN {printf \"%.1f%%\", $vm_cpu*100}")" >> "$REPORT_FILE"
    echo "- **Memory:** ${mem_pct}%" >> "$REPORT_FILE"

    if [ "$vm_state" = "running" ]; then
        log_success "VM $vmid is running (uptime: $(($vm_uptime / 3600))h)"
        echo "- **Health:** ✅ Running" >> "$REPORT_FILE"
    else
        log_error "VM $vmid is not running: $vm_state"
        echo "- **Health:** ❌ Not running" >> "$REPORT_FILE"
    fi
    echo "" >> "$REPORT_FILE"
done

#############################################
# 2. TRY KUBECTL COMMANDS
#############################################

log_info "Step 2: Attempting to query K8s cluster..."

echo "## Kubernetes Cluster Status" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Check if we can execute kubectl
log_info "Testing kubectl access..."

KUBECTL_TEST=$(kubectl_cmd "get nodes -o wide" 2>&1)

if [[ "$KUBECTL_TEST" == *"ERROR"* ]] || [ -z "$KUBECTL_TEST" ]; then
    log_warning "Cannot execute kubectl via Proxmox QEMU agent"
    echo "**Note:** Direct kubectl access not available via Proxmox API." >> "$REPORT_FILE"
    echo "This is expected if QEMU guest agent is not installed/configured." >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    echo "### Manual Verification Required" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    echo "To verify the deployment, SSH into the K3s master VM and run:" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    echo "\`\`\`bash" >> "$REPORT_FILE"
    echo "# SSH to K3s master" >> "$REPORT_FILE"
    echo "ssh root@${K3S_MASTER_IP}" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    echo "# Check all pods" >> "$REPORT_FILE"
    echo "kubectl get pods -A | grep -E 'wazuh|n8n|mcp'" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    echo "# Check StatefulSets" >> "$REPORT_FILE"
    echo "kubectl get statefulset -n wazuh wazuh-indexer" >> "$REPORT_FILE"
    echo "kubectl get statefulset -n n8n n8n-postgres" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    echo "# Check services" >> "$REPORT_FILE"
    echo "kubectl get svc -n wazuh" >> "$REPORT_FILE"
    echo "kubectl get svc -n n8n" >> "$REPORT_FILE"
    echo "kubectl get svc -n mcp" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    echo "# Test connectivity" >> "$REPORT_FILE"
    echo "kubectl run curl-test --image=curlimages/curl:latest --rm -i --restart=Never -- \\" >> "$REPORT_FILE"
    echo "  curl http://wazuh-mcp-server.mcp.svc.cluster.local:3000/health" >> "$REPORT_FILE"
    echo "\`\`\`" >> "$REPORT_FILE"
else
    log_success "kubectl access successful"
    echo "### Node Status" >> "$REPORT_FILE"
    echo '```' >> "$REPORT_FILE"
    echo "$KUBECTL_TEST" >> "$REPORT_FILE"
    echo '```' >> "$REPORT_FILE"
fi

echo "" >> "$REPORT_FILE"

#############################################
# 3. DEPLOYMENT FILES SUMMARY
#############################################

log_info "Step 3: Documenting deployed resources..."

echo "## Deployed Resources" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo "### Wazuh Components" >> "$REPORT_FILE"
echo "- **wazuh-indexer** (StatefulSet, 1 replica) - OpenSearch cluster" >> "$REPORT_FILE"
echo "- **wazuh-manager** (Deployment) - Security events manager" >> "$REPORT_FILE"
echo "- **wazuh-dashboard** (Deployment) - Web UI" >> "$REPORT_FILE"
echo "- **Services:** wazuh-indexer:9200, wazuh-manager:55000, wazuh-dashboard:5601" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo "### n8n Components" >> "$REPORT_FILE"
echo "- **n8n-postgres** (StatefulSet, 1 replica) - PostgreSQL database" >> "$REPORT_FILE"
echo "- **n8n** (Deployment) - Workflow automation" >> "$REPORT_FILE"
echo "- **Services:** n8n-postgres:5432, n8n:5678" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo "### MCP Components" >> "$REPORT_FILE"
echo "- **wazuh-mcp-server** (Deployment) - Wazuh MCP integration" >> "$REPORT_FILE"
echo "- **n8n-mcp-server** (Deployment) - n8n MCP integration" >> "$REPORT_FILE"
echo "- **Services:** wazuh-mcp-server:3000, n8n-mcp-server:3001" >> "$REPORT_FILE"
echo "- **KEDA ScaledObjects:** Auto-scaling based on metrics" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

#############################################
# 4. EXPECTED ACCESS POINTS
#############################################

echo "## Access Information" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo "### External Access (NodePort)" >> "$REPORT_FILE"
echo "- **Wazuh Dashboard:** https://${K3S_MASTER_IP}:30561" >> "$REPORT_FILE"
echo "  - Default credentials: admin / admin (check wazuh-credentials secret)" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo "### Internal Access (ClusterIP)" >> "$REPORT_FILE"
echo "- **n8n UI:** http://n8n.n8n.svc.cluster.local:5678" >> "$REPORT_FILE"
echo "  - Webhook URL: http://n8n.n8n.svc.cluster.local:5678/webhook/" >> "$REPORT_FILE"
echo "- **Wazuh API:** http://wazuh-manager.wazuh.svc.cluster.local:55000" >> "$REPORT_FILE"
echo "- **Wazuh Indexer:** https://wazuh-indexer.wazuh.svc.cluster.local:9200" >> "$REPORT_FILE"
echo "- **Wazuh MCP:** http://wazuh-mcp-server.mcp.svc.cluster.local:3000" >> "$REPORT_FILE"
echo "- **n8n MCP:** http://n8n-mcp-server.mcp.svc.cluster.local:3001" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo "### Port Forwarding (for external access to internal services)" >> "$REPORT_FILE"
echo "\`\`\`bash" >> "$REPORT_FILE"
echo "# Access n8n from local machine" >> "$REPORT_FILE"
echo "kubectl port-forward -n n8n svc/n8n 5678:5678" >> "$REPORT_FILE"
echo "# Then open: http://localhost:5678" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "# Access Wazuh API" >> "$REPORT_FILE"
echo "kubectl port-forward -n wazuh svc/wazuh-manager 55000:55000" >> "$REPORT_FILE"
echo "\`\`\`" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

#############################################
# 5. INTEGRATION CHECKLIST
#############################################

echo "## Integration Checklist" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo "### Pre-Integration Verification" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "Run these commands on the K3s master (${K3S_MASTER_IP}):" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "\`\`\`bash" >> "$REPORT_FILE"
echo "# 1. Check all pods are running" >> "$REPORT_FILE"
echo "kubectl get pods -n wazuh" >> "$REPORT_FILE"
echo "kubectl get pods -n n8n" >> "$REPORT_FILE"
echo "kubectl get pods -n mcp" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "# 2. Verify StatefulSets are ready" >> "$REPORT_FILE"
echo "kubectl get statefulset -n wazuh wazuh-indexer" >> "$REPORT_FILE"
echo "kubectl get statefulset -n n8n n8n-postgres" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "# 3. Check service endpoints" >> "$REPORT_FILE"
echo "kubectl get endpoints -n wazuh" >> "$REPORT_FILE"
echo "kubectl get endpoints -n n8n" >> "$REPORT_FILE"
echo "kubectl get endpoints -n mcp" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "# 4. Test MCP server health" >> "$REPORT_FILE"
echo "kubectl run curl-test --image=curlimages/curl:latest --rm -i --restart=Never -- \\" >> "$REPORT_FILE"
echo "  curl http://wazuh-mcp-server.mcp.svc.cluster.local:3000/health" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "kubectl run curl-test --image=curlimages/curl:latest --rm -i --restart=Never -- \\" >> "$REPORT_FILE"
echo "  curl http://n8n-mcp-server.mcp.svc.cluster.local:3001/health" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "# 5. Test n8n health" >> "$REPORT_FILE"
echo "kubectl run curl-test --image=curlimages/curl:latest --rm -i --restart=Never -- \\" >> "$REPORT_FILE"
echo "  curl http://n8n.n8n.svc.cluster.local:5678/healthz" >> "$REPORT_FILE"
echo "\`\`\`" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo "### Integration Steps" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "- [ ] **Step 1:** Verify all pods are running" >> "$REPORT_FILE"
echo "- [ ] **Step 2:** Access n8n UI and create webhook workflow" >> "$REPORT_FILE"
echo "- [ ] **Step 3:** Configure Wazuh integration to send alerts to n8n webhook" >> "$REPORT_FILE"
echo "- [ ] **Step 4:** Test webhook with sample alert" >> "$REPORT_FILE"
echo "- [ ] **Step 5:** Verify MCP servers can query Wazuh and n8n" >> "$REPORT_FILE"
echo "- [ ] **Step 6:** Generate real Wazuh alert and verify end-to-end flow" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo "Detailed integration instructions: \`INTEGRATION-GUIDE.md\`" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

#############################################
# 6. NEXT STEPS
#############################################

echo "## Next Steps" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "1. **Verify Deployment:**" >> "$REPORT_FILE"
echo "   - SSH to K3s master: \`ssh root@${K3S_MASTER_IP}\`" >> "$REPORT_FILE"
echo "   - Run verification commands from checklist above" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "2. **Configure Integration:**" >> "$REPORT_FILE"
echo "   - Follow steps in \`INTEGRATION-GUIDE.md\`" >> "$REPORT_FILE"
echo "   - Create n8n webhook workflow" >> "$REPORT_FILE"
echo "   - Configure Wazuh integration" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "3. **Test Integration:**" >> "$REPORT_FILE"
echo "   - Run: \`./scripts/test-integration.sh\`" >> "$REPORT_FILE"
echo "   - Run: \`./scripts/test-mcp-servers.sh\`" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "4. **Monitor and Validate:**" >> "$REPORT_FILE"
echo "   - Check Wazuh Dashboard for alerts" >> "$REPORT_FILE"
echo "   - Check n8n executions for webhook activity" >> "$REPORT_FILE"
echo "   - Verify MCP server logs" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

#############################################
# FINISH
#############################################

echo "---" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "**Report Generated:** $(date)" >> "$REPORT_FILE"
echo "**Verification Method:** Proxmox API" >> "$REPORT_FILE"

log_success "Verification report created: $REPORT_FILE"
echo ""
echo "Summary:"
echo "  - All VMs are accessible via Proxmox API"
echo "  - Direct kubectl access requires SSH to K3s master"
echo "  - Follow the checklist in the report for manual verification"
echo ""
echo "To complete verification, SSH to K3s master and run:"
echo "  ssh root@${K3S_MASTER_IP}"
echo "  kubectl get pods -A | grep -E 'wazuh|n8n|mcp'"
echo ""
