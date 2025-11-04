#!/bin/bash

# DEPRECATED: This script is no longer needed
# Dashboard file monitoring and event broadcasting has been integrated
# directly into the dashboard server (dashboard/server/index.js)
#
# The server now handles:
# - File watching with chokidar (150ms latency)
# - Event broadcasting via WebSocket
# - Daemon status monitoring and push
# - Event buffering for reconnecting clients
#
# To use the dashboard, simply run:
#   node dashboard/server/index.js
# Or use:
#   ./scripts/start-commit-relay.sh
#
# This script will be removed in a future version.

echo "DEPRECATED: dashboard-agent-monitor.sh is no longer needed"
echo "Dashboard monitoring is now integrated into dashboard/server/index.js"
echo "Please use: ./scripts/start-commit-relay.sh"
exit 0

# ============================================================================
# ORIGINAL CODE BELOW - KEPT FOR REFERENCE ONLY
# ============================================================================

set -e

# Change to commit-relay directory
cd "$(dirname "$0")/.."

# Configuration
EVENT_FILE="coordination/dashboard-events.jsonl"
LOG_DIR="agents/logs/dashboard"
LOG_FILE="$LOG_DIR/activity-$(date +%Y-%m-%d).log"

# Create directories if needed
mkdir -p "$LOG_DIR"
mkdir -p "$LOG_DIR/history"

# Initialize event file if it doesn't exist
touch "$EVENT_FILE"

# Logging function
log_activity() {
  local level=$1
  local message=$2
  echo "$(date -Iseconds) [$level] $message" | tee -a "$LOG_FILE"
}

# Broadcast event function
broadcast_event() {
  local event_type=$1
  local event_data=$2

  EVENT=$(jq -n \
    --arg id "evt-$(date +%s)-$$" \
    --arg timestamp "$(date -Iseconds)" \
    --arg type "$event_type" \
    --argjson data "$event_data" \
    '{
      id: $id,
      timestamp: $timestamp,
      type: $type,
      data: $data,
      source: "dashboard-agent"
    }')

  echo "$EVENT" >> "$EVENT_FILE"
  log_activity "INFO" "Event broadcasted: $event_type"
}

# Check task queue changes
check_task_queue_changes() {
  if [ ! -f "coordination/task-queue.json" ]; then
    return
  fi

  CURRENT_HASH=$(md5 -q coordination/task-queue.json 2>/dev/null || echo "")
  PREVIOUS_HASH=$(cat /tmp/task-queue.hash 2>/dev/null || echo "")

  if [ "$CURRENT_HASH" != "$PREVIOUS_HASH" ] && [ -n "$CURRENT_HASH" ]; then
    echo "$CURRENT_HASH" > /tmp/task-queue.hash

    # Get current task count
    CURRENT_COUNT=$(jq '.tasks | length' coordination/task-queue.json)
    PREVIOUS_COUNT=$(cat /tmp/task-count 2>/dev/null || echo 0)

    if [ "$CURRENT_COUNT" -gt "$PREVIOUS_COUNT" ]; then
      # New task(s) detected
      log_activity "INFO" "New task(s) detected in task-queue.json"
    fi

    echo "$CURRENT_COUNT" > /tmp/task-count
  fi
}

# Check worker pool changes
check_worker_pool_changes() {
  if [ ! -f "coordination/worker-pool.json" ]; then
    return
  fi

  CURRENT_HASH=$(md5 -q coordination/worker-pool.json 2>/dev/null || echo "")
  PREVIOUS_HASH=$(cat /tmp/worker-pool.hash 2>/dev/null || echo "")

  if [ "$CURRENT_HASH" != "$PREVIOUS_HASH" ] && [ -n "$CURRENT_HASH" ]; then
    echo "$CURRENT_HASH" > /tmp/worker-pool.hash
    log_activity "INFO" "Worker pool updated"
  fi
}

# Check token budget changes
check_budget_changes() {
  if [ ! -f "coordination/token-budget.json" ]; then
    return
  fi

  CURRENT_HASH=$(md5 -q coordination/token-budget.json 2>/dev/null || echo "")
  PREVIOUS_HASH=$(cat /tmp/token-budget.hash 2>/dev/null || echo "")

  if [ "$CURRENT_HASH" != "$PREVIOUS_HASH" ] && [ -n "$CURRENT_HASH" ]; then
    echo "$CURRENT_HASH" > /tmp/token-budget.hash
    log_activity "INFO" "Token budget updated"
  fi
}

# Check handoff changes
check_handoff_changes() {
  if [ ! -f "coordination/handoffs.json" ]; then
    return
  fi

  CURRENT_HASH=$(md5 -q coordination/handoffs.json 2>/dev/null || echo "")
  PREVIOUS_HASH=$(cat /tmp/handoffs.hash 2>/dev/null || echo "")

  if [ "$CURRENT_HASH" != "$PREVIOUS_HASH" ] && [ -n "$CURRENT_HASH" ]; then
    echo "$CURRENT_HASH" > /tmp/handoffs.hash
    log_activity "INFO" "Handoff created or updated"
  fi
}

# Check inventory changes
check_inventory_changes() {
  if [ ! -f "coordination/repository-inventory.json" ]; then
    return
  fi

  CURRENT_HASH=$(md5 -q coordination/repository-inventory.json 2>/dev/null || echo "")
  PREVIOUS_HASH=$(cat /tmp/inventory.hash 2>/dev/null || echo "")

  if [ "$CURRENT_HASH" != "$PREVIOUS_HASH" ] && [ -n "$CURRENT_HASH" ]; then
    echo "$CURRENT_HASH" > /tmp/inventory.hash
    log_activity "INFO" "Repository inventory updated"
  fi
}

# Analyze worker efficiency
analyze_worker_efficiency() {
  if [ ! -f "coordination/worker-pool.json" ]; then
    return
  fi

  COMPLETED=$(jq '.completed_workers | length' coordination/worker-pool.json)
  FAILED=$(jq '.failed_workers | length' coordination/worker-pool.json)
  TOTAL=$((COMPLETED + FAILED))

  if [ $TOTAL -gt 0 ]; then
    SUCCESS_RATE=$(echo "scale=1; $COMPLETED * 100 / $TOTAL" | bc)
  else
    SUCCESS_RATE=0
  fi

  AVG_DURATION=$(jq '.stats.avg_duration_minutes // 0' coordination/worker-pool.json)
  AVG_TOKENS=$(jq '.stats.avg_tokens_used // 0' coordination/worker-pool.json)

  log_activity "INFO" "Worker Efficiency: ${SUCCESS_RATE}% success, ${AVG_DURATION}m avg duration, ${AVG_TOKENS} avg tokens"
}

# Analyze token usage
analyze_token_usage() {
  if [ ! -f "coordination/token-budget.json" ]; then
    return
  fi

  USED=$(jq '.usage_metrics.total_tokens_used_today // 0' coordination/token-budget.json)
  TOTAL=$(jq '.total_budget // 1' coordination/token-budget.json)
  PERCENT=$(echo "scale=1; $USED * 100 / $TOTAL" | bc)

  log_activity "INFO" "Token Usage: ${USED}/${TOTAL} (${PERCENT}%)"

  # Check if approaching limits
  if (( $(echo "$PERCENT > 80" | bc -l) )); then
    broadcast_event "alert.created" '{"level":"warning","message":"Token budget at '"$PERCENT"'%"}'
  fi
}

# Health check
health_check() {
  if [ ! -f "coordination/status.json" ]; then
    echo '{"dashboard_agent":{"status":"unknown"}}' > coordination/status.json
  fi

  HEALTH_STATUS="healthy"

  # Simple health determination
  if [ -f "coordination/token-budget.json" ]; then
    TOKENS_USED=$(jq '.usage_metrics.total_tokens_used_today // 0' coordination/token-budget.json)
    TOKENS_TOTAL=$(jq '.total_budget // 1' coordination/token-budget.json)
    TOKEN_PERCENT=$(echo "scale=1; $TOKENS_USED * 100 / $TOKENS_TOTAL" | bc)

    if (( $(echo "$TOKEN_PERCENT > 90" | bc -l) )); then
      HEALTH_STATUS="degraded"
    fi
  fi

  # Update status.json
  jq --arg status "$HEALTH_STATUS" \
     --arg timestamp "$(date -Iseconds)" \
    '.dashboard_agent = {
      "status": $status,
      "last_check": $timestamp
    }' coordination/status.json > tmp && mv tmp coordination/status.json
}

# Main monitoring loop
log_activity "INFO" "Dashboard Agent v1.0 starting"
log_activity "INFO" "Monitoring coordination files"
log_activity "INFO" "Event stream: $EVENT_FILE"
log_activity "INFO" "Log file: $LOG_FILE"

COUNTER=0

while true; do
  # Check for changes every 2 seconds
  sleep 2
  COUNTER=$((COUNTER + 1))

  # Detect events
  check_task_queue_changes
  check_worker_pool_changes
  check_handoff_changes
  check_budget_changes
  check_inventory_changes

  # Generate analytics (every 30 seconds)
  if [ $((COUNTER % 15)) -eq 0 ]; then
    analyze_worker_efficiency
    analyze_token_usage
    health_check
  fi

  # Log heartbeat (every 5 minutes)
  if [ $((COUNTER % 150)) -eq 0 ]; then
    log_activity "INFO" "Dashboard Agent heartbeat - monitoring active"
  fi
done
