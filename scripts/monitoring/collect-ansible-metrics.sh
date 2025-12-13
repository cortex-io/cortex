#!/bin/bash
# Collect metrics from ansible-mcp-server execution logs
# Part of Cortex monitoring system

set -euo pipefail

LOG_DIR="$HOME/.ansible-mcp-server/logs"
METRICS_FILE="/Users/ryandahlberg/Projects/cortex/coordination/monitoring/ansible-metrics.json"
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Ensure directories exist
mkdir -p "$(dirname "$METRICS_FILE")"
mkdir -p "$LOG_DIR"

# Count executions in last 24 hours
TOTAL_EXECUTIONS=$(find "$LOG_DIR" -name "execution_*.json" -mtime -1 2>/dev/null | wc -l | tr -d ' ')

# Initialize counters
SUCCESSFUL=0
FAILED=0
TOTAL_DURATION=0

# Process each log file
for log_file in $(find "$LOG_DIR" -name "execution_*.json" -mtime -1 2>/dev/null); do
    if [ -f "$log_file" ]; then
        # Check if execution was successful
        if jq -e '.result.success == true' "$log_file" >/dev/null 2>&1; then
            ((SUCCESSFUL++))
        else
            ((FAILED++))
        fi
    fi
done

# Calculate success rate (avoid division by zero)
if [ "$TOTAL_EXECUTIONS" -gt 0 ]; then
    SUCCESS_RATE=$(echo "scale=2; $SUCCESSFUL / $TOTAL_EXECUTIONS * 100" | bc 2>/dev/null || echo "0")
else
    SUCCESS_RATE="0"
fi

# Get most recent execution
LATEST_EXECUTION="null"
LATEST_FILE=$(find "$LOG_DIR" -name "execution_*.json" -type f -exec ls -t {} + 2>/dev/null | head -1 || echo "")
if [ -n "$LATEST_FILE" ] && [ -f "$LATEST_FILE" ]; then
    LATEST_EXECUTION=$(jq -c '{timestamp: .timestamp, command: (.command[0:2] // []), success: .result.success}' "$LATEST_FILE" 2>/dev/null || echo "null")
fi

# Count total historical executions
TOTAL_HISTORICAL=$(find "$LOG_DIR" -name "execution_*.json" 2>/dev/null | wc -l | tr -d ' ')

# Write metrics
cat > "$METRICS_FILE" <<EOF
{
  "timestamp": "$TIMESTAMP",
  "component": "ansible-mcp-server",
  "period": "24h",
  "metrics": {
    "total_executions": $TOTAL_EXECUTIONS,
    "successful_executions": $SUCCESSFUL,
    "failed_executions": $FAILED,
    "success_rate_percent": $SUCCESS_RATE,
    "total_historical_executions": $TOTAL_HISTORICAL
  },
  "latest_execution": $LATEST_EXECUTION,
  "log_directory": "$LOG_DIR"
}
EOF

# Also append to time-series log
METRICS_LOG="/Users/ryandahlberg/Projects/cortex/coordination/monitoring/ansible-metrics.jsonl"
jq -c . "$METRICS_FILE" >> "$METRICS_LOG" 2>/dev/null || true

exit 0
