#!/usr/bin/env bash
# n8n MCP Server Health Check Monitor
# Part of Cortex Autonomous Management System
# Monitors n8n-mcp-server health, API connectivity, and workflow execution status

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INTEGRATION_DIR="$(dirname "$SCRIPT_DIR")"
CORTEX_ROOT="$(cd "$INTEGRATION_DIR/../../.." && pwd)"
EVENTS_LOG="${CORTEX_ROOT}/coordination/dashboard-events.jsonl"
MONITORING_DIR="${CORTEX_ROOT}/coordination/monitoring"
N8N_CONFIG="${INTEGRATION_DIR}/config/n8n-config.json"

# Load configuration
if [[ -f "$N8N_CONFIG" ]]; then
    N8N_HOST=$(jq -r '.n8n_host // "http://10.88.140.149:5678"' "$N8N_CONFIG")
    N8N_API_KEY=$(jq -r '.n8n_api_key // ""' "$N8N_CONFIG")
else
    N8N_HOST="${N8N_HOST:-http://10.88.140.149:5678}"
    N8N_API_KEY="${N8N_API_KEY:-}"
fi

# Health check results
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
CHECK_ID="n8n-health-$(date +%s)"
HEALTH_STATUS="healthy"
CHECKS_PASSED=0
CHECKS_FAILED=0
WARNINGS=()
ERRORS=()

# Ensure monitoring directory exists
mkdir -p "$MONITORING_DIR"

# Function to log event
log_event() {
    local event_type="$1"
    local message="$2"
    local severity="${3:-info}"

    cat >> "$EVENTS_LOG" <<EOF
{"timestamp":"$TIMESTAMP","event_type":"$event_type","source":"n8n-mcp-server-monitor","severity":"$severity","message":"$message","check_id":"$CHECK_ID"}
EOF
}

# Function to check n8n API availability
check_n8n_api() {
    echo "Checking n8n API availability..."

    if [[ -z "$N8N_API_KEY" ]]; then
        ERRORS+=("N8N_API_KEY not configured")
        CHECKS_FAILED=$((CHECKS_FAILED + 1))
        HEALTH_STATUS="unhealthy"
        return 1
    fi

    local response_code
    response_code=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "X-N8N-API-KEY: $N8N_API_KEY" \
        "${N8N_HOST}/api/v1/workflows" 2>/dev/null || echo "000")

    if [[ "$response_code" == "200" ]]; then
        echo "n8n API is accessible (HTTP $response_code)"
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
        return 0
    else
        ERRORS+=("n8n API check failed (HTTP $response_code)")
        CHECKS_FAILED=$((CHECKS_FAILED + 1))
        HEALTH_STATUS="unhealthy"
        return 1
    fi
}

# Function to check workflow status
check_workflow_status() {
    echo "Checking workflow status..."

    local workflows
    workflows=$(curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" \
        "${N8N_HOST}/api/v1/workflows" 2>/dev/null || echo '{"data":[]}')

    local total_workflows
    local active_workflows
    total_workflows=$(echo "$workflows" | jq -r '.data | length' 2>/dev/null || echo "0")
    active_workflows=$(echo "$workflows" | jq -r '[.data[] | select(.active == true)] | length' 2>/dev/null || echo "0")

    if [[ "$total_workflows" -gt 0 ]]; then
        echo "Found $total_workflows workflows ($active_workflows active)"
        CHECKS_PASSED=$((CHECKS_PASSED + 1))

        # Store workflow metrics
        cat > "${MONITORING_DIR}/n8n-workflow-metrics.json" <<EOF
{
  "timestamp": "$TIMESTAMP",
  "total_workflows": $total_workflows,
  "active_workflows": $active_workflows,
  "inactive_workflows": $((total_workflows - active_workflows))
}
EOF
        return 0
    else
        WARNINGS+=("No workflows found in n8n instance")
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
        return 0
    fi
}

# Function to check recent executions
check_recent_executions() {
    echo "Checking recent executions..."

    local executions
    executions=$(curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" \
        "${N8N_HOST}/api/v1/executions?limit=50" 2>/dev/null || echo '{"data":[]}')

    local total_executions
    local failed_executions
    local success_executions
    total_executions=$(echo "$executions" | jq -r '.data | length' 2>/dev/null || echo "0")
    failed_executions=$(echo "$executions" | jq -r '[.data[] | select(.status == "error")] | length' 2>/dev/null || echo "0")
    success_executions=$(echo "$executions" | jq -r '[.data[] | select(.status == "success")] | length' 2>/dev/null || echo "0")

    echo "Recent executions: $total_executions total, $success_executions success, $failed_executions failed"

    # Calculate failure rate
    if [[ "$total_executions" -gt 0 ]]; then
        local failure_rate
        failure_rate=$(echo "scale=2; $failed_executions * 100 / $total_executions" | bc)

        if (( $(echo "$failure_rate > 20" | bc -l) )); then
            WARNINGS+=("High failure rate: ${failure_rate}% ($failed_executions/$total_executions)")
            HEALTH_STATUS="degraded"
        fi
    fi

    # Store execution metrics
    cat > "${MONITORING_DIR}/n8n-execution-metrics.json" <<EOF
{
  "timestamp": "$TIMESTAMP",
  "total_executions": $total_executions,
  "success_executions": $success_executions,
  "failed_executions": $failed_executions,
  "failure_rate": $(echo "scale=2; $failed_executions * 100 / $total_executions" | bc 2>/dev/null || echo "0")
}
EOF

    CHECKS_PASSED=$((CHECKS_PASSED + 1))
    return 0
}

# Function to check MCP server container status
check_mcp_container() {
    echo "Checking n8n-mcp-server container status..."

    if command -v docker &> /dev/null; then
        local container_status
        container_status=$(docker inspect -f '{{.State.Status}}' n8n-mcp-server 2>/dev/null || echo "not_found")

        if [[ "$container_status" == "running" ]]; then
            echo "n8n-mcp-server container is running"
            CHECKS_PASSED=$((CHECKS_PASSED + 1))
            return 0
        elif [[ "$container_status" == "not_found" ]]; then
            WARNINGS+=("n8n-mcp-server container not found")
            CHECKS_PASSED=$((CHECKS_PASSED + 1))
            return 0
        else
            ERRORS+=("n8n-mcp-server container status: $container_status")
            CHECKS_FAILED=$((CHECKS_FAILED + 1))
            HEALTH_STATUS="degraded"
            return 1
        fi
    else
        WARNINGS+=("Docker not available, skipping container check")
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
        return 0
    fi
}

# Function to check disk usage
check_disk_usage() {
    echo "Checking n8n data disk usage..."

    local n8n_data_dir="/var/lib/docker/volumes/n8n_data"

    if [[ -d "$n8n_data_dir" ]]; then
        local disk_usage
        disk_usage=$(du -sh "$n8n_data_dir" 2>/dev/null | awk '{print $1}' || echo "unknown")
        echo "n8n data directory size: $disk_usage"
    fi

    CHECKS_PASSED=$((CHECKS_PASSED + 1))
    return 0
}

# Main health check execution
main() {
    echo "========================================="
    echo "n8n MCP Server Health Check"
    echo "Timestamp: $TIMESTAMP"
    echo "Check ID: $CHECK_ID"
    echo "========================================="
    echo

    # Run all checks
    check_n8n_api || true
    check_workflow_status || true
    check_recent_executions || true
    check_mcp_container || true
    check_disk_usage || true

    # Generate health report
    local health_report="${MONITORING_DIR}/n8n-health-report.json"

    cat > "$health_report" <<EOF
{
  "check_id": "$CHECK_ID",
  "timestamp": "$TIMESTAMP",
  "status": "$HEALTH_STATUS",
  "checks": {
    "passed": $CHECKS_PASSED,
    "failed": $CHECKS_FAILED,
    "total": $((CHECKS_PASSED + CHECKS_FAILED))
  },
  "warnings": $(printf '%s\n' "${WARNINGS[@]}" | jq -R . | jq -s . || echo '[]'),
  "errors": $(printf '%s\n' "${ERRORS[@]}" | jq -R . | jq -s . || echo '[]'),
  "n8n_config": {
    "host": "$N8N_HOST",
    "api_configured": $([ -n "$N8N_API_KEY" ] && echo "true" || echo "false")
  }
}
EOF

    echo
    echo "========================================="
    echo "Health Check Summary"
    echo "========================================="
    echo "Status: $HEALTH_STATUS"
    echo "Checks Passed: $CHECKS_PASSED"
    echo "Checks Failed: $CHECKS_FAILED"

    if [[ ${#WARNINGS[@]} -gt 0 ]]; then
        echo
        echo "Warnings:"
        printf '  - %s\n' "${WARNINGS[@]}"
    fi

    if [[ ${#ERRORS[@]} -gt 0 ]]; then
        echo
        echo "Errors:"
        printf '  - %s\n' "${ERRORS[@]}"
    fi

    echo
    echo "Health report: $health_report"

    # Log event
    log_event "health_check_completed" "n8n MCP Server health check completed: $HEALTH_STATUS (passed: $CHECKS_PASSED, failed: $CHECKS_FAILED)" \
        "$([[ "$HEALTH_STATUS" == "healthy" ]] && echo "info" || echo "warning")"

    # Return appropriate exit code
    if [[ "$HEALTH_STATUS" == "unhealthy" ]]; then
        exit 1
    else
        exit 0
    fi
}

# Run main function
main "$@"
