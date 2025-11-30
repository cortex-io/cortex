#!/usr/bin/env bash
# DORA Metric: Change Failure Rate
# Percentage of changes that result in failures requiring fixes

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CONFIG_FILE="$SCRIPT_DIR/config.json"
TASKS_DIR="$PROJECT_ROOT/coordination/tasks"

# ==============================================================================
# CHANGE FAILURE RATE CALCULATION
# ==============================================================================

calculate_change_failure_rate() {
    local lookback_days="${1:-30}"
    local master_filter="${2:-all}"

    local cutoff_date=$(date -u -v-${lookback_days}d +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || \
                        date -u -d "${lookback_days} days ago" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null)

    echo "Calculating change failure rate for last $lookback_days days..." >&2

    local total_changes=0
    local failed_changes=0
    declare -A master_total
    declare -A master_failed

    # Scan all tasks (changes)
    while IFS= read -r task_file; do
        [[ ! -f "$task_file" ]] && continue

        local status=$(jq -r '.status // "unknown"' "$task_file" 2>/dev/null)
        local created_at=$(jq -r '.created_at // empty' "$task_file" 2>/dev/null)

        [[ -z "$created_at" ]] && continue
        [[ "$created_at" < "$cutoff_date" ]] && continue

        local master=$(jq -r '.master // "unknown"' "$task_file" 2>/dev/null)

        if [[ "$master_filter" == "all" || "$master" == "$master_filter" ]]; then
            ((total_changes++))
            master_total[$master]=$((${master_total[$master]:-0} + 1))

            # Count as failure if:
            # 1. Status is "failed"
            # 2. Required retry (has retry_of field in another task)
            # 3. Had errors requiring fixes

            if [[ "$status" == "failed" ]]; then
                ((failed_changes++))
                master_failed[$master]=$((${master_failed[$master]:-0} + 1))
            else
                # Check if this task was retried (indicating initial failure)
                local task_id=$(jq -r '.id // empty' "$task_file" 2>/dev/null)
                if [[ -n "$task_id" ]]; then
                    local has_retry=$(find "$TASKS_DIR" -name "task-*.json" -type f \
                        -exec grep -l "\"retry_of\": \"$task_id\"" {} \; 2>/dev/null | head -1)

                    if [[ -n "$has_retry" ]]; then
                        ((failed_changes++))
                        master_failed[$master]=$((${master_failed[$master]:-0} + 1))
                    fi
                fi

                # Check for error indicators in task metadata
                local has_errors=$(jq -r '.errors // empty | length' "$task_file" 2>/dev/null)
                if [[ -n "$has_errors" && "$has_errors" -gt 0 ]]; then
                    ((failed_changes++))
                    master_failed[$master]=$((${master_failed[$master]:-0} + 1))
                fi
            fi
        fi
    done < <(find "$TASKS_DIR" -name "task-*.json" -type f 2>/dev/null)

    if [[ $total_changes -eq 0 ]]; then
        echo "No changes found in lookback window" >&2
        jq -nc '{metric: "change_failure_rate", error: "no_data"}'
        return 0
    fi

    # Calculate percentage
    local failure_rate=$(echo "scale=2; ($failed_changes / $total_changes) * 100" | bc)

    local performance_level=$(determine_performance_level "$failure_rate" "change_failure_rate")

    # Build per-master breakdown
    local masters_json="{"
    local first=true
    for master in "${!master_total[@]}"; do
        [[ "$first" == "false" ]] && masters_json+=","
        first=false
        local total=${master_total[$master]}
        local failed=${master_failed[$master]:-0}
        local rate=$(echo "scale=2; ($failed / $total) * 100" | bc)
        masters_json+="\"$master\": {\"total\": $total, \"failed\": $failed, \"rate_percent\": $rate}"
    done
    masters_json+="}"

    jq -nc \
        --arg timestamp "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --argjson lookback_days "$lookback_days" \
        --argjson total "$total_changes" \
        --argjson failed "$failed_changes" \
        --arg rate "$failure_rate" \
        --arg level "$performance_level" \
        --argjson masters "$masters_json" \
        '{
            metric: "change_failure_rate",
            timestamp: $timestamp,
            lookback_days: $lookback_days,
            total_changes: $total,
            failed_changes: $failed,
            failure_rate_percent: $rate,
            performance_level: $level,
            by_master: $masters
        }'
}

# ==============================================================================
# PERFORMANCE LEVEL CLASSIFICATION
# ==============================================================================

determine_performance_level() {
    local value="$1"
    local metric_type="$2"

    local config=$(cat "$CONFIG_FILE")
    local thresholds=$(echo "$config" | jq -r ".thresholds.${metric_type}")

    case "$metric_type" in
        change_failure_rate)
            local elite=$(echo "$thresholds" | jq -r '.elite.percent')
            local high=$(echo "$thresholds" | jq -r '.high.percent')
            local medium=$(echo "$thresholds" | jq -r '.medium.percent')

            # Lower is better for failure rate
            if (( $(echo "$value <= $elite" | bc -l) )); then
                echo "elite"
            elif (( $(echo "$value <= $high" | bc -l) )); then
                echo "high"
            elif (( $(echo "$value <= $medium" | bc -l) )); then
                echo "medium"
            else
                echo "low"
            fi
            ;;
    esac
}

# ==============================================================================
# MAIN
# ==============================================================================

main() {
    local command="${1:-calculate}"

    case "$command" in
        calculate)
            calculate_change_failure_rate "${2:-30}" "${3:-all}"
            ;;
        *)
            echo "Usage: $0 calculate [lookback_days] [master]"
            exit 1
            ;;
    esac
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi

export -f calculate_change_failure_rate
export -f determine_performance_level
