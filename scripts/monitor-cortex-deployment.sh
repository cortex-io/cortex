#!/bin/bash

#############################################################################
# Cortex Deployment Monitor
# Monitors GitHub Actions builds and K3s pod status in real-time
#############################################################################

set -e

# Configuration
REPO="ry-ops/cortex"
BRANCH="docker-container"
WORKFLOW_NAME="Build and Push Cortex Images"
K3S_MASTER_IP="10.88.145.180"
K3S_MASTER_HOST="k3s-master.prox"
DASHBOARD_URL="http://10.88.145.201/"
PROXMOX_TOKEN="root@pam!cortex-deploy=15d84996-1afe-4c00-9e5c-c6c5aa12da33"
PROXMOX_NODE="pve"
VM_ID="310"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# State tracking
LAST_WORKFLOW_RUN_ID=""
GITHUB_BUILD_COMPLETE=false
IMAGES_PUSHED=false
K3S_PODS_READY=false
DASHBOARD_ACCESSIBLE=false

log_section() {
    echo -e "\n${CYAN}=== $1 ===${NC}"
}

log_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

log_error() {
    echo -e "${RED}✗ $1${NC}"
}

log_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

timestamp() {
    date '+%Y-%m-%d %H:%M:%S'
}

#############################################################################
# GitHub Actions Monitoring
#############################################################################

check_github_workflow() {
    log_section "GitHub Actions - Build and Push"

    # Get the latest workflow run
    local workflow_data=$(gh api repos/$REPO/actions/workflows \
        -q ".workflows[] | select(.name == \"$WORKFLOW_NAME\") | .id" 2>/dev/null)

    if [ -z "$workflow_data" ]; then
        log_error "Could not find workflow: $WORKFLOW_NAME"
        return 1
    fi

    local workflow_id=$workflow_data
    log_info "Workflow ID: $workflow_id"

    # Get recent runs
    local runs=$(gh api repos/$REPO/actions/workflows/$workflow_id/runs \
        -q ".workflow_runs[] | select(.head_branch == \"$BRANCH\") | {id, status, conclusion, created_at, updated_at}" \
        --limit 5 2>/dev/null)

    if [ -z "$runs" ]; then
        log_warning "No workflow runs found for branch: $BRANCH"
        return 1
    fi

    # Parse the first (most recent) run
    local run_id=$(echo "$runs" | jq -r '.[0].id' 2>/dev/null)
    local status=$(echo "$runs" | jq -r '.[0].status' 2>/dev/null)
    local conclusion=$(echo "$runs" | jq -r '.[0].conclusion' 2>/dev/null)
    local created=$(echo "$runs" | jq -r '.[0].created_at' 2>/dev/null)
    local updated=$(echo "$runs" | jq -r '.[0].updated_at' 2>/dev/null)

    LAST_WORKFLOW_RUN_ID=$run_id

    log_info "Latest workflow run:"
    echo "  Run ID: $run_id"
    echo "  Status: $status"
    echo "  Conclusion: $conclusion"
    echo "  Created: $created"
    echo "  Updated: $updated"

    # Check for build completion
    if [ "$status" = "completed" ]; then
        if [ "$conclusion" = "success" ]; then
            log_success "Build completed successfully!"
            GITHUB_BUILD_COMPLETE=true
            return 0
        else
            log_error "Build failed with conclusion: $conclusion"
            GITHUB_BUILD_COMPLETE=false
            return 1
        fi
    else
        log_warning "Build still in progress (status: $status)"
        GITHUB_BUILD_COMPLETE=false
        return 2
    fi
}

check_ghcr_images() {
    log_section "Docker Images in GHCR"

    if [ "$GITHUB_BUILD_COMPLETE" != true ]; then
        log_warning "Skipping GHCR check - build not complete"
        return 1
    fi

    # Check for main Cortex image
    local cortex_image="ghcr.io/ry-ops/cortex"
    local dashboard_image="ghcr.io/ry-ops/cortex-dashboard"

    log_info "Checking image availability..."

    # Try to fetch manifest (requires authentication)
    if curl -s -H "Authorization: Bearer $(gh auth token)" \
        "https://ghcr.io/v2/ry-ops/cortex/manifests/latest" \
        -o /dev/null -w "%{http_code}"; then
        log_success "Cortex image pushed to GHCR"
        IMAGES_PUSHED=true
    else
        log_warning "Could not verify Cortex image in GHCR"
    fi

    if curl -s -H "Authorization: Bearer $(gh auth token)" \
        "https://ghcr.io/v2/ry-ops/cortex-dashboard/manifests/latest" \
        -o /dev/null -w "%{http_code}"; then
        log_success "Dashboard image pushed to GHCR"
    else
        log_warning "Could not verify Dashboard image in GHCR"
    fi
}

#############################################################################
# K3s Cluster Monitoring
#############################################################################

check_k3s_pods() {
    log_section "K3s Pod Status"

    # Try to connect to K3s master and check pods
    local kubeconfig_check=$(ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no \
        -i ~/.ssh/id_rsa root@$K3S_MASTER_IP \
        "kubectl get pods -n cortex-system -o json" 2>/dev/null || echo "")

    if [ -z "$kubeconfig_check" ]; then
        log_warning "Cannot connect to K3s master at $K3S_MASTER_IP"

        # Try alternative: Proxmox API to check VM status
        check_vm_via_proxmox
        return 1
    fi

    # Parse pod status
    local pod_count=$(echo "$kubeconfig_check" | jq '.items | length' 2>/dev/null)
    local running_count=$(echo "$kubeconfig_check" | jq '[.items[] | select(.status.phase == "Running")] | length' 2>/dev/null)

    log_info "Pod Status:"
    echo "  Total pods: $pod_count"
    echo "  Running: $running_count"

    # Show individual pod status
    echo "$kubeconfig_check" | jq -r '.items[] |
        "\(.metadata.name)\t\(.status.phase)\t\(.status.containerStatuses[0].ready // false)"' 2>/dev/null | \
        while read name phase ready; do
            if [ "$phase" = "Running" ] && [ "$ready" = "true" ]; then
                log_success "$name: $phase (Ready)"
            else
                log_warning "$name: $phase (Ready: $ready)"
            fi
        done

    # Check if all expected pods are running
    if [ "$pod_count" -gt 0 ] && [ "$running_count" -eq "$pod_count" ]; then
        K3S_PODS_READY=true
        log_success "All pods are running!"
        return 0
    else
        K3S_PODS_READY=false
        log_warning "Not all pods are running yet"
        return 1
    fi
}

check_vm_via_proxmox() {
    log_section "VM Status (Proxmox)"

    log_info "Checking VM $VM_ID status via Proxmox API..."

    # Note: This requires Proxmox API access, which may not be available in this environment
    # Attempting to use curl with token authentication

    local proxmox_url="https://10.88.145.1:8006/api2/json/nodes/pve/qemu/$VM_ID/status/current"

    local vm_status=$(curl -s -k \
        -H "Authorization: PVEAPIToken=root@pam!cortex-deploy=15d84996-1afe-4c00-9e5c-c6c5aa12da33" \
        "$proxmox_url" 2>/dev/null || echo "")

    if [ -n "$vm_status" ]; then
        echo "$vm_status" | jq '.data | {status, uptime}' 2>/dev/null || echo "$vm_status"
    else
        log_warning "Cannot access Proxmox API"
    fi
}

#############################################################################
# Dashboard Accessibility
#############################################################################

check_dashboard() {
    log_section "Dashboard Accessibility"

    if [ "$K3S_PODS_READY" != true ]; then
        log_warning "Skipping dashboard check - K3s pods not ready"
        return 1
    fi

    log_info "Testing dashboard connectivity to $DASHBOARD_URL"

    local http_code=$(curl -s -o /dev/null -w "%{http_code}" \
        -m 10 "$DASHBOARD_URL" 2>/dev/null || echo "000")

    if [ "$http_code" = "200" ]; then
        log_success "Dashboard is accessible! (HTTP $http_code)"
        DASHBOARD_ACCESSIBLE=true
        return 0
    elif [ "$http_code" != "000" ]; then
        log_warning "Dashboard responded with HTTP $http_code"
        return 1
    else
        log_error "Dashboard is not accessible (connection timeout/refused)"
        DASHBOARD_ACCESSIBLE=false
        return 1
    fi
}

#############################################################################
# Continuous Monitoring Loop
#############################################################################

continuous_monitor() {
    local iteration=0
    local max_iterations=120  # 60 minutes at 30-second intervals

    log_section "Starting Continuous Monitoring"
    log_info "Will check every 30 seconds for up to $((max_iterations * 30 / 60)) minutes"

    while [ $iteration -lt $max_iterations ]; do
        iteration=$((iteration + 1))

        echo ""
        echo "========================================================================"
        echo "Monitor Iteration $iteration at $(timestamp)"
        echo "========================================================================"

        # Check GitHub Actions
        check_github_workflow

        # Check GHCR images if build is complete
        if [ "$GITHUB_BUILD_COMPLETE" = true ]; then
            check_ghcr_images
        fi

        # Check K3s pods
        check_k3s_pods

        # Check dashboard
        check_dashboard

        # Print status summary
        echo ""
        echo "Status Summary:"
        echo "  GitHub Build: $([ "$GITHUB_BUILD_COMPLETE" = true ] && echo "✓ Complete" || echo "✗ In Progress")"
        echo "  Images Pushed: $([ "$IMAGES_PUSHED" = true ] && echo "✓ Yes" || echo "✗ No")"
        echo "  K3s Pods Ready: $([ "$K3S_PODS_READY" = true ] && echo "✓ Yes" || echo "✗ No")"
        echo "  Dashboard Access: $([ "$DASHBOARD_ACCESSIBLE" = true ] && echo "✓ Yes" || echo "✗ No")"

        # Check if all objectives are complete
        if [ "$GITHUB_BUILD_COMPLETE" = true ] && \
           [ "$IMAGES_PUSHED" = true ] && \
           [ "$K3S_PODS_READY" = true ] && \
           [ "$DASHBOARD_ACCESSIBLE" = true ]; then
            log_section "Deployment Successful!"
            log_success "All deployment objectives achieved!"
            echo "  - GitHub Actions build completed successfully"
            echo "  - Docker images pushed to GHCR"
            echo "  - K3s cluster pods are running"
            echo "  - Dashboard is accessible at $DASHBOARD_URL"
            return 0
        fi

        # Wait before next check
        if [ $iteration -lt $max_iterations ]; then
            log_info "Waiting 30 seconds before next check..."
            sleep 30
        fi
    done

    log_section "Monitoring Timeout"
    log_warning "Monitoring reached maximum duration ($((max_iterations * 30 / 60)) minutes)"
    return 2
}

#############################################################################
# Main
#############################################################################

main() {
    log_section "Cortex Deployment Monitor"
    log_info "Repository: $REPO"
    log_info "Branch: $BRANCH"
    log_info "K3s Master: $K3S_MASTER_IP"
    log_info "Dashboard: $DASHBOARD_URL"

    # Check prerequisites
    if ! command -v gh &> /dev/null; then
        log_error "GitHub CLI (gh) is not installed"
        exit 1
    fi

    if ! command -v jq &> /dev/null; then
        log_error "jq is not installed"
        exit 1
    fi

    # Start monitoring
    continuous_monitor
    exit_code=$?

    log_section "Monitoring Complete"
    echo "Exit code: $exit_code"
    exit $exit_code
}

main "$@"
