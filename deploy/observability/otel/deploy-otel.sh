#!/bin/bash
# Deploy OpenTelemetry stack for Cortex
# This script deploys the OTel collector and related resources

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAMESPACE="monitoring"

echo "=========================================="
echo "Deploying OpenTelemetry Stack for Cortex"
echo "=========================================="

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo "Error: kubectl not found. Please install kubectl first."
    exit 1
fi

# Check if monitoring namespace exists
if ! kubectl get namespace $NAMESPACE &> /dev/null; then
    echo "Creating namespace: $NAMESPACE"
    kubectl create namespace $NAMESPACE
fi

# Step 1: Create ConfigMap from the actual config file
echo ""
echo "Step 1: Creating OTel Collector ConfigMap..."
kubectl create configmap otel-collector-config \
    --from-file=otel-collector-config.yaml \
    --namespace=$NAMESPACE \
    --dry-run=client -o yaml | kubectl apply -f -
echo "✓ ConfigMap created"

# Step 2: Deploy OTel Collector
echo ""
echo "Step 2: Deploying OTel Collector..."
kubectl apply -f "$SCRIPT_DIR/otel-collector-deployment.yaml"
echo "✓ OTel Collector deployed"

# Step 3: Wait for collector to be ready
echo ""
echo "Step 3: Waiting for OTel Collector to be ready..."
kubectl wait --for=condition=ready pod \
    -l app=otel-collector \
    -n $NAMESPACE \
    --timeout=120s
echo "✓ OTel Collector is ready"

# Step 4: Deploy ServiceMonitor for Prometheus
echo ""
echo "Step 4: Deploying ServiceMonitor..."
kubectl apply -f "$SCRIPT_DIR/servicemonitor-otel.yaml"
echo "✓ ServiceMonitor deployed"

# Step 5: Deploy auto-instrumentation (optional)
echo ""
read -p "Deploy OpenTelemetry auto-instrumentation? (requires OTel Operator) [y/N]: " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Checking for OpenTelemetry Operator..."

    if ! kubectl get crd instrumentations.opentelemetry.io &> /dev/null; then
        echo "OpenTelemetry Operator not found. Installing..."
        kubectl apply -f https://github.com/open-telemetry/opentelemetry-operator/releases/latest/download/opentelemetry-operator.yaml

        echo "Waiting for operator to be ready..."
        kubectl wait --for=condition=ready pod \
            -l app.kubernetes.io/name=opentelemetry-operator \
            -n opentelemetry-operator-system \
            --timeout=120s
    fi

    echo "Deploying auto-instrumentation resources..."
    kubectl apply -f "$SCRIPT_DIR/otel-instrumentation.yaml"
    echo "✓ Auto-instrumentation deployed"
else
    echo "Skipping auto-instrumentation"
fi

# Step 6: Verify deployment
echo ""
echo "=========================================="
echo "Deployment Summary"
echo "=========================================="

# Check pods
echo ""
echo "OTel Collector Pods:"
kubectl get pods -n $NAMESPACE -l app=otel-collector

# Check services
echo ""
echo "OTel Collector Service:"
kubectl get svc -n $NAMESPACE otel-collector

# Check ServiceMonitor
echo ""
echo "ServiceMonitor:"
kubectl get servicemonitor -n $NAMESPACE otel-collector

# Display access information
echo ""
echo "=========================================="
echo "Access Information"
echo "=========================================="
echo ""
echo "OTLP gRPC Endpoint:   otel-collector.monitoring.svc.cluster.local:4317"
echo "OTLP HTTP Endpoint:   otel-collector.monitoring.svc.cluster.local:4318"
echo "Prometheus Endpoint:  otel-collector.monitoring.svc.cluster.local:8889"
echo "Health Check:         otel-collector.monitoring.svc.cluster.local:13133/health"
echo "Zpages (debug):       otel-collector.monitoring.svc.cluster.local:55679"
echo ""

# Test health endpoint
echo "Testing health endpoint..."
kubectl run otel-health-check --rm -it --restart=Never \
    --image=curlimages/curl:latest \
    --namespace=$NAMESPACE \
    -- curl -s http://otel-collector.monitoring.svc.cluster.local:13133/health || echo "Health check skipped (timeout)"

echo ""
echo "=========================================="
echo "Next Steps"
echo "=========================================="
echo ""
echo "1. Verify Prometheus is scraping OTel metrics:"
echo "   kubectl port-forward -n monitoring svc/prometheus-prometheus 9090:9090"
echo "   Open: http://localhost:9090/targets (look for 'otel-collector')"
echo ""
echo "2. Add instrumentation to your services:"
echo "   See: $SCRIPT_DIR/distributed-tracing-guide.md"
echo ""
echo "3. (Optional) Deploy Jaeger for trace visualization:"
echo "   kubectl apply -f https://raw.githubusercontent.com/jaegertracing/jaeger-operator/main/deploy/crds/jaegertracing.io_jaegers_crd.yaml"
echo "   kubectl apply -f https://raw.githubusercontent.com/jaegertracing/jaeger-operator/main/deploy/service_account.yaml"
echo "   kubectl apply -f https://raw.githubusercontent.com/jaegertracing/jaeger-operator/main/deploy/role.yaml"
echo "   kubectl apply -f https://raw.githubusercontent.com/jaegertracing/jaeger-operator/main/deploy/role_binding.yaml"
echo "   kubectl apply -f https://raw.githubusercontent.com/jaegertracing/jaeger-operator/main/deploy/operator.yaml"
echo ""
echo "4. View OTel Collector logs:"
echo "   kubectl logs -n monitoring -l app=otel-collector -f"
echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
