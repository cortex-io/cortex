#!/bin/bash
################################################################################
# Dashboard Update Worker
# Purpose: Deploy dashboard data changes with validation and real-time broadcasting
# Parent Master: CI/CD Master
# Token Budget: 8k tokens
################################################################################

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
COORDINATION_DIR="$PROJECT_ROOT/coordination"
DASHBOARD_URL="${DASHBOARD_URL:-http://localhost:3000}"
WORKER_ID="${WORKER_ID:-dashboard-worker-$(uuidgen | cut -d'-' -f1)}"
LOG_FILE="$PROJECT_ROOT/agents/logs/cicd/dashboard-update-worker-${WORKER_ID}.log"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

################################################################################
# Logging Functions
################################################################################

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    echo "[$timestamp] [$level] $message" | tee -a "$LOG_FILE"
}

log_info() { log "INFO" "$@"; }
log_error() { log "ERROR" "$@"; }
log_success() { log "SUCCESS" "$@"; }
log_warning() { log "WARNING" "$@"; }

################################################################################
# Argument Parsing
################################################################################

usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Dashboard Update Worker - Deploys dashboard data changes with validation

OPTIONS:
    --task-id TASK_ID              Task ID that triggered the update
    --components COMPONENTS        Comma-separated list: events,metrics,tasks,workers,streams
    --handoff-id HANDOFF_ID        Handoff ID from specialist master
    --priority PRIORITY            Update priority: immediate|batched (default: immediate)
    --help                         Show this help message

EXAMPLES:
    # Deploy task completion update
    $0 --task-id task-020 --components events,metrics,tasks --handoff-id dev-to-cicd-A1B2C3

    # Deploy security scan update
    $0 --task-id task-021 --components events,metrics --handoff-id sec-to-cicd-B2C3D4 --priority immediate

ENVIRONMENT VARIABLES:
    DASHBOARD_URL                  Dashboard server URL (default: http://localhost:3000)
    WORKER_ID                      Unique worker identifier (default: auto-generated)

EOF
    exit 1
}

TASK_ID=""
COMPONENTS=""
HANDOFF_ID=""
PRIORITY="immediate"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --task-id)
            TASK_ID="$2"
            shift 2
            ;;
        --components)
            COMPONENTS="$2"
            shift 2
            ;;
        --handoff-id)
            HANDOFF_ID="$2"
            shift 2
            ;;
        --priority)
            PRIORITY="$2"
            shift 2
            ;;
        --help)
            usage
            ;;
        *)
            echo -e "${RED}Error: Unknown option $1${NC}"
            usage
            ;;
    esac
done

# Validate required arguments
if [[ -z "$TASK_ID" ]] || [[ -z "$COMPONENTS" ]] || [[ -z "$HANDOFF_ID" ]]; then
    echo -e "${RED}Error: Missing required arguments${NC}"
    usage
fi

################################################################################
# Initialization
################################################################################

initialize() {
    log_info "Initializing Dashboard Update Worker"
    log_info "Worker ID: $WORKER_ID"
    log_info "Task ID: $TASK_ID"
    log_info "Components: $COMPONENTS"
    log_info "Handoff ID: $HANDOFF_ID"
    log_info "Priority: $PRIORITY"

    # Create log directory if it doesn't exist
    mkdir -p "$(dirname "$LOG_FILE")"

    # Check if dashboard server is running
    if ! curl -s -o /dev/null -w "%{http_code}" "$DASHBOARD_URL" > /dev/null 2>&1; then
        log_warning "Dashboard server may not be running at $DASHBOARD_URL"
    fi
}

################################################################################
# Data Validation
################################################################################

validate_coordination_file() {
    local file="$1"
    local file_path="$COORDINATION_DIR/$file"

    log_info "Validating $file"

    if [[ ! -f "$file_path" ]]; then
        log_error "File not found: $file_path"
        return 1
    fi

    # Validate JSON syntax
    if ! jq empty "$file_path" 2>/dev/null; then
        log_error "Invalid JSON in $file_path"
        return 1
    fi

    log_success "Validation passed: $file"
    return 0
}

validate_all_components() {
    log_info "Validating all coordination files"

    local validation_failed=0

    # Parse components
    IFS=',' read -ra COMPONENT_ARRAY <<< "$COMPONENTS"

    for component in "${COMPONENT_ARRAY[@]}"; do
        case "$component" in
            events)
                validate_coordination_file "dashboard-events.jsonl" || validation_failed=1
                ;;
            metrics)
                validate_coordination_file "status.json" || validation_failed=1
                validate_coordination_file "token-budget.json" || validation_failed=1
                ;;
            tasks)
                validate_coordination_file "task-queue.json" || validation_failed=1
                ;;
            workers)
                validate_coordination_file "worker-pool.json" || validation_failed=1
                ;;
            streams)
                validate_coordination_file "workforce-streams.json" || validation_failed=1
                ;;
            *)
                log_warning "Unknown component: $component"
                ;;
        esac
    done

    if [[ $validation_failed -eq 1 ]]; then
        log_error "Validation failed for one or more components"
        return 1
    fi

    log_success "All components validated successfully"
    return 0
}

################################################################################
# Event Generation
################################################################################

generate_dashboard_event() {
    local event_type="$1"
    local event_message="$2"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    local event_json=$(cat <<EOF
{
  "event_id": "$(uuidgen)",
  "event_type": "$event_type",
  "message": "$event_message",
  "timestamp": "$timestamp",
  "task_id": "$TASK_ID",
  "worker_id": "$WORKER_ID",
  "source": "dashboard-update-worker"
}
EOF
)

    # Append to dashboard-events.jsonl
    echo "$event_json" >> "$COORDINATION_DIR/dashboard-events.jsonl"

    log_info "Generated event: $event_type - $event_message"
}

################################################################################
# WebSocket Broadcasting
################################################################################

broadcast_websocket_update() {
    local component="$1"

    log_info "Broadcasting WebSocket update for component: $component"

    # Send HTTP POST to dashboard server API to trigger WebSocket broadcast
    local api_endpoint="$DASHBOARD_URL/api/broadcast"

    local payload=$(cat <<EOF
{
  "component": "$component",
  "task_id": "$TASK_ID",
  "worker_id": "$WORKER_ID",
  "handoff_id": "$HANDOFF_ID",
  "timestamp": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
}
EOF
)

    # Try to send broadcast request
    local response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "$payload" \
        "$api_endpoint" 2>&1 || echo "CURL_FAILED")

    if [[ "$response" == "CURL_FAILED" ]] || [[ -z "$response" ]]; then
        log_warning "Failed to broadcast WebSocket update for $component (dashboard may not be running)"
        return 1
    else
        log_success "WebSocket broadcast successful for $component"
        return 0
    fi
}

broadcast_all_components() {
    log_info "Broadcasting updates for all components"

    # Parse components
    IFS=',' read -ra COMPONENT_ARRAY <<< "$COMPONENTS"

    for component in "${COMPONENT_ARRAY[@]}"; do
        broadcast_websocket_update "$component"
        sleep 0.1  # Small delay between broadcasts
    done

    log_success "All component updates broadcasted"
}

################################################################################
# Dashboard Deployment
################################################################################

deploy_dashboard_updates() {
    log_info "Deploying dashboard updates"

    # Step 1: Validate all coordination files
    if ! validate_all_components; then
        log_error "Dashboard deployment failed: validation errors"
        return 1
    fi

    # Step 2: Generate dashboard event
    generate_dashboard_event "dashboard_deployed" "Dashboard updated for task $TASK_ID (components: $COMPONENTS)"

    # Step 3: Broadcast WebSocket updates
    broadcast_all_components

    # Step 4: Record deployment in CI/CD context
    record_deployment

    log_success "Dashboard deployment completed successfully"
    return 0
}

################################################################################
# Deployment Recording
################################################################################

record_deployment() {
    local cicd_deployments_file="$COORDINATION_DIR/masters/cicd/context/dashboard-deployments.jsonl"

    # Create directory if it doesn't exist
    mkdir -p "$(dirname "$cicd_deployments_file")"

    local deployment_record=$(cat <<EOF
{
  "deployment_id": "$(uuidgen)",
  "worker_id": "$WORKER_ID",
  "task_id": "$TASK_ID",
  "handoff_id": "$HANDOFF_ID",
  "components": "$COMPONENTS",
  "priority": "$PRIORITY",
  "status": "success",
  "timestamp": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')",
  "duration_seconds": $SECONDS
}
EOF
)

    echo "$deployment_record" >> "$cicd_deployments_file"

    log_info "Deployment recorded in $cicd_deployments_file"
}

################################################################################
# Main Execution
################################################################################

main() {
    local start_time=$(date +%s)

    echo -e "${BLUE}=================================${NC}"
    echo -e "${BLUE}  Dashboard Update Worker${NC}"
    echo -e "${BLUE}=================================${NC}"

    # Initialize worker
    initialize

    # Deploy dashboard updates
    if deploy_dashboard_updates; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))

        echo -e "${GREEN}=================================${NC}"
        echo -e "${GREEN}  Deployment Successful${NC}"
        echo -e "${GREEN}  Duration: ${duration}s${NC}"
        echo -e "${GREEN}=================================${NC}"

        # Set files changed for git automation
        export FILES_CHANGED="coordination/dashboard-events.jsonl,coordination/masters/cicd/context/dashboard-deployments.jsonl"
        export WORKER_TYPE="dashboard-update-worker"

        # Use automatic git workflow
        log_info "Starting autonomous git workflow..."
        source "$PROJECT_ROOT/scripts/templates/worker-completion-hook.sh"
    else
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))

        echo -e "${RED}=================================${NC}"
        echo -e "${RED}  Deployment Failed${NC}"
        echo -e "${RED}  Duration: ${duration}s${NC}"
        echo -e "${RED}=================================${NC}"

        exit 1
    fi
}

# Execute main function
main
