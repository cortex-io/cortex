#!/usr/bin/env bash
# DORA Metric: Deployment Frequency
# Measures how often tasks are successfully completed (deployments/day)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CONFIG_FILE="$SCRIPT_DIR/config.json"
TASKS_DIR="$PROJECT_ROOT/coordination/tasks"

# ==============================================================================
# CONFIGURATION
# ==============================================================================

load_config() {
    if [[ ! -f "$CONFIG_FILE" ]]; then
        echo "Error: Config file not found: $CONFIG_FILE" >&2
        return 1
    fi
    cat "$CONFIG_FILE"
}

get_lookback_days() {
    local config=$(load_config)
    echo "$config" | jq -r '.lookback_windows.default_days // 30'
}

# ==============================================================================
# DEPLOYMENT FREQUENCY CALCULATION
# ==============================================================================

calculate_deployment_frequency() {
    local lookback_days="${1:-$(get_lookback_days)}"
    local master_filter="${2:-all}"

    local cutoff_date=$(date -u -v-${lookback_days}d +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || \
                        date -u -d "${lookback_days} days ago" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null)

    echo "Calculating deployment frequency for last $lookback_days days..." >&2
    echo "Cutoff date: $cutoff_date" >&2

    # Count completed tasks by master
    local total_deployments=0
    declare -A master_deployments

    # Scan all task files
    while IFS= read -r task_file; do
        [[ ! -f "$task_file" ]] && continue

        local status=$(jq -r '.status // "unknown"' "$task_file" 2>/dev/null)
        [[ "$status" != "completed" ]] && continue

        local completed_at=$(jq -r '.completed_at // empty' "$task_file" 2>/dev/null)
        [[ -z "$completed_at" ]] && continue

        # Check if within lookback window
        if [[ "$completed_at" > "$cutoff_date" ]]; then
            local master=$(jq -r '.master // "unknown"' "$task_file" 2>/dev/null)

            if [[ "$master_filter" == "all" || "$master" == "$master_filter" ]]; then
                ((total_deployments++))
                master_deployments[$master]=$((${master_deployments[$master]:-0} + 1))
            fi
        fi
    done < <(find "$TASKS_DIR" -name "task-*.json" -type f 2>/dev/null)

    # Calculate per-day rate
    local deployments_per_day=$(echo "scale=2; $total_deployments / $lookback_days" | bc)

    # Determine performance level
    local performance_level=$(determine_performance_level "$deployments_per_day" "deployment_frequency")

    # Build JSON output
    local masters_json="{"
    local first=true
    for master in "${!master_deployments[@]}"; do
        [[ "$first" == "false" ]] && masters_json+=","
        first=false
        local count=${master_deployments[$master]}
        local per_day=$(echo "scale=2; $count / $lookback_days" | bc)
        masters_json+="\"$master\": {\"count\": $count, \"per_day\": $per_day}"
    done
    masters_json+="}"

    jq -nc \
        --arg timestamp "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --argjson lookback_days "$lookback_days" \
        --argjson total "$total_deployments" \
        --arg per_day "$deployments_per_day" \
        --arg level "$performance_level" \
        --argjson masters "$masters_json" \
        '{
            metric: "deployment_frequency",
            timestamp: $timestamp,
            lookback_days: $lookback_days,
            total_deployments: $total,
            deployments_per_day: $per_day,
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

    local config=$(load_config)
    local thresholds=$(echo "$config" | jq -r ".thresholds.${metric_type}")

    case "$metric_type" in
        deployment_frequency)
            local elite=$(echo "$thresholds" | jq -r '.elite.per_day')
            local high=$(echo "$thresholds" | jq -r '.high.per_day')
            local medium=$(echo "$thresholds" | jq -r '.medium.per_day')

            if (( $(echo "$value >= $elite" | bc -l) )); then
                echo "elite"
            elif (( $(echo "$value >= $high" | bc -l) )); then
                echo "high"
            elif (( $(echo "$value >= $medium" | bc -l) )); then
                echo "medium"
            else
                echo "low"
            fi
            ;;
    esac
}

# ==============================================================================
# TRENDING ANALYSIS
# ==============================================================================

calculate_trend() {
    local lookback_days="${1:-30}"
    local comparison_days="${2:-90}"

    local current=$(calculate_deployment_frequency "$lookback_days" "all")
    local baseline=$(calculate_deployment_frequency "$comparison_days" "all")

    local current_per_day=$(echo "$current" | jq -r '.deployments_per_day')
    local baseline_per_day=$(echo "$baseline" | jq -r '.deployments_per_day')

    local change_percent=$(echo "scale=2; (($current_per_day - $baseline_per_day) / $baseline_per_day) * 100" | bc)

    local trend="stable"
    if (( $(echo "$change_percent > 10" | bc -l) )); then
        trend="improving"
    elif (( $(echo "$change_percent < -10" | bc -l) )); then
        trend="degrading"
    fi

    jq -nc \
        --argjson current "$current" \
        --argjson baseline "$baseline" \
        --arg change_percent "$change_percent" \
        --arg trend "$trend" \
        '{
            current: $current,
            baseline: $baseline,
            change_percent: $change_percent,
            trend: $trend
        }'
}

# ==============================================================================
# MAIN
# ==============================================================================

main() {
    local command="${1:-calculate}"

    case "$command" in
        calculate)
            calculate_deployment_frequency "${2:-30}" "${3:-all}"
            ;;
        trend)
            calculate_trend "${2:-30}" "${3:-90}"
            ;;
        *)
            echo "Usage: $0 {calculate [lookback_days] [master]|trend [current_days] [baseline_days]}"
            exit 1
            ;;
    esac
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi

export -f calculate_deployment_frequency
export -f determine_performance_level
export -f calculate_trend
