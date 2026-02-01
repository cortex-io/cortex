#!/bin/bash
# OpenTelemetry Deployment Script for Cortex
# Phase 3: Advanced Observability

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAMESPACE_OBSERVABILITY="cortex-observability"
NAMESPACE_CORTEX="cortex-system"

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl not found. Please install kubectl."
        exit 1
    fi

    # Check cluster connection
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster."
        exit 1
    fi

    # Check if Prometheus Operator is installed
    if ! kubectl get crd servicemonitors.monitoring.coreos.com &> /dev/null; then
        log_warn "Prometheus Operator CRDs not found. ServiceMonitors will not work."
        log_warn "Install Prometheus Operator first or disable ServiceMonitors."
    fi

    log_info "Prerequisites check passed."
}

create_namespaces() {
    log_info "Creating namespaces..."

    # Create observability namespace
    kubectl create namespace "$NAMESPACE_OBSERVABILITY" --dry-run=client -o yaml | kubectl apply -f -
    kubectl label namespace "$NAMESPACE_OBSERVABILITY" name="$NAMESPACE_OBSERVABILITY" --overwrite

    # Ensure cortex-system namespace exists
    if ! kubectl get namespace "$NAMESPACE_CORTEX" &> /dev/null; then
        kubectl create namespace "$NAMESPACE_CORTEX"
        kubectl label namespace "$NAMESPACE_CORTEX" name="$NAMESPACE_CORTEX" --overwrite
    fi

    log_info "Namespaces created."
}

deploy_otel_collector_config() {
    log_info "Deploying OpenTelemetry Collector configuration..."

    # Create ConfigMap from the configuration file
    kubectl create configmap otel-collector-config \
        --from-file=otel-collector-config.yaml="${SCRIPT_DIR}/otel-collector-config.yaml" \
        -n "$NAMESPACE_OBSERVABILITY" \
        --dry-run=client -o yaml | kubectl apply -f -

    log_info "OTel Collector configuration deployed."
}

deploy_otel_collector() {
    log_info "Deploying OpenTelemetry Collector..."

    kubectl apply -f "${SCRIPT_DIR}/otel-collector-deployment.yaml"

    # Wait for deployment to be ready
    log_info "Waiting for OTel Collector to be ready..."
    kubectl wait --for=condition=available --timeout=300s \
        deployment/otel-collector -n "$NAMESPACE_OBSERVABILITY"

    log_info "OTel Collector deployed successfully."
}

deploy_otel_agent_config() {
    log_info "Deploying OpenTelemetry Agent configuration..."

    # Agent config is embedded in the DaemonSet YAML
    # No separate ConfigMap needed unless you want to override

    log_info "OTel Agent configuration ready."
}

deploy_otel_agent() {
    log_info "Deploying OpenTelemetry Agent..."

    kubectl apply -f "${SCRIPT_DIR}/otel-agent-daemonset.yaml"

    # Wait for DaemonSet to be ready
    log_info "Waiting for OTel Agent to be ready..."
    kubectl rollout status daemonset/otel-agent -n "$NAMESPACE_OBSERVABILITY" --timeout=300s

    log_info "OTel Agent deployed successfully."
}

deploy_cortex_instrumentation() {
    log_info "Deploying Cortex instrumentation configuration..."

    kubectl apply -f "${SCRIPT_DIR}/cortex-instrumentation.yaml"

    log_info "Cortex instrumentation configuration deployed."
}

verify_deployment() {
    log_info "Verifying deployment..."

    # Check OTel Collector
    COLLECTOR_READY=$(kubectl get deployment otel-collector -n "$NAMESPACE_OBSERVABILITY" -o jsonpath='{.status.readyReplicas}')
    COLLECTOR_DESIRED=$(kubectl get deployment otel-collector -n "$NAMESPACE_OBSERVABILITY" -o jsonpath='{.status.replicas}')

    if [ "$COLLECTOR_READY" = "$COLLECTOR_DESIRED" ]; then
        log_info "OTel Collector: ${COLLECTOR_READY}/${COLLECTOR_DESIRED} replicas ready ✓"
    else
        log_warn "OTel Collector: ${COLLECTOR_READY}/${COLLECTOR_DESIRED} replicas ready"
    fi

    # Check OTel Agent
    AGENT_DESIRED=$(kubectl get daemonset otel-agent -n "$NAMESPACE_OBSERVABILITY" -o jsonpath='{.status.desiredNumberScheduled}')
    AGENT_READY=$(kubectl get daemonset otel-agent -n "$NAMESPACE_OBSERVABILITY" -o jsonpath='{.status.numberReady}')

    if [ "$AGENT_READY" = "$AGENT_DESIRED" ]; then
        log_info "OTel Agent: ${AGENT_READY}/${AGENT_DESIRED} pods ready ✓"
    else
        log_warn "OTel Agent: ${AGENT_READY}/${AGENT_DESIRED} pods ready"
    fi

    # Check services
    log_info "Services:"
    kubectl get svc -n "$NAMESPACE_OBSERVABILITY" -l app.kubernetes.io/part-of=cortex

    # Show endpoints
    log_info "OpenTelemetry endpoints:"
    echo "  OTLP gRPC: otel-collector.${NAMESPACE_OBSERVABILITY}.svc.cluster.local:4317"
    echo "  OTLP HTTP: otel-collector.${NAMESPACE_OBSERVABILITY}.svc.cluster.local:4318"
    echo "  Prometheus: otel-collector.${NAMESPACE_OBSERVABILITY}.svc.cluster.local:8889"
}

show_next_steps() {
    log_info "Deployment complete!"
    echo ""
    echo "Next steps:"
    echo "1. Deploy Tempo for trace storage:"
    echo "   kubectl apply -f ../monitoring/tempo-deployment.yaml"
    echo ""
    echo "2. Deploy Loki for log aggregation:"
    echo "   kubectl apply -f ../monitoring/loki-deployment.yaml"
    echo ""
    echo "3. Configure Grafana data sources:"
    echo "   - Prometheus: http://prometheus-operated.cortex-system.svc.cluster.local:9090"
    echo "   - Tempo: http://tempo.cortex-system.svc.cluster.local:3100"
    echo "   - Loki: http://loki.cortex-system.svc.cluster.local:3100"
    echo ""
    echo "4. Add instrumentation to Cortex agents:"
    echo "   See: ${SCRIPT_DIR}/tracing-config.md"
    echo ""
    echo "5. Test the setup:"
    echo "   kubectl run test-otel --image=curlimages/curl --rm -it -- \\"
    echo "     curl -X POST http://otel-collector.${NAMESPACE_OBSERVABILITY}.svc.cluster.local:4318/v1/traces"
    echo ""
    echo "6. View OTel Collector metrics:"
    echo "   kubectl port-forward -n ${NAMESPACE_OBSERVABILITY} svc/otel-collector 8888:8888"
    echo "   Open: http://localhost:8888/metrics"
    echo ""
    echo "7. Check logs:"
    echo "   kubectl logs -n ${NAMESPACE_OBSERVABILITY} -l app.kubernetes.io/name=otel-collector -f"
}

main() {
    log_info "Starting OpenTelemetry deployment for Cortex..."

    check_prerequisites
    create_namespaces
    deploy_otel_collector_config
    deploy_otel_collector
    deploy_otel_agent_config
    deploy_otel_agent
    deploy_cortex_instrumentation
    verify_deployment
    show_next_steps
}

# Run main function
main "$@"
