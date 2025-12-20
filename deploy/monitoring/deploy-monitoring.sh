#!/bin/bash
set -euo pipefail

# Deploy Monitoring Stack to Talos Kubernetes Cluster
# Phase 2: Kubernetes Deployment - kube-prometheus-stack
# Task: mon-001-k8s

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAMESPACE="monitoring"
RELEASE_NAME="prometheus"
CHART_REPO="prometheus-community"
CHART_NAME="kube-prometheus-stack"
CHART_VERSION="56.0.0"  # Pin to specific version for reproducibility

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
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

    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl not found. Please install kubectl."
        exit 1
    fi

    # Check helm
    if ! command -v helm &> /dev/null; then
        log_error "helm not found. Please install helm."
        exit 1
    fi

    # Check cluster connectivity
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster. Check your kubeconfig."
        exit 1
    fi

    log_success "Prerequisites check passed"
}

# Add Helm repository
add_helm_repo() {
    log_info "Adding Prometheus Community Helm repository..."

    if helm repo list | grep -q "^${CHART_REPO}"; then
        log_info "Repository already exists, updating..."
        helm repo update ${CHART_REPO}
    else
        helm repo add ${CHART_REPO} https://prometheus-community.github.io/helm-charts
        helm repo update
    fi

    log_success "Helm repository configured"
}

# Create namespace
create_namespace() {
    log_info "Creating monitoring namespace..."

    if kubectl get namespace ${NAMESPACE} &> /dev/null; then
        log_warn "Namespace ${NAMESPACE} already exists"
    else
        kubectl apply -f "${SCRIPT_DIR}/namespace.yaml"
        log_success "Namespace created"
    fi
}

# Prepare storage
prepare_storage() {
    log_info "Configuring storage for monitoring..."

    # Check if storage class exists
    if kubectl get storageclass monitoring-local-storage &> /dev/null; then
        log_warn "Storage class already exists"
    else
        log_info "Creating storage class and persistent volumes..."
        log_warn "IMPORTANT: Update node names in storage-class.yaml before applying!"
        log_info "Skipping storage-class.yaml for now. Apply manually after updating node names."
        # kubectl apply -f "${SCRIPT_DIR}/storage-class.yaml"
    fi

    # Check available storage classes
    log_info "Available storage classes:"
    kubectl get storageclass
}

# Install kube-prometheus-stack
install_prometheus_stack() {
    log_info "Installing kube-prometheus-stack..."

    # Check if already installed
    if helm list -n ${NAMESPACE} | grep -q "^${RELEASE_NAME}"; then
        log_warn "Release ${RELEASE_NAME} already exists. Upgrading..."
        helm upgrade ${RELEASE_NAME} ${CHART_REPO}/${CHART_NAME} \
            --namespace ${NAMESPACE} \
            --values "${SCRIPT_DIR}/prometheus-values.yaml" \
            --wait \
            --timeout 10m
        log_success "Helm release upgraded"
    else
        helm install ${RELEASE_NAME} ${CHART_REPO}/${CHART_NAME} \
            --namespace ${NAMESPACE} \
            --values "${SCRIPT_DIR}/prometheus-values.yaml" \
            --version ${CHART_VERSION} \
            --create-namespace \
            --wait \
            --timeout 10m
        log_success "Helm release installed"
    fi
}

# Apply ingress configuration
apply_ingress() {
    log_info "Applying ingress configuration..."

    # Check if nginx ingress controller is installed
    if ! kubectl get ingressclass nginx &> /dev/null; then
        log_warn "NGINX Ingress Controller not found. Ingress resources may not work."
        log_info "Install with: kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/cloud/deploy.yaml"
    fi

    kubectl apply -f "${SCRIPT_DIR}/ingress.yaml"
    log_success "Ingress configuration applied"
}

# Verify deployment
verify_deployment() {
    log_info "Verifying deployment..."

    # Wait for pods to be ready
    log_info "Waiting for Prometheus pods to be ready..."
    kubectl wait --for=condition=ready pod \
        -l app.kubernetes.io/name=prometheus \
        -n ${NAMESPACE} \
        --timeout=5m || log_warn "Some Prometheus pods may not be ready yet"

    log_info "Waiting for Grafana pods to be ready..."
    kubectl wait --for=condition=ready pod \
        -l app.kubernetes.io/name=grafana \
        -n ${NAMESPACE} \
        --timeout=5m || log_warn "Grafana pod may not be ready yet"

    log_info "Waiting for Alertmanager pods to be ready..."
    kubectl wait --for=condition=ready pod \
        -l app.kubernetes.io/name=alertmanager \
        -n ${NAMESPACE} \
        --timeout=5m || log_warn "Alertmanager pod may not be ready yet"

    # Show pod status
    echo ""
    log_info "Pod status:"
    kubectl get pods -n ${NAMESPACE}

    # Show services
    echo ""
    log_info "Services:"
    kubectl get svc -n ${NAMESPACE}

    # Show ingresses
    echo ""
    log_info "Ingresses:"
    kubectl get ingress -n ${NAMESPACE}

    # Show persistent volumes
    echo ""
    log_info "Persistent Volume Claims:"
    kubectl get pvc -n ${NAMESPACE}
}

# Get access information
get_access_info() {
    echo ""
    log_success "Deployment complete!"
    echo ""
    log_info "Access Information:"
    echo ""

    # Grafana
    echo "  Grafana:"
    echo "    URL: http://grafana.cortex.local (or use port-forward)"
    echo "    Port-forward: kubectl port-forward -n ${NAMESPACE} svc/prometheus-grafana 3000:80"
    echo "    Username: admin"
    echo "    Password: cortex-admin-changeme"
    echo ""

    # Prometheus
    echo "  Prometheus:"
    echo "    URL: http://prometheus.cortex.local (or use port-forward)"
    echo "    Port-forward: kubectl port-forward -n ${NAMESPACE} svc/prometheus-prometheus 9090:9090"
    echo ""

    # Alertmanager
    echo "  Alertmanager:"
    echo "    URL: http://alertmanager.cortex.local (or use port-forward)"
    echo "    Port-forward: kubectl port-forward -n ${NAMESPACE} svc/prometheus-alertmanager 9093:9093"
    echo ""

    log_info "Note: Update /etc/hosts or DNS to resolve *.cortex.local to your cluster IP"
    log_info "Or use port-forwarding for local access"
}

# Rollback function
rollback_deployment() {
    log_warn "Rolling back deployment..."
    helm rollback ${RELEASE_NAME} -n ${NAMESPACE}
    log_success "Rollback complete"
}

# Uninstall function
uninstall_monitoring() {
    log_warn "Uninstalling monitoring stack..."

    read -p "Are you sure you want to uninstall? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        log_info "Uninstall cancelled"
        return
    fi

    helm uninstall ${RELEASE_NAME} -n ${NAMESPACE}
    kubectl delete -f "${SCRIPT_DIR}/ingress.yaml" || true
    kubectl delete namespace ${NAMESPACE} || true

    log_success "Monitoring stack uninstalled"
}

# Main deployment function
main() {
    log_info "Starting monitoring stack deployment..."
    echo ""

    check_prerequisites
    add_helm_repo
    create_namespace
    prepare_storage
    install_prometheus_stack
    apply_ingress
    verify_deployment
    get_access_info

    echo ""
    log_success "Monitoring stack deployment complete!"
    log_info "Next steps:"
    echo "  1. Update /etc/hosts with cluster IP for *.cortex.local"
    echo "  2. Configure DNS for production use"
    echo "  3. Update Grafana admin password"
}

# Command line interface
case "${1:-deploy}" in
    deploy)
        main
        ;;
    verify)
        verify_deployment
        ;;
    info)
        get_access_info
        ;;
    rollback)
        rollback_deployment
        ;;
    uninstall)
        uninstall_monitoring
        ;;
    *)
        echo "Usage: $0 {deploy|verify|info|rollback|uninstall}"
        echo ""
        echo "Commands:"
        echo "  deploy     - Deploy the monitoring stack (default)"
        echo "  verify     - Verify deployment status"
        echo "  info       - Show access information"
        echo "  rollback   - Rollback to previous version"
        echo "  uninstall  - Uninstall monitoring stack"
        exit 1
        ;;
esac
