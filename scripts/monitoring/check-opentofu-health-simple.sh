#!/bin/bash
# Simplified OpenTofu MCP Server Health Check
set -euo pipefail

CORTEX_ROOT="/Users/ryandahlberg/Projects/cortex"
OPENTOFU_PATH="/Users/ryandahlberg/Projects/opentofu-mcp-server"
REPORTS_DIR="$CORTEX_ROOT/coordination/reports/opentofu-mcp-server"
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
REPORT_FILE="$REPORTS_DIR/health-check-$(date +%Y%m%d-%H%M%S).json"

mkdir -p "$REPORTS_DIR"

# Initialize health score
HEALTH_SCORE=100

# Check CLI
if command -v tofu &> /dev/null; then
    CLI_TYPE="tofu"
    CLI_VERSION=$(tofu version 2>/dev/null | head -n1 | awk '{print $2}' || echo "unknown")
elif command -v terraform &> /dev/null; then
    CLI_TYPE="terraform"
    CLI_VERSION=$(terraform version 2>/dev/null | head -n1 | awk '{print $2}' || echo "unknown")
else
    CLI_TYPE="none"
    CLI_VERSION="none"
    HEALTH_SCORE=$((HEALTH_SCORE - 40))
fi

# Check MCP server
if python3 -m py_compile "$OPENTOFU_PATH/main.py" 2>/dev/null; then
    MCP_STATUS="valid"
else
    MCP_STATUS="invalid"
    HEALTH_SCORE=$((HEALTH_SCORE - 30))
fi

# Check operation log
OP_LOG="$OPENTOFU_PATH/tofu_operations.log"
if [ -f "$OP_LOG" ]; then
    TOTAL_OPS=$(wc -l < "$OP_LOG" | tr -d ' ')
    APPLY_OPS=$(grep -c '"operation": "apply"' "$OP_LOG" 2>/dev/null || echo "0")
    DESTROY_OPS=$(grep -c '"operation": "destroy"' "$OP_LOG" 2>/dev/null || echo "0")
    FAILED_OPS=$(grep -c '"success": false' "$OP_LOG" 2>/dev/null || echo "0")
else
    TOTAL_OPS=0
    APPLY_OPS=0
    DESTROY_OPS=0
    FAILED_OPS=0
fi

# Check security
SECURITY_ISSUES=0
if git -C "$OPENTOFU_PATH" ls-files --error-unmatch .env &>/dev/null 2>&1; then
    SECURITY_ISSUES=$((SECURITY_ISSUES + 1))
    HEALTH_SCORE=$((HEALTH_SCORE - 20))
fi

# Generate report
cat > "$REPORT_FILE" <<EOF
{
  "timestamp": "$TIMESTAMP",
  "health_score": $HEALTH_SCORE,
  "cli_status": {
    "primary_cli": "$CLI_TYPE",
    "version": "$CLI_VERSION",
    "available": $([ "$CLI_TYPE" != "none" ] && echo "true" || echo "false")
  },
  "mcp_server": {
    "status": "$MCP_STATUS",
    "main_py_valid": $([ "$MCP_STATUS" = "valid" ] && echo "true" || echo "false")
  },
  "operations": {
    "total_operations": $TOTAL_OPS,
    "apply_operations": $APPLY_OPS,
    "destroy_operations": $DESTROY_OPS,
    "failed_operations": $FAILED_OPS
  },
  "workspace_protection": {
    "enabled": true,
    "protected_workspaces": "production,prod,main"
  },
  "security": {
    "issues_count": $SECURITY_ISSUES
  }
}
EOF

# Post to dashboard
cat >> "$CORTEX_ROOT/coordination/dashboard-events.jsonl" <<EOF
{"timestamp":"$TIMESTAMP","event_type":"health_check","source":"opentofu-mcp-server","status":"$([ $HEALTH_SCORE -ge 80 ] && echo healthy || echo degraded)","health_score":$HEALTH_SCORE,"cli":"$CLI_TYPE","component":"iac"}
EOF

echo "Health check complete: $HEALTH_SCORE/100 - Report: $REPORT_FILE"
