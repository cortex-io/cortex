#!/usr/bin/env bash
# DORA Metrics Aggregator
# Collects all DORA metrics and aggregates them

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/config.json"
OUTPUT_FILE="$SCRIPT_DIR/dora-metrics.jsonl"

# Source all metric collectors
source "$SCRIPT_DIR/deployment-frequency.sh"
source "$SCRIPT_DIR/lead-time.sh"
source "$SCRIPT_DIR/mttr.sh"
source "$SCRIPT_DIR/change-failure-rate.sh"

# ==============================================================================
# AGGREGATION
# ==============================================================================

aggregate_all_metrics() {
    local lookback_days="${1:-30}"
    local master_filter="${2:-all}"

    echo "Aggregating all DORA metrics..." >&2
    echo "Lookback: $lookback_days days, Master: $master_filter" >&2

    # Collect all metrics in parallel
    local deployment_freq=$(calculate_deployment_frequency "$lookback_days" "$master_filter")
    local lead_time=$(calculate_lead_time "$lookback_days" "$master_filter")
    local mttr=$(calculate_mttr "$lookback_days" "$master_filter")
    local change_failure=$(calculate_change_failure_rate "$lookback_days" "$master_filter")

    # Build aggregate JSON
    jq -nc \
        --arg timestamp "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --argjson lookback_days "$lookback_days" \
        --arg master "$master_filter" \
        --argjson deployment_frequency "$deployment_freq" \
        --argjson lead_time "$lead_time" \
        --argjson mttr "$mttr" \
        --argjson change_failure_rate "$change_failure" \
        '{
            report_type: "dora_metrics",
            timestamp: $timestamp,
            lookback_days: $lookback_days,
            master_filter: $master,
            metrics: {
                deployment_frequency: $deployment_frequency,
                lead_time: $lead_time,
                mttr: $mttr,
                change_failure_rate: $change_failure_rate
            }
        }'
}

# ==============================================================================
# SAVE TO JSONL
# ==============================================================================

save_metrics() {
    local lookback_days="${1:-30}"
    local master_filter="${2:-all}"

    local metrics=$(aggregate_all_metrics "$lookback_days" "$master_filter")

    echo "$metrics" | jq -c '.' >> "$OUTPUT_FILE"

    echo "Metrics saved to $OUTPUT_FILE" >&2
    echo "$metrics"
}

# ==============================================================================
# TIME SERIES ANALYSIS
# ==============================================================================

generate_time_series() {
    local days="${1:-90}"
    local interval_days="${2:-7}"

    echo "Generating time series for last $days days (interval: $interval_days days)..." >&2

    local series=()

    for ((i=days; i>=interval_days; i-=interval_days)); do
        echo "  Calculating metrics for days $i to $((i-interval_days))..." >&2

        local metrics=$(aggregate_all_metrics "$interval_days" "all")
        local period_end=$(date -u -v-${i}d +"%Y-%m-%d" 2>/dev/null || \
                          date -u -d "${i} days ago" +"%Y-%m-%d" 2>/dev/null)

        # Add period marker
        local period_metrics=$(echo "$metrics" | jq --arg period "$period_end" '. + {period_end: $period}')

        series+=("$period_metrics")
    done

    # Build JSON array
    local series_json="["
    local first=true
    for metric in "${series[@]}"; do
        [[ "$first" == "false" ]] && series_json+=","
        first=false
        series_json+="$metric"
    done
    series_json+="]"

    echo "$series_json" | jq '.'
}

# ==============================================================================
# PER-MASTER COMPARISON
# ==============================================================================

compare_masters() {
    local lookback_days="${1:-30}"

    echo "Comparing all masters..." >&2

    local masters=("security" "development" "inventory" "cicd" "cleanup" "coordinator")
    local comparison=()

    for master in "${masters[@]}"; do
        echo "  Analyzing ${master}-master..." >&2

        local metrics=$(aggregate_all_metrics "$lookback_days" "$master")
        comparison+=("$metrics")
    done

    # Build comparison JSON
    local comparison_json="["
    local first=true
    for metric in "${comparison[@]}"; do
        [[ "$first" == "false" ]] && comparison_json+=","
        first=false
        comparison_json+="$metric"
    done
    comparison_json+="]"

    jq -nc \
        --arg timestamp "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --argjson lookback_days "$lookback_days" \
        --argjson masters "$comparison_json" \
        '{
            report_type: "master_comparison",
            timestamp: $timestamp,
            lookback_days: $lookback_days,
            masters: $masters
        }'
}

# ==============================================================================
# MAIN
# ==============================================================================

main() {
    local command="${1:-aggregate}"

    case "$command" in
        aggregate)
            aggregate_all_metrics "${2:-30}" "${3:-all}"
            ;;
        save)
            save_metrics "${2:-30}" "${3:-all}"
            ;;
        time-series)
            generate_time_series "${2:-90}" "${3:-7}"
            ;;
        compare)
            compare_masters "${2:-30}"
            ;;
        *)
            echo "Usage: $0 {aggregate|save|time-series|compare} [lookback_days] [master]"
            echo ""
            echo "Commands:"
            echo "  aggregate       - Collect all metrics and output JSON"
            echo "  save            - Collect and append to metrics file"
            echo "  time-series     - Generate historical time series"
            echo "  compare         - Compare all masters side-by-side"
            exit 1
            ;;
    esac
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi

export -f aggregate_all_metrics
export -f save_metrics
export -f generate_time_series
export -f compare_masters
