#!/usr/bin/env bash
#
# Aggregate Metrics - Daily Summaries and Rollups
# Processes raw metrics into aggregated summaries for reporting
#
# Usage:
#   ./scripts/aggregate-metrics.sh [date]
#   ./scripts/aggregate-metrics.sh 2025-11-27
#   ./scripts/aggregate-metrics.sh --all
#

set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Source required libraries
source "$SCRIPT_DIR/lib/metrics.sh" 2>/dev/null || true

# Configuration (use existing values from metrics-collector.sh if available)
: "${METRICS_RAW_DIR:=coordination/observability/metrics/raw}"
: "${METRICS_AGG_DIR:=coordination/metrics/aggregates}"
METRICS_DAILY_DIR="$METRICS_AGG_DIR/daily"
METRICS_HOURLY_DIR="$METRICS_AGG_DIR/hourly"
: "${METRICS_MASTER_DIR:=coordination/metrics/masters}"

# Initialize directories
mkdir -p "$METRICS_DAILY_DIR" "$METRICS_HOURLY_DIR"

#
# Print usage
#
usage() {
    cat << EOF
Aggregate Metrics - Daily Summaries

Usage:
    $0 [OPTIONS] [DATE]

Options:
    --all           Aggregate all available dates
    --yesterday     Aggregate yesterday's metrics
    --today         Aggregate today's metrics (default)
    --help          Show this help

Arguments:
    DATE            Date in YYYY-MM-DD format (default: today)

Examples:
    $0                          # Aggregate today's metrics
    $0 --yesterday              # Aggregate yesterday
    $0 2025-11-27               # Aggregate specific date
    $0 --all                    # Aggregate all available dates

Output:
    - Daily aggregate: $METRICS_DAILY_DIR/YYYY-MM-DD.json
    - Hourly rollups: $METRICS_HOURLY_DIR/YYYY-MM-DD-HH.json
    - Master summaries: $METRICS_AGG_DIR/masters/MASTER_ID-YYYY-MM-DD-summary.json
EOF
    exit 0
}

#
# Aggregate metrics for a specific hour
#
aggregate_hour() {
    local date="$1"
    local hour="$2"  # 00-23

    local metrics_file="$METRICS_RAW_DIR/metrics-${date}.jsonl"

    if [[ ! -f "$metrics_file" ]]; then
        echo "No metrics file for $date" >&2
        return 1
    fi

    local hour_start="${date}T${hour}:00:00"
    local hour_end="${date}T${hour}:59:59"

    echo "Aggregating metrics for $date hour $hour..." >&2

    local aggregated=$(cat "$metrics_file" | jq -s --arg start "$hour_start" --arg end "$hour_end" '
        map(select(
            .timestamp >= ($start + "Z" | fromdateiso8601) * 1000 and
            .timestamp <= ($end + "Z" | fromdateiso8601) * 1000
        )) |
        if length == 0 then null else
        {
            period: {
                start: $start,
                end: $end,
                hour: '"$hour"'
            },
            total_metrics: length,

            # Group by metric type
            by_metric_type: (
                group_by(.metric_type) |
                map({
                    type: .[0].metric_type,
                    count: length,
                    metrics: (group_by(.metric_name) | map({
                        name: .[0].metric_name,
                        count: length,
                        sum: (map(.value) | add),
                        min: (map(.value) | min),
                        max: (map(.value) | max),
                        mean: (map(.value) | add / length),
                        p50: (map(.value) | sort | .[length / 2 | floor]),
                        p95: (map(.value) | sort | .[length * 0.95 | floor]),
                        p99: (map(.value) | sort | .[length * 0.99 | floor])
                    }))
                })
            ),

            # Top metrics by volume
            top_metrics: (
                group_by(.metric_name) |
                sort_by(length) | reverse |
                .[0:10] |
                map({
                    metric: .[0].metric_name,
                    count: length,
                    avg_value: (map(.value) | add / length)
                })
            ),

            # Worker metrics summary
            workers: {
                spawns_total: (map(select(.metric_name == "worker_spawns_total")) | map(.value) | add // 0),
                spawns_successful: (map(select(.metric_name == "worker_spawns_successful")) | map(.value) | add // 0),
                spawns_failed: (map(select(.metric_name == "worker_spawns_failed")) | map(.value) | add // 0),
                completions: (map(select(.metric_name == "workers_completed_total")) | map(.value) | add // 0),
                avg_duration_ms: (map(select(.metric_name == "worker_duration_ms")) | if length > 0 then (map(.value) | add / length) else 0 end)
            },

            # Task metrics summary
            tasks: {
                processed: (map(select(.metric_name == "tasks_processed_total")) | map(.value) | add // 0),
                avg_processing_time_ms: (map(select(.metric_name == "task_processing_time_ms")) | if length > 0 then (map(.value) | add / length) else 0 end),
                p95_processing_time_ms: (map(select(.metric_name == "task_processing_time_ms")) | map(.value) | sort | if length > 0 then .[length * 0.95 | floor] else 0 end)
            },

            # Token metrics summary
            tokens: {
                total_consumed: (map(select(.metric_name == "tokens_consumed_total")) | map(.value) | add // 0),
                avg_usage: (map(select(.metric_name == "token_usage")) | if length > 0 then (map(.value) | add / length) else 0 end),
                max_usage: (map(select(.metric_name == "token_usage")) | map(.value) | max // 0)
            },

            # Alert summary
            alerts: {
                total: (map(select(.metric_name == "alerts_triggered_total")) | map(.value) | add // 0),
                by_severity: (
                    map(select(.metric_name == "alerts_triggered_total")) |
                    group_by(.dimensions.severity) |
                    map({
                        severity: .[0].dimensions.severity,
                        count: (map(.value) | add)
                    })
                )
            },

            # Routing metrics
            routing: {
                decisions: (map(select(.metric_name == "routing_decisions_total")) | map(.value) | add // 0),
                avg_confidence: (map(select(.metric_name == "routing_confidence")) | if length > 0 then (map(.value) | add / length) else 0 end),
                handoffs_total: (map(select(.metric_name == "master_handoffs_total")) | map(.value) | add // 0),
                handoffs_successful: (map(select(.metric_name == "master_handoffs_successful")) | map(.value) | add // 0)
            }
        }
        end
    ')

    if [[ "$aggregated" != "null" ]]; then
        local output_file="$METRICS_HOURLY_DIR/${date}-${hour}.json"
        echo "$aggregated" > "$output_file"
        echo "Created hourly aggregate: $output_file" >&2
    fi
}

#
# Aggregate metrics for a full day
#
aggregate_day() {
    local date="$1"

    echo "Aggregating daily metrics for $date..." >&2

    local metrics_file="$METRICS_RAW_DIR/metrics-${date}.jsonl"

    if [[ ! -f "$metrics_file" ]]; then
        echo "No metrics file for $date" >&2
        return 1
    fi

    # First create hourly rollups
    for hour in $(seq -f "%02g" 0 23); do
        aggregate_hour "$date" "$hour" 2>/dev/null || true
    done

    # Then aggregate all hourly data
    local daily_summary=$(cat "$metrics_file" | jq -s --arg date "$date" '
        {
            date: $date,
            generated_at: (now | todate),
            total_metrics: length,

            # Overall statistics
            statistics: {
                metrics_by_hour: (
                    group_by(.timestamp / 3600000 | floor) |
                    map({
                        hour: (.[0].timestamp / 3600000 | floor | . % 24),
                        count: length
                    })
                ),
                unique_metric_names: ([.[].metric_name] | unique | length),
                unique_dimensions: ([.[].dimensions | keys] | flatten | unique | length)
            },

            # Worker performance
            workers: {
                total_spawned: (map(select(.metric_name == "worker_spawns_total")) | map(.value) | add // 0),
                successful_spawns: (map(select(.metric_name == "worker_spawns_successful")) | map(.value) | add // 0),
                failed_spawns: (map(select(.metric_name == "worker_spawns_failed")) | map(.value) | add // 0),
                spawn_success_rate: (
                    if (map(select(.metric_name == "worker_spawns_total")) | map(.value) | add // 0) > 0 then
                        (map(select(.metric_name == "worker_spawns_successful")) | map(.value) | add // 0) /
                        (map(select(.metric_name == "worker_spawns_total")) | map(.value) | add // 0)
                    else 0 end
                ),
                total_completed: (map(select(.metric_name == "workers_completed_total")) | map(.value) | add // 0),
                avg_duration_ms: (map(select(.metric_name == "worker_duration_ms")) | if length > 0 then (map(.value) | add / length) else 0 end),
                p50_duration_ms: (map(select(.metric_name == "worker_duration_ms")) | map(.value) | sort | if length > 0 then .[length / 2 | floor] else 0 end),
                p95_duration_ms: (map(select(.metric_name == "worker_duration_ms")) | map(.value) | sort | if length > 0 then .[length * 0.95 | floor] else 0 end),
                p99_duration_ms: (map(select(.metric_name == "worker_duration_ms")) | map(.value) | sort | if length > 0 then .[length * 0.99 | floor] else 0 end)
            },

            # Task performance
            tasks: {
                total_processed: (map(select(.metric_name == "tasks_processed_total")) | map(.value) | add // 0),
                avg_processing_time_ms: (map(select(.metric_name == "task_processing_time_ms")) | if length > 0 then (map(.value) | add / length) else 0 end),
                p50_processing_time_ms: (map(select(.metric_name == "task_processing_time_ms")) | map(.value) | sort | if length > 0 then .[length / 2 | floor] else 0 end),
                p95_processing_time_ms: (map(select(.metric_name == "task_processing_time_ms")) | map(.value) | sort | if length > 0 then .[length * 0.95 | floor] else 0 end),
                p99_processing_time_ms: (map(select(.metric_name == "task_processing_time_ms")) | map(.value) | sort | if length > 0 then .[length * 0.99 | floor] else 0 end),
                sla_breaches: (map(select(.metric_name == "task_processing_time_ms" and .value > 300000)) | length)
            },

            # Token consumption
            tokens: {
                total_consumed: (map(select(.metric_name == "tokens_consumed_total")) | map(.value) | add // 0),
                by_entity_type: (
                    map(select(.metric_name == "tokens_consumed_total")) |
                    group_by(.dimensions.entity_type) |
                    map({
                        entity_type: (.[0].dimensions.entity_type // "unknown"),
                        total_tokens: (map(.value) | add)
                    })
                ),
                avg_per_operation: (map(select(.metric_name == "token_usage")) | if length > 0 then (map(.value) | add / length) else 0 end),
                max_single_usage: (map(select(.metric_name == "token_usage")) | map(.value) | max // 0),
                high_usage_incidents: (map(select(.metric_name == "token_usage" and .value > 50000)) | length)
            },

            # Alerts
            alerts: {
                total_triggered: (map(select(.metric_name == "alerts_triggered_total")) | map(.value) | add // 0),
                by_severity: (
                    map(select(.metric_name == "alerts_triggered_total")) |
                    group_by(.dimensions.severity) |
                    map({
                        severity: (.[0].dimensions.severity // "unknown"),
                        count: (map(.value) | add)
                    })
                ),
                by_type: (
                    map(select(.metric_name == "alerts_triggered_total")) |
                    group_by(.dimensions.alert_type) |
                    sort_by(length) | reverse | .[0:10] |
                    map({
                        alert_type: (.[0].dimensions.alert_type // "unknown"),
                        count: (map(.value) | add)
                    })
                )
            },

            # Routing performance
            routing: {
                total_decisions: (map(select(.metric_name == "routing_decisions_total")) | map(.value) | add // 0),
                avg_confidence: (map(select(.metric_name == "routing_confidence")) | if length > 0 then (map(.value) | add / length) else 0 end),
                low_confidence_count: (map(select(.metric_name == "routing_confidence" and .value < 0.5)) | length),
                handoffs_total: (map(select(.metric_name == "master_handoffs_total")) | map(.value) | add // 0),
                handoffs_successful: (map(select(.metric_name == "master_handoffs_successful")) | map(.value) | add // 0),
                handoffs_failed: (map(select(.metric_name == "master_handoffs_failed")) | map(.value) | add // 0),
                handoff_success_rate: (
                    if (map(select(.metric_name == "master_handoffs_total")) | map(.value) | add // 0) > 0 then
                        (map(select(.metric_name == "master_handoffs_successful")) | map(.value) | add // 0) /
                        (map(select(.metric_name == "master_handoffs_total")) | map(.value) | add // 0)
                    else 0 end
                )
            },

            # System health
            system: {
                avg_health_score: (map(select(.metric_name == "system_health_score")) | if length > 0 then (map(.value) | add / length) else 0 end),
                min_health_score: (map(select(.metric_name == "system_health_score")) | map(.value) | min // 0),
                health_degraded_incidents: (map(select(.metric_name == "system_health_score" and .value < 70)) | length),
                rag_avg_retrieval_ms: (map(select(.metric_name == "rag_retrieval_time_ms")) | if length > 0 then (map(.value) | add / length) else 0 end),
                rag_p95_retrieval_ms: (map(select(.metric_name == "rag_retrieval_time_ms")) | map(.value) | sort | if length > 0 then .[length * 0.95 | floor] else 0 end),
                rag_slow_retrievals: (map(select(.metric_name == "rag_retrieval_time_ms" and .value > 5000)) | length)
            },

            # Master-specific metrics
            masters: (
                map(select(.dimensions.master_id)) |
                group_by(.dimensions.master_id) |
                map({
                    master_id: .[0].dimensions.master_id,
                    total_metrics: length,
                    task_count: (map(select(.metric_name | contains("task"))) | length),
                    avg_task_time: (map(select(.metric_name == "master_task_processing_time_ms")) | if length > 0 then (map(.value) | add / length) else 0 end)
                })
            )
        }
    ')

    local output_file="$METRICS_DAILY_DIR/${date}.json"
    echo "$daily_summary" > "$output_file"
    echo "Created daily summary: $output_file"

    # Also aggregate master-specific summaries
    aggregate_master_summaries "$date"

    return 0
}

#
# Aggregate master-specific summaries
#
aggregate_master_summaries() {
    local date="$1"

    for master in development security inventory cicd coordinator; do
        local master_id="${master}-master"
        local master_file="$METRICS_MASTER_DIR/${master_id}-${date}.jsonl"

        if [[ -f "$master_file" ]]; then
            echo "Aggregating metrics for $master_id..." >&2

            local master_summary=$(cat "$master_file" | jq -s --arg master_id "$master_id" --arg date "$date" '
                {
                    master_id: $master_id,
                    date: $date,
                    generated_at: (now | todate),
                    total_metrics: length,

                    metrics_breakdown: (
                        group_by(.metric) |
                        map({
                            metric: .[0].metric,
                            count: length,
                            sum: (map(.value) | add),
                            avg: (map(.value) | add / length),
                            min: (map(.value) | min),
                            max: (map(.value) | max),
                            p95: (map(.value) | sort | .[length * 0.95 | floor])
                        })
                    ),

                    task_processing: {
                        total_tasks: (map(select(.metric == "task_processing_time_ms")) | length),
                        avg_time_ms: (map(select(.metric == "task_processing_time_ms")) | if length > 0 then (map(.value) | add / length) else 0 end),
                        p95_time_ms: (map(select(.metric == "task_processing_time_ms")) | map(.value) | sort | if length > 0 then .[length * 0.95 | floor] else 0 end),
                        sla_breaches: (map(select(.metric == "task_processing_time_ms" and .value > 300000)) | length)
                    },

                    token_usage: {
                        total: (map(select(.metric == "token_usage")) | map(.value) | add // 0),
                        avg: (map(select(.metric == "token_usage")) | if length > 0 then (map(.value) | add / length) else 0 end),
                        max: (map(select(.metric == "token_usage")) | map(.value) | max // 0)
                    }
                }
            ')

            local master_output="$METRICS_AGG_DIR/masters/${master_id}-${date}-summary.json"
            mkdir -p "$METRICS_AGG_DIR/masters"
            echo "$master_summary" > "$master_output"
            echo "Created master summary: $master_output" >&2
        fi
    done
}

#
# Main execution
#
main() {
    local target_date=""
    local process_all=false

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --help|-h)
                usage
                ;;
            --all)
                process_all=true
                shift
                ;;
            --yesterday)
                target_date=$(date -v-1d +%Y-%m-%d 2>/dev/null || date -d "yesterday" +%Y-%m-%d)
                shift
                ;;
            --today)
                target_date=$(date +%Y-%m-%d)
                shift
                ;;
            [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9])
                target_date="$1"
                shift
                ;;
            *)
                echo "Unknown option: $1" >&2
                usage
                ;;
        esac
    done

    # Default to today if no date specified
    if [[ -z "$target_date" ]] && [[ "$process_all" == false ]]; then
        target_date=$(date +%Y-%m-%d)
    fi

    if [[ "$process_all" == true ]]; then
        echo "Processing all available metrics files..."
        for metrics_file in "$METRICS_RAW_DIR"/metrics-*.jsonl; do
            if [[ -f "$metrics_file" ]]; then
                local date=$(basename "$metrics_file" .jsonl | sed 's/metrics-//')
                echo "Processing $date..."
                aggregate_day "$date" || echo "Failed to process $date" >&2
            fi
        done
    else
        aggregate_day "$target_date"
    fi

    echo ""
    echo "Aggregation complete!"
    echo "Daily summaries: $METRICS_DAILY_DIR/"
    echo "Hourly rollups: $METRICS_HOURLY_DIR/"
    echo "Master summaries: $METRICS_AGG_DIR/masters/"
}

# Run main
main "$@"
