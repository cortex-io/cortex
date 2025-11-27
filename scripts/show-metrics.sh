#!/usr/bin/env bash
#
# Show Metrics - Interactive Dashboard View
# Displays real-time and historical metrics in a formatted dashboard
#
# Usage:
#   ./scripts/show-metrics.sh [OPTIONS]
#   ./scripts/show-metrics.sh --live
#   ./scripts/show-metrics.sh --master development
#   ./scripts/show-metrics.sh --summary
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
: "${METRICS_ALERTS_DIR:=coordination/metrics/alerts}"
: "${METRICS_MASTER_DIR:=coordination/metrics/masters}"

# Color codes for terminal output
readonly COLOR_RESET='\033[0m'
readonly COLOR_BOLD='\033[1m'
readonly COLOR_RED='\033[0;31m'
readonly COLOR_GREEN='\033[0;32m'
readonly COLOR_YELLOW='\033[0;33m'
readonly COLOR_BLUE='\033[0;34m'
readonly COLOR_CYAN='\033[0;36m'
readonly COLOR_GRAY='\033[0;90m'

#
# Print usage
#
usage() {
    cat << EOF
Show Metrics Dashboard

Usage:
    $0 [OPTIONS]

Options:
    --live              Live metrics (updates every 5 seconds)
    --summary           System-wide summary
    --master <id>       Show specific master metrics
    --workers           Worker performance metrics
    --tasks             Task processing metrics
    --tokens            Token consumption metrics
    --alerts            Active alerts
    --routing           Routing performance
    --health            System health
    --period <hours>    Time period in hours (default: 24)
    --json              Output as JSON
    --help              Show this help

Examples:
    $0 --summary                    # System-wide summary
    $0 --master development         # Development master metrics
    $0 --live                       # Live updating dashboard
    $0 --alerts                     # Show active alerts
    $0 --period 48                  # Last 48 hours
    $0 --workers --json             # Worker metrics as JSON
EOF
    exit 0
}

#
# Format number with commas
#
format_number() {
    local num="$1"
    printf "%'d" "$num" 2>/dev/null || echo "$num"
}

#
# Format duration in ms to human readable
#
format_duration() {
    local ms="$1"

    if [[ $ms -lt 1000 ]]; then
        echo "${ms}ms"
    elif [[ $ms -lt 60000 ]]; then
        echo "$(echo "scale=2; $ms / 1000" | bc)s"
    elif [[ $ms -lt 3600000 ]]; then
        echo "$(echo "scale=2; $ms / 60000" | bc)m"
    else
        echo "$(echo "scale=2; $ms / 3600000" | bc)h"
    fi
}

#
# Format percentage
#
format_percentage() {
    local value="$1"
    printf "%.1f%%" "$(echo "scale=3; $value * 100" | bc)"
}

#
# Get health status color
#
health_color() {
    local score="$1"

    if (( $(echo "$score >= 90" | bc -l) )); then
        echo -e "${COLOR_GREEN}"
    elif (( $(echo "$score >= 70" | bc -l) )); then
        echo -e "${COLOR_YELLOW}"
    else
        echo -e "${COLOR_RED}"
    fi
}

#
# Print section header
#
print_header() {
    local title="$1"
    echo -e "\n${COLOR_BOLD}${COLOR_CYAN}========================================${COLOR_RESET}"
    echo -e "${COLOR_BOLD}${COLOR_CYAN}  $title${COLOR_RESET}"
    echo -e "${COLOR_BOLD}${COLOR_CYAN}========================================${COLOR_RESET}\n"
}

#
# Print metric row
#
print_metric() {
    local label="$1"
    local value="$2"
    local color="${3:-$COLOR_RESET}"

    printf "  %-30s ${color}%s${COLOR_RESET}\n" "$label:" "$value"
}

#
# Show system summary
#
show_summary() {
    local period_hours="${1:-24}"
    local json_output="${2:-false}"

    print_header "System Metrics Summary (Last ${period_hours}h)"

    local summary=$(get_system_summary "$period_hours" 2>/dev/null || echo '{}')

    if [[ "$json_output" == "true" ]]; then
        echo "$summary" | jq '.'
        return
    fi

    # Parse summary
    local total_metrics=$(echo "$summary" | jq -r '.total_metrics // 0')
    local worker_spawns=$(echo "$summary" | jq -r '.worker_spawns // 0')
    local tasks_completed=$(echo "$summary" | jq -r '.tasks_completed // 0')
    local total_tokens=$(echo "$summary" | jq -r '.total_tokens // 0')
    local alert_count=$(echo "$summary" | jq -r '.alert_count // 0')

    print_metric "Total Metrics Collected" "$(format_number $total_metrics)" "$COLOR_CYAN"
    print_metric "Worker Spawns" "$(format_number $worker_spawns)" "$COLOR_GREEN"
    print_metric "Tasks Completed" "$(format_number $tasks_completed)" "$COLOR_GREEN"
    print_metric "Total Tokens Consumed" "$(format_number $total_tokens)" "$COLOR_YELLOW"
    print_metric "Alerts Triggered" "$(format_number $alert_count)" "$COLOR_RED"

    # Top metrics
    echo -e "\n${COLOR_BOLD}Top Metrics by Volume:${COLOR_RESET}"
    echo "$summary" | jq -r '.top_metrics[]? | "  \(.metric): \(.count)"' 2>/dev/null || echo "  No data"

    # Metrics by type
    echo -e "\n${COLOR_BOLD}Metrics by Type:${COLOR_RESET}"
    echo "$summary" | jq -r '.metrics_by_type | to_entries[]? | "  \(.key): \(.value)"' 2>/dev/null || echo "  No data"
}

#
# Show master metrics
#
show_master() {
    local master_id="$1"
    local period_hours="${2:-24}"
    local json_output="${3:-false}"

    # Add -master suffix if not present
    [[ "$master_id" != *-master ]] && master_id="${master_id}-master"

    print_header "Master Metrics: $master_id (Last ${period_hours}h)"

    local performance=$(get_master_performance "$master_id" "$period_hours" 2>/dev/null || echo '{}')

    if [[ "$json_output" == "true" ]]; then
        echo "$performance" | jq '.'
        return
    fi

    # Parse performance data
    local total_metrics=$(echo "$performance" | jq -r '.total_metrics // 0')
    local total_tasks=$(echo "$performance" | jq -r '.total_tasks // 0')
    local avg_task_time=$(echo "$performance" | jq -r '.avg_task_time // 0')
    local token_usage=$(echo "$performance" | jq -r '.token_usage // 0')

    print_metric "Total Metrics" "$(format_number $total_metrics)" "$COLOR_CYAN"
    print_metric "Tasks Processed" "$(format_number $total_tasks)" "$COLOR_GREEN"
    print_metric "Avg Task Time" "$(format_duration ${avg_task_time%.*})" "$COLOR_BLUE"
    print_metric "Token Usage" "$(format_number $token_usage)" "$COLOR_YELLOW"

    # Metrics breakdown
    echo -e "\n${COLOR_BOLD}Metrics Breakdown:${COLOR_RESET}"
    echo "$performance" | jq -r '.metrics_by_type | to_entries[]? | "  \(.key): \(.value)"' 2>/dev/null || echo "  No data"

    # Calculate success rate
    local success_rate=$(calculate_success_rate "master_id" "$master_id" "$period_hours" 2>/dev/null || echo "0")
    local success_pct=$(format_percentage "$success_rate")
    local success_color=$(health_color "$(echo "$success_rate * 100" | bc)")
    print_metric "Success Rate" "$success_pct" "$success_color"
}

#
# Show worker metrics
#
show_workers() {
    local period_hours="${1:-24}"
    local json_output="${2:-false}"

    print_header "Worker Performance (Last ${period_hours}h)"

    local metrics_file="$METRICS_RAW_DIR/metrics-$(date +%Y-%m-%d).jsonl"

    if [[ ! -f "$metrics_file" ]]; then
        echo "No metrics data available"
        return
    fi

    local since_ms=$(( ($(date +%s) - (period_hours * 3600)) * 1000 ))

    local worker_stats=$(cat "$metrics_file" | jq -s --arg since "$since_ms" '
        map(select(.timestamp >= ($since | tonumber))) |
        {
            spawns: {
                total: (map(select(.metric_name == "worker_spawns_total")) | map(.value) | add // 0),
                successful: (map(select(.metric_name == "worker_spawns_successful")) | map(.value) | add // 0),
                failed: (map(select(.metric_name == "worker_spawns_failed")) | map(.value) | add // 0)
            },
            completions: {
                total: (map(select(.metric_name == "workers_completed_total")) | map(.value) | add // 0),
                successful: (map(select(.metric_name == "workers_successful")) | map(.value) | add // 0),
                failed: (map(select(.metric_name == "workers_failed")) | map(.value) | add // 0)
            },
            duration: {
                avg_ms: (map(select(.metric_name == "worker_duration_ms")) | if length > 0 then (map(.value) | add / length) else 0 end),
                p50_ms: (map(select(.metric_name == "worker_duration_ms")) | map(.value) | sort | if length > 0 then .[length / 2 | floor] else 0 end),
                p95_ms: (map(select(.metric_name == "worker_duration_ms")) | map(.value) | sort | if length > 0 then .[length * 0.95 | floor] else 0 end),
                p99_ms: (map(select(.metric_name == "worker_duration_ms")) | map(.value) | sort | if length > 0 then .[length * 0.99 | floor] else 0 end)
            }
        }
    ')

    if [[ "$json_output" == "true" ]]; then
        echo "$worker_stats" | jq '.'
        return
    fi

    # Spawns
    echo -e "${COLOR_BOLD}Worker Spawns:${COLOR_RESET}"
    local spawn_total=$(echo "$worker_stats" | jq -r '.spawns.total')
    local spawn_success=$(echo "$worker_stats" | jq -r '.spawns.successful')
    local spawn_failed=$(echo "$worker_stats" | jq -r '.spawns.failed')
    print_metric "Total Spawns" "$(format_number $spawn_total)" "$COLOR_CYAN"
    print_metric "Successful" "$(format_number $spawn_success)" "$COLOR_GREEN"
    print_metric "Failed" "$(format_number $spawn_failed)" "$COLOR_RED"

    if [[ $spawn_total -gt 0 ]]; then
        local spawn_rate=$(echo "scale=4; $spawn_success / $spawn_total" | bc)
        local spawn_pct=$(format_percentage "$spawn_rate")
        local spawn_color=$(health_color "$(echo "$spawn_rate * 100" | bc)")
        print_metric "Success Rate" "$spawn_pct" "$spawn_color"
    fi

    # Completions
    echo -e "\n${COLOR_BOLD}Worker Completions:${COLOR_RESET}"
    local comp_total=$(echo "$worker_stats" | jq -r '.completions.total')
    local comp_success=$(echo "$worker_stats" | jq -r '.completions.successful')
    local comp_failed=$(echo "$worker_stats" | jq -r '.completions.failed')
    print_metric "Total Completions" "$(format_number $comp_total)" "$COLOR_CYAN"
    print_metric "Successful" "$(format_number $comp_success)" "$COLOR_GREEN"
    print_metric "Failed" "$(format_number $comp_failed)" "$COLOR_RED"

    # Duration
    echo -e "\n${COLOR_BOLD}Duration Metrics:${COLOR_RESET}"
    local avg_duration=$(echo "$worker_stats" | jq -r '.duration.avg_ms')
    local p50_duration=$(echo "$worker_stats" | jq -r '.duration.p50_ms')
    local p95_duration=$(echo "$worker_stats" | jq -r '.duration.p95_ms')
    local p99_duration=$(echo "$worker_stats" | jq -r '.duration.p99_ms')
    print_metric "Average" "$(format_duration ${avg_duration%.*})" "$COLOR_BLUE"
    print_metric "P50" "$(format_duration ${p50_duration%.*})" "$COLOR_BLUE"
    print_metric "P95" "$(format_duration ${p95_duration%.*})" "$COLOR_YELLOW"
    print_metric "P99" "$(format_duration ${p99_duration%.*})" "$COLOR_RED"
}

#
# Show active alerts
#
show_alerts() {
    local json_output="${1:-false}"

    print_header "Active Alerts"

    local active_alerts="$METRICS_ALERTS_DIR/active-alerts.json"

    if [[ ! -f "$active_alerts" ]]; then
        echo "No active alerts"
        return
    fi

    local alerts=$(cat "$active_alerts")

    if [[ "$json_output" == "true" ]]; then
        echo "$alerts" | jq '.'
        return
    fi

    local alert_count=$(echo "$alerts" | jq '.alerts | length')

    if [[ $alert_count -eq 0 ]]; then
        echo -e "${COLOR_GREEN}No active alerts${COLOR_RESET}"
        return
    fi

    echo -e "${COLOR_YELLOW}Total Active Alerts: $alert_count${COLOR_RESET}\n"

    # Group by severity
    echo -e "${COLOR_BOLD}Critical Alerts:${COLOR_RESET}"
    echo "$alerts" | jq -r '.alerts[] | select(.severity == "critical") | "  [\(.timestamp)] \(.message)"' 2>/dev/null || echo "  None"

    echo -e "\n${COLOR_BOLD}High Severity:${COLOR_RESET}"
    echo "$alerts" | jq -r '.alerts[] | select(.severity == "high") | "  [\(.timestamp)] \(.message)"' 2>/dev/null || echo "  None"

    echo -e "\n${COLOR_BOLD}Medium Severity:${COLOR_RESET}"
    echo "$alerts" | jq -r '.alerts[] | select(.severity == "medium") | "  [\(.timestamp)] \(.message)"' 2>/dev/null || echo "  None"

    echo -e "\n${COLOR_BOLD}Low Severity:${COLOR_RESET}"
    echo "$alerts" | jq -r '.alerts[] | select(.severity == "low") | "  [\(.timestamp)] \(.message)"' 2>/dev/null || echo "  None"
}

#
# Show task metrics
#
show_tasks() {
    local period_hours="${1:-24}"
    local json_output="${2:-false}"

    print_header "Task Processing (Last ${period_hours}h)"

    local metrics_file="$METRICS_RAW_DIR/metrics-$(date +%Y-%m-%d).jsonl"

    if [[ ! -f "$metrics_file" ]]; then
        echo "No metrics data available"
        return
    fi

    local since_ms=$(( ($(date +%s) - (period_hours * 3600)) * 1000 ))

    local task_stats=$(cat "$metrics_file" | jq -s --arg since "$since_ms" '
        map(select(.timestamp >= ($since | tonumber))) |
        {
            total_processed: (map(select(.metric_name == "tasks_processed_total")) | map(.value) | add // 0),
            processing_time: {
                avg_ms: (map(select(.metric_name == "task_processing_time_ms")) | if length > 0 then (map(.value) | add / length) else 0 end),
                p50_ms: (map(select(.metric_name == "task_processing_time_ms")) | map(.value) | sort | if length > 0 then .[length / 2 | floor] else 0 end),
                p95_ms: (map(select(.metric_name == "task_processing_time_ms")) | map(.value) | sort | if length > 0 then .[length * 0.95 | floor] else 0 end),
                p99_ms: (map(select(.metric_name == "task_processing_time_ms")) | map(.value) | sort | if length > 0 then .[length * 0.99 | floor] else 0 end),
                min_ms: (map(select(.metric_name == "task_processing_time_ms")) | map(.value) | min // 0),
                max_ms: (map(select(.metric_name == "task_processing_time_ms")) | map(.value) | max // 0)
            },
            sla_breaches: (map(select(.metric_name == "task_processing_time_ms" and .value > 300000)) | length)
        }
    ')

    if [[ "$json_output" == "true" ]]; then
        echo "$task_stats" | jq '.'
        return
    fi

    local total_processed=$(echo "$task_stats" | jq -r '.total_processed')
    print_metric "Tasks Processed" "$(format_number $total_processed)" "$COLOR_GREEN"

    echo -e "\n${COLOR_BOLD}Processing Time:${COLOR_RESET}"
    local avg_time=$(echo "$task_stats" | jq -r '.processing_time.avg_ms')
    local p50_time=$(echo "$task_stats" | jq -r '.processing_time.p50_ms')
    local p95_time=$(echo "$task_stats" | jq -r '.processing_time.p95_ms')
    local p99_time=$(echo "$task_stats" | jq -r '.processing_time.p99_ms')
    local min_time=$(echo "$task_stats" | jq -r '.processing_time.min_ms')
    local max_time=$(echo "$task_stats" | jq -r '.processing_time.max_ms')

    print_metric "Average" "$(format_duration ${avg_time%.*})" "$COLOR_BLUE"
    print_metric "Median (P50)" "$(format_duration ${p50_time%.*})" "$COLOR_BLUE"
    print_metric "P95" "$(format_duration ${p95_time%.*})" "$COLOR_YELLOW"
    print_metric "P99" "$(format_duration ${p99_time%.*})" "$COLOR_RED"
    print_metric "Min" "$(format_duration ${min_time%.*})" "$COLOR_GREEN"
    print_metric "Max" "$(format_duration ${max_time%.*})" "$COLOR_RED"

    local sla_breaches=$(echo "$task_stats" | jq -r '.sla_breaches')
    if [[ $sla_breaches -gt 0 ]]; then
        print_metric "SLA Breaches (>5min)" "$sla_breaches" "$COLOR_RED"
    else
        print_metric "SLA Breaches (>5min)" "0" "$COLOR_GREEN"
    fi
}

#
# Live dashboard
#
show_live() {
    while true; do
        clear
        echo -e "${COLOR_BOLD}${COLOR_CYAN}Cortex Metrics Dashboard - Live View${COLOR_RESET}"
        echo -e "${COLOR_GRAY}Updated: $(date)${COLOR_RESET}"

        show_summary 1 false
        show_alerts false

        echo -e "\n${COLOR_GRAY}Press Ctrl+C to exit${COLOR_RESET}"
        sleep 5
    done
}

#
# Main execution
#
main() {
    local view="summary"
    local master_id=""
    local period_hours=24
    local json_output=false

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --help|-h)
                usage
                ;;
            --live)
                show_live
                exit 0
                ;;
            --summary)
                view="summary"
                shift
                ;;
            --master)
                view="master"
                master_id="$2"
                shift 2
                ;;
            --workers)
                view="workers"
                shift
                ;;
            --tasks)
                view="tasks"
                shift
                ;;
            --alerts)
                view="alerts"
                shift
                ;;
            --period)
                period_hours="$2"
                shift 2
                ;;
            --json)
                json_output=true
                shift
                ;;
            *)
                echo "Unknown option: $1" >&2
                usage
                ;;
        esac
    done

    # Display requested view
    case "$view" in
        summary)
            show_summary "$period_hours" "$json_output"
            ;;
        master)
            if [[ -z "$master_id" ]]; then
                echo "Error: --master requires a master ID" >&2
                exit 1
            fi
            show_master "$master_id" "$period_hours" "$json_output"
            ;;
        workers)
            show_workers "$period_hours" "$json_output"
            ;;
        tasks)
            show_tasks "$period_hours" "$json_output"
            ;;
        alerts)
            show_alerts "$json_output"
            ;;
    esac

    echo ""
}

# Run main
main "$@"
