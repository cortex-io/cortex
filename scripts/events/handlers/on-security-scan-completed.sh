#!/usr/bin/env bash
# Handler for security.scan_completed events
# Aggregates scan results, creates alerts for critical vulnerabilities

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

log() {
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [on-security-scan-completed] $*" >&2
}

handle_security_scan_completed() {
    local event_file="$1"
    local event_json

    event_json=$(cat "$event_file")

    # Extract event data
    local event_id scan_id scan_type scanner duration_ms
    local vulnerabilities_found critical_count high_count medium_count low_count
    event_id=$(echo "$event_json" | jq -r '.event_id')
    scan_id=$(echo "$event_json" | jq -r '.correlation_id // .payload.scan_id // "unknown"')
    scan_type=$(echo "$event_json" | jq -r '.payload.scan_type // "unknown"')
    scanner=$(echo "$event_json" | jq -r '.payload.scanner // "unknown"')
    duration_ms=$(echo "$event_json" | jq -r '.payload.duration_ms // 0')
    vulnerabilities_found=$(echo "$event_json" | jq -r '.payload.vulnerabilities_found // 0')
    critical_count=$(echo "$event_json" | jq -r '.payload.severity_breakdown.critical // 0')
    high_count=$(echo "$event_json" | jq -r '.payload.severity_breakdown.high // 0')
    medium_count=$(echo "$event_json" | jq -r '.payload.severity_breakdown.medium // 0')
    low_count=$(echo "$event_json" | jq -r '.payload.severity_breakdown.low // 0')

    log "Security scan completed: $scan_id (type: $scan_type, scanner: $scanner)"
    log "Vulnerabilities found: $vulnerabilities_found (critical: $critical_count, high: $high_count, medium: $medium_count, low: $low_count)"

    # Record scan completion
    local scan_log="$PROJECT_ROOT/coordination/security/scan-results.jsonl"
    mkdir -p "$(dirname "$scan_log")"

    local scan_entry
    scan_entry=$(jq -n \
        --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --arg scan "$scan_id" \
        --arg type "$scan_type" \
        --arg scanner "$scanner" \
        --argjson duration "$duration_ms" \
        --argjson total "$vulnerabilities_found" \
        --argjson critical "$critical_count" \
        --argjson high "$high_count" \
        --argjson medium "$medium_count" \
        --argjson low "$low_count" \
        '{
            timestamp: $ts,
            scan_id: $scan,
            scan_type: $type,
            scanner: $scanner,
            duration_ms: $duration,
            vulnerabilities_found: $total,
            severity_breakdown: {
                critical: $critical,
                high: $high,
                medium: $medium,
                low: $low
            }
        }')

    echo "$scan_entry" | jq -c '.' >> "$scan_log"
    log "Scan results recorded"

    # Create detailed vulnerability report if vulnerabilities found
    if [[ "$vulnerabilities_found" -gt 0 ]]; then
        log "Creating vulnerability report..."

        local report_dir="$PROJECT_ROOT/coordination/security/reports"
        mkdir -p "$report_dir"

        local report_file="$report_dir/scan-${scan_id}-$(date +%Y%m%d-%H%M%S).json"
        local vulnerabilities
        vulnerabilities=$(echo "$event_json" | jq '.payload.vulnerabilities // []')

        local report_data
        report_data=$(jq -n \
            --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
            --arg scan "$scan_id" \
            --arg type "$scan_type" \
            --arg scanner "$scanner" \
            --argjson total "$vulnerabilities_found" \
            --argjson critical "$critical_count" \
            --argjson high "$high_count" \
            --argjson medium "$medium_count" \
            --argjson low "$low_count" \
            --argjson vulns "$vulnerabilities" \
            '{
                report_timestamp: $ts,
                scan_id: $scan,
                scan_type: $type,
                scanner: $scanner,
                summary: {
                    total_vulnerabilities: $total,
                    critical: $critical,
                    high: $high,
                    medium: $medium,
                    low: $low
                },
                vulnerabilities: $vulns
            }')

        echo "$report_data" > "$report_file"
        log "Vulnerability report created: $report_file"
    fi

    # Create alerts for critical and high severity vulnerabilities
    local alert_threshold=$((critical_count + high_count))
    if [[ "$alert_threshold" -gt 0 ]]; then
        log "Creating security alert for $alert_threshold critical/high vulnerabilities"

        local alert_priority="high"
        if [[ "$critical_count" -gt 0 ]]; then
            alert_priority="critical"
        fi

        # Create health alert event
        local alert_event
        alert_event=$("$PROJECT_ROOT/scripts/events/lib/event-logger.sh" --create \
            "system.health_alert" \
            "on-security-scan-completed-handler" \
            "$(jq -n \
                --arg scan "$scan_id" \
                --arg type "$scan_type" \
                --argjson total "$vulnerabilities_found" \
                --argjson critical "$critical_count" \
                --argjson high "$high_count" \
                '{
                    alert_type: "security_vulnerabilities",
                    scan_id: $scan,
                    scan_type: $type,
                    total_vulnerabilities: $total,
                    critical_count: $critical,
                    high_count: $high,
                    requires_immediate_action: true
                }')" \
            "$scan_id" \
            "$alert_priority")

        echo "$alert_event" | "$PROJECT_ROOT/scripts/events/lib/event-logger.sh"
        log "Security alert created with priority: $alert_priority"

        # Also create specific vulnerability found events
        if [[ "$critical_count" -gt 0 ]]; then
            local vuln_event
            vuln_event=$("$PROJECT_ROOT/scripts/events/lib/event-logger.sh" --create \
                "security.vulnerability_found" \
                "on-security-scan-completed-handler" \
                "$(jq -n \
                    --arg scan "$scan_id" \
                    --argjson count "$critical_count" \
                    '{
                        scan_id: $scan,
                        severity: "critical",
                        count: $count
                    }')" \
                "$scan_id" \
                "critical")

            echo "$vuln_event" | "$PROJECT_ROOT/scripts/events/lib/event-logger.sh"
            log "Critical vulnerability event created"
        fi
    fi

    # Aggregate scan statistics
    local stats_file="$PROJECT_ROOT/coordination/metrics/security-stats.json"
    mkdir -p "$(dirname "$stats_file")"

    if [[ ! -f "$stats_file" ]]; then
        echo '{"total_scans": 0, "total_vulnerabilities": 0, "by_severity": {"critical": 0, "high": 0, "medium": 0, "low": 0}, "by_scanner": {}, "by_scan_type": {}}' > "$stats_file"
    fi

    local temp_file
    temp_file=$(mktemp)

    jq --arg scanner "$scanner" \
        --arg type "$scan_type" \
        --argjson total "$vulnerabilities_found" \
        --argjson critical "$critical_count" \
        --argjson high "$high_count" \
        --argjson medium "$medium_count" \
        --argjson low "$low_count" \
        '
        .total_scans += 1 |
        .total_vulnerabilities += $total |
        .by_severity.critical += $critical |
        .by_severity.high += $high |
        .by_severity.medium += $medium |
        .by_severity.low += $low |
        .by_scanner[$scanner] = ((.by_scanner[$scanner] // 0) + 1) |
        .by_scan_type[$type] = ((.by_scan_type[$type] // 0) + 1)
        ' "$stats_file" > "$temp_file"

    mv "$temp_file" "$stats_file"
    log "Security statistics updated"

    # Update security posture score (simple calculation)
    local posture_file="$PROJECT_ROOT/coordination/security/posture-score.json"
    mkdir -p "$(dirname "$posture_file")"

    # Calculate posture score (100 - weighted vulnerability count)
    # Critical: -10, High: -5, Medium: -2, Low: -1, max deduction of 100
    local deduction=$((critical_count * 10 + high_count * 5 + medium_count * 2 + low_count * 1))
    local posture_score=$((100 - deduction))
    if [[ "$posture_score" -lt 0 ]]; then
        posture_score=0
    fi

    local posture_data
    posture_data=$(jq -n \
        --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --argjson score "$posture_score" \
        --argjson critical "$critical_count" \
        --argjson high "$high_count" \
        --argjson medium "$medium_count" \
        --argjson low "$low_count" \
        --arg scan "$scan_id" \
        '{
            timestamp: $ts,
            posture_score: $score,
            last_scan_id: $scan,
            active_vulnerabilities: {
                critical: $critical,
                high: $high,
                medium: $medium,
                low: $low
            }
        }')

    echo "$posture_data" > "$posture_file"
    log "Security posture updated: score $posture_score/100"

    # Trigger remediation workflow if critical vulnerabilities found
    if [[ "$critical_count" -gt 0 ]]; then
        log "Triggering remediation workflow for $critical_count critical vulnerabilities"

        local remediation_dir="$PROJECT_ROOT/coordination/remediation"
        mkdir -p "$remediation_dir"

        local remediation_task
        remediation_task=$(jq -n \
            --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
            --arg scan "$scan_id" \
            --argjson critical "$critical_count" \
            '{
                created_at: $ts,
                scan_id: $scan,
                task_type: "critical_vulnerability_remediation",
                critical_count: $critical,
                status: "pending",
                priority: "critical"
            }')

        echo "$remediation_task" > "$remediation_dir/remediation-${scan_id}.json"
        log "Remediation task created"
    fi

    # Log to dashboard events
    local dashboard_log="$PROJECT_ROOT/coordination/dashboard-events.jsonl"
    local dashboard_entry
    dashboard_entry=$(jq -n \
        --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --arg event_type "security_scan_completed" \
        --arg scan "$scan_id" \
        --arg type "$scan_type" \
        --argjson total "$vulnerabilities_found" \
        --argjson critical "$critical_count" \
        --argjson high "$high_count" \
        '{
            timestamp: $ts,
            event_type: $event_type,
            scan_id: $scan,
            scan_type: $type,
            vulnerabilities_found: $total,
            critical_count: $critical,
            high_count: $high
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

handle_security_scan_completed "$1"
