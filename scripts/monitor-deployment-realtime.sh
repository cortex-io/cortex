#!/bin/bash

#############################################################################
# Real-Time Cortex Deployment Monitor
# Comprehensive monitoring with detailed status reporting
#############################################################################

set -e

# Configuration
REPO="ry-ops/cortex"
BRANCH="docker-container"
K3S_MASTER_IP="10.88.145.180"
DASHBOARD_URL="http://10.88.145.201/"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# State tracking
GITHUB_BUILD_STARTED=false
GITHUB_BUILD_COMPLETE=false
IMAGES_PUSHED=false
K3S_PODS_READY=false
DASHBOARD_ACCESSIBLE=false
LAST_RUN_ID=""
LAST_BUILD_STATUS=""

log_header() {
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC} $1"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
}

log_section() {
    echo -e "\n${MAGENTA}━━━ $1 ━━━${NC}"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

log_info() {
    echo -e "${BLUE}→${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_status_box() {
    echo -e "${CYAN}┌─ $1${NC}"
}

log_status_item() {
    echo -e "${CYAN}│${NC}  $1"
}

log_status_end() {
    echo -e "${CYAN}└─${NC}"
}

timestamp() {
    date '+%Y-%m-%d %H:%M:%S'
}

elapsed_time() {
    local start_time=$1
    local end_time=$(date +%s)
    local elapsed=$((end_time - start_time))
    local mins=$((elapsed / 60))
    local secs=$((elapsed % 60))
    printf "%02d:%02d" $mins $secs
}

#############################################################################
# GitHub Actions Monitoring
#############################################################################

check_github_status() {
    log_section "GitHub Actions Build Status"

    # Get recent runs
    local runs=$(gh api repos/$REPO/actions/runs \
        -q '.workflow_runs[] | select(.head_branch == "'$BRANCH'" and .name == "Build and Push Cortex Images") | {id, status, conclusion, created_at}' \
        --limit 3 2>/dev/null | head -3)

    if [ -z "$runs" ]; then
        log_warning "No workflow runs found"
        return 1
    fi

    # Get first run
    local run_id=$(echo "$runs" | jq -r '.id' | head -1)
    local status=$(echo "$runs" | jq -r '.status' | head -1)
    local conclusion=$(echo "$runs" | jq -r '.conclusion' | head -1)
    local created=$(echo "$runs" | jq -r '.created_at' | head -1)

    LAST_RUN_ID=$run_id
    LAST_BUILD_STATUS=$status

    log_status_box "Build Information"
    log_status_item "Run ID: $run_id"
    log_status_item "Status: $status"
    log_status_item "Conclusion: $conclusion"
    log_status_item "Created: $created"
    log_status_end

    if [ "$status" = "in_progress" ]; then
        log_info "Build is in progress..."
        GITHUB_BUILD_COMPLETE=false

        # Get detailed job status
        local jobs=$(gh api repos/$REPO/actions/runs/$run_id/jobs \
            -q '.jobs[] | {name, status, conclusion}' 2>/dev/null)

        if [ -n "$jobs" ]; then
            echo -e "\n${BLUE}Job Status:${NC}"
            echo "$jobs" | jq -r '.name + ": " + .status + " (" + (.conclusion // "pending") + ")"' | while read line; do
                if [[ $line == *"success"* ]]; then
                    log_success "$line"
                elif [[ $line == *"in_progress"* ]]; then
                    log_info "$line"
                elif [[ $line == *"failure"* ]]; then
                    log_error "$line"
                else
                    log_warning "$line"
                fi
            done
        fi
        return 2
    elif [ "$status" = "completed" ]; then
        if [ "$conclusion" = "success" ]; then
            log_success "Build completed successfully!"
            GITHUB_BUILD_COMPLETE=true
            GITHUB_BUILD_STARTED=true
            return 0
        else
            log_error "Build failed with conclusion: $conclusion"
            GITHUB_BUILD_COMPLETE=false
            GITHUB_BUILD_STARTED=true

            # Get failure details
            local jobs=$(gh api repos/$REPO/actions/runs/$run_id/jobs \
                -q '.jobs[] | select(.conclusion == "failure") | {name, conclusion}' 2>/dev/null)

            if [ -n "$jobs" ]; then
                echo -e "\n${RED}Failed Jobs:${NC}"
                echo "$jobs" | jq -r '.name'
            fi
            return 1
        fi
    else
        log_warning "Unknown status: $status"
        return 1
    fi
}

check_ghcr_images() {
    log_section "Docker Image Availability"

    if [ "$GITHUB_BUILD_COMPLETE" != true ]; then
        log_warning "Skipping - build not complete yet"
        return 1
    fi

    log_info "Checking GHCR for pushed images..."

    # Check for docker images
    local images=$(gh api repos/$REPO/packages \
        -q '.[] | {name, package_type, created_at}' 2>/dev/null)

    if [ -n "$images" ]; then
        echo "$images" | jq -r '.name' | while read image; do
            log_success "Image available: $image"
        done
        IMAGES_PUSHED=true
        return 0
    else
        log_warning "No images found in GHCR yet"
        return 1
    fi
}

#############################################################################
# K3s Cluster Monitoring
#############################################################################

check_k3s_pods() {
    log_section "K3s Cluster Pod Status"

    # Try SSH connection first
    local pods_output=""
    if timeout 10 ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no \
        -i ~/.ssh/id_rsa root@$K3S_MASTER_IP \
        "kubectl get pods -n cortex-system -o json 2>/dev/null" 2>/dev/null > /tmp/k3s_pods.json; then

        pods_output=$(cat /tmp/k3s_pods.json)
    else
        log_warning "Cannot connect to K3s master"
        return 1
    fi

    if [ -z "$pods_output" ]; then
        log_warning "No pod data retrieved"
        return 1
    fi

    local pod_count=$(echo "$pods_output" | jq '.items | length' 2>/dev/null)
    local running_count=$(echo "$pods_output" | jq '[.items[] | select(.status.phase == "Running")] | length' 2>/dev/null)
    local ready_count=$(echo "$pods_output" | jq '[.items[] | select(.status.containerStatuses[0].ready == true)] | length' 2>/dev/null)

    log_status_box "Pod Summary"
    log_status_item "Total Pods: $pod_count"
    log_status_item "Running: $running_count"
    log_status_item "Ready: $ready_count"
    log_status_end

    # Show individual pods
    if [ "$pod_count" -gt 0 ]; then
        echo -e "\n${BLUE}Individual Pod Status:${NC}"
        echo "$pods_output" | jq -r '.items[] |
            "\(.metadata.name)\t\(.status.phase)\t\(.status.containerStatuses[0].ready // false)"' 2>/dev/null | \
            while IFS=$'\t' read name phase ready; do
                if [ "$phase" = "Running" ] && [ "$ready" = "true" ]; then
                    log_success "$name: Running (Ready)"
                elif [ "$phase" = "Running" ]; then
                    log_warning "$name: Running (Not Ready)"
                else
                    log_info "$name: $phase"
                fi
            done
    fi

    if [ "$pod_count" -gt 0 ] && [ "$running_count" -eq "$pod_count" ] && [ "$ready_count" -eq "$pod_count" ]; then
        K3S_PODS_READY=true
        log_success "All pods are running and ready!"
        return 0
    else
        K3S_PODS_READY=false
        log_warning "Not all pods are ready yet ($ready_count/$pod_count ready)"
        return 2
    fi
}

#############################################################################
# Dashboard Monitoring
#############################################################################

check_dashboard_status() {
    log_section "Dashboard Accessibility"

    if [ "$K3S_PODS_READY" != true ]; then
        log_warning "Skipping - K3s pods not ready yet"
        return 1
    fi

    log_info "Testing dashboard at $DASHBOARD_URL"

    if timeout 5 curl -s -o /dev/null -w "%{http_code}" "$DASHBOARD_URL" 2>/dev/null | grep -q "200"; then
        log_success "Dashboard is accessible (HTTP 200)"
        DASHBOARD_ACCESSIBLE=true
        return 0
    else
        log_warning "Dashboard is not yet accessible"
        DASHBOARD_ACCESSIBLE=false
        return 1
    fi
}

#############################################################################
# Overall Status Report
#############################################################################

print_status_report() {
    echo ""
    log_header "Deployment Status Report"
    echo ""

    log_status_box "Build Status"
    [ "$GITHUB_BUILD_STARTED" = true ] && log_status_item "Build Started: Yes" || log_status_item "Build Started: No"
    [ "$GITHUB_BUILD_COMPLETE" = true ] && log_status_item "Build Complete: Yes" || log_status_item "Build Complete: No"
    [ "$IMAGES_PUSHED" = true ] && log_status_item "Images Pushed: Yes" || log_status_item "Images Pushed: No"
    log_status_end

    log_status_box "Cluster Status"
    [ "$K3S_PODS_READY" = true ] && log_status_item "K3s Pods Ready: Yes" || log_status_item "K3s Pods Ready: No"
    [ "$DASHBOARD_ACCESSIBLE" = true ] && log_status_item "Dashboard Access: Yes" || log_status_item "Dashboard Access: No"
    log_status_end

    echo ""

    if [ "$GITHUB_BUILD_COMPLETE" = true ] && \
       [ "$IMAGES_PUSHED" = true ] && \
       [ "$K3S_PODS_READY" = true ] && \
       [ "$DASHBOARD_ACCESSIBLE" = true ]; then
        echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
        echo -e "${GREEN}  DEPLOYMENT SUCCESSFUL!${NC}"
        echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
        return 0
    else
        local progress=0
        [ "$GITHUB_BUILD_COMPLETE" = true ] && progress=$((progress + 1))
        [ "$IMAGES_PUSHED" = true ] && progress=$((progress + 1))
        [ "$K3S_PODS_READY" = true ] && progress=$((progress + 1))
        [ "$DASHBOARD_ACCESSIBLE" = true ] && progress=$((progress + 1))

        echo -e "${YELLOW}Progress: $progress/4 objectives complete${NC}"
        return 1
    fi
}

#############################################################################
# Main Monitoring Loop
#############################################################################

main() {
    log_header "Cortex Deployment Real-Time Monitor"
    log_info "Repository: $REPO (branch: $BRANCH)"
    log_info "K3s Master: $K3S_MASTER_IP"
    log_info "Dashboard: $DASHBOARD_URL"
    log_info "Started at: $(timestamp)"

    local iteration=0
    local max_iterations=180  # 90 minutes at 30-second intervals
    local start_time=$(date +%s)

    while [ $iteration -lt $max_iterations ]; do
        iteration=$((iteration + 1))
        local elapsed=$(elapsed_time $start_time)

        echo ""
        echo -e "${CYAN}[${elapsed}]${NC} Monitoring cycle $iteration/$(($max_iterations)) - $(timestamp)"

        # Check GitHub status
        check_github_status
        local github_exit=$?

        # Check GHCR if build is complete
        if [ "$GITHUB_BUILD_COMPLETE" = true ]; then
            check_ghcr_images
        fi

        # Check K3s pods
        check_k3s_pods

        # Check dashboard if pods are ready
        if [ "$K3S_PODS_READY" = true ]; then
            check_dashboard_status
        fi

        # Print status report
        print_status_report
        local overall_exit=$?

        # Success condition
        if [ $overall_exit -eq 0 ]; then
            echo ""
            log_success "All deployment objectives achieved!"
            echo -e "${GREEN}Dashboard available at: $DASHBOARD_URL${NC}"
            return 0
        fi

        # Wait for next cycle
        if [ $iteration -lt $max_iterations ]; then
            log_info "Next check in 30 seconds (press Ctrl+C to stop)..."
            sleep 30
        fi
    done

    log_header "Monitoring Complete"
    log_warning "Maximum monitoring duration reached (90 minutes)"
    print_status_report
    return 1
}

# Run main
main "$@"
