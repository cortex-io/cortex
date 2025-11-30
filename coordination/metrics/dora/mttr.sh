#!/usr/bin/env bash
# DORA Metric: Mean Time to Recover (MTTR)
# Measures average time to recover from failures

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CONFIG_FILE="$SCRIPT_DIR/config.json"
TASKS_DIR="$PROJECT_ROOT/coordination/tasks"

# ==============================================================================
# MTTR CALCULATION
# ==============================================================================

calculate_mttr() {
    local lookback_days="${1:-30}"
    local master_filter="${2:-all}"

    local cutoff_date=$(date -u -v-${lookback_days}d +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || \
                        date -u -d "${lookback_days} days ago" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null)

    echo "Calculating MTTR for last $lookback_days days..." >&2

    local total_recovery_time=0
    local failure_count=0
    declare -A master_recovery_times
    declare -A master_failure_counts
    local recovery_times_array=()

    # Scan all tasks that failed and were recovered
    while IFS= read -r task_file; do
        [[ ! -f "$task_file" ]] && continue

        local status=$(jq -r '.status // "unknown"' "$task_file" 2>/dev/null)
        local failed_at=$(jq -r '.failed_at // empty' "$task_file" 2>/dev/null)

        # Look for tasks that failed and were recovered
        # Recovery can be:
        # 1. Task status changed from failed to completed
        # 2. Retry task succeeded (check retry_of field)

        [[ -z "$failed_at" ]] && continue
        [[ "$failed_at" < "$cutoff_date" ]] && continue

        local master=$(jq -r '.master // "unknown"' "$task_file" 2>/dev/null)

        if [[ "$master_filter" == "all" || "$master" == "$master_filter" ]]; then
            local recovered_at=""

            # Check if task was recovered
            if [[ "$status" == "completed" ]]; then
                recovered_at=$(jq -r '.completed_at // empty' "$task_file" 2>/dev/null)
            else
                # Check if there's a retry task that succeeded
                local task_id=$(jq -r '.id // empty' "$task_file" 2>/dev/null)
                if [[ -n "$task_id" ]]; then
                    local retry_task=$(find "$TASKS_DIR" -name "task-*.json" -type f \
                        -exec grep -l "\"retry_of\": \"$task_id\"" {} \; 2>/dev/null | head -1)

                    if [[ -n "$retry_task" && -f "$retry_task" ]]; then
                        local retry_status=$(jq -r '.status // "unknown"' "$retry_task" 2>/dev/null)
                        if [[ "$retry_status" == "completed" ]]; then
                            recovered_at=$(jq -r '.completed_at // empty' "$retry_task" 2>/dev/null)
                        fi
                    fi
                fi
            fi

            if [[ -n "$recovered_at" ]]; then
                # Calculate recovery time
                local failed_ts=$(date -j -f "%Y-%m-%dT%H:%M:%S%z" "$failed_at" "+%s" 2>/dev/null || \
                                date -d "$failed_at" "+%s" 2>/dev/null || echo 0)
                local recovered_ts=$(date -j -f "%Y-%m-%dT%H:%M:%S%z" "$recovered_at" "+%s" 2>/dev/null || \
                                   date -d "$recovered_at" "+%s" 2>/dev/null || echo 0)

                if [[ $failed_ts -gt 0 && $recovered_ts -gt 0 ]]; then
                    local recovery_seconds=$((recovered_ts - failed_ts))
                    local recovery_minutes=$((recovery_seconds / 60))

                    total_recovery_time=$((total_recovery_time + recovery_minutes))
                    ((failure_count++))
                    recovery_times_array+=($recovery_minutes)

                    master_recovery_times[$master]=$((${master_recovery_times[$master]:-0} + recovery_minutes))
                    master_failure_counts[$master]=$((${master_failure_counts[$master]:-0} + 1))
                fi
            fi
        fi
    done < <(find "$TASKS_DIR" -name "task-*.json" -type f 2>/dev/null)

    if [[ $failure_count -eq 0 ]]; then
        echo "No recovered failures found in lookback window" >&2
        jq -nc \
            --arg timestamp "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
            --argjson lookback_days "$lookback_days" \
            '{
                metric: "mttr",
                timestamp: $timestamp,
                lookback_days: $lookback_days,
                failure_count: 0,
                mean_minutes: 0,
                performance_level: "unknown",
                note: "No recovered failures in period"
            }'
        return 0
    fi

    # Calculate statistics
    local mean_minutes=$((total_recovery_time / failure_count))
    local median_minutes=$(calculate_median "${recovery_times_array[@]}")
    local p95_minutes=$(calculate_percentile 95 "${recovery_times_array[@]}")

    local performance_level=$(determine_performance_level "$mean_minutes" "mttr")

    # Build per-master breakdown
    local masters_json="{"
    local first=true
    for master in "${!master_recovery_times[@]}"; do
        [[ "$first" == "false" ]] && masters_json+=","
        first=false
        local total=${master_recovery_times[$master]}
        local count=${master_failure_counts[$master]}
        local avg=$((total / count))
        masters_json+="\"$master\": {\"avg_minutes\": $avg, \"failure_count\": $count}"
    done
    masters_json+="}"

    jq -nc \
        --arg timestamp "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --argjson lookback_days "$lookback_days" \
        --argjson failure_count "$failure_count" \
        --argjson mean "$mean_minutes" \
        --argjson median "$median_minutes" \
        --argjson p95 "$p95_minutes" \
        --arg level "$performance_level" \
        --argjson masters "$masters_json" \
        '{
            metric: "mttr",
            timestamp: $timestamp,
            lookback_days: $lookback_days,
            failure_count: $failure_count,
            mean_minutes: $mean,
            median_minutes: $median,
            p95_minutes: $p95,
            performance_level: $level,
            by_master: $masters
        }'
}

# ==============================================================================
# STATISTICAL HELPERS
# ==============================================================================

calculate_median() {
    local values=("$@")
    local count=${#values[@]}

    [[ $count -eq 0 ]] && echo "0" && return

    IFS=$'\n' sorted=($(sort -n <<<"${values[*]}"))
    unset IFS

    local mid=$((count / 2))
    if (( count % 2 == 0 )); then
        echo $(( (sorted[mid-1] + sorted[mid]) / 2 ))
    else
        echo "${sorted[mid]}"
    fi
}

calculate_percentile() {
    local percentile=$1
    shift
    local values=("$@")
    local count=${#values[@]}

    [[ $count -eq 0 ]] && echo "0" && return

    IFS=$'\n' sorted=($(sort -n <<<"${values[*]}"))
    unset IFS

    local index=$(echo "scale=0; ($percentile / 100) * $count" | bc)
    echo "${sorted[index]}"
}

determine_performance_level() {
    local value="$1"
    local metric_type="$2"

    local config=$(cat "$CONFIG_FILE")
    local thresholds=$(echo "$config" | jq -r ".thresholds.${metric_type}")

    case "$metric_type" in
        mttr)
            local elite=$(echo "$thresholds" | jq -r '.elite.minutes')
            local high=$(echo "$thresholds" | jq -r '.high.minutes')
            local medium=$(echo "$thresholds" | jq -r '.medium.minutes')

            if [[ $value -le $elite ]]; then
                echo "elite"
            elif [[ $value -le $high ]]; then
                echo "high"
            elif [[ $value -le $medium ]]; then
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
            calculate_mttr "${2:-30}" "${3:-all}"
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

export -f calculate_mttr
export -f calculate_median
export -f calculate_percentile
export -f determine_performance_level
