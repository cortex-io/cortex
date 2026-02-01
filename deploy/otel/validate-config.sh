#!/bin/bash
# OpenTelemetry Configuration Validation Script

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ERRORS=0
WARNINGS=0

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
    ((ERRORS++))
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARNINGS++))
}

log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

echo "OpenTelemetry Configuration Validation"
echo "======================================="
echo ""

# 1. Validate YAML syntax
log_info "Validating YAML syntax..."

for file in otel-collector-config.yaml otel-collector-deployment.yaml otel-agent-daemonset.yaml cortex-instrumentation.yaml; do
    if command -v yq &> /dev/null; then
        if yq eval '.' "${SCRIPT_DIR}/${file}" &> /dev/null; then
            log_success "${file}: Valid YAML"
        else
            log_error "${file}: Invalid YAML syntax"
        fi
    elif command -v python3 &> /dev/null; then
        if python3 -c "import yaml; yaml.safe_load(open('${SCRIPT_DIR}/${file}'))" &> /dev/null; then
            log_success "${file}: Valid YAML"
        else
            log_error "${file}: Invalid YAML syntax"
        fi
    else
        log_warn "No YAML validator found (install yq or python3-yaml)"
        break
    fi
done

echo ""

# 2. Validate Kubernetes resources
log_info "Validating Kubernetes resources..."

if command -v kubectl &> /dev/null; then
    for file in otel-collector-deployment.yaml otel-agent-daemonset.yaml cortex-instrumentation.yaml; do
        if kubectl apply -f "${SCRIPT_DIR}/${file}" --dry-run=client &> /dev/null; then
            log_success "${file}: Valid Kubernetes manifest"
        else
            log_error "${file}: Invalid Kubernetes manifest"
        fi
    done
else
    log_warn "kubectl not found, skipping Kubernetes validation"
fi

echo ""

# 3. Validate OTel Collector config
log_info "Validating OTel Collector configuration..."

if command -v docker &> /dev/null; then
    if docker run --rm \
        -v "${SCRIPT_DIR}/otel-collector-config.yaml:/config.yaml" \
        otel/opentelemetry-collector-contrib:0.91.0 \
        validate --config=/config.yaml &> /dev/null; then
        log_success "OTel Collector config is valid"
    else
        log_error "OTel Collector config validation failed"
        docker run --rm \
            -v "${SCRIPT_DIR}/otel-collector-config.yaml:/config.yaml" \
            otel/opentelemetry-collector-contrib:0.91.0 \
            validate --config=/config.yaml 2>&1 | head -20
    fi
else
    log_warn "Docker not found, skipping OTel Collector validation"
fi

echo ""

# 4. Check required fields
log_info "Checking required configuration fields..."

# Check for OTLP receivers
if grep -q "otlp:" "${SCRIPT_DIR}/otel-collector-config.yaml"; then
    log_success "OTLP receiver configured"
else
    log_error "OTLP receiver not found"
fi

# Check for Prometheus exporter
if grep -q "prometheus:" "${SCRIPT_DIR}/otel-collector-config.yaml"; then
    log_success "Prometheus exporter configured"
else
    log_error "Prometheus exporter not found"
fi

# Check for k8sattributes processor
if grep -q "k8sattributes:" "${SCRIPT_DIR}/otel-collector-config.yaml"; then
    log_success "k8sattributes processor configured"
else
    log_warn "k8sattributes processor not found"
fi

# Check for memory_limiter processor
if grep -q "memory_limiter:" "${SCRIPT_DIR}/otel-collector-config.yaml"; then
    log_success "memory_limiter processor configured"
else
    log_error "memory_limiter processor not found"
fi

# Check for batch processor
if grep -q "batch:" "${SCRIPT_DIR}/otel-collector-config.yaml"; then
    log_success "batch processor configured"
else
    log_error "batch processor not found"
fi

echo ""

# 5. Check ServiceAccount and RBAC
log_info "Checking RBAC configuration..."

if grep -q "kind: ServiceAccount" "${SCRIPT_DIR}/otel-collector-deployment.yaml"; then
    log_success "ServiceAccount defined"
else
    log_error "ServiceAccount not found"
fi

if grep -q "kind: ClusterRole" "${SCRIPT_DIR}/otel-collector-deployment.yaml"; then
    log_success "ClusterRole defined"
else
    log_error "ClusterRole not found"
fi

if grep -q "kind: ClusterRoleBinding" "${SCRIPT_DIR}/otel-collector-deployment.yaml"; then
    log_success "ClusterRoleBinding defined"
else
    log_error "ClusterRoleBinding not found"
fi

echo ""

# 6. Check resource limits
log_info "Checking resource limits..."

if grep -q "resources:" "${SCRIPT_DIR}/otel-collector-deployment.yaml" && \
   grep -q "limits:" "${SCRIPT_DIR}/otel-collector-deployment.yaml"; then
    log_success "Resource limits configured for collector"
else
    log_warn "Resource limits not fully configured"
fi

if grep -q "resources:" "${SCRIPT_DIR}/otel-agent-daemonset.yaml" && \
   grep -q "limits:" "${SCRIPT_DIR}/otel-agent-daemonset.yaml"; then
    log_success "Resource limits configured for agent"
else
    log_warn "Resource limits not fully configured"
fi

echo ""

# 7. Check health probes
log_info "Checking health probes..."

if grep -q "livenessProbe:" "${SCRIPT_DIR}/otel-collector-deployment.yaml" && \
   grep -q "readinessProbe:" "${SCRIPT_DIR}/otel-collector-deployment.yaml"; then
    log_success "Health probes configured for collector"
else
    log_warn "Health probes not fully configured"
fi

if grep -q "livenessProbe:" "${SCRIPT_DIR}/otel-agent-daemonset.yaml" && \
   grep -q "readinessProbe:" "${SCRIPT_DIR}/otel-agent-daemonset.yaml"; then
    log_success "Health probes configured for agent"
else
    log_warn "Health probes not fully configured"
fi

echo ""

# 8. Check security contexts
log_info "Checking security contexts..."

if grep -q "securityContext:" "${SCRIPT_DIR}/otel-collector-deployment.yaml"; then
    log_success "Security context configured for collector"
else
    log_warn "Security context not configured"
fi

if grep -q "runAsNonRoot:" "${SCRIPT_DIR}/otel-collector-deployment.yaml"; then
    log_success "Non-root user configured for collector"
else
    log_warn "Running as root (security risk)"
fi

echo ""

# 9. Check file structure
log_info "Checking file structure..."

required_files=(
    "otel-collector-config.yaml"
    "otel-collector-deployment.yaml"
    "otel-agent-daemonset.yaml"
    "cortex-instrumentation.yaml"
    "tracing-config.md"
    "README.md"
    "deploy-otel.sh"
    "test-span.json"
)

for file in "${required_files[@]}"; do
    if [ -f "${SCRIPT_DIR}/${file}" ]; then
        log_success "${file} exists"
    else
        log_error "${file} missing"
    fi
done

echo ""

# 10. Check for common issues
log_info "Checking for common issues..."

# Check for placeholder values
if grep -q "replace-with-config-hash" "${SCRIPT_DIR}/otel-collector-deployment.yaml"; then
    log_warn "Placeholder 'replace-with-config-hash' found - update before deploying"
fi

# Check for insecure settings
if grep -q "insecure: true" "${SCRIPT_DIR}/otel-collector-config.yaml"; then
    log_warn "Insecure TLS settings found (acceptable for internal services)"
fi

# Check endpoint configurations
if grep -q "otel-collector.cortex-observability.svc.cluster.local" "${SCRIPT_DIR}/cortex-instrumentation.yaml"; then
    log_success "Service endpoints correctly configured"
else
    log_warn "Service endpoint configuration may be incorrect"
fi

echo ""
echo "======================================="
echo "Validation Summary"
echo "======================================="

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed!${NC}"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠ ${WARNINGS} warnings found${NC}"
    echo "Review warnings before deploying to production"
    exit 0
else
    echo -e "${RED}✗ ${ERRORS} errors and ${WARNINGS} warnings found${NC}"
    echo "Fix errors before deploying"
    exit 1
fi
