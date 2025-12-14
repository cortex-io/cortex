#!/bin/bash
#
# Wazuh + n8n + MCP Deployment Verification Script
# Verifies all components and completes integration
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
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

# Load environment variables
if [ -f "/Users/ryandahlberg/Projects/cortex/.env" ]; then
    source /Users/ryandahlberg/Projects/cortex/.env
    log_info "Loaded environment variables from .env"
else
    log_error ".env file not found"
    exit 1
fi

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOYMENT_DIR="$(dirname "$SCRIPT_DIR")"
REPORT_DIR="$DEPLOYMENT_DIR/verification"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
REPORT_FILE="$REPORT_DIR/verification-report-$TIMESTAMP.md"

# K3s master SSH connection
K3S_SSH="ssh -o StrictHostKeyChecking=no root@${K3S_MASTER_IP}"

# Create report directory
mkdir -p "$REPORT_DIR"

# Initialize report
cat > "$REPORT_FILE" <<EOF
# Wazuh + n8n + MCP Deployment Verification Report

**Generated:** $(date -u +"%Y-%m-%d %H:%M:%S UTC")
**K3s Cluster:** ${K3S_MASTER_IP}
**Deployment Location:** ${DEPLOYMENT_DIR}

---

## Executive Summary

EOF

#############################################
# 1. VERIFY POD STATUS
#############################################

log_info "Step 1: Verifying Pod Status..."

verify_pods() {
    local namespace=$1
    local expected_pods=$2

    log_info "Checking namespace: $namespace"

    # Get pod status
    local pod_status=$($K3S_SSH "kubectl get pods -n $namespace -o wide")

    echo "## Namespace: $namespace" >> "$REPORT_FILE"
    echo '```' >> "$REPORT_FILE"
    echo "$pod_status" >> "$REPORT_FILE"
    echo '```' >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"

    # Check if all pods are running
    local running_pods=$($K3S_SSH "kubectl get pods -n $namespace --field-selector=status.phase=Running --no-headers | wc -l")
    local total_pods=$($K3S_SSH "kubectl get pods -n $namespace --no-headers | wc -l")

    if [ "$running_pods" -eq "$total_pods" ] && [ "$total_pods" -ge "$expected_pods" ]; then
        log_success "All pods in $namespace are running ($running_pods/$total_pods)"
        echo "**Status:** ✅ All pods running ($running_pods/$total_pods)" >> "$REPORT_FILE"
    else
        log_warning "Some pods in $namespace are not running ($running_pods/$total_pods)"
        echo "**Status:** ⚠️ Some pods not running ($running_pods/$total_pods)" >> "$REPORT_FILE"

        # Get detailed status of non-running pods
        $K3S_SSH "kubectl get pods -n $namespace --field-selector=status.phase!=Running -o wide" >> "$REPORT_FILE" || true
    fi
    echo "" >> "$REPORT_FILE"
}

# Verify all namespaces
verify_pods "wazuh" 3  # indexer, manager, dashboard
verify_pods "n8n" 2    # postgres, n8n
verify_pods "mcp" 2    # wazuh-mcp, n8n-mcp

#############################################
# 2. VERIFY STATEFULSETS
#############################################

log_info "Step 2: Verifying StatefulSets..."

echo "## StatefulSets Status" >> "$REPORT_FILE"

verify_statefulset() {
    local namespace=$1
    local name=$2

    log_info "Checking StatefulSet: $namespace/$name"

    local sts_status=$($K3S_SSH "kubectl get statefulset -n $namespace $name -o wide" 2>&1)

    echo "### $namespace/$name" >> "$REPORT_FILE"
    echo '```' >> "$REPORT_FILE"
    echo "$sts_status" >> "$REPORT_FILE"
    echo '```' >> "$REPORT_FILE"

    # Check if ready
    local ready=$($K3S_SSH "kubectl get statefulset -n $namespace $name -o jsonpath='{.status.readyReplicas}'" 2>/dev/null || echo "0")
    local replicas=$($K3S_SSH "kubectl get statefulset -n $namespace $name -o jsonpath='{.spec.replicas}'" 2>/dev/null || echo "1")

    if [ "$ready" = "$replicas" ]; then
        log_success "$namespace/$name is ready ($ready/$replicas)"
        echo "**Status:** ✅ Ready ($ready/$replicas)" >> "$REPORT_FILE"
    else
        log_warning "$namespace/$name is not ready ($ready/$replicas)"
        echo "**Status:** ⚠️ Not ready ($ready/$replicas)" >> "$REPORT_FILE"
    fi
    echo "" >> "$REPORT_FILE"
}

verify_statefulset "wazuh" "wazuh-indexer"
verify_statefulset "n8n" "n8n-postgres"

#############################################
# 3. VERIFY SERVICES
#############################################

log_info "Step 3: Verifying Services..."

echo "## Services Status" >> "$REPORT_FILE"

verify_service() {
    local namespace=$1
    local name=$2
    local port=$3

    log_info "Checking service: $namespace/$name"

    local svc_status=$($K3S_SSH "kubectl get svc -n $namespace $name -o wide" 2>&1)

    echo "### $namespace/$name" >> "$REPORT_FILE"
    echo '```' >> "$REPORT_FILE"
    echo "$svc_status" >> "$REPORT_FILE"
    echo '```' >> "$REPORT_FILE"

    # Get service endpoints
    local endpoints=$($K3S_SSH "kubectl get endpoints -n $namespace $name -o jsonpath='{.subsets[*].addresses[*].ip}'" 2>/dev/null || echo "")

    if [ -n "$endpoints" ]; then
        log_success "$namespace/$name has endpoints: $endpoints"
        echo "**Endpoints:** $endpoints" >> "$REPORT_FILE"
        echo "**Status:** ✅ Service ready" >> "$REPORT_FILE"
    else
        log_warning "$namespace/$name has no endpoints"
        echo "**Status:** ⚠️ No endpoints" >> "$REPORT_FILE"
    fi
    echo "" >> "$REPORT_FILE"
}

# Verify key services
verify_service "wazuh" "wazuh-indexer" 9200
verify_service "wazuh" "wazuh-manager" 55000
verify_service "wazuh" "wazuh-dashboard" 5601
verify_service "n8n" "n8n-postgres" 5432
verify_service "n8n" "n8n" 5678
verify_service "mcp" "wazuh-mcp-server" 3000
verify_service "mcp" "n8n-mcp-server" 3001

#############################################
# 4. TEST SERVICE CONNECTIVITY
#############################################

log_info "Step 4: Testing Service Connectivity..."

echo "## Service Connectivity Tests" >> "$REPORT_FILE"

test_http_endpoint() {
    local namespace=$1
    local service=$2
    local port=$3
    local path=$4
    local description=$5

    log_info "Testing $description at $service:$port$path"

    # Create a test pod to curl the service
    local test_result=$($K3S_SSH "kubectl run curl-test-$$-$RANDOM --image=curlimages/curl:latest --rm -i --restart=Never --namespace=default -- curl -s -o /dev/null -w '%{http_code}' --connect-timeout 5 http://${service}.${namespace}.svc.cluster.local:${port}${path}" 2>&1 || echo "FAILED")

    echo "### $description" >> "$REPORT_FILE"
    echo "- **URL:** http://${service}.${namespace}.svc.cluster.local:${port}${path}" >> "$REPORT_FILE"

    if [[ "$test_result" =~ ^[2-3][0-9][0-9]$ ]]; then
        log_success "$description responded with HTTP $test_result"
        echo "- **Status:** ✅ HTTP $test_result" >> "$REPORT_FILE"
    else
        log_warning "$description test failed: $test_result"
        echo "- **Status:** ⚠️ Failed: $test_result" >> "$REPORT_FILE"
    fi
    echo "" >> "$REPORT_FILE"
}

# Test MCP servers
test_http_endpoint "mcp" "wazuh-mcp-server" 3000 "/health" "Wazuh MCP Server Health"
test_http_endpoint "mcp" "n8n-mcp-server" 3001 "/health" "n8n MCP Server Health"

# Test n8n
test_http_endpoint "n8n" "n8n" 5678 "/healthz" "n8n Health Check"

#############################################
# 5. WAZUH API VERIFICATION
#############################################

log_info "Step 5: Verifying Wazuh API..."

echo "## Wazuh API Verification" >> "$REPORT_FILE"

# Get Wazuh credentials from secrets
WAZUH_API_USER=$($K3S_SSH "kubectl get secret -n wazuh wazuh-credentials -o jsonpath='{.data.wazuh-api-user}' | base64 -d" 2>/dev/null || echo "admin")
WAZUH_API_PASSWORD=$($K3S_SSH "kubectl get secret -n wazuh wazuh-credentials -o jsonpath='{.data.wazuh-api-password}' | base64 -d" 2>/dev/null || echo "")

log_info "Testing Wazuh API authentication..."

# Test Wazuh API
WAZUH_TOKEN=$($K3S_SSH "kubectl run wazuh-api-test-$$-$RANDOM --image=curlimages/curl:latest --rm -i --restart=Never --namespace=wazuh -- curl -s -u '${WAZUH_API_USER}:${WAZUH_API_PASSWORD}' -k -X POST 'http://wazuh-manager.wazuh.svc.cluster.local:55000/security/user/authenticate' | grep -o 'token\":\"[^\"]*' | cut -d'\"' -f3" 2>&1 || echo "")

if [ -n "$WAZUH_TOKEN" ] && [ "$WAZUH_TOKEN" != "FAILED" ]; then
    log_success "Wazuh API authentication successful"
    echo "- **Status:** ✅ API authentication successful" >> "$REPORT_FILE"
    echo "- **Token obtained:** Yes" >> "$REPORT_FILE"
else
    log_warning "Wazuh API authentication failed"
    echo "- **Status:** ⚠️ API authentication failed" >> "$REPORT_FILE"
fi
echo "" >> "$REPORT_FILE"

#############################################
# 6. COLLECT ACCESS INFORMATION
#############################################

log_info "Step 6: Collecting Access Information..."

echo "## Access Information" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Get NodePort for Wazuh Dashboard
WAZUH_DASHBOARD_NODEPORT=$($K3S_SSH "kubectl get svc -n wazuh wazuh-dashboard -o jsonpath='{.spec.ports[0].nodePort}'" 2>/dev/null || echo "")

echo "### Wazuh Dashboard" >> "$REPORT_FILE"
if [ -n "$WAZUH_DASHBOARD_NODEPORT" ]; then
    echo "- **URL:** https://${K3S_MASTER_IP}:${WAZUH_DASHBOARD_NODEPORT}" >> "$REPORT_FILE"
    echo "- **Username:** admin" >> "$REPORT_FILE"
    echo "- **Password:** (from wazuh-credentials secret)" >> "$REPORT_FILE"
    log_info "Wazuh Dashboard: https://${K3S_MASTER_IP}:${WAZUH_DASHBOARD_NODEPORT}"
else
    echo "- **Status:** ⚠️ NodePort not available" >> "$REPORT_FILE"
fi
echo "" >> "$REPORT_FILE"

# n8n access (internal only, would need ingress for external)
echo "### n8n" >> "$REPORT_FILE"
echo "- **Internal URL:** http://n8n.n8n.svc.cluster.local:5678" >> "$REPORT_FILE"
echo "- **Webhook URL:** http://n8n.n8n.svc.cluster.local:5678/webhook/" >> "$REPORT_FILE"
echo "- **Note:** Requires port-forward or ingress for external access" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# MCP servers
echo "### MCP Servers" >> "$REPORT_FILE"
echo "- **Wazuh MCP:** http://wazuh-mcp-server.mcp.svc.cluster.local:3000" >> "$REPORT_FILE"
echo "- **n8n MCP:** http://n8n-mcp-server.mcp.svc.cluster.local:3001" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

#############################################
# 7. RESOURCE USAGE
#############################################

log_info "Step 7: Checking Resource Usage..."

echo "## Resource Usage" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

for ns in wazuh n8n mcp; do
    echo "### Namespace: $ns" >> "$REPORT_FILE"
    echo '```' >> "$REPORT_FILE"
    $K3S_SSH "kubectl top pods -n $ns --no-headers 2>/dev/null || echo 'Metrics not available'" >> "$REPORT_FILE"
    echo '```' >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
done

#############################################
# 8. COLLECT LOGS
#############################################

log_info "Step 8: Collecting Recent Logs..."

echo "## Recent Logs (Last 20 lines)" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

collect_logs() {
    local namespace=$1
    local label=$2
    local description=$3

    log_info "Collecting logs from $namespace/$description"

    local pod=$($K3S_SSH "kubectl get pods -n $namespace -l $label -o jsonpath='{.items[0].metadata.name}'" 2>/dev/null || echo "")

    if [ -n "$pod" ]; then
        echo "### $description ($pod)" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
        $K3S_SSH "kubectl logs -n $namespace $pod --tail=20 2>&1 | head -20" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
    fi
}

collect_logs "wazuh" "app=wazuh-manager" "Wazuh Manager"
collect_logs "n8n" "app=n8n" "n8n"
collect_logs "mcp" "app=wazuh-mcp-server" "Wazuh MCP Server"
collect_logs "mcp" "app=n8n-mcp-server" "n8n MCP Server"

#############################################
# 9. VERIFICATION SUMMARY
#############################################

echo "## Verification Summary" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Count running pods
TOTAL_PODS=$($K3S_SSH "kubectl get pods -n wazuh,n8n,mcp --no-headers 2>/dev/null | wc -l" || echo "0")
RUNNING_PODS=$($K3S_SSH "kubectl get pods -n wazuh,n8n,mcp --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l" || echo "0")

echo "- **Total Pods:** $TOTAL_PODS" >> "$REPORT_FILE"
echo "- **Running Pods:** $RUNNING_PODS" >> "$REPORT_FILE"
echo "- **Deployment Health:** $(awk "BEGIN {printf \"%.1f%%\", ($RUNNING_PODS/$TOTAL_PODS)*100}")" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

if [ "$RUNNING_PODS" -eq "$TOTAL_PODS" ] && [ "$TOTAL_PODS" -ge 7 ]; then
    echo "**Overall Status:** ✅ Deployment is healthy and operational" >> "$REPORT_FILE"
    log_success "Deployment verification complete - All systems operational"
else
    echo "**Overall Status:** ⚠️ Some components need attention" >> "$REPORT_FILE"
    log_warning "Deployment verification complete - Some issues found"
fi

echo "" >> "$REPORT_FILE"
echo "---" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "**Report Generated:** $(date)" >> "$REPORT_FILE"

#############################################
# FINISH
#############################################

log_success "Verification report saved to: $REPORT_FILE"
echo ""
echo "Next Steps:"
echo "1. Review the verification report: $REPORT_FILE"
echo "2. Configure Wazuh -> n8n webhook integration"
echo "3. Test end-to-end alert flow"
echo ""
