#!/bin/bash
# Cortex MetalLB Installation and Configuration Script
# Sets up MetalLB for LoadBalancer services in K3s cluster

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
KUBECONFIG="${KUBECONFIG:-/etc/rancher/k3s/k3s.yaml}"
KUBECTL_CMD="${KUBECTL_CMD:-kubectl}"
METALLB_VERSION="v0.13.12"
METALLB_NAMESPACE="metallb-system"

# IP address pool for LoadBalancer services
METALLB_IP_START="10.88.140.155"
METALLB_IP_END="10.88.140.158"

# Function to check kubectl access
check_kubectl_access() {
    log_info "Checking kubectl access..."

    if ! command -v kubectl >/dev/null 2>&1; then
        if command -v k3s >/dev/null 2>&1; then
            KUBECTL_CMD='k3s kubectl'
        else
            log_error "kubectl not found"
            exit 1
        fi
    fi

    if ! $KUBECTL_CMD version --short >/dev/null 2>&1; then
        log_error "Cannot connect to cluster"
        exit 1
    fi

    log_success "kubectl is accessible"
}

# Function to install MetalLB
install_metallb() {
    log_info "Installing MetalLB ${METALLB_VERSION}..."

    # Check if MetalLB is already installed
    if $KUBECTL_CMD get namespace "$METALLB_NAMESPACE" >/dev/null 2>&1; then
        log_warn "MetalLB namespace already exists"
        log_info "Checking MetalLB installation..."

        if $KUBECTL_CMD get deployment -n "$METALLB_NAMESPACE" controller >/dev/null 2>&1; then
            log_success "MetalLB is already installed"
            return 0
        fi
    fi

    # Install MetalLB using manifest
    log_info "Applying MetalLB manifest..."

    local metallb_manifest="https://raw.githubusercontent.com/metallb/metallb/${METALLB_VERSION}/config/manifests/metallb-native.yaml"

    if $KUBECTL_CMD apply -f "$metallb_manifest"; then
        log_success "MetalLB manifest applied"
    else
        log_error "Failed to apply MetalLB manifest"
        exit 1
    fi

    # Wait for MetalLB to be ready
    log_info "Waiting for MetalLB controller to be ready..."
    if $KUBECTL_CMD wait --for=condition=available deployment/controller -n "$METALLB_NAMESPACE" --timeout=300s; then
        log_success "MetalLB controller is ready"
    else
        log_error "MetalLB controller did not become ready"
        exit 1
    fi

    log_info "Waiting for MetalLB speaker daemonset to be ready..."
    if $KUBECTL_CMD wait --for=condition=ready pod -l app=metallb,component=speaker -n "$METALLB_NAMESPACE" --timeout=300s; then
        log_success "MetalLB speaker is ready"
    else
        log_error "MetalLB speaker did not become ready"
        exit 1
    fi
}

# Function to configure MetalLB IP address pool
configure_metallb() {
    log_info "Configuring MetalLB IP address pool..."

    # Create IPAddressPool
    local ipaddresspool_yaml
    ipaddresspool_yaml=$(cat <<EOF
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: cortex-pool
  namespace: ${METALLB_NAMESPACE}
spec:
  addresses:
  - ${METALLB_IP_START}-${METALLB_IP_END}
EOF
)

    echo "$ipaddresspool_yaml" | $KUBECTL_CMD apply -f -
    log_success "IPAddressPool created"

    # Create L2Advertisement
    local l2advertisement_yaml
    l2advertisement_yaml=$(cat <<EOF
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: cortex-l2-advert
  namespace: ${METALLB_NAMESPACE}
spec:
  ipAddressPools:
  - cortex-pool
EOF
)

    echo "$l2advertisement_yaml" | $KUBECTL_CMD apply -f -
    log_success "L2Advertisement created"
}

# Function to test MetalLB with a sample service
test_metallb() {
    log_info "Testing MetalLB with a sample service..."

    # Create test namespace
    $KUBECTL_CMD create namespace metallb-test 2>/dev/null || true

    # Create test deployment
    local test_deployment_yaml
    test_deployment_yaml=$(cat <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-test
  namespace: metallb-test
spec:
  replicas: 1
  selector:
    matchLabels:
      app: nginx-test
  template:
    metadata:
      labels:
        app: nginx-test
    spec:
      containers:
      - name: nginx
        image: nginx:alpine
        ports:
        - containerPort: 80
EOF
)

    echo "$test_deployment_yaml" | $KUBECTL_CMD apply -f -

    # Wait for deployment to be ready
    $KUBECTL_CMD wait --for=condition=available deployment/nginx-test -n metallb-test --timeout=60s

    # Create LoadBalancer service
    local test_service_yaml
    test_service_yaml=$(cat <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: nginx-test
  namespace: metallb-test
spec:
  type: LoadBalancer
  selector:
    app: nginx-test
  ports:
  - port: 80
    targetPort: 80
EOF
)

    echo "$test_service_yaml" | $KUBECTL_CMD apply -f -

    log_info "Waiting for LoadBalancer IP to be assigned..."

    local max_attempts=30
    local attempt=0
    local external_ip=""

    while [ $attempt -lt $max_attempts ]; do
        external_ip=$($KUBECTL_CMD get svc -n metallb-test nginx-test -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")

        if [ -n "$external_ip" ]; then
            log_success "LoadBalancer IP assigned: ${external_ip}"
            break
        fi

        attempt=$((attempt + 1))
        echo -n "."
        sleep 2
    done

    echo ""

    if [ -z "$external_ip" ]; then
        log_error "LoadBalancer IP was not assigned within timeout"
        log_info "Checking service status:"
        $KUBECTL_CMD describe svc -n metallb-test nginx-test
        return 1
    fi

    # Test connectivity
    log_info "Testing connectivity to ${external_ip}..."

    if timeout 5 curl -s "http://${external_ip}" >/dev/null 2>&1; then
        log_success "MetalLB test successful - service is accessible"
    else
        log_warn "Could not connect to test service (may be network/firewall issue)"
    fi

    # Cleanup test resources
    log_info "Cleaning up test resources..."
    $KUBECTL_CMD delete namespace metallb-test

    log_success "MetalLB test complete"
}

# Function to display MetalLB status
display_metallb_status() {
    log_info "MetalLB Status:"
    echo "================================"

    echo "MetalLB Pods:"
    $KUBECTL_CMD get pods -n "$METALLB_NAMESPACE"

    echo ""
    echo "IP Address Pools:"
    $KUBECTL_CMD get ipaddresspool -n "$METALLB_NAMESPACE"

    echo ""
    echo "L2 Advertisements:"
    $KUBECTL_CMD get l2advertisement -n "$METALLB_NAMESPACE"

    echo "================================"
}

# Function to create service example
create_example_manifest() {
    local example_file="/tmp/metallb-service-example.yaml"

    log_info "Creating example LoadBalancer service manifest..."

    cat > "$example_file" <<EOF
# Example LoadBalancer service using MetalLB
apiVersion: v1
kind: Service
metadata:
  name: my-service
  namespace: default
spec:
  type: LoadBalancer
  selector:
    app: my-app
  ports:
  - port: 80
    targetPort: 8080
    protocol: TCP
    name: http

# IP address will be automatically assigned from pool: ${METALLB_IP_START}-${METALLB_IP_END}

# To request a specific IP from the pool:
# metadata:
#   annotations:
#     metallb.universe.tf/address-pool: cortex-pool
# spec:
#   loadBalancerIP: 10.88.140.155
EOF

    log_success "Example manifest created: ${example_file}"
    echo "$example_file"
}

# Main function
main() {
    log_info "Starting MetalLB installation and configuration"

    # Check kubectl access
    check_kubectl_access

    # Install MetalLB
    install_metallb

    # Configure MetalLB
    configure_metallb

    # Display status
    display_metallb_status

    # Test MetalLB
    if [ "${SKIP_TEST:-false}" != "true" ]; then
        test_metallb
    else
        log_info "Skipping MetalLB test (SKIP_TEST=true)"
    fi

    # Create example manifest
    example_file=$(create_example_manifest)

    log_success "MetalLB installation and configuration complete"
    echo ""
    log_info "LoadBalancer IP range: ${METALLB_IP_START} - ${METALLB_IP_END}"
    log_info "Example service manifest: ${example_file}"
    echo ""
    log_info "To create a LoadBalancer service:"
    log_info "  kubectl create service loadbalancer my-service --tcp=80:8080"
}

# Run main function
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi
