#!/usr/bin/env bash
# Test and validate Helm charts

set -euo pipefail

CHART_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/mcp-server" && pwd)"
VALUES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/values" && pwd)"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

# Test chart structure
test_chart_structure() {
    log_info "Testing chart structure..."

    local required_files=(
        "Chart.yaml"
        "values.yaml"
        "templates/_helpers.tpl"
        "templates/deployment.yaml"
        "templates/service.yaml"
        "templates/configmap.yaml"
        "templates/secret.yaml"
        "templates/serviceaccount.yaml"
        "templates/hpa.yaml"
        "templates/pdb.yaml"
        "templates/scaledobject.yaml"
        "templates/NOTES.txt"
    )

    for file in "${required_files[@]}"; do
        if [ -f "$CHART_DIR/$file" ]; then
            log_info "✓ Found: $file"
        else
            log_error "✗ Missing: $file"
            return 1
        fi
    done

    log_info "Chart structure test passed"
}

# Lint chart with all values files
lint_charts() {
    log_info "Linting charts..."

    # Lint with default values
    log_info "Linting with default values..."
    if helm lint "$CHART_DIR"; then
        log_info "✓ Default values lint passed"
    else
        log_error "✗ Default values lint failed"
        return 1
    fi

    # Lint with each values file
    local values_files=(
        "n8n-mcp.yaml"
        "talos-mcp.yaml"
        "proxmox-mcp.yaml"
        "resource-manager.yaml"
    )

    for values_file in "${values_files[@]}"; do
        log_info "Linting with $values_file..."
        if helm lint "$CHART_DIR" -f "$VALUES_DIR/$values_file"; then
            log_info "✓ $values_file lint passed"
        else
            log_error "✗ $values_file lint failed"
            return 1
        fi
    done

    log_info "All lint tests passed"
}

# Template rendering test
test_templates() {
    log_info "Testing template rendering..."

    local values_files=(
        "n8n-mcp.yaml"
        "talos-mcp.yaml"
        "proxmox-mcp.yaml"
        "resource-manager.yaml"
    )

    for values_file in "${values_files[@]}"; do
        local server_name="${values_file%.yaml}"
        log_info "Rendering templates for $server_name..."

        if helm template "$server_name" "$CHART_DIR" \
            -f "$VALUES_DIR/$values_file" \
            --namespace cortex-mcp > /dev/null; then
            log_info "✓ $server_name templates rendered successfully"
        else
            log_error "✗ $server_name template rendering failed"
            return 1
        fi
    done

    log_info "Template rendering tests passed"
}

# Validate Kubernetes resources
validate_k8s_resources() {
    log_info "Validating Kubernetes resources..."

    local values_files=(
        "n8n-mcp.yaml"
        "talos-mcp.yaml"
        "proxmox-mcp.yaml"
        "resource-manager.yaml"
    )

    for values_file in "${values_files[@]}"; do
        local server_name="${values_file%.yaml}"
        log_info "Validating K8s resources for $server_name..."

        # Render and validate with kubectl
        if helm template "$server_name" "$CHART_DIR" \
            -f "$VALUES_DIR/$values_file" \
            --namespace cortex-mcp | kubectl apply --dry-run=client -f - > /dev/null; then
            log_info "✓ $server_name K8s validation passed"
        else
            log_warn "⚠ $server_name K8s validation failed (may require cluster connection)"
        fi
    done

    log_info "Kubernetes resource validation complete"
}

# Check for required values
check_required_values() {
    log_info "Checking for placeholder values that need to be filled..."

    local values_files=(
        "n8n-mcp.yaml"
        "talos-mcp.yaml"
        "proxmox-mcp.yaml"
        "resource-manager.yaml"
    )

    local found_placeholders=0

    for values_file in "${values_files[@]}"; do
        log_info "Checking $values_file..."

        # Look for empty base64 encoded values in secret data
        if grep -q 'data:' "$VALUES_DIR/$values_file"; then
            log_warn "⚠ $values_file contains secret placeholders - fill before deployment"
            found_placeholders=1
        fi
    done

    if [ $found_placeholders -eq 0 ]; then
        log_info "✓ No obvious placeholders found"
    else
        log_warn "Remember to fill in secret values before deployment!"
    fi
}

# Main test runner
main() {
    log_info "Starting Helm chart tests..."
    echo ""

    local failed=0

    test_chart_structure || failed=1
    echo ""

    lint_charts || failed=1
    echo ""

    test_templates || failed=1
    echo ""

    validate_k8s_resources || failed=1
    echo ""

    check_required_values
    echo ""

    if [ $failed -eq 0 ]; then
        log_info "=========================================="
        log_info "All tests passed! ✓"
        log_info "=========================================="
        log_info ""
        log_info "Next steps:"
        log_info "1. Fill in secret values in values/*.yaml files"
        log_info "2. Review and customize configuration as needed"
        log_info "3. Run: ./install-mcp-servers.sh"
        return 0
    else
        log_error "=========================================="
        log_error "Some tests failed! ✗"
        log_error "=========================================="
        return 1
    fi
}

main "$@"
