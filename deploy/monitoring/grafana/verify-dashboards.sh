#!/bin/bash
# Grafana Dashboard Verification Script
# Verifies dashboard JSON files and Grafana deployment

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DASHBOARD_DIR="${SCRIPT_DIR}/dashboards"

echo "======================================"
echo "Cortex Grafana Dashboard Verification"
echo "======================================"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check functions
check_pass() {
    echo -e "${GREEN}✓${NC} $1"
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# 1. Verify JSON files exist
echo "1. Checking dashboard files..."
DASHBOARDS=(
    "cortex-executive-overview.json"
    "cortex-operational.json"
    "cortex-agent-hierarchy.json"
    "cortex-mcp-servers.json"
)

for dashboard in "${DASHBOARDS[@]}"; do
    if [ -f "${DASHBOARD_DIR}/${dashboard}" ]; then
        check_pass "Found: ${dashboard}"
    else
        check_fail "Missing: ${dashboard}"
        exit 1
    fi
done
echo ""

# 2. Validate JSON syntax
echo "2. Validating JSON syntax..."
for dashboard in "${DASHBOARDS[@]}"; do
    if jq empty "${DASHBOARD_DIR}/${dashboard}" 2>/dev/null; then
        check_pass "Valid JSON: ${dashboard}"
    else
        check_fail "Invalid JSON: ${dashboard}"
        exit 1
    fi
done
echo ""

# 3. Check dashboard structure
echo "3. Checking dashboard structure..."
for dashboard in "${DASHBOARDS[@]}"; do
    TITLE=$(jq -r '.title // empty' "${DASHBOARD_DIR}/${dashboard}")
    DASH_UID=$(jq -r '.uid // empty' "${DASHBOARD_DIR}/${dashboard}")
    PANELS=$(jq -r '.panels // empty | length' "${DASHBOARD_DIR}/${dashboard}")

    if [ -n "$TITLE" ] && [ -n "$DASH_UID" ] && [ "$PANELS" -gt 0 ]; then
        check_pass "${dashboard}: ${PANELS} panels, uid=${DASH_UID}"
    else
        check_fail "${dashboard}: Missing required fields"
        exit 1
    fi
done
echo ""

# 4. Verify datasource configuration
echo "4. Checking datasource references..."
for dashboard in "${DASHBOARDS[@]}"; do
    DS_TYPE=$(jq -r '.panels[0].datasource.type // empty' "${DASHBOARD_DIR}/${dashboard}")
    if [ "$DS_TYPE" = "prometheus" ]; then
        check_pass "${dashboard}: Prometheus datasource configured"
    else
        check_warn "${dashboard}: Datasource type: ${DS_TYPE}"
    fi
done
echo ""

# 5. Check templating variables
echo "5. Checking templating variables..."
for dashboard in "${DASHBOARDS[@]}"; do
    VARS=$(jq -r '.templating.list // empty | length' "${DASHBOARD_DIR}/${dashboard}")
    if [ "$VARS" -gt 0 ]; then
        VAR_NAMES=$(jq -r '.templating.list[].name' "${DASHBOARD_DIR}/${dashboard}" | tr '\n' ', ')
        check_pass "${dashboard}: ${VARS} variables (${VAR_NAMES})"
    else
        check_warn "${dashboard}: No template variables"
    fi
done
echo ""

# 6. Verify panel queries
echo "6. Verifying panel queries..."
for dashboard in "${DASHBOARDS[@]}"; do
    QUERY_COUNT=$(jq -r '[.panels[].targets[]? | select(.expr)] | length' "${DASHBOARD_DIR}/${dashboard}")
    if [ "$QUERY_COUNT" -gt 0 ]; then
        check_pass "${dashboard}: ${QUERY_COUNT} PromQL queries"
    else
        check_fail "${dashboard}: No queries found"
    fi
done
echo ""

# 7. Check Grafana deployment (if running in Kubernetes)
if command -v kubectl &> /dev/null; then
    echo "7. Checking Grafana Kubernetes deployment..."

    if kubectl get namespace cortex-system &> /dev/null; then
        check_pass "Namespace cortex-system exists"

        if kubectl get deployment grafana -n cortex-system &> /dev/null; then
            check_pass "Grafana deployment found"

            REPLICAS=$(kubectl get deployment grafana -n cortex-system -o jsonpath='{.status.readyReplicas}')
            if [ "$REPLICAS" -gt 0 ]; then
                check_pass "Grafana is running (${REPLICAS} replicas)"
            else
                check_warn "Grafana deployment exists but no ready replicas"
            fi
        else
            check_warn "Grafana deployment not found in cortex-system namespace"
        fi

        # Check ConfigMaps
        if kubectl get configmap grafana-dashboards -n cortex-system &> /dev/null; then
            check_pass "Dashboard ConfigMap exists"
        else
            check_warn "Dashboard ConfigMap not found"
        fi
    else
        check_warn "Namespace cortex-system not found"
    fi
    echo ""
else
    echo "7. Skipping Kubernetes checks (kubectl not available)"
    echo ""
fi

# 8. Check Prometheus datasource config
echo "8. Checking Prometheus datasource configuration..."
if [ -f "${SCRIPT_DIR}/datasources.yaml" ]; then
    check_pass "datasources.yaml found"

    if grep -q "type: prometheus" "${SCRIPT_DIR}/datasources.yaml"; then
        check_pass "Prometheus datasource configured"
    else
        check_warn "Prometheus datasource not found in datasources.yaml"
    fi
else
    check_warn "datasources.yaml not found"
fi
echo ""

# 9. Verify documentation
echo "9. Checking documentation..."
DOCS=(
    "README.md"
    "DASHBOARD-SUMMARY.md"
    "../DASHBOARD-DEPLOYMENT.md"
)

for doc in "${DOCS[@]}"; do
    if [ -f "${DASHBOARD_DIR}/${doc}" ]; then
        check_pass "Found: ${doc}"
    else
        check_warn "Missing: ${doc}"
    fi
done
echo ""

# 10. Dashboard summary
echo "======================================"
echo "Dashboard Summary"
echo "======================================"
echo ""

TOTAL_PANELS=0
TOTAL_QUERIES=0

for dashboard in "${DASHBOARDS[@]}"; do
    TITLE=$(jq -r '.title' "${DASHBOARD_DIR}/${dashboard}")
    PANELS=$(jq -r '.panels | length' "${DASHBOARD_DIR}/${dashboard}")
    QUERIES=$(jq -r '[.panels[].targets[]? | select(.expr)] | length' "${DASHBOARD_DIR}/${dashboard}")
    SIZE=$(ls -lh "${DASHBOARD_DIR}/${dashboard}" | awk '{print $5}')

    echo "${TITLE}"
    echo "  Panels: ${PANELS}"
    echo "  Queries: ${QUERIES}"
    echo "  Size: ${SIZE}"
    echo ""

    TOTAL_PANELS=$((TOTAL_PANELS + PANELS))
    TOTAL_QUERIES=$((TOTAL_QUERIES + QUERIES))
done

echo "Total Statistics:"
echo "  Dashboards: ${#DASHBOARDS[@]}"
echo "  Panels: ${TOTAL_PANELS}"
echo "  Queries: ${TOTAL_QUERIES}"
echo ""

echo "======================================"
echo -e "${GREEN}✓ All verification checks passed!${NC}"
echo "======================================"
echo ""
echo "Next steps:"
echo "  1. Deploy Grafana: ./deploy-monitoring.sh"
echo "  2. Access Grafana: kubectl port-forward -n cortex-system svc/grafana 3000:80"
echo "  3. Open browser: http://localhost:3000"
echo "  4. Navigate to: Dashboards → Cortex folder"
echo ""
