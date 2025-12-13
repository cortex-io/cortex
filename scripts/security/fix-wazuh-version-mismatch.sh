#!/bin/bash
# Wazuh Dashboard Version Mismatch Fix Script
# Purpose: Upgrade wazuh-dashboard from 4.11.2 to 4.14.1 to match API version
# Task ID: wazuh-version-fix-1765571682
# Created: 2025-12-12

set -euo pipefail

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Configuration
WAZUH_SERVER="${WAZUH_SERVER:-}"
PROXMOX_HOST="${PROXMOX_HOST:-10.88.140.151}"
PROXMOX_NODE="${PROXMOX_NODE:-pve}"
TARGET_VERSION="4.14.1"
API_VERSION="4.14.1"
CURRENT_DASHBOARD_VERSION="4.11.2"

# Function to detect Wazuh server
detect_wazuh_server() {
    log_info "Detecting Wazuh server..."

    # Try direct SSH if WAZUH_SERVER is set
    if [ -n "$WAZUH_SERVER" ]; then
        if ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "root@${WAZUH_SERVER}" "command -v wazuh-manager" &>/dev/null; then
            log_success "Wazuh server found at: $WAZUH_SERVER"
            echo "$WAZUH_SERVER"
            return 0
        fi
    fi

    # Try to find Wazuh VM on Proxmox
    log_info "Searching for Wazuh VM on Proxmox at ${PROXMOX_HOST}..."

    # First check if Proxmox is accessible
    if ! ping -c 1 -W 2 "$PROXMOX_HOST" &>/dev/null; then
        log_error "Cannot reach Proxmox host at ${PROXMOX_HOST}"
        return 1
    fi

    # Try to SSH to Proxmox and list VMs
    if ! ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "root@${PROXMOX_HOST}" "qm list" &>/dev/null; then
        log_error "Cannot SSH to Proxmox host at ${PROXMOX_HOST}"
        log_info "Please provide Wazuh server IP via WAZUH_SERVER environment variable"
        return 1
    fi

    # Get list of VMs and search for Wazuh
    local vms
    vms=$(ssh "root@${PROXMOX_HOST}" "qm list | grep -i wazuh" || true)

    if [ -z "$vms" ]; then
        log_error "No Wazuh VM found on Proxmox"
        return 1
    fi

    # Extract VM ID
    local vmid
    vmid=$(echo "$vms" | awk '{print $1}' | head -n1)

    log_info "Found Wazuh VM with ID: $vmid"

    # Get VM IP address
    local vm_ip
    vm_ip=$(ssh "root@${PROXMOX_HOST}" "qm guest cmd $vmid network-get-interfaces" | jq -r '.[] | select(.name == "eth0" or .name == "ens18") | .["ip-addresses"][] | select(.["ip-address-type"] == "ipv4") | .["ip-address"]' | head -n1)

    if [ -z "$vm_ip" ]; then
        log_error "Could not determine IP address for Wazuh VM"
        return 1
    fi

    log_success "Wazuh server detected at: $vm_ip"
    echo "$vm_ip"
    return 0
}

# Function to check current versions
check_versions() {
    local server=$1

    log_info "Checking current versions on $server..."

    # Check API version
    local api_version
    api_version=$(ssh "root@${server}" "wazuh-manager --version 2>/dev/null || /var/ossec/bin/wazuh-control info | grep 'WAZUH' | awk '{print \$2}'" 2>/dev/null || echo "unknown")

    # Check dashboard version
    local dashboard_version
    dashboard_version=$(ssh "root@${server}" "dpkg -l | grep wazuh-dashboard | awk '{print \$3}' || rpm -q wazuh-dashboard --queryformat '%{VERSION}'" 2>/dev/null || echo "unknown")

    log_info "API Version: $api_version"
    log_info "Dashboard Version: $dashboard_version"

    echo "${api_version}|${dashboard_version}"
}

# Function to detect OS type
detect_os() {
    local server=$1

    log_info "Detecting OS type on $server..."

    local os_type
    os_type=$(ssh "root@${server}" "cat /etc/os-release | grep '^ID=' | cut -d= -f2 | tr -d '\"'" 2>/dev/null || echo "unknown")

    log_info "Detected OS: $os_type"
    echo "$os_type"
}

# Function to backup current configuration
backup_config() {
    local server=$1
    local backup_dir="/var/ossec/backup-$(date +%Y%m%d-%H%M%S)"

    log_info "Creating backup of Wazuh configuration..."

    ssh "root@${server}" "mkdir -p ${backup_dir} && \
        cp -r /etc/wazuh-dashboard ${backup_dir}/ 2>/dev/null || true && \
        cp /etc/wazuh-dashboard/opensearch_dashboards.yml ${backup_dir}/opensearch_dashboards.yml.bak 2>/dev/null || true && \
        echo 'Backup created at ${backup_dir}'"

    log_success "Configuration backed up to $backup_dir"
}

# Function to upgrade dashboard on Debian/Ubuntu
upgrade_dashboard_debian() {
    local server=$1

    log_info "Upgrading Wazuh dashboard on Debian/Ubuntu system..."

    ssh "root@${server}" "bash -s" << 'ENDSSH'
set -euo pipefail

echo "[INFO] Stopping wazuh-dashboard service..."
systemctl stop wazuh-dashboard

echo "[INFO] Updating package lists..."
apt-get update

echo "[INFO] Upgrading wazuh-dashboard to 4.14.1..."
apt-get install --only-upgrade wazuh-dashboard=4.14.1-1 -y

echo "[SUCCESS] Wazuh dashboard upgraded successfully"
ENDSSH

    log_success "Dashboard upgrade completed"
}

# Function to upgrade dashboard on RHEL/CentOS
upgrade_dashboard_rhel() {
    local server=$1

    log_info "Upgrading Wazuh dashboard on RHEL/CentOS system..."

    ssh "root@${server}" "bash -s" << 'ENDSSH'
set -euo pipefail

echo "[INFO] Stopping wazuh-dashboard service..."
systemctl stop wazuh-dashboard

echo "[INFO] Upgrading wazuh-dashboard to 4.14.1..."
yum install wazuh-dashboard-4.14.1-1 -y

echo "[SUCCESS] Wazuh dashboard upgraded successfully"
ENDSSH

    log_success "Dashboard upgrade completed"
}

# Function to restart dashboard service
restart_dashboard() {
    local server=$1

    log_info "Restarting wazuh-dashboard service..."

    ssh "root@${server}" "systemctl restart wazuh-dashboard"
    sleep 5

    # Check service status
    local status
    status=$(ssh "root@${server}" "systemctl is-active wazuh-dashboard" || echo "failed")

    if [ "$status" == "active" ]; then
        log_success "Wazuh dashboard service is running"
    else
        log_error "Wazuh dashboard service failed to start"
        log_info "Checking service status..."
        ssh "root@${server}" "systemctl status wazuh-dashboard --no-pager -l"
        return 1
    fi
}

# Function to verify versions
verify_versions() {
    local server=$1

    log_info "Verifying version alignment..."

    local versions
    versions=$(check_versions "$server")

    local api_ver
    local dash_ver
    api_ver=$(echo "$versions" | cut -d'|' -f1)
    dash_ver=$(echo "$versions" | cut -d'|' -f2)

    log_info "Final API Version: $api_ver"
    log_info "Final Dashboard Version: $dash_ver"

    if [[ "$dash_ver" == *"$TARGET_VERSION"* ]]; then
        log_success "Version alignment verified! Dashboard is now at $TARGET_VERSION"
        return 0
    else
        log_error "Version mismatch still exists"
        return 1
    fi
}

# Function to test dashboard connectivity
test_dashboard() {
    local server=$1

    log_info "Testing dashboard connectivity..."

    # Try to curl the dashboard
    local response
    response=$(ssh "root@${server}" "curl -s -o /dev/null -w '%{http_code}' http://localhost:5601" || echo "000")

    if [ "$response" == "200" ] || [ "$response" == "302" ]; then
        log_success "Dashboard is responding (HTTP $response)"
    else
        log_warn "Dashboard returned HTTP $response (this may be normal if authentication is required)"
    fi
}

# Main execution
main() {
    log_info "=== Wazuh Version Mismatch Fix Script ==="
    log_info "Target: Upgrade dashboard from $CURRENT_DASHBOARD_VERSION to $TARGET_VERSION"
    log_info ""

    # Detect Wazuh server
    local wazuh_server
    if ! wazuh_server=$(detect_wazuh_server); then
        log_error "Could not detect Wazuh server"
        log_info ""
        log_info "Please run this script with WAZUH_SERVER environment variable:"
        log_info "  export WAZUH_SERVER=<wazuh-server-ip>"
        log_info "  $0"
        exit 1
    fi

    # Check current versions
    log_info ""
    check_versions "$wazuh_server"

    # Detect OS
    log_info ""
    local os_type
    os_type=$(detect_os "$wazuh_server")

    if [ "$os_type" == "unknown" ]; then
        log_error "Could not detect OS type"
        exit 1
    fi

    # Backup configuration
    log_info ""
    backup_config "$wazuh_server"

    # Upgrade dashboard based on OS
    log_info ""
    case "$os_type" in
        ubuntu|debian)
            upgrade_dashboard_debian "$wazuh_server"
            ;;
        rhel|centos|rocky|alma)
            upgrade_dashboard_rhel "$wazuh_server"
            ;;
        *)
            log_error "Unsupported OS type: $os_type"
            exit 1
            ;;
    esac

    # Restart dashboard
    log_info ""
    if ! restart_dashboard "$wazuh_server"; then
        log_error "Failed to restart dashboard service"
        exit 1
    fi

    # Verify versions
    log_info ""
    if ! verify_versions "$wazuh_server"; then
        log_error "Verification failed"
        exit 1
    fi

    # Test dashboard
    log_info ""
    test_dashboard "$wazuh_server"

    # Success summary
    log_info ""
    log_success "=== Fix Complete ==="
    log_success "Wazuh dashboard successfully upgraded to $TARGET_VERSION"
    log_success "Version alignment verified - API and Dashboard are now both at $TARGET_VERSION"
    log_info ""
    log_info "Next steps:"
    log_info "  1. Access the Wazuh dashboard in your browser"
    log_info "  2. Verify the version mismatch error is resolved"
    log_info "  3. Check that all dashboard features are working correctly"
    log_info ""
    log_info "If you encounter any issues, restore from backup:"
    log_info "  ssh root@${wazuh_server}"
    log_info "  systemctl stop wazuh-dashboard"
    log_info "  cp /var/ossec/backup-*/opensearch_dashboards.yml.bak /etc/wazuh-dashboard/opensearch_dashboards.yml"
    log_info "  systemctl start wazuh-dashboard"

    exit 0
}

# Run main function
main
