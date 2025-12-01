#!/usr/bin/env bash
# Handler for security.* events
# Processes security scan results and vulnerabilities

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

log() {
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [on-security-alert] $*" >&2
}

handle_security_alert() {
    local event_file="$1"
    local event_json

    event_json=$(cat "$event_file")

    # Extract event data
    local event_id event_type scan_id severity finding_count
    event_id=$(echo "$event_json" | jq -r '.event_id')
    event_type=$(echo "$event_json" | jq -r '.event_type')
    scan_id=$(echo "$event_json" | jq -r '.correlation_id // .payload.scan_id // "unknown"')
    severity=$(echo "$event_json" | jq -r '.payload.severity // .metadata.priority // "medium"')
    finding_count=$(echo "$event_json" | jq -r '.payload.finding_count // 0')

    log "Security alert: $event_type (scan: $scan_id, severity: $severity, findings: $finding_count)"

    # Record security event
    local security_log="$PROJECT_ROOT/coordination/security/scan-results.jsonl"
    mkdir -p "$(dirname "$security_log")"

    local security_entry
    security_entry=$(jq -n \
        --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --arg scan "$scan_id" \
        --arg type "$event_type" \
        --arg severity "$severity" \
        --argjson count "$finding_count" \
        --argjson payload "$(echo "$event_json" | jq '.payload')" \
        '{
            timestamp: $ts,
            scan_id: $scan,
            event_type: $type,
            severity: $severity,
            finding_count: $count,
            details: $payload
        }')

    echo "$security_entry" | jq -c '.' >> "$security_log"
    log "Security event recorded"

    # Handle high/critical severity alerts
    if [[ "$severity" == "high" || "$severity" == "critical" ]]; then
        log "HIGH/CRITICAL severity alert detected"

        # Create health alert for critical security issues
        local alert_event
        alert_event=$("$PROJECT_ROOT/scripts/events/lib/event-logger.sh" --create \
            "system.health_alert" \
            "on-security-alert-handler" \
            "$(jq -n \
                --arg scan "$scan_id" \
                --arg severity "$severity" \
                --argjson count "$finding_count" \
                '{
                    alert_type: "security_critical",
                    scan_id: $scan,
                    severity: $severity,
                    finding_count: $count,
                    requires_immediate_attention: true
                }')" \
            "$scan_id" \
            "critical")

        echo "$alert_event" | "$PROJECT_ROOT/scripts/events/lib/event-logger.sh"
        log "Critical health alert created"

        # Update security dashboard metrics
        local dashboard_file="$PROJECT_ROOT/coordination/security/dashboard-metrics.json"
        if [[ ! -f "$dashboard_file" ]]; then
            echo '{"critical_alerts": [], "last_updated": ""}' > "$dashboard_file"
        fi

        local temp_file
        temp_file=$(mktemp)

        jq --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
            --arg scan "$scan_id" \
            --arg severity "$severity" \
            --argjson count "$finding_count" \
            '
            .critical_alerts += [{
                timestamp: $ts,
                scan_id: $scan,
                severity: $severity,
                finding_count: $count
            }] |
            .critical_alerts = (.critical_alerts | sort_by(.timestamp) | .[-10:]) |
            .last_updated = $ts
            ' "$dashboard_file" > "$temp_file"

        mv "$temp_file" "$dashboard_file"
        log "Security dashboard updated"
    fi

    # Aggregate scan statistics
    local stats_file="$PROJECT_ROOT/coordination/metrics/security-stats.json"
    mkdir -p "$(dirname "$stats_file")"

    if [[ ! -f "$stats_file" ]]; then
        echo '{"total_scans": 0, "total_findings": 0, "by_severity": {}}' > "$stats_file"
    fi

    local temp_file
    temp_file=$(mktemp)

    jq --arg severity "$severity" \
        --argjson count "$finding_count" \
        '
        .total_scans += 1 |
        .total_findings += $count |
        .by_severity[$severity] = ((.by_severity[$severity] // 0) + $count)
        ' "$stats_file" > "$temp_file"

    mv "$temp_file" "$stats_file"
    log "Security statistics updated"

    log "Handler completed successfully"
    return 0
}

# Main execution
if [[ $# -eq 0 ]]; then
    echo "Usage: $0 <event_file>" >&2
    exit 1
fi

handle_security_alert "$1"
