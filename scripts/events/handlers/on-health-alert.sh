#!/usr/bin/env bash
# Handler for system.health_alert events
# Processes health alerts and triggers notifications

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

log() {
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [on-health-alert] $*" >&2
}

handle_health_alert() {
    local event_file="$1"
    local event_json

    event_json=$(cat "$event_file")

    # Extract event data
    local event_id alert_type severity source description
    event_id=$(echo "$event_json" | jq -r '.event_id')
    alert_type=$(echo "$event_json" | jq -r '.payload.alert_type // "unknown"')
    severity=$(echo "$event_json" | jq -r '.metadata.priority // "medium"')
    source=$(echo "$event_json" | jq -r '.source')
    description=$(echo "$event_json" | jq -r '.payload.description // .payload | tostring')

    log "Health alert: $alert_type (severity: $severity, source: $source)"

    # Record alert
    local alerts_file="$PROJECT_ROOT/coordination/health-alerts.json"
    mkdir -p "$(dirname "$alerts_file")"

    # Initialize if doesn't exist
    if [[ ! -f "$alerts_file" ]]; then
        echo '{"alerts": [], "last_updated": ""}' > "$alerts_file"
    fi

    local temp_file
    temp_file=$(mktemp)

    # Add new alert and keep last 50
    jq --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --arg alert_type "$alert_type" \
        --arg severity "$severity" \
        --arg source "$source" \
        --arg desc "$description" \
        --arg event_id "$event_id" \
        '
        .alerts += [{
            timestamp: $ts,
            event_id: $event_id,
            alert_type: $alert_type,
            severity: $severity,
            source: $source,
            description: $desc
        }] |
        .alerts = (.alerts | sort_by(.timestamp) | .[-50:]) |
        .last_updated = $ts
        ' "$alerts_file" > "$temp_file"

    mv "$temp_file" "$alerts_file"
    log "Alert recorded"

    # Log alert to health reports
    local reports_file="$PROJECT_ROOT/coordination/health-reports.jsonl"
    mkdir -p "$(dirname "$reports_file")"

    local report_entry
    report_entry=$(jq -n \
        --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --arg event_id "$event_id" \
        --arg alert_type "$alert_type" \
        --arg severity "$severity" \
        --arg source "$source" \
        --arg desc "$description" \
        '{
            timestamp: $ts,
            event_id: $event_id,
            alert_type: $alert_type,
            severity: $severity,
            source: $source,
            description: $desc
        }')

    echo "$report_entry" | jq -c '.' >> "$reports_file"
    log "Health report logged"

    # Check if critical alert threshold exceeded
    if [[ "$severity" == "critical" ]]; then
        log "CRITICAL alert detected - checking recent critical count"

        local recent_critical
        recent_critical=$(jq '.alerts | map(select(.severity == "critical")) | length' "$alerts_file")

        if [[ "$recent_critical" -gt 5 ]]; then
            log "WARNING: More than 5 critical alerts active"
            # Could trigger additional escalation here
        fi
    fi

    # Update alert statistics
    local stats_file="$PROJECT_ROOT/coordination/metrics/health-alert-stats.json"
    mkdir -p "$(dirname "$stats_file")"

    if [[ ! -f "$stats_file" ]]; then
        echo '{"total_alerts": 0, "by_severity": {}, "by_type": {}}' > "$stats_file"
    fi

    temp_file=$(mktemp)

    jq --arg severity "$severity" \
        --arg type "$alert_type" \
        '
        .total_alerts += 1 |
        .by_severity[$severity] = ((.by_severity[$severity] // 0) + 1) |
        .by_type[$type] = ((.by_type[$type] // 0) + 1)
        ' "$stats_file" > "$temp_file"

    mv "$temp_file" "$stats_file"
    log "Alert statistics updated"

    # Log to dashboard
    local dashboard_log="$PROJECT_ROOT/coordination/dashboard-events.jsonl"
    local dashboard_entry
    dashboard_entry=$(jq -n \
        --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --arg event_type "health_alert" \
        --arg alert_type "$alert_type" \
        --arg severity "$severity" \
        --arg source "$source" \
        '{
            timestamp: $ts,
            event_type: $event_type,
            alert_type: $alert_type,
            severity: $severity,
            source: $source
        }')

    echo "$dashboard_entry" | jq -c '.' >> "$dashboard_log"
    log "Dashboard event logged"

    log "Handler completed successfully"
    return 0
}

# Main execution
if [[ $# -eq 0 ]]; then
    echo "Usage: $0 <event_file>" >&2
    exit 1
fi

handle_health_alert "$1"
