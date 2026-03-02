#!/bin/bash
#
# Wazuh Integration Test Suite
# Tests all components of the Wazuh-Cortex integration
#
# Usage: ./test-integration.sh [--wazuh-ip IP] [--namespace NS]
#

set -euo pipefail

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
WAZUH_IP="${WAZUH_IP:-10.88.140.202}"
NAMESPACE="${NAMESPACE:-cortex-monitoring}"
TEST_RESULTS=()

# Functions
log_test() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    TEST_RESULTS+=("PASS: $1")
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    TEST_RESULTS+=("FAIL: $1")
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Test functions
test_wazuh_manager_reachable() {
    log_test "Testing Wazuh manager reachability..."

    if ssh -q -o BatchMode=yes -o ConnectTimeout=5 root@"$WAZUH_IP" exit 2>/dev/null; then
        log_pass "Wazuh manager reachable via SSH"
        return 0
    else
        log_fail "Cannot reach Wazuh manager via SSH"
        return 1
    fi
}

test_custom_rules_loaded() {
    log_test "Testing custom rules loaded on Wazuh manager..."

    if ssh root@"$WAZUH_IP" 'test -f /var/ossec/etc/rules/cortex-rules.xml' 2>/dev/null; then
        log_pass "Custom rules file exists"

        # Check if rules are loaded
        if ssh root@"$WAZUH_IP" 'grep -q "100100" /var/ossec/logs/ossec.log' 2>/dev/null; then
            log_pass "Custom rules loaded in manager"
            return 0
        else
            log_warn "Rules file exists but may not be loaded"
            return 1
        fi
    else
        log_fail "Custom rules file not found"
        return 1
    fi
}

test_custom_decoders_loaded() {
    log_test "Testing custom decoders loaded on Wazuh manager..."

    if ssh root@"$WAZUH_IP" 'test -f /var/ossec/etc/decoders/cortex-decoders.xml' 2>/dev/null; then
        log_pass "Custom decoders file exists"
        return 0
    else
        log_fail "Custom decoders file not found"
        return 1
    fi
}

test_rule_with_logtest() {
    log_test "Testing rule triggering with wazuh-logtest..."

    local test_log='{"component":"meta-agent","event_type":"authentication_failed","username":"testuser","source_ip":"192.168.1.100"}'

    local result
    result=$(ssh root@"$WAZUH_IP" "/var/ossec/bin/wazuh-logtest" <<< "$test_log" 2>/dev/null || echo "FAILED")

    if echo "$result" | grep -q "rule: 100101"; then
        log_pass "Authentication failure rule (100101) triggered correctly"
        return 0
    else
        log_fail "Authentication failure rule did not trigger"
        echo "$result"
        return 1
    fi
}

test_agents_deployed() {
    log_test "Testing Wazuh agents deployed in Kubernetes..."

    if kubectl get daemonset wazuh-agent -n "$NAMESPACE" &>/dev/null; then
        log_pass "Wazuh agent DaemonSet exists"

        # Check desired vs ready
        local desired ready
        desired=$(kubectl get daemonset wazuh-agent -n "$NAMESPACE" -o jsonpath='{.status.desiredNumberScheduled}')
        ready=$(kubectl get daemonset wazuh-agent -n "$NAMESPACE" -o jsonpath='{.status.numberReady}')

        if [ "$desired" -eq "$ready" ]; then
            log_pass "All $ready/$desired agents ready"
            return 0
        else
            log_warn "$ready/$desired agents ready"
            return 1
        fi
    else
        log_fail "Wazuh agent DaemonSet not found"
        return 1
    fi
}

test_agents_connected() {
    log_test "Testing Wazuh agents connected to manager..."

    local connected_agents
    connected_agents=$(ssh root@"$WAZUH_IP" '/var/ossec/bin/agent_control -l' 2>/dev/null | grep -c "cortex-k3s" || echo "0")

    if [ "$connected_agents" -gt 0 ]; then
        log_pass "$connected_agents Cortex agents connected to manager"
        return 0
    else
        log_fail "No Cortex agents connected to manager"
        return 1
    fi
}

test_agent_logs_collected() {
    log_test "Testing agent log collection..."

    # Get a random agent pod
    local agent_pod
    agent_pod=$(kubectl get pods -n "$NAMESPACE" -l app=wazuh-agent -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

    if [ -z "$agent_pod" ]; then
        log_fail "No agent pods found"
        return 1
    fi

    # Check if agent is collecting logs
    local log_count
    log_count=$(kubectl exec -n "$NAMESPACE" "$agent_pod" -- ls -1 /var/log/cortex 2>/dev/null | wc -l || echo "0")

    if [ "$log_count" -gt 0 ]; then
        log_pass "Agent collecting logs from /var/log/cortex"
        return 0
    else
        log_warn "No logs found in /var/log/cortex (may not exist yet)"
        return 1
    fi
}

test_prometheus_exporter_deployed() {
    log_test "Testing Prometheus exporter deployed..."

    if kubectl get deployment wazuh-exporter -n "$NAMESPACE" &>/dev/null; then
        log_pass "Prometheus exporter deployment exists"

        # Check if ready
        local replicas ready
        replicas=$(kubectl get deployment wazuh-exporter -n "$NAMESPACE" -o jsonpath='{.status.replicas}')
        ready=$(kubectl get deployment wazuh-exporter -n "$NAMESPACE" -o jsonpath='{.status.readyReplicas}')

        if [ "$replicas" -eq "$ready" ]; then
            log_pass "Exporter deployment ready ($ready/$replicas)"
            return 0
        else
            log_warn "Exporter deployment not fully ready ($ready/$replicas)"
            return 1
        fi
    else
        log_fail "Prometheus exporter deployment not found"
        return 1
    fi
}

test_prometheus_exporter_metrics() {
    log_test "Testing Prometheus exporter metrics endpoint..."

    # Port forward to exporter
    kubectl port-forward -n "$NAMESPACE" svc/wazuh-exporter 9140:9140 >/dev/null 2>&1 &
    local pf_pid=$!
    sleep 3

    # Check metrics
    local metrics
    metrics=$(curl -s http://localhost:9140/metrics 2>/dev/null || echo "FAILED")

    kill $pf_pid 2>/dev/null || true

    if echo "$metrics" | grep -q "wazuh_"; then
        log_pass "Exporter serving Wazuh metrics"

        # Count metric types
        local metric_count
        metric_count=$(echo "$metrics" | grep -c "^wazuh_" || echo "0")
        log_pass "Found $metric_count Wazuh metric series"
        return 0
    else
        log_fail "Exporter not serving metrics correctly"
        return 1
    fi
}

test_servicemonitor_exists() {
    log_test "Testing ServiceMonitor for Prometheus scraping..."

    if kubectl get servicemonitor wazuh-exporter -n "$NAMESPACE" &>/dev/null; then
        log_pass "ServiceMonitor exists for Wazuh exporter"
        return 0
    else
        log_warn "ServiceMonitor not found (may not use Prometheus Operator)"
        return 1
    fi
}

test_webhook_forwarder_deployed() {
    log_test "Testing Alertmanager webhook forwarder deployed..."

    if kubectl get deployment wazuh-webhook-forwarder -n "$NAMESPACE" &>/dev/null; then
        log_pass "Webhook forwarder deployment exists"

        # Check if ready
        local replicas ready
        replicas=$(kubectl get deployment wazuh-webhook-forwarder -n "$NAMESPACE" -o jsonpath='{.status.replicas}' 2>/dev/null || echo "0")
        ready=$(kubectl get deployment wazuh-webhook-forwarder -n "$NAMESPACE" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")

        if [ "$replicas" -eq "$ready" ] && [ "$ready" -gt 0 ]; then
            log_pass "Webhook forwarder ready ($ready/$replicas)"
            return 0
        else
            log_warn "Webhook forwarder not fully ready ($ready/$replicas)"
            return 1
        fi
    else
        log_warn "Webhook forwarder deployment not found (optional component)"
        return 1
    fi
}

test_webhook_endpoint() {
    log_test "Testing webhook forwarder endpoint..."

    # Check if deployment exists first
    if ! kubectl get deployment wazuh-webhook-forwarder -n "$NAMESPACE" &>/dev/null; then
        log_warn "Webhook forwarder not deployed, skipping endpoint test"
        return 1
    fi

    # Port forward
    kubectl port-forward -n "$NAMESPACE" svc/wazuh-webhook-forwarder 8080:8080 >/dev/null 2>&1 &
    local pf_pid=$!
    sleep 3

    # Test health endpoint
    local health
    health=$(curl -s http://localhost:8080/healthz 2>/dev/null || echo "FAILED")

    kill $pf_pid 2>/dev/null || true

    if echo "$health" | grep -q "healthy"; then
        log_pass "Webhook forwarder health endpoint responding"
        return 0
    else
        log_fail "Webhook forwarder health endpoint not responding"
        return 1
    fi
}

test_fim_configured() {
    log_test "Testing File Integrity Monitoring configuration..."

    # Check if FIM paths are configured in agent config
    if kubectl get configmap wazuh-agent-config -n "$NAMESPACE" -o yaml | grep -q "file_integrity_monitoring"; then
        log_pass "FIM configuration present in agent ConfigMap"

        # Check critical paths
        if kubectl get configmap wazuh-agent-config -n "$NAMESPACE" -o yaml | grep -q "/etc/cortex"; then
            log_pass "FIM monitoring /etc/cortex"
            return 0
        else
            log_warn "FIM may not be monitoring all critical paths"
            return 1
        fi
    else
        log_fail "FIM configuration not found"
        return 1
    fi
}

test_alerting_rules_deployed() {
    log_test "Testing Prometheus alerting rules for Wazuh..."

    if kubectl get prometheusrule wazuh-alerting-rules -n "$NAMESPACE" &>/dev/null; then
        log_pass "Wazuh alerting rules deployed"

        # Count rules
        local rule_count
        rule_count=$(kubectl get prometheusrule wazuh-alerting-rules -n "$NAMESPACE" -o yaml | grep -c "alert:" || echo "0")
        log_pass "Found $rule_count Wazuh alert rules"
        return 0
    else
        log_warn "Wazuh alerting rules not found (may not use Prometheus Operator)"
        return 1
    fi
}

test_recording_rules_deployed() {
    log_test "Testing Prometheus recording rules for Wazuh..."

    if kubectl get prometheusrule wazuh-recording-rules -n "$NAMESPACE" &>/dev/null; then
        log_pass "Wazuh recording rules deployed"
        return 0
    else
        log_warn "Wazuh recording rules not found (may not use Prometheus Operator)"
        return 1
    fi
}

test_wazuh_api_accessible() {
    log_test "Testing Wazuh API accessibility..."

    local response
    response=$(curl -k -s -o /dev/null -w "%{http_code}" https://"$WAZUH_IP":55000 2>/dev/null || echo "000")

    if [ "$response" = "200" ] || [ "$response" = "401" ]; then
        log_pass "Wazuh API accessible (HTTP $response)"
        return 0
    else
        log_fail "Wazuh API not accessible (HTTP $response)"
        return 1
    fi
}

test_namespace_exists() {
    log_test "Testing namespace exists..."

    if kubectl get namespace "$NAMESPACE" &>/dev/null; then
        log_pass "Namespace $NAMESPACE exists"
        return 0
    else
        log_fail "Namespace $NAMESPACE does not exist"
        return 1
    fi
}

# Generate test alert
test_generate_test_alert() {
    log_test "Generating test security alert..."

    # Get first agent pod
    local agent_pod
    agent_pod=$(kubectl get pods -n "$NAMESPACE" -l app=wazuh-agent -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

    if [ -z "$agent_pod" ]; then
        log_warn "No agent pods found, cannot generate test alert"
        return 1
    fi

    # Inject test log
    kubectl exec -n "$NAMESPACE" "$agent_pod" -- \
        logger -t cortex-meta-agent \
        '{"component":"meta-agent","event_type":"authentication_failed","username":"test-user-integration-test","source_ip":"192.168.1.100"}' \
        2>/dev/null || true

    log_pass "Test alert sent to Wazuh agent"
    log_warn "Check Wazuh dashboard for alert with rule 100101 in ~30 seconds"
    return 0
}

# Print summary
print_summary() {
    echo ""
    echo "========================================="
    echo "           TEST SUMMARY"
    echo "========================================="
    echo ""

    local passed=0
    local failed=0

    for result in "${TEST_RESULTS[@]}"; do
        if [[ $result == PASS:* ]]; then
            ((passed++))
            echo -e "${GREEN}✓${NC} ${result#PASS: }"
        else
            ((failed++))
            echo -e "${RED}✗${NC} ${result#FAIL: }"
        fi
    done

    echo ""
    echo "========================================="
    echo "Total Tests: $((passed + failed))"
    echo -e "${GREEN}Passed: $passed${NC}"
    echo -e "${RED}Failed: $failed${NC}"
    echo "========================================="
    echo ""

    if [ $failed -eq 0 ]; then
        echo -e "${GREEN}All tests passed! ✓${NC}"
        return 0
    else
        echo -e "${RED}Some tests failed. Review output above.${NC}"
        return 1
    fi
}

# Main execution
main() {
    echo "========================================="
    echo "  Wazuh Integration Test Suite"
    echo "========================================="
    echo "Wazuh Manager: $WAZUH_IP"
    echo "Namespace: $NAMESPACE"
    echo ""

    # Core infrastructure tests
    test_namespace_exists
    test_wazuh_manager_reachable
    test_wazuh_api_accessible

    # Wazuh manager tests
    test_custom_rules_loaded
    test_custom_decoders_loaded
    test_rule_with_logtest

    # Agent tests
    test_agents_deployed
    test_agents_connected
    test_agent_logs_collected
    test_fim_configured

    # Prometheus exporter tests
    test_prometheus_exporter_deployed
    test_prometheus_exporter_metrics
    test_servicemonitor_exists

    # Alerting tests
    test_alerting_rules_deployed
    test_recording_rules_deployed

    # Webhook tests
    test_webhook_forwarder_deployed
    test_webhook_endpoint

    # Integration test
    test_generate_test_alert

    # Print summary
    print_summary
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --wazuh-ip)
            WAZUH_IP="$2"
            shift 2
            ;;
        --namespace)
            NAMESPACE="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [--wazuh-ip IP] [--namespace NS]"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Run tests
main
