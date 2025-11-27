#!/usr/bin/env bash
#
# Check Alerts - Threshold Monitoring and Alerting
# Monitors metrics against defined thresholds and triggers alerts
#
# Usage:
#   ./scripts/check-alerts.sh [OPTIONS]
#   ./scripts/check-alerts.sh --check-all
#   ./scripts/check-alerts.sh --critical-only
#

set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Source required libraries
source "$SCRIPT_DIR/lib/metrics.sh" 2>/dev/null || true

# Configuration (use existing values from metrics-collector.sh if available)
: "${ALERT_CONFIG:=coordination/config/alert-thresholds.json}"
: "${METRICS_RAW_DIR:=coordination/observability/metrics/raw}"
: "${METRICS_ALERTS_DIR:=coordination/metrics/alerts}"

# Alert thresholds (can be overridden by config file)
readonly TASK_PROCESSING_SLA_MS=300000  # 5 minutes
readonly TOKEN_HIGH_USAGE_THRESHOLD=50000
readonly WORKER_SPAWN_FAILURE_RATE_THRESHOLD=0.2  # 20%
readonly SYSTEM_HEALTH_LOW_THRESHOLD=70
readonly SYSTEM_HEALTH_CRITICAL_THRESHOLD=50
readonly ROUTING_LOW_CONFIDENCE_THRESHOLD=0.5
readonly HANDOFF_FAILURE_RATE_THRESHOLD=0.1  # 10%
readonly RAG_SLOW_RETRIEVAL_MS=5000

# Initialize directories
mkdir -p "$METRICS_ALERTS_DIR"

#
# Print usage
#
usage() {
    cat << EOF
Check Alerts - Threshold Monitoring

Usage:
    $0 [OPTIONS]

Options:
    --check-all         Check all alert conditions
    --critical-only     Check only critical conditions
    --check-tasks       Check task processing alerts
    --check-workers     Check worker alerts
    --check-tokens      Check token usage alerts
    --check-health      Check system health alerts
    --check-routing     Check routing alerts
    --resolve <id>      Resolve an alert by ID
    --clear-all         Clear all active alerts
    --help              Show this help

Examples:
    $0 --check-all                  # Check all conditions
    $0 --critical-only              # Only critical checks
    $0 --check-tasks                # Check task SLA
    $0 --resolve alert-12345        # Resolve specific alert

Alert Thresholds:
    Task Processing SLA:    ${TASK_PROCESSING_SLA_MS}ms (5 minutes)
    High Token Usage:       ${TOKEN_HIGH_USAGE_THRESHOLD} tokens
    Worker Spawn Failure:   $(echo "scale=0; $WORKER_SPAWN_FAILURE_RATE_THRESHOLD * 100" | bc)%
    System Health Low:      ${SYSTEM_HEALTH_LOW_THRESHOLD}%
    System Health Critical: ${SYSTEM_HEALTH_CRITICAL_THRESHOLD}%
    Routing Confidence:     $ROUTING_LOW_CONFIDENCE_THRESHOLD
    Handoff Failure:        $(echo "scale=0; $HANDOFF_FAILURE_RATE_THRESHOLD * 100" | bc)%
    RAG Slow Retrieval:     ${RAG_SLOW_RETRIEVAL_MS}ms
EOF
    exit 0
}

#
# Get metrics for time period
#
get_recent_metrics() {
    local metric_name="$1"
    local hours_back="${2:-1}"

    local metrics_file="$METRICS_RAW_DIR/metrics-$(date +%Y-%m-%d).jsonl"

    if [[ ! -f "$metrics_file" ]]; then
        echo "[]"
        return
    fi

    local since_ms=$(( ($(date +%s) - (hours_back * 3600)) * 1000 ))

    cat "$metrics_file" | jq -s --arg name "$metric_name" --arg since "$since_ms" '
        map(select(.metric_name == $name and .timestamp >= ($since | tonumber)))
    '
}

#
# Check task processing SLA
#
check_task_sla() {
    echo "Checking task processing SLA..."

    local violations=$(get_recent_metrics "task_processing_time_ms" 1 | jq --arg threshold "$TASK_PROCESSING_SLA_MS" '
        map(select(.value > ($threshold | tonumber)))
    ')

    local violation_count=$(echo "$violations" | jq 'length')

    if [[ $violation_count -gt 0 ]]; then
        echo "  WARNING: $violation_count task(s) exceeded SLA in the last hour"

        # Emit alerts for each violation
        echo "$violations" | jq -c '.[]' | while read -r violation; do
            local task_id=$(echo "$violation" | jq -r '.dimensions.task_id // "unknown"')
            local duration=$(echo "$violation" | jq -r '.value')
            local master_id=$(echo "$violation" | jq -r '.dimensions.master_id // "unknown"')

            emit_alert "task_processing_sla_breach" "high" \
                "Task $task_id exceeded SLA: ${duration}ms (threshold: ${TASK_PROCESSING_SLA_MS}ms)" \
                "{\"task_id\":\"$task_id\",\"master_id\":\"$master_id\",\"duration_ms\":$duration}"
        done

        return 1
    else
        echo "  OK: No SLA violations"
        return 0
    fi
}

#
# Check token usage
#
check_token_usage() {
    echo "Checking token usage..."

    local high_usage=$(get_recent_metrics "token_usage" 1 | jq --arg threshold "$TOKEN_HIGH_USAGE_THRESHOLD" '
        map(select(.value > ($threshold | tonumber)))
    ')

    local high_usage_count=$(echo "$high_usage" | jq 'length')

    if [[ $high_usage_count -gt 0 ]]; then
        echo "  WARNING: $high_usage_count instance(s) of high token usage"

        # Calculate total high usage
        local total_high=$(echo "$high_usage" | jq 'map(.value) | add')
        echo "  Total high usage: $total_high tokens"

        # Emit alert for aggregate high usage
        emit_alert "high_token_usage_aggregate" "medium" \
            "$high_usage_count instances of token usage >$TOKEN_HIGH_USAGE_THRESHOLD (total: $total_high)" \
            "{\"count\":$high_usage_count,\"total_tokens\":$total_high}"

        return 1
    else
        echo "  OK: Token usage within normal range"
        return 0
    fi
}

#
# Check worker spawn success rate
#
check_worker_spawns() {
    echo "Checking worker spawn success rate..."

    local spawn_total=$(get_recent_metrics "worker_spawns_total" 1 | jq 'map(.value) | add // 0')
    local spawn_failed=$(get_recent_metrics "worker_spawns_failed" 1 | jq 'map(.value) | add // 0')

    if [[ $spawn_total -eq 0 ]]; then
        echo "  OK: No worker spawns in the last hour"
        return 0
    fi

    local failure_rate=$(echo "scale=4; $spawn_failed / $spawn_total" | bc)

    if (( $(echo "$failure_rate > $WORKER_SPAWN_FAILURE_RATE_THRESHOLD" | bc -l) )); then
        local failure_pct=$(echo "scale=1; $failure_rate * 100" | bc)
        echo "  CRITICAL: Worker spawn failure rate at ${failure_pct}% ($spawn_failed/$spawn_total)"

        emit_alert "high_worker_spawn_failure_rate" "critical" \
            "Worker spawn failure rate at ${failure_pct}% (threshold: $(echo "scale=0; $WORKER_SPAWN_FAILURE_RATE_THRESHOLD * 100" | bc)%)" \
            "{\"total\":$spawn_total,\"failed\":$spawn_failed,\"rate\":$failure_rate}"

        return 1
    else
        local success_pct=$(echo "scale=1; (1 - $failure_rate) * 100" | bc)
        echo "  OK: Worker spawn success rate at ${success_pct}%"
        return 0
    fi
}

#
# Check system health
#
check_system_health() {
    echo "Checking system health..."

    local health_scores=$(get_recent_metrics "system_health_score" 1)
    local health_count=$(echo "$health_scores" | jq 'length')

    if [[ $health_count -eq 0 ]]; then
        echo "  WARNING: No health metrics available"
        return 0
    fi

    local min_health=$(echo "$health_scores" | jq 'map(.value) | min')
    local avg_health=$(echo "$health_scores" | jq 'map(.value) | add / length')

    if (( $(echo "$min_health < $SYSTEM_HEALTH_CRITICAL_THRESHOLD" | bc -l) )); then
        echo "  CRITICAL: Minimum health score at ${min_health}%"

        # Find which component
        local critical_component=$(echo "$health_scores" | jq -r '
            map(select(.value < '"$SYSTEM_HEALTH_CRITICAL_THRESHOLD"')) |
            .[0].dimensions.component // "unknown"
        ')

        emit_alert "system_health_critical" "critical" \
            "System health critical: $critical_component at ${min_health}%" \
            "{\"component\":\"$critical_component\",\"health_score\":$min_health}"

        return 1

    elif (( $(echo "$avg_health < $SYSTEM_HEALTH_LOW_THRESHOLD" | bc -l) )); then
        echo "  WARNING: Average health score at ${avg_health}%"

        emit_alert "system_health_degraded" "high" \
            "System health degraded: average ${avg_health}%" \
            "{\"avg_health\":$avg_health,\"min_health\":$min_health}"

        return 1
    else
        echo "  OK: System health at ${avg_health}%"
        return 0
    fi
}

#
# Check routing confidence
#
check_routing_confidence() {
    echo "Checking routing confidence..."

    local low_confidence=$(get_recent_metrics "routing_confidence" 1 | jq --arg threshold "$ROUTING_LOW_CONFIDENCE_THRESHOLD" '
        map(select(.value < ($threshold | tonumber)))
    ')

    local low_count=$(echo "$low_confidence" | jq 'length')

    if [[ $low_count -gt 0 ]]; then
        local total_decisions=$(get_recent_metrics "routing_decisions_total" 1 | jq 'map(.value) | add // 0')
        local low_pct="0"
        if [[ $total_decisions -gt 0 ]]; then
            low_pct=$(echo "scale=1; ($low_count / $total_decisions) * 100" | bc)
        fi

        echo "  WARNING: $low_count routing decisions with low confidence (${low_pct}% of total)"

        emit_alert "low_routing_confidence_aggregate" "medium" \
            "$low_count routing decisions below confidence threshold of $ROUTING_LOW_CONFIDENCE_THRESHOLD" \
            "{\"count\":$low_count,\"total_decisions\":$total_decisions}"

        return 1
    else
        echo "  OK: Routing confidence above threshold"
        return 0
    fi
}

#
# Check handoff success rate
#
check_handoffs() {
    echo "Checking master handoff success rate..."

    local handoff_total=$(get_recent_metrics "master_handoffs_total" 1 | jq 'map(.value) | add // 0')
    local handoff_failed=$(get_recent_metrics "master_handoffs_failed" 1 | jq 'map(.value) | add // 0')

    if [[ $handoff_total -eq 0 ]]; then
        echo "  OK: No handoffs in the last hour"
        return 0
    fi

    local failure_rate=$(echo "scale=4; $handoff_failed / $handoff_total" | bc)

    if (( $(echo "$failure_rate > $HANDOFF_FAILURE_RATE_THRESHOLD" | bc -l) )); then
        local failure_pct=$(echo "scale=1; $failure_rate * 100" | bc)
        echo "  CRITICAL: Handoff failure rate at ${failure_pct}% ($handoff_failed/$handoff_total)"

        emit_alert "high_handoff_failure_rate" "critical" \
            "Master handoff failure rate at ${failure_pct}% (threshold: $(echo "scale=0; $HANDOFF_FAILURE_RATE_THRESHOLD * 100" | bc)%)" \
            "{\"total\":$handoff_total,\"failed\":$handoff_failed,\"rate\":$failure_rate}"

        return 1
    else
        local success_pct=$(echo "scale=1; (1 - $failure_rate) * 100" | bc)
        echo "  OK: Handoff success rate at ${success_pct}%"
        return 0
    fi
}

#
# Check RAG retrieval performance
#
check_rag_performance() {
    echo "Checking RAG retrieval performance..."

    local slow_retrievals=$(get_recent_metrics "rag_retrieval_time_ms" 1 | jq --arg threshold "$RAG_SLOW_RETRIEVAL_MS" '
        map(select(.value > ($threshold | tonumber)))
    ')

    local slow_count=$(echo "$slow_retrievals" | jq 'length')

    if [[ $slow_count -gt 0 ]]; then
        local avg_slow=$(echo "$slow_retrievals" | jq 'map(.value) | add / length')
        echo "  WARNING: $slow_count slow RAG retrievals (avg: ${avg_slow}ms)"

        emit_alert "slow_rag_retrievals" "low" \
            "$slow_count RAG retrievals exceeded ${RAG_SLOW_RETRIEVAL_MS}ms threshold" \
            "{\"count\":$slow_count,\"avg_duration_ms\":$avg_slow}"

        return 1
    else
        echo "  OK: RAG retrievals within performance threshold"
        return 0
    fi
}

#
# Check for stale workers (no heartbeat)
#
check_stale_workers() {
    echo "Checking for stale workers..."

    # Check worker specs that haven't updated in 30 minutes
    local stale_threshold=$(($(date +%s) - 1800))
    local stale_count=0

    if ls coordination/worker-specs/active/*.json >/dev/null 2>&1; then
        for worker_file in coordination/worker-specs/active/*.json; do
            local last_mod=$(stat -f %m "$worker_file" 2>/dev/null || stat -c %Y "$worker_file")
            if [[ $last_mod -lt $stale_threshold ]]; then
                ((stale_count++))
                local worker_id=$(basename "$worker_file" .json)
                emit_alert "stale_worker" "medium" \
                    "Worker $worker_id has not updated in 30+ minutes" \
                    "{\"worker_id\":\"$worker_id\",\"last_update\":$last_mod}"
            fi
        done
    fi

    if [[ $stale_count -gt 0 ]]; then
        echo "  WARNING: $stale_count stale worker(s) detected"
        return 1
    else
        echo "  OK: All workers active"
        return 0
    fi
}

#
# Resolve an alert
#
resolve_alert() {
    local alert_id="$1"

    local active_alerts="$METRICS_ALERTS_DIR/active-alerts.json"

    if [[ ! -f "$active_alerts" ]]; then
        echo "No active alerts file found"
        return 1
    fi

    # Update alert status to resolved
    local updated=$(cat "$active_alerts" | jq --arg id "$alert_id" '
        .alerts |= map(
            if .alert_id == $id then
                . + {status: "resolved", resolved_at: (now | todate)}
            else
                .
            end
        )
    ')

    echo "$updated" > "$active_alerts"
    echo "Alert $alert_id resolved"

    # Archive to resolved alerts
    local resolved_file="$METRICS_ALERTS_DIR/resolved-alerts.jsonl"
    echo "$updated" | jq --arg id "$alert_id" '.alerts[] | select(.alert_id == $id)' >> "$resolved_file"
}

#
# Clear all active alerts
#
clear_all_alerts() {
    local active_alerts="$METRICS_ALERTS_DIR/active-alerts.json"

    if [[ ! -f "$active_alerts" ]]; then
        echo "No active alerts to clear"
        return 0
    fi

    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    # Archive current alerts
    local archive_file="$METRICS_ALERTS_DIR/cleared-alerts-${timestamp}.json"
    cp "$active_alerts" "$archive_file"

    # Clear active alerts
    echo '{"alerts":[]}' > "$active_alerts"

    echo "All active alerts cleared and archived to $archive_file"
}

#
# Run all checks
#
check_all() {
    local critical_only="${1:-false}"

    echo "Running alert checks..."
    echo ""

    local failed_checks=0

    # Critical checks
    check_worker_spawns || ((failed_checks++))
    check_system_health || ((failed_checks++))
    check_handoffs || ((failed_checks++))

    if [[ "$critical_only" == "false" ]]; then
        # Non-critical checks
        check_task_sla || ((failed_checks++))
        check_token_usage || ((failed_checks++))
        check_routing_confidence || ((failed_checks++))
        check_rag_performance || ((failed_checks++))
        check_stale_workers || ((failed_checks++))
    fi

    echo ""
    echo "Alert check complete: $failed_checks check(s) triggered alerts"

    return $failed_checks
}

#
# Main execution
#
main() {
    local action="check_all"
    local alert_id=""
    local critical_only=false

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --help|-h)
                usage
                ;;
            --check-all)
                action="check_all"
                shift
                ;;
            --critical-only)
                action="check_all"
                critical_only=true
                shift
                ;;
            --check-tasks)
                action="check_tasks"
                shift
                ;;
            --check-workers)
                action="check_workers"
                shift
                ;;
            --check-tokens)
                action="check_tokens"
                shift
                ;;
            --check-health)
                action="check_health"
                shift
                ;;
            --check-routing)
                action="check_routing"
                shift
                ;;
            --resolve)
                action="resolve"
                alert_id="$2"
                shift 2
                ;;
            --clear-all)
                action="clear_all"
                shift
                ;;
            *)
                echo "Unknown option: $1" >&2
                usage
                ;;
        esac
    done

    # Execute requested action
    case "$action" in
        check_all)
            check_all "$critical_only"
            ;;
        check_tasks)
            check_task_sla
            ;;
        check_workers)
            check_worker_spawns
            ;;
        check_tokens)
            check_token_usage
            ;;
        check_health)
            check_system_health
            ;;
        check_routing)
            check_routing_confidence
            check_handoffs
            ;;
        resolve)
            if [[ -z "$alert_id" ]]; then
                echo "Error: --resolve requires an alert ID" >&2
                exit 1
            fi
            resolve_alert "$alert_id"
            ;;
        clear_all)
            clear_all_alerts
            ;;
    esac
}

# Run main
main "$@"
