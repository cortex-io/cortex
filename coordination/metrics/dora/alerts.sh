#!/usr/bin/env bash
# DORA Metrics Alerts
# Monitors metrics and generates alerts for degradation

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CONFIG_FILE="$SCRIPT_DIR/config.json"
ALERTS_FILE="$PROJECT_ROOT/coordination/health-alerts.json"

source "$SCRIPT_DIR/aggregator.sh"

# ==============================================================================
# ALERT DETECTION
# ==============================================================================

detect_alerts() {
    local lookback_days="${1:-7}"
    local baseline_days="${2:-30}"

    echo "Detecting DORA metric alerts..." >&2
    echo "Current period: $lookback_days days, Baseline: $baseline_days days" >&2

    local current=$(aggregate_all_metrics "$lookback_days" "all")
    local baseline=$(aggregate_all_metrics "$baseline_days" "all")

    local config=$(cat "$CONFIG_FILE")
    local alerts=()

    # Check deployment frequency
    local current_deploy=$(echo "$current" | jq -r '.metrics.deployment_frequency.deployments_per_day')
    local baseline_deploy=$(echo "$baseline" | jq -r '.metrics.deployment_frequency.deployments_per_day')

    if [[ "$current_deploy" != "null" && "$baseline_deploy" != "null" ]]; then
        local deploy_change=$(echo "scale=2; (($baseline_deploy - $current_deploy) / $baseline_deploy) * 100" | bc)
        local deploy_threshold=$(echo "$config" | jq -r '.alert_conditions.deployment_frequency_drop.threshold_percent')

        if (( $(echo "$deploy_change >= $deploy_threshold" | bc -l) )); then
            local alert=$(jq -nc \
                --arg metric "deployment_frequency" \
                --arg severity "warning" \
                --arg message "Deployment frequency dropped ${deploy_change}% from baseline" \
                --arg current "$current_deploy" \
                --arg baseline "$baseline_deploy" \
                '{
                    metric: $metric,
                    severity: $severity,
                    message: $message,
                    current_value: $current,
                    baseline_value: $baseline,
                    change_percent: $deploy_change
                }')
            alerts+=("$alert")
        fi
    fi

    # Check lead time
    local current_lead=$(echo "$current" | jq -r '.metrics.lead_time.mean_minutes')
    local baseline_lead=$(echo "$baseline" | jq -r '.metrics.lead_time.mean_minutes')

    if [[ "$current_lead" != "null" && "$baseline_lead" != "null" && "$current_lead" != "0" && "$baseline_lead" != "0" ]]; then
        local lead_change=$(echo "scale=2; (($current_lead - $baseline_lead) / $baseline_lead) * 100" | bc)
        local lead_threshold=$(echo "$config" | jq -r '.alert_conditions.lead_time_increase.threshold_percent')

        if (( $(echo "$lead_change >= $lead_threshold" | bc -l) )); then
            local alert=$(jq -nc \
                --arg metric "lead_time" \
                --arg severity "warning" \
                --arg message "Lead time increased ${lead_change}% from baseline" \
                --argjson current "$current_lead" \
                --argjson baseline "$baseline_lead" \
                --arg change "$lead_change" \
                '{
                    metric: $metric,
                    severity: $severity,
                    message: $message,
                    current_value: $current,
                    baseline_value: $baseline,
                    change_percent: $change
                }')
            alerts+=("$alert")
        fi
    fi

    # Check MTTR
    local current_mttr=$(echo "$current" | jq -r '.metrics.mttr.mean_minutes')
    local baseline_mttr=$(echo "$baseline" | jq -r '.metrics.mttr.mean_minutes')

    if [[ "$current_mttr" != "null" && "$baseline_mttr" != "null" && "$current_mttr" != "0" && "$baseline_mttr" != "0" ]]; then
        local mttr_change=$(echo "scale=2; (($current_mttr - $baseline_mttr) / $baseline_mttr) * 100" | bc)
        local mttr_threshold=$(echo "$config" | jq -r '.alert_conditions.mttr_increase.threshold_percent')

        if (( $(echo "$mttr_change >= $mttr_threshold" | bc -l) )); then
            local alert=$(jq -nc \
                --arg metric "mttr" \
                --arg severity "critical" \
                --arg message "MTTR increased ${mttr_change}% from baseline" \
                --argjson current "$current_mttr" \
                --argjson baseline "$baseline_mttr" \
                --arg change "$mttr_change" \
                '{
                    metric: $metric,
                    severity: $severity,
                    message: $message,
                    current_value: $current,
                    baseline_value: $baseline,
                    change_percent: $change
                }')
            alerts+=("$alert")
        fi
    fi

    # Check failure rate
    local current_failure=$(echo "$current" | jq -r '.metrics.change_failure_rate.failure_rate_percent')
    local baseline_failure=$(echo "$baseline" | jq -r '.metrics.change_failure_rate.failure_rate_percent')

    if [[ "$current_failure" != "null" && "$baseline_failure" != "null" ]]; then
        local failure_change=$(echo "scale=2; (($current_failure - $baseline_failure) / $baseline_failure) * 100" | bc 2>/dev/null || echo "0")
        local failure_threshold=$(echo "$config" | jq -r '.alert_conditions.failure_rate_increase.threshold_percent')

        if (( $(echo "$failure_change >= $failure_threshold" | bc -l) )); then
            local alert=$(jq -nc \
                --arg metric "change_failure_rate" \
                --arg severity "critical" \
                --arg message "Failure rate increased ${failure_change}% from baseline" \
                --arg current "$current_failure" \
                --arg baseline "$baseline_failure" \
                --arg change "$failure_change" \
                '{
                    metric: $metric,
                    severity: $severity,
                    message: $message,
                    current_value: $current,
                    baseline_value: $baseline,
                    change_percent: $change
                }')
            alerts+=("$alert")
        fi
    fi

    # Build alerts JSON
    if [[ ${#alerts[@]} -eq 0 ]]; then
        jq -nc \
            --arg timestamp "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
            '{
                alert_type: "dora_metrics",
                timestamp: $timestamp,
                status: "healthy",
                alerts: []
            }'
    else
        local alerts_json="["
        local first=true
        for alert in "${alerts[@]}"; do
            [[ "$first" == "false" ]] && alerts_json+=","
            first=false
            alerts_json+="$alert"
        done
        alerts_json+="]"

        echo "$alerts_json" | jq \
            --arg timestamp "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
            '{
                alert_type: "dora_metrics",
                timestamp: $timestamp,
                status: "degraded",
                alerts: .
            }'
    fi
}

# ==============================================================================
# SAVE ALERTS
# ==============================================================================

save_alerts() {
    local lookback_days="${1:-7}"
    local baseline_days="${2:-30}"

    local alerts=$(detect_alerts "$lookback_days" "$baseline_days")

    # Merge with existing alerts file
    if [[ -f "$ALERTS_FILE" ]]; then
        local existing=$(cat "$ALERTS_FILE")
        echo "$existing" | jq --argjson new "$alerts" '. + {dora_metrics: $new}' > "$ALERTS_FILE"
    else
        jq -nc --argjson alerts "$alerts" '{dora_metrics: $alerts}' > "$ALERTS_FILE"
    fi

    echo "Alerts saved to $ALERTS_FILE" >&2
    echo "$alerts"
}

# ==============================================================================
# MAIN
# ==============================================================================

main() {
    local command="${1:-detect}"

    case "$command" in
        detect)
            detect_alerts "${2:-7}" "${3:-30}"
            ;;
        save)
            save_alerts "${2:-7}" "${3:-30}"
            ;;
        *)
            echo "Usage: $0 {detect|save} [current_days] [baseline_days]"
            exit 1
            ;;
    esac
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi

export -f detect_alerts
export -f save_alerts
