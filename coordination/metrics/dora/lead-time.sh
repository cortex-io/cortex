#!/usr/bin/env bash
# DORA Metric: Lead Time for Changes
# Measures time from task creation to completion

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CONFIG_FILE="$SCRIPT_DIR/config.json"
TASKS_DIR="$PROJECT_ROOT/coordination/tasks"

# ==============================================================================
# LEAD TIME CALCULATION
# ==============================================================================

calculate_lead_time() {
    local lookback_days="${1:-30}"
    local master_filter="${2:-all}"

    local cutoff_date=$(date -u -v-${lookback_days}d +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || \
                        date -u -d "${lookback_days} days ago" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null)

    echo "Calculating lead time for last $lookback_days days..." >&2

    local total_lead_time=0
    local task_count=0
    declare -A master_lead_times
    declare -A master_counts
    local lead_times_array=()

    # Scan all completed tasks
    while IFS= read -r task_file; do
        [[ ! -f "$task_file" ]] && continue

        local status=$(jq -r '.status // "unknown"' "$task_file" 2>/dev/null)
        [[ "$status" != "completed" ]] && continue

        local created_at=$(jq -r '.created_at // empty' "$task_file" 2>/dev/null)
        local completed_at=$(jq -r '.completed_at // empty' "$task_file" 2>/dev/null)

        [[ -z "$created_at" || -z "$completed_at" ]] && continue
        [[ "$completed_at" < "$cutoff_date" ]] && continue

        local master=$(jq -r '.master // "unknown"' "$task_file" 2>/dev/null)

        if [[ "$master_filter" == "all" || "$master" == "$master_filter" ]]; then
            # Calculate duration in minutes
            local created_ts=$(date -j -f "%Y-%m-%dT%H:%M:%S%z" "$created_at" "+%s" 2>/dev/null || \
                             date -d "$created_at" "+%s" 2>/dev/null || echo 0)
            local completed_ts=$(date -j -f "%Y-%m-%dT%H:%M:%S%z" "$completed_at" "+%s" 2>/dev/null || \
                               date -d "$completed_at" "+%s" 2>/dev/null || echo 0)

            if [[ $created_ts -gt 0 && $completed_ts -gt 0 ]]; then
                local duration_seconds=$((completed_ts - created_ts))
                local duration_minutes=$((duration_seconds / 60))

                total_lead_time=$((total_lead_time + duration_minutes))
                ((task_count++))
                lead_times_array+=($duration_minutes)

                master_lead_times[$master]=$((${master_lead_times[$master]:-0} + duration_minutes))
                master_counts[$master]=$((${master_counts[$master]:-0} + 1))
            fi
        fi
    done < <(find "$TASKS_DIR" -name "task-*.json" -type f 2>/dev/null)

    if [[ $task_count -eq 0 ]]; then
        echo "No completed tasks found in lookback window" >&2
        jq -nc '{metric: "lead_time", error: "no_data"}'
        return 0
    fi

    # Calculate statistics
    local mean_minutes=$((total_lead_time / task_count))
    local median_minutes=$(calculate_median "${lead_times_array[@]}")
    local p95_minutes=$(calculate_percentile 95 "${lead_times_array[@]}")

    local performance_level=$(determine_performance_level "$mean_minutes" "lead_time")

    # Build per-master breakdown
    local masters_json="{"
    local first=true
    for master in "${!master_lead_times[@]}"; do
        [[ "$first" == "false" ]] && masters_json+=","
        first=false
        local total=${master_lead_times[$master]}
        local count=${master_counts[$master]}
        local avg=$((total / count))
        masters_json+="\"$master\": {\"avg_minutes\": $avg, \"count\": $count}"
    done
    masters_json+="}"

    jq -nc \
        --arg timestamp "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --argjson lookback_days "$lookback_days" \
        --argjson task_count "$task_count" \
        --argjson mean "$mean_minutes" \
        --argjson median "$median_minutes" \
        --argjson p95 "$p95_minutes" \
        --arg level "$performance_level" \
        --argjson masters "$masters_json" \
        '{
            metric: "lead_time",
            timestamp: $timestamp,
            lookback_days: $lookback_days,
            task_count: $task_count,
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

    # Sort array
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

    # Sort array
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
        lead_time)
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
            calculate_lead_time "${2:-30}" "${3:-all}"
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

export -f calculate_lead_time
export -f calculate_median
export -f calculate_percentile
export -f determine_performance_level
