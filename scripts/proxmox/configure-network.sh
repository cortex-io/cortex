#!/bin/bash
# Cortex Network Configuration Script
# Validates and configures network for /27 subnet

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

# Network configuration
SUBNET="10.88.140.144/27"
GATEWAY="10.88.140.144"
NETWORK_START="10.88.140.144"
NETWORK_END="10.88.140.175"
DNS_PRIMARY="8.8.8.8"
DNS_SECONDARY="1.1.1.1"

# VM IP assignments
CONTROL_PLANE_IP="10.88.140.152"
WORKER_01_IP="10.88.140.153"
WORKER_02_IP="10.88.140.154"

# MetalLB IP range for LoadBalancer services
METALLB_START="10.88.140.155"
METALLB_END="10.88.140.158"

# Function to validate IP is in subnet
validate_ip_in_subnet() {
    local ip=$1
    local subnet_base="10.88.140"

    if [[ ! $ip =~ ^${subnet_base}\.[0-9]+$ ]]; then
        log_error "IP $ip is not in subnet ${subnet_base}.0/24"
        return 1
    fi

    local last_octet
    last_octet=$(echo "$ip" | cut -d. -f4)

    if [ "$last_octet" -lt 144 ] || [ "$last_octet" -gt 175 ]; then
        log_error "IP $ip is outside /27 subnet range (144-175)"
        return 1
    fi

    return 0
}

# Function to test connectivity
test_connectivity() {
    local target=$1
    local name=$2

    log_info "Testing connectivity to ${name} (${target})..."

    if timeout 3 ping -c 1 "$target" >/dev/null 2>&1; then
        log_success "Connectivity to ${name} successful"
        return 0
    else
        log_warn "No response from ${name} (this may be expected if VM is not yet created)"
        return 1
    fi
}

# Function to check gateway connectivity
check_gateway() {
    log_info "Checking gateway connectivity..."

    if timeout 3 ping -c 1 "$GATEWAY" >/dev/null 2>&1; then
        log_success "Gateway ${GATEWAY} is reachable"
        return 0
    else
        log_error "Gateway ${GATEWAY} is not reachable"
        return 1
    fi
}

# Function to check DNS resolution
check_dns() {
    log_info "Checking DNS resolution..."

    if timeout 3 dig @${DNS_PRIMARY} google.com +short >/dev/null 2>&1; then
        log_success "DNS resolution working (${DNS_PRIMARY})"
        return 0
    elif timeout 3 dig @${DNS_SECONDARY} google.com +short >/dev/null 2>&1; then
        log_success "DNS resolution working (${DNS_SECONDARY})"
        return 0
    else
        log_error "DNS resolution failed"
        return 1
    fi
}

# Function to display network configuration
display_network_config() {
    log_info "Network Configuration Summary"
    echo "================================"
    echo "Subnet: ${SUBNET}"
    echo "Gateway: ${GATEWAY}"
    echo "DNS Primary: ${DNS_PRIMARY}"
    echo "DNS Secondary: ${DNS_SECONDARY}"
    echo ""
    echo "VM IP Assignments:"
    echo "  Control Plane (VM 110): ${CONTROL_PLANE_IP}"
    echo "  Worker 01 (VM 111): ${WORKER_01_IP}"
    echo "  Worker 02 (VM 112): ${WORKER_02_IP}"
    echo ""
    echo "MetalLB LoadBalancer Range:"
    echo "  Start: ${METALLB_START}"
    echo "  End: ${METALLB_END}"
    echo "================================"
}

# Function to validate all IPs
validate_all_ips() {
    log_info "Validating IP assignments..."

    local all_valid=true

    for ip_config in \
        "${CONTROL_PLANE_IP}:Control Plane" \
        "${WORKER_01_IP}:Worker 01" \
        "${WORKER_02_IP}:Worker 02" \
        "${METALLB_START}:MetalLB Start" \
        "${METALLB_END}:MetalLB End"; do

        local ip
        local name
        ip=$(echo "$ip_config" | cut -d: -f1)
        name=$(echo "$ip_config" | cut -d: -f2)

        if validate_ip_in_subnet "$ip"; then
            log_success "${name} IP ${ip} is valid"
        else
            all_valid=false
        fi
    done

    if [ "$all_valid" = true ]; then
        log_success "All IP assignments are valid"
        return 0
    else
        log_error "Some IP assignments are invalid"
        return 1
    fi
}

# Function to check IP conflicts
check_ip_conflicts() {
    log_info "Checking for IP conflicts..."

    local conflict_found=false

    for ip in "$CONTROL_PLANE_IP" "$WORKER_01_IP" "$WORKER_02_IP"; do
        # Use arping if available, otherwise skip
        if command -v arping >/dev/null 2>&1; then
            if timeout 2 arping -c 1 -I eth0 "$ip" >/dev/null 2>&1; then
                log_warn "IP ${ip} is already in use on the network"
                conflict_found=true
            fi
        else
            # Fallback to ping
            if timeout 1 ping -c 1 "$ip" >/dev/null 2>&1; then
                log_warn "IP ${ip} responds to ping (may be in use)"
            fi
        fi
    done

    if [ "$conflict_found" = false ]; then
        log_success "No IP conflicts detected"
    fi

    return 0
}

# Function to generate MetalLB configuration
generate_metallb_config() {
    local output_file="/tmp/metallb-config.yaml"

    log_info "Generating MetalLB configuration..."

    cat > "$output_file" <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  namespace: metallb-system
  name: config
data:
  config: |
    address-pools:
    - name: default
      protocol: layer2
      addresses:
      - ${METALLB_START}-${METALLB_END}
EOF

    log_success "MetalLB config generated: ${output_file}"
    echo "$output_file"
}

# Main function
main() {
    log_info "Starting network configuration validation"

    # Display configuration
    display_network_config
    echo ""

    # Validate IPs
    if ! validate_all_ips; then
        log_error "IP validation failed"
        exit 1
    fi

    # Check gateway (optional - may fail if not on same network)
    check_gateway || log_warn "Gateway check failed (may be expected if running remotely)"

    # Check DNS
    if ! check_dns; then
        log_warn "DNS check failed, but continuing..."
    fi

    # Check for IP conflicts
    check_ip_conflicts

    # Generate MetalLB config
    metallb_config=$(generate_metallb_config)

    log_success "Network configuration validation complete"
    log_info "MetalLB configuration saved to: ${metallb_config}"

    echo ""
    log_info "Next steps:"
    echo "  1. Create VMs with the validated IP addresses"
    echo "  2. Install K3s cluster"
    echo "  3. Deploy MetalLB with generated configuration"
}

# Run main function
main "$@"
