#!/usr/bin/env bash
set -euo pipefail

# Cortex Monitoring Stack - Deployment Verification Script
# Verifies that all components are deployed and functioning correctly

NAMESPACE="${CORTEX_NAMESPACE:-cortex}"
DEPLOYMENT_TYPE="${1:-local}"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

pass_count=0
fail_count=0
warn_count=0

log_pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((pass_count++))
}

log_fail() {
    echo -e "${RED}✗${NC} $1"
    ((fail_count++))
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((warn_count++))
}

log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# Verify local deployment
verify_local() {
    log_info "Verifying local Docker Compose deployment..."
    echo ""

    # Check if containers are running
    log_info "Checking container status..."
    for container in cortex-prometheus cortex-alertmanager cortex-grafana; do
        if docker ps --filter "name=$container" --filter "status=running" | grep -q "$container"; then
            log_pass "Container $container is running"
        else
            log_fail "Container $container is not running"
        fi
    done
    echo ""

    # Check service health
    log_info "Checking service health..."

    # Prometheus
    if curl -s http://localhost:9090/-/ready > /dev/null 2>&1; then
        log_pass "Prometheus is healthy"
    else
        log_fail "Prometheus is not healthy"
    fi

    # AlertManager
    if curl -s http://localhost:9093/-/ready > /dev/null 2>&1; then
        log_pass "AlertManager is healthy"
    else
        log_fail "AlertManager is not healthy"
    fi

    # Grafana
    if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
        log_pass "Grafana is healthy"
    else
        log_fail "Grafana is not healthy"
    fi
    echo ""

    # Check Prometheus targets
    log_info "Checking Prometheus scrape targets..."
    targets=$(curl -s http://localhost:9090/api/v1/targets 2>/dev/null | jq -r '.data.activeTargets[] | "\(.labels.job) - \(.health)"' 2>/dev/null || echo "")
    if [ -n "$targets" ]; then
        while IFS= read -r target; do
            job=$(echo "$target" | cut -d' ' -f1)
            health=$(echo "$target" | cut -d' ' -f3)
            if [ "$health" = "up" ]; then
                log_pass "Target $job is up"
            else
                log_warn "Target $job is $health"
            fi
        done <<< "$targets"
    else
        log_warn "Could not retrieve Prometheus targets"
    fi
    echo ""

    # Check Prometheus rules
    log_info "Checking Prometheus rules..."
    rules=$(curl -s http://localhost:9090/api/v1/rules 2>/dev/null | jq -r '.data.groups[].name' 2>/dev/null || echo "")
    if [ -n "$rules" ]; then
        rule_count=$(echo "$rules" | wc -l | tr -d ' ')
        log_pass "Found $rule_count rule groups loaded"
    else
        log_fail "No Prometheus rules loaded"
    fi
    echo ""

    # Check Grafana datasources
    log_info "Checking Grafana datasources..."
    datasources=$(curl -s -u admin:admin http://localhost:3000/api/datasources 2>/dev/null | jq -r '.[].name' 2>/dev/null || echo "")
    if [ -n "$datasources" ]; then
        while IFS= read -r ds; do
            log_pass "Datasource '$ds' configured"
        done <<< "$datasources"
    else
        log_warn "Could not retrieve Grafana datasources"
    fi
    echo ""

    # Check Grafana dashboards
    log_info "Checking Grafana dashboards..."
    dashboards=$(curl -s -u admin:admin http://localhost:3000/api/search 2>/dev/null | jq -r '.[].title' 2>/dev/null || echo "")
    if [ -n "$dashboards" ]; then
        while IFS= read -r dashboard; do
            log_pass "Dashboard '$dashboard' available"
        done <<< "$dashboards"
    else
        log_warn "Could not retrieve Grafana dashboards"
    fi
}

# Verify Kubernetes deployment
verify_kubernetes() {
    log_info "Verifying Kubernetes deployment in namespace: $NAMESPACE"
    echo ""

    # Check if namespace exists
    if kubectl get namespace "$NAMESPACE" > /dev/null 2>&1; then
        log_pass "Namespace $NAMESPACE exists"
    else
        log_fail "Namespace $NAMESPACE does not exist"
        return
    fi
    echo ""

    # Check deployments/statefulsets
    log_info "Checking deployments and statefulsets..."

    for resource in statefulset/prometheus deployment/alertmanager deployment/grafana; do
        type=$(echo "$resource" | cut -d'/' -f1)
        name=$(echo "$resource" | cut -d'/' -f2)
        if kubectl get "$resource" -n "$NAMESPACE" > /dev/null 2>&1; then
            ready=$(kubectl get "$resource" -n "$NAMESPACE" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
            replicas=$(kubectl get "$resource" -n "$NAMESPACE" -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "0")
            if [ "$ready" = "$replicas" ] && [ "$ready" != "0" ]; then
                log_pass "$type/$name is ready ($ready/$replicas replicas)"
            else
                log_fail "$type/$name is not ready ($ready/$replicas replicas)"
            fi
        else
            log_fail "$type/$name does not exist"
        fi
    done
    echo ""

    # Check services
    log_info "Checking services..."
    for svc in prometheus alertmanager grafana; do
        if kubectl get service "$svc" -n "$NAMESPACE" > /dev/null 2>&1; then
            log_pass "Service $svc exists"
        else
            log_fail "Service $svc does not exist"
        fi
    done
    echo ""

    # Check ConfigMaps
    log_info "Checking ConfigMaps..."
    for cm in prometheus-config prometheus-rules alertmanager-config grafana-datasources grafana-dashboards; do
        if kubectl get configmap "$cm" -n "$NAMESPACE" > /dev/null 2>&1; then
            log_pass "ConfigMap $cm exists"
        else
            log_fail "ConfigMap $cm does not exist"
        fi
    done
    echo ""

    # Check ServiceMonitors and PodMonitors
    log_info "Checking monitoring CRDs..."
    if kubectl get crd servicemonitors.monitoring.coreos.com > /dev/null 2>&1; then
        sm_count=$(kubectl get servicemonitors -n "$NAMESPACE" 2>/dev/null | grep -v NAME | wc -l | tr -d ' ')
        log_pass "Found $sm_count ServiceMonitors"
    else
        log_warn "ServiceMonitor CRD not found (Prometheus Operator not installed?)"
    fi

    if kubectl get crd podmonitors.monitoring.coreos.com > /dev/null 2>&1; then
        pm_count=$(kubectl get podmonitors -n "$NAMESPACE" 2>/dev/null | grep -v NAME | wc -l | tr -d ' ')
        log_pass "Found $pm_count PodMonitors"
    else
        log_warn "PodMonitor CRD not found (Prometheus Operator not installed?)"
    fi
    echo ""

    # Check pod status
    log_info "Checking pod status..."
    pods=$(kubectl get pods -n "$NAMESPACE" -o json 2>/dev/null | jq -r '.items[] | "\(.metadata.name) \(.status.phase)"' 2>/dev/null || echo "")
    if [ -n "$pods" ]; then
        while IFS= read -r pod_info; do
            pod=$(echo "$pod_info" | cut -d' ' -f1)
            phase=$(echo "$pod_info" | cut -d' ' -f2)
            if [ "$phase" = "Running" ]; then
                log_pass "Pod $pod is Running"
            else
                log_fail "Pod $pod is $phase"
            fi
        done <<< "$pods"
    else
        log_fail "No pods found"
    fi
}

# Display summary
display_summary() {
    echo ""
    echo "======================================"
    echo "Verification Summary"
    echo "======================================"
    echo -e "${GREEN}Passed:${NC} $pass_count"
    echo -e "${YELLOW}Warnings:${NC} $warn_count"
    echo -e "${RED}Failed:${NC} $fail_count"
    echo "======================================"
    echo ""

    if [ $fail_count -eq 0 ]; then
        echo -e "${GREEN}All checks passed!${NC}"
        echo ""
        if [ "$DEPLOYMENT_TYPE" = "local" ]; then
            echo "Access URLs:"
            echo "  Prometheus:   http://localhost:9090"
            echo "  AlertManager: http://localhost:9093"
            echo "  Grafana:      http://localhost:3000 (admin/admin)"
        else
            echo "Port-forward commands:"
            echo "  kubectl port-forward -n $NAMESPACE svc/prometheus 9090:9090"
            echo "  kubectl port-forward -n $NAMESPACE svc/alertmanager 9093:9093"
            echo "  kubectl port-forward -n $NAMESPACE svc/grafana 3000:3000"
        fi
        exit 0
    else
        echo -e "${RED}Some checks failed. Please review the output above.${NC}"
        exit 1
    fi
}

# Main
main() {
    echo "======================================"
    echo "Cortex Monitoring Stack Verification"
    echo "======================================"
    echo ""

    case "$DEPLOYMENT_TYPE" in
        local|docker)
            verify_local
            ;;
        k8s|kubernetes)
            verify_kubernetes
            ;;
        *)
            echo "Usage: $0 {local|kubernetes}"
            exit 1
            ;;
    esac

    display_summary
}

main "$@"
