#!/bin/bash

# K3s Cortex Dashboard Health Check Script
# Verifies dashboard service, LoadBalancer IP assignment, and cluster health
# Usage: ./k3s-dashboard-health-check.sh [--verbose] [--output json|text]

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE="cortex-system"
DASHBOARD_SERVICE="dashboard"
LOADBALANCER_IP="10.88.145.201"
DASHBOARD_PORT=80
API_PORT=3004
VERBOSE=false
OUTPUT_FORMAT="text"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --verbose)
            VERBOSE=true
            shift
            ;;
        --output)
            OUTPUT_FORMAT="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Health check results
declare -A health_checks
declare -A check_status

# Helper functions
log_info() {
    if [ "$VERBOSE" = true ]; then
        echo -e "${BLUE}[INFO]${NC} $1"
    fi
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
    health_checks["$1"]="PASS"
}

log_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
    health_checks["$1"]="WARN"
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
    health_checks["$1"]="FAIL"
}

# Test 1: Verify kubectl access
verify_kubectl_access() {
    echo ""
    echo -e "${BLUE}=== Verifying kubectl Access ===${NC}"

    if command -v kubectl &> /dev/null; then
        log_success "kubectl command available"

        if kubectl cluster-info &> /dev/null; then
            log_success "kubectl cluster-info accessible"
        else
            log_error "kubectl cluster-info failed"
            return 1
        fi
    else
        log_error "kubectl command not found"
        return 1
    fi
}

# Test 2: Verify namespace exists
verify_namespace() {
    echo ""
    echo -e "${BLUE}=== Verifying Namespace ===${NC}"

    if kubectl get namespace "$NAMESPACE" &> /dev/null; then
        log_success "Namespace '$NAMESPACE' exists"
    else
        log_error "Namespace '$NAMESPACE' does not exist"
        return 1
    fi
}

# Test 3: Get dashboard service details
get_dashboard_service() {
    echo ""
    echo -e "${BLUE}=== Dashboard Service Status ===${NC}"

    local service_output
    service_output=$(kubectl get svc "$DASHBOARD_SERVICE" -n "$NAMESPACE" -o json 2>/dev/null)

    if [ $? -eq 0 ]; then
        log_success "Dashboard service found"

        # Extract service details
        local service_type
        local cluster_ip
        local external_ip
        local port

        service_type=$(echo "$service_output" | jq -r '.spec.type // "N/A"')
        cluster_ip=$(echo "$service_output" | jq -r '.spec.clusterIP // "N/A"')
        external_ip=$(echo "$service_output" | jq -r '.status.loadBalancer.ingress[0].ip // "N/A"')
        port=$(echo "$service_output" | jq -r '.spec.ports[0].port // "N/A"')

        echo "  Service Type: $service_type"
        echo "  Cluster IP: $cluster_ip"
        echo "  External IP: $external_ip"
        echo "  Port: $port"

        if [ "$external_ip" != "N/A" ] && [ "$external_ip" != "null" ]; then
            log_success "LoadBalancer external IP assigned: $external_ip"
        else
            log_warning "LoadBalancer external IP not yet assigned (may be pending)"
        fi
    else
        log_error "Dashboard service not found"
        return 1
    fi
}

# Test 4: Get endpoints
get_service_endpoints() {
    echo ""
    echo -e "${BLUE}=== Service Endpoints ===${NC}"

    local endpoints_output
    endpoints_output=$(kubectl get endpoints "$DASHBOARD_SERVICE" -n "$NAMESPACE" -o json 2>/dev/null)

    if [ $? -eq 0 ]; then
        local endpoint_count
        endpoint_count=$(echo "$endpoints_output" | jq '.subsets[0].addresses | length' 2>/dev/null || echo "0")

        if [ "$endpoint_count" -gt 0 ]; then
            log_success "Dashboard service has $endpoint_count active endpoint(s)"

            # Show endpoint IPs
            echo "$endpoints_output" | jq -r '.subsets[0].addresses[] | .ip' 2>/dev/null | while read -r ip; do
                echo "  - $ip"
            done
        else
            log_warning "Dashboard service has no active endpoints (pod may not be running)"
        fi
    else
        log_error "Unable to get endpoints"
    fi
}

# Test 5: Check pod status
check_pods() {
    echo ""
    echo -e "${BLUE}=== Cortex Pods Status ===${NC}"

    local pods_output
    pods_output=$(kubectl get pods -n "$NAMESPACE" -o json 2>/dev/null)

    if [ $? -eq 0 ]; then
        local pod_count
        pod_count=$(echo "$pods_output" | jq '.items | length')

        echo "Total pods: $pod_count"

        # Count by status
        local running
        local pending
        local failed
        local other

        running=$(echo "$pods_output" | jq '[.items[] | select(.status.phase == "Running")] | length')
        pending=$(echo "$pods_output" | jq '[.items[] | select(.status.phase == "Pending")] | length')
        failed=$(echo "$pods_output" | jq '[.items[] | select(.status.phase == "Failed")] | length')
        other=$(echo "$pods_output" | jq "[.items[] | select(.status.phase != \"Running\" and .status.phase != \"Pending\" and .status.phase != \"Failed\")] | length")

        echo "  Running: $running"
        echo "  Pending: $pending"
        echo "  Failed: $failed"
        echo "  Other: $other"

        if [ "$running" -ge 5 ]; then
            log_success "All expected Cortex pods are running"
        elif [ "$running" -gt 0 ]; then
            log_warning "Only $running/$pod_count pods running"
        else
            log_error "No pods running in cortex-system namespace"
        fi

        # List pod details
        if [ "$VERBOSE" = true ]; then
            echo ""
            echo "Pod Details:"
            kubectl get pods -n "$NAMESPACE" -o wide
        fi
    else
        log_error "Unable to get pods"
    fi
}

# Test 6: Check services
check_services() {
    echo ""
    echo -e "${BLUE}=== All Services ===${NC}"

    kubectl get svc -n "$NAMESPACE" 2>/dev/null || log_error "Unable to get services"
}

# Test 7: Check deployments
check_deployments() {
    echo ""
    echo -e "${BLUE}=== Deployments Status ===${NC}"

    local deployments_output
    deployments_output=$(kubectl get deployments -n "$NAMESPACE" -o json 2>/dev/null)

    if [ $? -eq 0 ]; then
        local dep_count
        dep_count=$(echo "$deployments_output" | jq '.items | length')

        echo "Total deployments: $dep_count"

        kubectl get deployments -n "$NAMESPACE" -o wide || log_error "Unable to list deployments"
    else
        log_error "Unable to get deployments"
    fi
}

# Test 8: Check nodes
check_nodes() {
    echo ""
    echo -e "${BLUE}=== Cluster Nodes ===${NC}"

    local nodes_output
    nodes_output=$(kubectl get nodes -o json 2>/dev/null)

    if [ $? -eq 0 ]; then
        local node_count
        node_count=$(echo "$nodes_output" | jq '.items | length')

        echo "Total nodes: $node_count"

        # Check node status
        local ready_nodes
        ready_nodes=$(echo "$nodes_output" | jq '[.items[] | select(.status.conditions[] | select(.type == "Ready" and .status == "True"))] | length')

        echo "  Ready nodes: $ready_nodes/$node_count"

        kubectl get nodes -o wide || log_error "Unable to list nodes"
    else
        log_error "Unable to get nodes"
    fi
}

# Test 9: Check recent events
check_events() {
    echo ""
    echo -e "${BLUE}=== Recent Cluster Events (Last 10) ===${NC}"

    kubectl get events -n "$NAMESPACE" --sort-by='.lastTimestamp' | tail -10 || log_error "Unable to get events"
}

# Test 10: Test HTTP connectivity (if possible)
test_http_connectivity() {
    echo ""
    echo -e "${BLUE}=== HTTP Connectivity Test ===${NC}"

    if command -v curl &> /dev/null; then
        # Test LoadBalancer IP
        if curl -s -m 5 "http://${LOADBALANCER_IP}/" > /dev/null 2>&1; then
            log_success "Dashboard accessible at http://${LOADBALANCER_IP}/"
        else
            log_warning "Dashboard at http://${LOADBALANCER_IP}/ not accessible (may be pending or network issue)"
        fi

        # Test API endpoint
        if curl -s -m 5 "http://${LOADBALANCER_IP}:${API_PORT}/api/health" > /dev/null 2>&1; then
            log_success "API health endpoint accessible"
        else
            log_warning "API health endpoint not accessible"
        fi
    else
        log_warning "curl not available for connectivity testing"
    fi
}

# Test 11: Get resource usage
get_resource_usage() {
    echo ""
    echo -e "${BLUE}=== Resource Usage ===${NC}"

    if kubectl top nodes 2>/dev/null; then
        echo ""
        kubectl top pods -n "$NAMESPACE" 2>/dev/null || log_warning "Pod resource metrics not available (metrics-server may not be running)"
    else
        log_warning "Node metrics not available (metrics-server may not be running)"
    fi
}

# Generate JSON output
generate_json_output() {
    cat > /tmp/k3s-health-check-report.json << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "cluster": {
    "namespace": "$NAMESPACE",
    "dashboard_service": "$DASHBOARD_SERVICE",
    "loadbalancer_ip": "$LOADBALANCER_IP"
  },
  "health_checks": [
EOF

    local first=true
    for check in "${!health_checks[@]}"; do
        if [ "$first" = false ]; then
            echo "," >> /tmp/k3s-health-check-report.json
        fi
        first=false
        echo -n "    {\"check\": \"$check\", \"status\": \"${health_checks[$check]}\"}" >> /tmp/k3s-health-check-report.json
    done

    cat >> /tmp/k3s-health-check-report.json << 'EOF'
  ],
  "endpoints": {
    "dashboard": "http://10.88.145.201/",
    "api_health": "http://10.88.145.201:3004/api/health",
    "api_metrics": "http://10.88.145.201:3004/api/metrics",
    "api_workers": "http://10.88.145.201:3004/api/workers",
    "api_tasks": "http://10.88.145.201:3004/api/tasks",
    "kubernetes_cli": "kubectl -n cortex-system"
  },
  "kubernetes_commands": {
    "get_pods": "kubectl get pods -n cortex-system",
    "get_services": "kubectl get svc -n cortex-system",
    "get_endpoints": "kubectl get endpoints -n cortex-system",
    "describe_service": "kubectl describe svc dashboard -n cortex-system",
    "get_events": "kubectl get events -n cortex-system --sort-by='.lastTimestamp'",
    "get_deployments": "kubectl get deployments -n cortex-system",
    "get_nodes": "kubectl get nodes"
  }
}
EOF

    echo "JSON report saved to /tmp/k3s-health-check-report.json"
}

# Main execution
main() {
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║ K3s Cortex Dashboard Health Check                          ║${NC}"
    echo -e "${BLUE}║ Timestamp: $(date '+%Y-%m-%d %H:%M:%S')                           ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"

    # Run all checks
    verify_kubectl_access || exit 1
    verify_namespace || exit 1
    get_dashboard_service
    get_service_endpoints
    check_pods
    check_services
    check_deployments
    check_nodes
    check_events
    test_http_connectivity
    get_resource_usage

    # Generate output
    echo ""
    echo -e "${BLUE}=== Summary ===${NC}"

    local pass_count=0
    local fail_count=0
    local warn_count=0

    for check in "${!health_checks[@]}"; do
        case "${health_checks[$check]}" in
            PASS) ((pass_count++)) ;;
            FAIL) ((fail_count++)) ;;
            WARN) ((warn_count++)) ;;
        esac
    done

    echo "Passed: $pass_count | Failed: $fail_count | Warnings: $warn_count"

    if [ "$OUTPUT_FORMAT" = "json" ]; then
        generate_json_output
    fi

    echo ""
    echo -e "${BLUE}Health check complete!${NC}"
}

# Execute main function
main
