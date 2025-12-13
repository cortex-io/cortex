#!/bin/bash
#
# Cloudflare MCP Server Health Check Script
# Part of Cortex Autonomous Management System
#
# This script monitors the health of the Cloudflare MCP server integration
# and reports status to the Cortex dashboard.
#

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CLOUDFLARE_MCP_PATH="/Users/ryandahlberg/Projects/cloudflare-mcp-server"
MONITORING_CONFIG="$CORTEX_ROOT/coordination/monitoring/cloudflare-mcp-server.json"
HEALTH_LOG="$CORTEX_ROOT/logs/cloudflare-health-check.log"
ALERT_LOG="$CORTEX_ROOT/coordination/monitoring/alerts/cloudflare-mcp-server.log"
DASHBOARD_EVENTS="$CORTEX_ROOT/coordination/dashboard-events.jsonl"

# Ensure log directories exist
mkdir -p "$(dirname "$HEALTH_LOG")"
mkdir -p "$(dirname "$ALERT_LOG")"

# Logging function
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    echo "[$timestamp] [$level] $message" | tee -a "$HEALTH_LOG"
}

# Dashboard event function
post_event() {
    local event_type="$1"
    local severity="$2"
    local message="$3"
    local details="${4:-{}}"

    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    local event_id="cloudflare-health-$(date +%s)-$RANDOM"

    cat >> "$DASHBOARD_EVENTS" <<EOF
{"event_id":"$event_id","timestamp":"$timestamp","event_type":"$event_type","source":"cloudflare-mcp-health-check","severity":"$severity","message":"$message","details":$details}
EOF
}

# Alert function
send_alert() {
    local severity="$1"
    local alert_name="$2"
    local message="$3"
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    cat >> "$ALERT_LOG" <<EOF
{"timestamp":"$timestamp","severity":"$severity","alert":"$alert_name","message":"$message","service":"cloudflare-mcp-server"}
EOF

    log "ALERT" "[$severity] $alert_name: $message"
    post_event "alert" "$severity" "$message" "{\"alert\":\"$alert_name\"}"
}

# Check if API token is set
check_api_token() {
    log "INFO" "Checking Cloudflare API token configuration..."

    if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
        send_alert "critical" "missing_api_token" "CLOUDFLARE_API_TOKEN environment variable is not set"
        return 1
    fi

    log "INFO" "API token is configured"
    return 0
}

# Verify API token validity
verify_api_token() {
    log "INFO" "Verifying Cloudflare API token validity..."

    local response_code
    response_code=$(curl -s -o /dev/null -w "%{http_code}" \
        -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" \
        -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
        -H "Content-Type: application/json" \
        --max-time 30)

    if [ "$response_code" == "200" ]; then
        log "INFO" "API token is valid (HTTP $response_code)"
        post_event "health_check_success" "info" "Cloudflare API token verification successful" "{\"check\":\"api_token_verify\",\"status_code\":$response_code}"
        return 0
    elif [ "$response_code" == "401" ]; then
        send_alert "critical" "api_token_expired" "Cloudflare API token is invalid or expired (HTTP 401)"
        return 1
    elif [ "$response_code" == "429" ]; then
        send_alert "warning" "api_rate_limit" "Cloudflare API rate limit exceeded (HTTP 429)"
        return 1
    else
        send_alert "warning" "api_connectivity_issue" "Cloudflare API returned unexpected status code: $response_code"
        return 1
    fi
}

# Test zone listing functionality
test_zone_listing() {
    log "INFO" "Testing zone listing functionality..."

    local response
    local response_code

    response=$(curl -s -w "\n%{http_code}" \
        -X GET "https://api.cloudflare.com/client/v4/zones?per_page=5" \
        -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
        -H "Content-Type: application/json" \
        --max-time 30)

    response_code=$(echo "$response" | tail -n1)

    if [ "$response_code" == "200" ]; then
        local zone_count=$(echo "$response" | head -n-1 | grep -o '"result":\[.*\]' | grep -o '\[.*\]' | grep -o '{' | wc -l | tr -d ' ')
        log "INFO" "Zone listing successful (found $zone_count zones)"
        post_event "health_check_success" "info" "Zone listing test passed" "{\"check\":\"zone_listing\",\"zone_count\":$zone_count}"
        return 0
    else
        send_alert "warning" "zone_listing_failed" "Zone listing test failed (HTTP $response_code)"
        return 1
    fi
}

# Check MCP server directory
check_mcp_directory() {
    log "INFO" "Checking MCP server installation..."

    if [ ! -d "$CLOUDFLARE_MCP_PATH" ]; then
        send_alert "critical" "mcp_server_missing" "Cloudflare MCP server directory not found: $CLOUDFLARE_MCP_PATH"
        return 1
    fi

    if [ ! -f "$CLOUDFLARE_MCP_PATH/pyproject.toml" ]; then
        send_alert "warning" "mcp_config_missing" "pyproject.toml not found in MCP server directory"
        return 1
    fi

    log "INFO" "MCP server installation verified"
    return 0
}

# Check Python and uv availability
check_dependencies() {
    log "INFO" "Checking dependencies..."

    if ! command -v python3 &> /dev/null; then
        send_alert "critical" "python_missing" "Python 3 is not installed or not in PATH"
        return 1
    fi

    local python_version=$(python3 --version | awk '{print $2}')
    log "INFO" "Python version: $python_version"

    if ! command -v uv &> /dev/null; then
        send_alert "warning" "uv_missing" "uv package manager not found (recommended but optional)"
    else
        local uv_version=$(uv --version | awk '{print $2}')
        log "INFO" "uv version: $uv_version"
    fi

    return 0
}

# Collect metrics
collect_metrics() {
    log "INFO" "Collecting Cloudflare metrics..."

    # This is a placeholder for actual metrics collection
    # In production, this would gather real metrics from Cloudflare API

    local metrics_file="$CORTEX_ROOT/coordination/monitoring/metrics/cloudflare-$(date +%Y%m%d-%H%M%S).json"
    mkdir -p "$(dirname "$metrics_file")"

    cat > "$metrics_file" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "service": "cloudflare-mcp-server",
  "metrics": {
    "api_health": "healthy",
    "last_check": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "checks_passed": 0,
    "checks_failed": 0
  }
}
EOF

    log "INFO" "Metrics collected and saved to $metrics_file"
}

# Main health check function
main() {
    log "INFO" "Starting Cloudflare MCP Server health check..."

    local checks_passed=0
    local checks_failed=0
    local overall_status="healthy"

    # Run all checks
    if check_api_token; then
        ((checks_passed++))
    else
        ((checks_failed++))
        overall_status="unhealthy"
    fi

    if check_mcp_directory; then
        ((checks_passed++))
    else
        ((checks_failed++))
        overall_status="degraded"
    fi

    if check_dependencies; then
        ((checks_passed++))
    else
        ((checks_failed++))
        overall_status="degraded"
    fi

    # Only run API checks if token is available
    if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
        if verify_api_token; then
            ((checks_passed++))
        else
            ((checks_failed++))
            overall_status="unhealthy"
        fi

        if test_zone_listing; then
            ((checks_passed++))
        else
            ((checks_failed++))
            overall_status="degraded"
        fi
    fi

    # Collect metrics
    collect_metrics

    # Summary
    log "INFO" "Health check completed: $checks_passed passed, $checks_failed failed (status: $overall_status)"
    post_event "health_check_complete" "info" "Cloudflare MCP health check completed" "{\"status\":\"$overall_status\",\"passed\":$checks_passed,\"failed\":$checks_failed}"

    # Exit with appropriate code
    if [ "$overall_status" == "unhealthy" ]; then
        return 1
    fi

    return 0
}

# Run main function
main "$@"
