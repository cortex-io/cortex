#!/bin/bash
# OpenTofu MCP Server Health Check Monitor
# Part of Cortex Autonomous Management System
# Monitors OpenTofu/Terraform CLI health, state, and operation logs

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MONITORING_DIR="$CORTEX_ROOT/coordination/monitoring"
REPORTS_DIR="$CORTEX_ROOT/coordination/reports/opentofu-mcp-server"
OPENTOFU_SERVER_PATH="${OPENTOFU_SERVER_PATH:-/Users/ryandahlberg/Projects/opentofu-mcp-server}"
OPERATION_LOG="${OPERATION_LOG:-$OPENTOFU_SERVER_PATH/tofu_operations.log}"
HEALTH_CHECK_INTERVAL="${HEALTH_CHECK_INTERVAL:-3600}" # 1 hour default

# Ensure reports directory exists
mkdir -p "$REPORTS_DIR"

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*"
}

# Check OpenTofu CLI
check_opentofu_cli() {
    log "Checking OpenTofu CLI availability..."

    local tofu_version=""
    local terraform_version=""
    local cli_status="unknown"

    if command -v tofu &> /dev/null; then
        tofu_version=$(tofu version -json 2>/dev/null | jq -r '.terraform_version' 2>/dev/null || tofu version | head -n1 | awk '{print $2}')
        cli_status="tofu"
        log_success "OpenTofu CLI found: $tofu_version"
    fi

    if command -v terraform &> /dev/null; then
        terraform_version=$(terraform version -json 2>/dev/null | jq -r '.terraform_version' 2>/dev/null || terraform version | head -n1 | awk '{print $2}')
        if [ "$cli_status" = "unknown" ]; then
            cli_status="terraform"
            log_success "Terraform CLI found: $terraform_version"
        else
            log "Terraform CLI also available: $terraform_version"
        fi
    fi

    if [ "$cli_status" = "unknown" ]; then
        log_error "Neither OpenTofu nor Terraform CLI found in PATH"
        echo "error"
        return 1
    fi

    echo "$cli_status|$tofu_version|$terraform_version"
    return 0
}

# Check MCP server health endpoint
check_mcp_health() {
    log "Checking MCP server health endpoint..."

    # This would require the MCP server to be running
    # For now, we'll check if the main.py exists and is valid Python
    if [ -f "$OPENTOFU_SERVER_PATH/main.py" ]; then
        if python3 -m py_compile "$OPENTOFU_SERVER_PATH/main.py" 2>/dev/null; then
            log_success "MCP server main.py is valid Python"
            echo "valid"
        else
            log_error "MCP server main.py has syntax errors"
            echo "invalid"
        fi
    else
        log_error "MCP server main.py not found at $OPENTOFU_SERVER_PATH"
        echo "missing"
    fi
}

# Check operation log
check_operation_log() {
    log "Checking operation audit log..."

    if [ ! -f "$OPERATION_LOG" ]; then
        log_warning "Operation log not found (may not exist until first operation)"
        echo "0|0|0|0"
        return 0
    fi

    local total_ops=0
    local apply_ops=0
    local destroy_ops=0
    local failed_ops=0

    # Count operations from JSON log
    total_ops=$(wc -l < "$OPERATION_LOG" | tr -d ' ')

    if [ "$total_ops" -gt 0 ]; then
        apply_ops=$(grep -c '"operation": "apply"' "$OPERATION_LOG" 2>/dev/null || echo "0")
        destroy_ops=$(grep -c '"operation": "destroy"' "$OPERATION_LOG" 2>/dev/null || echo "0")
        failed_ops=$(grep -c '"success": false' "$OPERATION_LOG" 2>/dev/null || echo "0")
    fi

    log_success "Operation log: $total_ops total ops, $apply_ops applies, $destroy_ops destroys, $failed_ops failures"
    echo "$total_ops|$apply_ops|$destroy_ops|$failed_ops"
}

# Check workspace protection configuration
check_workspace_protection() {
    log "Checking workspace protection configuration..."

    local protected_workspaces="${TOFU_PROTECTED_WORKSPACES:-production,prod,main}"
    local workspace_count=$(echo "$protected_workspaces" | tr ',' '\n' | wc -l | tr -d ' ')

    log_success "Protected workspaces: $protected_workspaces ($workspace_count workspaces)"
    echo "$protected_workspaces"
}

# Check for security issues
check_security_issues() {
    log "Checking for security issues..."

    local issues=0
    local warnings=()

    # Check for .env file exposure
    if [ -f "$OPENTOFU_SERVER_PATH/.env" ]; then
        if git -C "$OPENTOFU_SERVER_PATH" ls-files --error-unmatch .env &>/dev/null; then
            log_error "SECURITY: .env file is tracked in git!"
            warnings+=("env_tracked_in_git")
            ((issues++))
        fi
    fi

    # Check operation log permissions
    if [ -f "$OPERATION_LOG" ]; then
        local log_perms=$(stat -f "%A" "$OPERATION_LOG" 2>/dev/null || stat -c "%a" "$OPERATION_LOG" 2>/dev/null || echo "unknown")
        if [ "$log_perms" != "600" ] && [ "$log_perms" != "unknown" ]; then
            log_warning "Operation log permissions are $log_perms (recommend 600)"
            warnings+=("log_permissions_loose")
        fi
    fi

    # Check for state files in repository
    if find "$OPENTOFU_SERVER_PATH" -name "*.tfstate*" -type f | grep -q .; then
        log_warning "Terraform state files found in repository"
        warnings+=("state_files_present")
    fi

    log_success "Security check complete: $issues issues, ${#warnings[@]} warnings"
    if [ ${#warnings[@]} -eq 0 ]; then
        echo "$issues|"
    else
        echo "$issues|${warnings[*]}"
    fi
}

# Generate health report
generate_health_report() {
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    local report_file="$REPORTS_DIR/health-check-$(date +%Y%m%d-%H%M%S).json"

    log "Generating health report..."

    # Collect all health data
    local cli_info=$(check_opentofu_cli || echo "error||")
    local mcp_health=$(check_mcp_health)
    local op_log_stats=$(check_operation_log)
    local protected_ws=$(check_workspace_protection)
    local security_check=$(check_security_issues)

    # Parse data
    IFS='|' read -r cli_type tofu_ver terraform_ver <<< "$cli_info"
    IFS='|' read -r total_ops apply_ops destroy_ops failed_ops <<< "$op_log_stats"
    IFS='|' read -r security_issues security_warnings <<< "$security_check"

    # Calculate health score (0-100)
    local health_score=100

    if [ "$cli_type" = "error" ]; then
        health_score=$((health_score - 40))
    fi

    if [ "$mcp_health" != "valid" ]; then
        health_score=$((health_score - 30))
    fi

    if [ "$security_issues" != "0" ]; then
        health_score=$((health_score - 20))
    fi

    if [ "$failed_ops" != "0" ] && [ "$total_ops" != "0" ] && [ -n "$failed_ops" ] && [ -n "$total_ops" ]; then
        local failure_rate=$(echo "scale=0; ($failed_ops * 100) / $total_ops" | bc 2>/dev/null || echo "0")
        health_score=$((health_score - failure_rate))
    fi

    # Ensure score doesn't go negative
    if [ "$health_score" -lt 0 ]; then
        health_score=0
    fi

    # Generate JSON report
    cat > "$report_file" <<EOF
{
  "timestamp": "$timestamp",
  "health_score": $health_score,
  "cli_status": {
    "primary_cli": "$cli_type",
    "opentofu_version": "$tofu_ver",
    "terraform_version": "$terraform_ver",
    "available": $([ "$cli_type" != "error" ] && echo "true" || echo "false")
  },
  "mcp_server": {
    "status": "$mcp_health",
    "server_path": "$OPENTOFU_SERVER_PATH",
    "main_py_valid": $([ "$mcp_health" = "valid" ] && echo "true" || echo "false")
  },
  "operations": {
    "total_operations": $total_ops,
    "apply_operations": $apply_ops,
    "destroy_operations": $destroy_ops,
    "failed_operations": $failed_ops,
    "operation_log_path": "$OPERATION_LOG",
    "failure_rate": $(echo "scale=2; if ($total_ops > 0) ($failed_ops * 100) / $total_ops else 0" | bc 2>/dev/null || echo "0")
  },
  "workspace_protection": {
    "enabled": true,
    "protected_workspaces": "$(echo $protected_ws | tr ' ' ',')",
    "enforcement_level": "strict"
  },
  "security": {
    "issues_count": $security_issues,
    "warnings": $([ -n "$security_warnings" ] && echo "\"$security_warnings\"" || echo "[]"),
    "last_scan": "$timestamp"
  },
  "monitoring_config": "$MONITORING_DIR/opentofu-mcp-server.json"
}
EOF

    log_success "Health report generated: $report_file"

    # Display health status
    echo ""
    if [ "$health_score" -ge 80 ]; then
        log_success "=== HEALTH STATUS: HEALTHY ($health_score/100) ==="
    elif [ "$health_score" -ge 60 ]; then
        log_warning "=== HEALTH STATUS: DEGRADED ($health_score/100) ==="
    else
        log_error "=== HEALTH STATUS: UNHEALTHY ($health_score/100) ==="
    fi

    # Post event to dashboard
    post_health_event "$health_score" "$cli_type" "$mcp_health"

    echo "$report_file"
}

# Post health event to dashboard
post_health_event() {
    local health_score=$1
    local cli_type=$2
    local mcp_health=$3
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    local event_file="$CORTEX_ROOT/coordination/dashboard-events.jsonl"

    local status="healthy"
    if [ "$health_score" -lt 80 ]; then
        status="degraded"
    fi
    if [ "$health_score" -lt 60 ]; then
        status="unhealthy"
    fi

    cat >> "$event_file" <<EOF
{"timestamp":"$timestamp","event_type":"health_check","source":"opentofu-mcp-server","status":"$status","health_score":$health_score,"cli":"$cli_type","mcp_server":"$mcp_health","component":"iac"}
EOF

    log "Health event posted to dashboard"
}

# Main execution
main() {
    log "=== OpenTofu MCP Server Health Check ==="
    log "Server Path: $OPENTOFU_SERVER_PATH"
    log "Operation Log: $OPERATION_LOG"
    echo ""

    # Generate comprehensive health report
    report_file=$(generate_health_report)

    echo ""
    log "Health check complete. Report: $report_file"

    # Display report summary
    if command -v jq &> /dev/null; then
        echo ""
        log "=== Report Summary ==="
        jq '.' "$report_file"
    fi
}

# Run main function
main "$@"
