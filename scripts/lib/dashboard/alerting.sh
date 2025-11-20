#!/usr/bin/env bash
#
# Alerting & Notifications Library
# Part of Phase 7.4: Alerting & Notifications
#
# Provides configurable alerts, spike detection, and warning systems
#

set -euo pipefail

if [[ -z "${ALERTING_LOADED:-}" ]]; then
    readonly ALERTING_LOADED=true
fi

# Directory setup
ALERTS_DIR="${ALERTS_DIR:-coordination/dashboard/alerts}"
ALERTS_FILE="${ALERTS_FILE:-coordination/health-alerts.json}"

#
# Initialize alerting
#
init_alerting() {
    mkdir -p "$ALERTS_DIR"/{active,history,rules}

    # Create default alert rules if not exist
    if [[ ! -f "$ALERTS_DIR/rules/default-rules.json" ]]; then
        cat > "$ALERTS_DIR/rules/default-rules.json" <<EOF
{
  "rules": [
    {
      "id": "token-budget-warning",
      "metric": "token_usage_pct",
      "condition": "gt",
      "threshold": 80,
      "severity": "warning",
      "message": "Token budget usage exceeds 80%"
    },
    {
      "id": "token-budget-critical",
      "metric": "token_usage_pct",
      "condition": "gt",
      "threshold": 90,
      "severity": "critical",
      "message": "Token budget usage exceeds 90%"
    },
    {
      "id": "worker-failure-spike",
      "metric": "failure_rate",
      "condition": "gt",
      "threshold": 20,
      "severity": "warning",
      "message": "Worker failure rate exceeds 20%"
    },
    {
      "id": "zombie-detection",
      "metric": "zombie_count",
      "condition": "gt",
      "threshold": 0,
      "severity": "warning",
      "message": "Zombie workers detected"
    },
    {
      "id": "no-active-workers",
      "metric": "active_workers",
      "condition": "eq",
      "threshold": 0,
      "duration_minutes": 30,
      "severity": "info",
      "message": "No active workers for 30 minutes"
    }
  ]
}
EOF
    fi
}

#
# Get timestamp
#
_get_ts() {
    date +%s%3N 2>/dev/null || echo $(($(date +%s) * 1000))
}

#
# Generate alert ID
#
generate_alert_id() {
    echo "alert-$(date +%s)-$RANDOM"
}

#
# Create alert
#
create_alert() {
    local severity="$1"
    local message="$2"
    local source="${3:-system}"
    local metric="${4:-}"
    local value="${5:-}"

    init_alerting

    local alert_id=$(generate_alert_id)
    local timestamp=$(_get_ts)

    local alert=$(cat <<EOF
{
  "alert_id": "$alert_id",
  "severity": "$severity",
  "message": "$message",
  "source": "$source",
  "metric": "$metric",
  "value": $value,
  "status": "active",
  "created_at": $timestamp,
  "acknowledged_at": null,
  "resolved_at": null
}
EOF
)

    echo "$alert" > "$ALERTS_DIR/active/${alert_id}.json"

    # Also append to alerts file for history
    echo "$alert" >> "$ALERTS_DIR/history/alerts.jsonl"

    echo "$alert_id"
}

#
# Acknowledge alert
#
acknowledge_alert() {
    local alert_id="$1"
    local acknowledged_by="${2:-system}"

    local file="$ALERTS_DIR/active/${alert_id}.json"
    if [[ ! -f "$file" ]]; then
        echo "Alert not found: $alert_id" >&2
        return 1
    fi

    local alert=$(cat "$file")
    alert=$(echo "$alert" | jq \
        --argjson ts "$(_get_ts)" \
        --arg by "$acknowledged_by" \
        '.status = "acknowledged" | .acknowledged_at = $ts | .acknowledged_by = $by')

    echo "$alert" > "$file"
    echo "Alert acknowledged: $alert_id"
}

#
# Resolve alert
#
resolve_alert() {
    local alert_id="$1"
    local resolution="${2:-resolved}"

    local file="$ALERTS_DIR/active/${alert_id}.json"
    if [[ ! -f "$file" ]]; then
        echo "Alert not found: $alert_id" >&2
        return 1
    fi

    local alert=$(cat "$file")
    alert=$(echo "$alert" | jq \
        --argjson ts "$(_get_ts)" \
        --arg res "$resolution" \
        '.status = "resolved" | .resolved_at = $ts | .resolution = $res')

    # Move to history
    echo "$alert" > "$ALERTS_DIR/history/${alert_id}.json"
    rm "$file"

    echo "Alert resolved: $alert_id"
}

#
# Get active alerts
#
get_active_alerts() {
    local severity="${1:-}"

    init_alerting

    local alerts="[]"

    for file in "$ALERTS_DIR/active"/*.json; do
        if [[ -f "$file" ]]; then
            local alert=$(cat "$file")

            if [[ -z "$severity" ]] || [[ $(echo "$alert" | jq -r '.severity') == "$severity" ]]; then
                alerts=$(echo "$alerts" | jq --argjson a "$alert" '. + [$a]')
            fi
        fi
    done

    echo "$alerts" | jq 'sort_by(.created_at) | reverse'
}

#
# Check alert rules against current metrics
#
check_alert_rules() {
    init_alerting

    local rules_file="$ALERTS_DIR/rules/default-rules.json"
    if [[ ! -f "$rules_file" ]]; then
        return
    fi

    local rules=$(jq -r '.rules[]' "$rules_file")
    local triggered="[]"

    # Get current metrics
    local token_pct=0
    if [[ -f "coordination/token-budget.json" ]]; then
        local used=$(jq -r '.used // 0' coordination/token-budget.json)
        local total=$(jq -r '.total // 270000' coordination/token-budget.json)
        token_pct=$(echo "scale=2; $used * 100 / $total" | bc)
    fi

    local active_workers=$(ls coordination/worker-specs/active/*.json 2>/dev/null | wc -l | tr -d ' ')

    # Check token budget rules
    if (( $(echo "$token_pct > 90" | bc -l) )); then
        local alert_id=$(create_alert "critical" "Token budget usage exceeds 90%" "alerting" "token_usage_pct" "$token_pct")
        triggered=$(echo "$triggered" | jq --arg id "$alert_id" '. + [$id]')
    elif (( $(echo "$token_pct > 80" | bc -l) )); then
        local alert_id=$(create_alert "warning" "Token budget usage exceeds 80%" "alerting" "token_usage_pct" "$token_pct")
        triggered=$(echo "$triggered" | jq --arg id "$alert_id" '. + [$id]')
    fi

    echo "$triggered"
}

#
# Detect error rate spikes
#
detect_error_spike() {
    local threshold="${1:-20}"
    local window_minutes="${2:-30}"

    # Count recent failures
    local now=$(_get_ts)
    local start=$((now - window_minutes * 60000))

    local total=0
    local failed=0

    for file in coordination/worker-specs/completed/*.json coordination/worker-specs/failed/*.json; do
        if [[ -f "$file" ]]; then
            local ts=$(jq -r '.completed_at // .failed_at // 0' "$file" 2>/dev/null)
            if [[ $ts -ge $start ]]; then
                total=$((total + 1))
                local status=$(jq -r '.status // ""' "$file" 2>/dev/null)
                if [[ "$status" == "failed" ]]; then
                    failed=$((failed + 1))
                fi
            fi
        fi
    done

    local error_rate=0
    if [[ $total -gt 0 ]]; then
        error_rate=$(echo "scale=2; $failed * 100 / $total" | bc)
    fi

    local spike=false
    if (( $(echo "$error_rate > $threshold" | bc -l) )); then
        spike=true
        create_alert "warning" "Error rate spike detected: ${error_rate}%" "spike-detection" "error_rate" "$error_rate"
    fi

    cat <<EOF
{
  "window_minutes": $window_minutes,
  "total_tasks": $total,
  "failed_tasks": $failed,
  "error_rate": $error_rate,
  "threshold": $threshold,
  "spike_detected": $spike
}
EOF
}

#
# Check resource exhaustion
#
check_resource_exhaustion() {
    init_alerting

    local warnings="[]"

    # Check token budget
    if [[ -f "coordination/token-budget.json" ]]; then
        local used=$(jq -r '.used // 0' coordination/token-budget.json)
        local total=$(jq -r '.total // 270000' coordination/token-budget.json)
        local remaining=$((total - used))

        if [[ $remaining -lt 10000 ]]; then
            warnings=$(echo "$warnings" | jq '. + [{
                resource: "token_budget",
                remaining: '$remaining',
                severity: "critical",
                message: "Token budget nearly exhausted"
            }]')
        fi
    fi

    # Check disk space (coordination directory)
    local dir_size=$(du -sk coordination 2>/dev/null | cut -f1)
    if [[ $dir_size -gt 1000000 ]]; then  # > 1GB
        warnings=$(echo "$warnings" | jq --argjson size "$dir_size" '. + [{
            resource: "disk_space",
            size_kb: $size,
            severity: "warning",
            message: "Coordination directory exceeds 1GB"
        }]')
    fi

    echo "$warnings"
}

#
# Get alert statistics
#
get_alert_stats() {
    local hours="${1:-24}"

    init_alerting

    local active=$(ls "$ALERTS_DIR/active"/*.json 2>/dev/null | wc -l | tr -d ' ')
    local critical=0
    local warning=0
    local info=0

    for file in "$ALERTS_DIR/active"/*.json; do
        if [[ -f "$file" ]]; then
            local severity=$(jq -r '.severity' "$file")
            case "$severity" in
                critical) critical=$((critical + 1)) ;;
                warning) warning=$((warning + 1)) ;;
                info) info=$((info + 1)) ;;
            esac
        fi
    done

    cat <<EOF
{
  "period_hours": $hours,
  "active_alerts": $active,
  "by_severity": {
    "critical": $critical,
    "warning": $warning,
    "info": $info
  }
}
EOF
}

#
# Configure alert rule
#
configure_rule() {
    local rule_id="$1"
    local metric="$2"
    local condition="$3"
    local threshold="$4"
    local severity="$5"
    local message="$6"

    init_alerting

    local rules_file="$ALERTS_DIR/rules/default-rules.json"
    local rules=$(cat "$rules_file")

    local new_rule=$(cat <<EOF
{
  "id": "$rule_id",
  "metric": "$metric",
  "condition": "$condition",
  "threshold": $threshold,
  "severity": "$severity",
  "message": "$message"
}
EOF
)

    rules=$(echo "$rules" | jq --argjson rule "$new_rule" '.rules += [$rule]')
    echo "$rules" > "$rules_file"

    echo "Rule configured: $rule_id"
}

#
# Get alerting summary
#
get_alerting_summary() {
    cat <<EOF
{
  "stats": $(get_alert_stats 24),
  "active_alerts": $(get_active_alerts),
  "resource_warnings": $(check_resource_exhaustion)
}
EOF
}

# Export functions
export -f init_alerting
export -f create_alert
export -f acknowledge_alert
export -f resolve_alert
export -f get_active_alerts
export -f check_alert_rules
export -f detect_error_spike
export -f check_resource_exhaustion
export -f get_alert_stats
export -f configure_rule
export -f get_alerting_summary
