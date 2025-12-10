#!/usr/bin/env bash
# Install all MCP servers using Helm

set -euo pipefail

# Configuration
NAMESPACE="${NAMESPACE:-cortex-mcp}"
CHART_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/mcp-server" && pwd)"
VALUES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/values" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    if ! command -v helm &> /dev/null; then
        log_error "helm is not installed. Please install Helm 3.8+"
        exit 1
    fi

    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed. Please install kubectl"
        exit 1
    fi

    # Check Helm version
    HELM_VERSION=$(helm version --short | grep -oE 'v[0-9]+\.[0-9]+')
    log_info "Helm version: $HELM_VERSION"

    # Check kubectl access
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi

    log_info "Prerequisites check passed"
}

# Create namespace
create_namespace() {
    log_info "Creating namespace: $NAMESPACE"
    kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
    kubectl label namespace "$NAMESPACE" name="$NAMESPACE" cortex.ai/managed=true --overwrite
}

# Install MCP server
install_mcp_server() {
    local server_name=$1
    local values_file=$2

    log_info "Installing $server_name..."

    if [ ! -f "$values_file" ]; then
        log_error "Values file not found: $values_file"
        return 1
    fi

    # Validate chart
    if ! helm lint "$CHART_DIR" -f "$values_file"; then
        log_error "Chart validation failed for $server_name"
        return 1
    fi

    # Install or upgrade
    if helm status "$server_name" -n "$NAMESPACE" &> /dev/null; then
        log_info "Upgrading existing release: $server_name"
        helm upgrade "$server_name" "$CHART_DIR" \
            -f "$values_file" \
            --namespace "$NAMESPACE" \
            --wait \
            --timeout 5m
    else
        log_info "Installing new release: $server_name"
        helm install "$server_name" "$CHART_DIR" \
            -f "$values_file" \
            --namespace "$NAMESPACE" \
            --create-namespace \
            --wait \
            --timeout 5m
    fi

    log_info "Successfully installed $server_name"
}

# Main installation
main() {
    log_info "Starting MCP servers installation..."

    check_prerequisites
    create_namespace

    # Install each MCP server
    declare -A servers=(
        ["n8n-mcp"]="$VALUES_DIR/n8n-mcp.yaml"
        ["talos-mcp"]="$VALUES_DIR/talos-mcp.yaml"
        ["proxmox-mcp"]="$VALUES_DIR/proxmox-mcp.yaml"
        ["resource-manager"]="$VALUES_DIR/resource-manager.yaml"
    )

    for server in "${!servers[@]}"; do
        if install_mcp_server "$server" "${servers[$server]}"; then
            log_info "✓ $server installed successfully"
        else
            log_error "✗ Failed to install $server"
        fi
    done

    log_info "Installation complete!"
    log_info ""
    log_info "Check deployment status:"
    log_info "  kubectl get deployments -n $NAMESPACE"
    log_info ""
    log_info "View logs:"
    log_info "  kubectl logs -n $NAMESPACE -l app.kubernetes.io/name=mcp-server"
    log_info ""
    log_info "Check KEDA ScaledObjects (if enabled):"
    log_info "  kubectl get scaledobject -n $NAMESPACE"
}

# Run main function
main "$@"
