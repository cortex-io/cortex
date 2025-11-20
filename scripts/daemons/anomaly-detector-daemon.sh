#!/usr/bin/env bash
#
# Anomaly Detector Daemon
# Part of Q2 Week 19: Anomaly Detection
#
# Continuously monitors metrics for anomalies using statistical methods
#

set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Source required libraries
source "$PROJECT_ROOT/scripts/lib/observability/anomaly-detector.sh"
source "$PROJECT_ROOT/scripts/lib/observability/metrics-collector.sh" 2>/dev/null || true

# Configuration
readonly DAEMON_NAME="anomaly-detector"
readonly PID_FILE="${PID_FILE:-/tmp/commit-relay-anomaly-detector.pid}"
readonly LOG_FILE="${LOG_FILE:-coordination/observability/anomalies/anomaly-detector.log}"
readonly CHECK_INTERVAL="${CHECK_INTERVAL:-60}"  # Check every 60 seconds
readonly BASELINE_UPDATE_INTERVAL="${BASELINE_UPDATE_INTERVAL:-3600}"  # Update baselines hourly

# Metrics to monitor
readonly MONITORED_METRICS=(
    "task_success_rate"
    "task_queue_depth"
    "worker_failure_rate"
    "token_usage_total"
    "routing_confidence_avg"
    "task_execution_time_p95"
    "worker_spawn_time_p95"
    "error_rate"
    "task_throughput"
    "worker_utilization"
)

#
# Log message
#
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $message" | tee -a "$LOG_FILE"
}

#
# Check if daemon is already running
#
check_running() {
    if [[ -f "$PID_FILE" ]]; then
        local pid=$(cat "$PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            return 0
        else
            rm -f "$PID_FILE"
        fi
    fi
    return 1
}

#
# Initialize daemon
#
initialize() {
    log "INFO" "Initializing anomaly detector daemon..."

    # Create log directory
    mkdir -p "$(dirname "$LOG_FILE")"

    # Check if already running
    if check_running; then
        log "ERROR" "Daemon already running (PID: $(cat "$PID_FILE"))"
        exit 1
    fi

    # Write PID file
    echo $$ > "$PID_FILE"

    # Initialize baselines for all monitored metrics
    log "INFO" "Calculating initial baselines for ${#MONITORED_METRICS[@]} metrics..."
    for metric in "${MONITORED_METRICS[@]}"; do
        log "INFO" "  Calculating baseline for: $metric"
        calculate_baseline "$metric" 7 2>&1 | grep -v "^{" || true
    done

    log "INFO" "Initialization complete"
}

#
# Update baselines
#
update_baselines() {
    log "INFO" "Updating baselines..."

    for metric in "${MONITORED_METRICS[@]}"; do
        calculate_baseline "$metric" 7 >/dev/null 2>&1 || true
    done

    log "INFO" "Baselines updated"
}

#
# Monitor a single metric
#
monitor_metric() {
    local metric_name="$1"

    # Get current value (from most recent metric)
    local current_value=$(query_metrics_recent "$metric_name" 60 | jq -r '.[0].value // empty' 2>/dev/null)

    if [[ -z "$current_value" || "$current_value" == "null" ]]; then
        return 0
    fi

    # Check for anomaly
    local anomaly_id=$(check_metric_for_anomaly "$metric_name" "$current_value" "{}")

    if [[ -n "$anomaly_id" ]]; then
        local anomaly_file="$ANOMALIES_ACTIVE_DIR/${anomaly_id}.json"

        if [[ -f "$anomaly_file" ]]; then
            local anomaly_type=$(jq -r '.type' "$anomaly_file")
            local severity=$(jq -r '.severity' "$anomaly_file")
            local description=$(jq -r '.description' "$anomaly_file")

            log "WARN" "ANOMALY DETECTED: [$severity] $anomaly_type"
            log "WARN" "  Metric: $metric_name"
            log "WARN" "  Description: $description"
            log "WARN" "  Anomaly ID: $anomaly_id"

            # Emit event for critical/high severity anomalies
            if [[ "$severity" == "critical" || "$severity" == "high" ]]; then
                emit_system_event "anomaly_detected" \
                    "{\"anomaly_id\":\"$anomaly_id\",\"type\":\"$anomaly_type\",\"severity\":\"$severity\",\"metric\":\"$metric_name\"}" \
                    "error" 2>/dev/null || true
            fi
        fi
    fi
}

#
# Monitor all metrics
#
monitor_all_metrics() {
    for metric in "${MONITORED_METRICS[@]}"; do
        monitor_metric "$metric" || true
    done
}

#
# Auto-resolve anomalies
#
auto_resolve_anomalies() {
    # Find active anomalies older than 1 hour with normal current values
    local one_hour_ago=$(($(date +%s) * 1000 - 3600000))

    for anomaly_file in "$ANOMALIES_ACTIVE_DIR"/*.json; do
        if [[ ! -f "$anomaly_file" ]]; then
            continue
        fi

        local anomaly_id=$(basename "$anomaly_file" .json)
        local timestamp=$(jq -r '.timestamp' "$anomaly_file")
        local metric_name=$(jq -r '.metric_name' "$anomaly_file")

        # Check if old enough
        if [[ $timestamp -lt $one_hour_ago ]]; then
            # Check if metric is back to normal
            local current_value=$(query_metrics_recent "$metric_name" 60 | jq -r '.[0].value // empty' 2>/dev/null)

            if [[ -n "$current_value" ]]; then
                # Quick check: is it within 2 sigma?
                local baseline=$(get_baseline "$metric_name" 2>/dev/null || echo "{}")

                if [[ "$baseline" != "{}" ]]; then
                    local mean=$(echo "$baseline" | jq -r '.mean')
                    local stddev=$(echo "$baseline" | jq -r '.stddev')

                    if [[ "$stddev" != "0" && -n "$stddev" ]]; then
                        local deviation=$(echo "scale=4; ($current_value - $mean) / $stddev" | bc 2>/dev/null || echo "0")
                        local abs_deviation=$(echo "$deviation" | tr -d '-')

                        # If within 2 sigma, auto-resolve
                        if [[ $(echo "$abs_deviation < 2" | bc -l 2>/dev/null) -eq 1 ]]; then
                            resolve_anomaly "$anomaly_id" "Auto-resolved: metric returned to normal range"
                            log "INFO" "Auto-resolved anomaly: $anomaly_id (metric: $metric_name)"
                        fi
                    fi
                fi
            fi
        fi
    done
}

#
# Print statistics
#
print_stats() {
    local stats=$(get_anomaly_stats "today")

    log "INFO" "=== Anomaly Detection Statistics ==="
    log "INFO" "Total Anomalies: $(echo "$stats" | jq -r '.total_anomalies')"
    log "INFO" "Active: $(echo "$stats" | jq -r '.active_anomalies')"
    log "INFO" "Resolved: $(echo "$stats" | jq -r '.resolved_anomalies')"
    log "INFO" "False Positives: $(echo "$stats" | jq -r '.false_positives')"
    log "INFO" "Detection Accuracy: $(echo "$stats" | jq -r '.detection_accuracy')%"
    log "INFO" "False Positive Rate: $(echo "$stats" | jq -r '.false_positive_rate')%"
    log "INFO" "==================================="
}

#
# Cleanup on exit
#
cleanup() {
    log "INFO" "Shutting down anomaly detector daemon..."
    rm -f "$PID_FILE"
    print_stats
    log "INFO" "Daemon stopped"
}

#
# Main daemon loop
#
main() {
    trap cleanup EXIT INT TERM

    initialize

    local last_baseline_update=$(date +%s)
    local check_count=0

    log "INFO" "Starting monitoring loop (interval: ${CHECK_INTERVAL}s)"

    while true; do
        check_count=$((check_count + 1))

        # Monitor all metrics
        monitor_all_metrics

        # Auto-resolve old anomalies
        if [[ $((check_count % 10)) -eq 0 ]]; then
            auto_resolve_anomalies
        fi

        # Update baselines hourly
        local now=$(date +%s)
        if [[ $((now - last_baseline_update)) -ge $BASELINE_UPDATE_INTERVAL ]]; then
            update_baselines
            last_baseline_update=$now
        fi

        # Print stats every 30 minutes
        if [[ $((check_count % 30)) -eq 0 ]]; then
            print_stats
        fi

        # Sleep until next check
        sleep "$CHECK_INTERVAL"
    done
}

#
# CLI commands
#
case "${1:-start}" in
    start)
        main
        ;;
    stop)
        if [[ -f "$PID_FILE" ]]; then
            local pid=$(cat "$PID_FILE")
            log "INFO" "Stopping daemon (PID: $pid)"
            kill "$pid" 2>/dev/null || true
            rm -f "$PID_FILE"
        else
            log "INFO" "Daemon not running"
        fi
        ;;
    status)
        if check_running; then
            log "INFO" "Daemon is running (PID: $(cat "$PID_FILE"))"
            print_stats
        else
            log "INFO" "Daemon is not running"
        fi
        ;;
    stats)
        print_stats
        ;;
    baseline)
        metric_name="${2:-}"
        if [[ -z "$metric_name" ]]; then
            log "ERROR" "Usage: $0 baseline <metric_name>"
            exit 1
        fi
        calculate_baseline "$metric_name" 7
        ;;
    check)
        metric_name="${2:-}"
        value="${3:-}"
        if [[ -z "$metric_name" || -z "$value" ]]; then
            log "ERROR" "Usage: $0 check <metric_name> <value>"
            exit 1
        fi
        check_metric_for_anomaly "$metric_name" "$value" "{}"
        ;;
    resolve)
        anomaly_id="${2:-}"
        notes="${3:-Manually resolved}"
        if [[ -z "$anomaly_id" ]]; then
            log "ERROR" "Usage: $0 resolve <anomaly_id> [notes]"
            exit 1
        fi
        resolve_anomaly "$anomaly_id" "$notes"
        ;;
    false-positive)
        anomaly_id="${2:-}"
        notes="${3:-}"
        if [[ -z "$anomaly_id" ]]; then
            log "ERROR" "Usage: $0 false-positive <anomaly_id> [notes]"
            exit 1
        fi
        mark_false_positive "$anomaly_id" "$notes"
        ;;
    *)
        echo "Usage: $0 {start|stop|status|stats|baseline|check|resolve|false-positive}"
        echo ""
        echo "Commands:"
        echo "  start                          Start the daemon"
        echo "  stop                           Stop the daemon"
        echo "  status                         Check daemon status"
        echo "  stats                          Show statistics"
        echo "  baseline <metric>              Calculate baseline for metric"
        echo "  check <metric> <value>         Check value for anomalies"
        echo "  resolve <anomaly_id> [notes]   Resolve an anomaly"
        echo "  false-positive <id> [notes]    Mark as false positive"
        exit 1
        ;;
esac
