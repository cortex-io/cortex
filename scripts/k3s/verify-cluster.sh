#!/bin/bash
# Cortex K3s Cluster Verification Script
# Comprehensive cluster health and readiness checks

set -euo pipefail

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Configuration
EXPECTED_NODES=3
KUBECONFIG="${KUBECONFIG:-/etc/rancher/k3s/k3s.yaml}"

# Test results
TESTS_PASSED=0
TESTS_FAILED=0

# Function to run test
run_test() {
    local test_name=$1
    local test_command=$2

    log_info "Running test: ${test_name}"

    if eval "$test_command" >/dev/null 2>&1; then
        log_success "PASS: ${test_name}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        log_error "FAIL: ${test_name}"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

# Function to check kubectl access
check_kubectl_access() {
    log_info "Checking kubectl access..."

    if ! command -v kubectl >/dev/null 2>&1; then
        # Try k3s kubectl
        if command -v k3s >/dev/null 2>&1; then
            alias kubectl='k3s kubectl'
            export KUBECTL_CMD='k3s kubectl'
        else
            log_error "kubectl not found"
            return 1
        fi
    else
        export KUBECTL_CMD='kubectl'
    fi

    if $KUBECTL_CMD version --short >/dev/null 2>&1; then
        log_success "kubectl is accessible"
        return 0
    else
        log_error "kubectl cannot connect to cluster"
        return 1
    fi
}

# Function to check all nodes are Ready
check_nodes_ready() {
    log_info "Checking node status..."

    local node_count
    node_count=$($KUBECTL_CMD get nodes --no-headers | wc -l | tr -d ' ')

    if [ "$node_count" -lt "$EXPECTED_NODES" ]; then
        log_error "Expected ${EXPECTED_NODES} nodes, found ${node_count}"
        $KUBECTL_CMD get nodes
        return 1
    fi

    # Check each node is Ready
    local not_ready_count
    not_ready_count=$($KUBECTL_CMD get nodes --no-headers | grep -v " Ready " | wc -l | tr -d ' ')

    if [ "$not_ready_count" -gt 0 ]; then
        log_error "${not_ready_count} nodes are not Ready"
        $KUBECTL_CMD get nodes
        return 1
    fi

    log_success "All ${node_count} nodes are Ready"
    $KUBECTL_CMD get nodes -o wide
    return 0
}

# Function to check system pods
check_system_pods() {
    log_info "Checking system pods..."

    # Check kube-system namespace pods
    local not_running
    not_running=$($KUBECTL_CMD get pods -n kube-system --no-headers | grep -v "Running\|Completed" | wc -l | tr -d ' ')

    if [ "$not_running" -gt 0 ]; then
        log_error "${not_running} system pods are not Running"
        $KUBECTL_CMD get pods -n kube-system
        return 1
    fi

    log_success "All system pods are Running"
    $KUBECTL_CMD get pods -n kube-system
    return 0
}

# Function to check CoreDNS
check_coredns() {
    log_info "Checking CoreDNS..."

    local coredns_ready
    coredns_ready=$($KUBECTL_CMD get deployment -n kube-system coredns -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")

    if [ "$coredns_ready" -lt 1 ]; then
        log_error "CoreDNS is not ready"
        return 1
    fi

    log_success "CoreDNS is ready (${coredns_ready} replicas)"
    return 0
}

# Function to check metrics-server
check_metrics_server() {
    log_info "Checking metrics-server..."

    if ! $KUBECTL_CMD get deployment -n kube-system metrics-server >/dev/null 2>&1; then
        log_warn "Metrics-server deployment not found"
        return 1
    fi

    local metrics_ready
    metrics_ready=$($KUBECTL_CMD get deployment -n kube-system metrics-server -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")

    if [ "$metrics_ready" -lt 1 ]; then
        log_warn "Metrics-server is not ready"
        return 1
    fi

    log_success "Metrics-server is ready"
    return 0
}

# Function to test DNS resolution
test_dns_resolution() {
    log_info "Testing DNS resolution..."

    # Create test pod
    local test_pod_yaml
    test_pod_yaml=$(cat <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: dns-test
  namespace: default
spec:
  containers:
  - name: dns-test
    image: busybox:1.28
    command: ['sh', '-c', 'nslookup kubernetes.default && sleep 30']
  restartPolicy: Never
EOF
)

    echo "$test_pod_yaml" | $KUBECTL_CMD apply -f - >/dev/null 2>&1

    # Wait for pod to complete
    if $KUBECTL_CMD wait --for=condition=Ready pod/dns-test --timeout=30s >/dev/null 2>&1; then
        log_success "DNS resolution test passed"
        $KUBECTL_CMD delete pod dns-test >/dev/null 2>&1 || true
        return 0
    else
        log_error "DNS resolution test failed"
        $KUBECTL_CMD logs dns-test 2>/dev/null || true
        $KUBECTL_CMD delete pod dns-test >/dev/null 2>&1 || true
        return 1
    fi
}

# Function to test storage provisioning
test_storage_provisioning() {
    log_info "Testing storage provisioning..."

    # Check for storage class
    if ! $KUBECTL_CMD get storageclass local-path >/dev/null 2>&1; then
        log_error "Storage class 'local-path' not found"
        return 1
    fi

    # Create test PVC
    local test_pvc_yaml
    test_pvc_yaml=$(cat <<'EOF'
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: storage-test
  namespace: default
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: local-path
  resources:
    requests:
      storage: 1Gi
EOF
)

    echo "$test_pvc_yaml" | $KUBECTL_CMD apply -f - >/dev/null 2>&1

    # Wait for PVC to be bound
    if $KUBECTL_CMD wait --for=jsonpath='{.status.phase}'=Bound pvc/storage-test --timeout=30s >/dev/null 2>&1; then
        log_success "Storage provisioning test passed"
        $KUBECTL_CMD delete pvc storage-test >/dev/null 2>&1 || true
        return 0
    else
        log_error "Storage provisioning test failed"
        $KUBECTL_CMD describe pvc storage-test 2>/dev/null || true
        $KUBECTL_CMD delete pvc storage-test >/dev/null 2>&1 || true
        return 1
    fi
}

# Function to check API server health
check_api_server_health() {
    log_info "Checking API server health..."

    if $KUBECTL_CMD get --raw /healthz >/dev/null 2>&1; then
        log_success "API server is healthy"
        return 0
    else
        log_error "API server health check failed"
        return 1
    fi
}

# Function to check node resources
check_node_resources() {
    log_info "Checking node resources..."

    echo ""
    echo "Node Resource Usage:"
    $KUBECTL_CMD top nodes 2>/dev/null || log_warn "Metrics not available yet (metrics-server may still be starting)"

    echo ""
    echo "Node Allocatable Resources:"
    $KUBECTL_CMD get nodes -o custom-columns=NAME:.metadata.name,CPU:.status.allocatable.cpu,MEMORY:.status.allocatable.memory,STORAGE:.status.allocatable.ephemeral-storage

    return 0
}

# Function to display cluster summary
display_cluster_summary() {
    log_info "Cluster Summary:"
    echo "================================"

    echo "Cluster Version:"
    $KUBECTL_CMD version --short 2>/dev/null || true

    echo ""
    echo "Nodes (${EXPECTED_NODES} expected):"
    $KUBECTL_CMD get nodes -o wide

    echo ""
    echo "Namespaces:"
    $KUBECTL_CMD get namespaces

    echo ""
    echo "Storage Classes:"
    $KUBECTL_CMD get storageclass

    echo ""
    echo "System Pods:"
    $KUBECTL_CMD get pods -n kube-system

    echo ""
    echo "Cluster Info:"
    $KUBECTL_CMD cluster-info

    echo "================================"
}

# Function to generate validation report
generate_validation_report() {
    local report_file="/tmp/k3s-cluster-validation-report.txt"

    log_info "Generating validation report..."

    {
        echo "Cortex K3s Cluster Validation Report"
        echo "Generated: $(date)"
        echo "================================"
        echo ""
        echo "Test Results:"
        echo "  Tests Passed: ${TESTS_PASSED}"
        echo "  Tests Failed: ${TESTS_FAILED}"
        echo ""
        echo "Cluster Details:"
        $KUBECTL_CMD get nodes -o wide
        echo ""
        echo "System Pods:"
        $KUBECTL_CMD get pods -n kube-system
        echo ""
        echo "================================"
    } > "$report_file"

    log_success "Validation report saved to ${report_file}"
    echo "$report_file"
}

# Main function
main() {
    log_info "Starting K3s cluster verification"
    echo ""

    # Check kubectl access
    if ! check_kubectl_access; then
        log_error "Cannot access cluster"
        exit 1
    fi

    echo ""
    log_info "Running verification tests..."
    echo ""

    # Run all tests
    run_test "API Server Health" "check_api_server_health"
    run_test "All Nodes Ready" "check_nodes_ready"
    run_test "System Pods Running" "check_system_pods"
    run_test "CoreDNS Ready" "check_coredns"
    run_test "Metrics Server Ready" "check_metrics_server"
    run_test "DNS Resolution" "test_dns_resolution"
    run_test "Storage Provisioning" "test_storage_provisioning"

    echo ""

    # Check node resources
    check_node_resources

    echo ""

    # Display cluster summary
    display_cluster_summary

    echo ""

    # Generate report
    report_file=$(generate_validation_report)

    echo ""
    log_info "Verification Results:"
    log_info "  Tests Passed: ${TESTS_PASSED}"
    log_info "  Tests Failed: ${TESTS_FAILED}"

    if [ "$TESTS_FAILED" -eq 0 ]; then
        log_success "All tests passed - cluster is healthy and ready"
        exit 0
    else
        log_error "Some tests failed - cluster may not be fully ready"
        exit 1
    fi
}

# Run main function
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi
