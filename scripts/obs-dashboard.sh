#!/usr/bin/env bash
#
# Real-Time Observability Dashboard
# Part of Q2 Week 20: Query Engine & Dashboards
#
# Displays system health, metrics, and anomalies in real-time
#

set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Configuration
readonly REFRESH_INTERVAL="${REFRESH_INTERVAL:-5}"  # seconds
readonly OBS_QUERY="$SCRIPT_DIR/obs-query.sh"

# Source query library
if [[ -f "$SCRIPT_DIR/lib/observability/query-library.sh" ]]; then
    source "$SCRIPT_DIR/lib/observability/query-library.sh"
fi

#
# Clear screen and move cursor to top
#
clear_screen() {
    clear
    tput cup 0 0
}

#
# Get system health status
#
get_system_health() {
    local health="HEALTHY"
    local health_color="32"  # Green

    # Check for critical anomalies
    local critical_count=$("$OBS_QUERY" "SELECT * FROM anomalies WHERE severity=critical AND status=active LIMIT 1" 2>/dev/null | jq -r '.results | length' 2>/dev/null || echo "0")

    if [[ $critical_count -gt 0 ]]; then
        health="CRITICAL"
        health_color="31"  # Red
        return 0
    fi

    # Check for high severity anomalies
    local high_count=$("$OBS_QUERY" "SELECT * FROM anomalies WHERE severity=high AND status=active LIMIT 5" 2>/dev/null | jq -r '.results | length' 2>/dev/null || echo "0")

    if [[ $high_count -gt 2 ]]; then
        health="DEGRADED"
        health_color="33"  # Yellow
    fi

    echo -e "\033[${health_color}m${health}\033[0m"
}

#
# Get anomaly counts by severity
#
get_anomaly_counts() {
    local critical=$("$OBS_QUERY" "SELECT * FROM anomalies WHERE severity=critical AND status=active" 2>/dev/null | jq -r '.results | length' 2>/dev/null || echo "0")
    local high=$("$OBS_QUERY" "SELECT * FROM anomalies WHERE severity=high AND status=active" 2>/dev/null | jq -r '.results | length' 2>/dev/null || echo "0")
    local medium=$("$OBS_QUERY" "SELECT * FROM anomalies WHERE severity=medium AND status=active" 2>/dev/null | jq -r '.results | length' 2>/dev/null || echo "0")
    local low=$("$OBS_QUERY" "SELECT * FROM anomalies WHERE severity=low AND status=active" 2>/dev/null | jq -r '.results | length' 2>/dev/null || echo "0")

    echo "$critical/$high/$medium/$low"
}

#
# Get recent event counts
#
get_event_stats() {
    local recent_events=$("$OBS_QUERY" "SELECT * FROM events WHERE timestamp > now-5m" 2>/dev/null | jq -r '.results | length' 2>/dev/null || echo "0")
    local error_events=$("$OBS_QUERY" "SELECT * FROM events WHERE category=error AND timestamp > now-5m" 2>/dev/null | jq -r '.results | length' 2>/dev/null || echo "0")

    echo "$recent_events events ($error_events errors)"
}

#
# Get trace stats
#
get_trace_stats() {
    local trace_count=$("$OBS_QUERY" "SELECT * FROM traces WHERE timestamp > now-5m" 2>/dev/null | jq -r '.results | length' 2>/dev/null || echo "0")
    local slow_traces=$("$OBS_QUERY" "SELECT * FROM traces WHERE duration_ms > 5000 AND timestamp > now-5m" 2>/dev/null | jq -r '.results | length' 2>/dev/null || echo "0")

    echo "$trace_count traces ($slow_traces slow)"
}

#
# Display header
#
display_header() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    echo "╔════════════════════════════════════════════════════════════════════════════╗"
    echo "║              COMMIT-RELAY OBSERVABILITY DASHBOARD                          ║"
    echo "║            $timestamp                   Refresh: ${REFRESH_INTERVAL}s            ║"
    echo "╚════════════════════════════════════════════════════════════════════════════╝"
    echo ""
}

#
# Display system health widget
#
display_system_health() {
    local health=$(get_system_health)

    echo "┌─ SYSTEM HEALTH ─────────────────────────────────────────────────────────────┐"
    echo "│  Status: $health"
    echo "│  Anomalies (C/H/M/L): $(get_anomaly_counts)"
    echo "│  Last 5min: $(get_event_stats)"
    echo "│  Traces: $(get_trace_stats)"
    echo "└─────────────────────────────────────────────────────────────────────────────┘"
    echo ""
}

#
# Display active anomalies widget
#
display_active_anomalies() {
    echo "┌─ ACTIVE ANOMALIES (Top 5) ──────────────────────────────────────────────────┐"

    local anomalies=$("$OBS_QUERY" "SELECT * FROM anomalies WHERE status=active ORDER BY timestamp DESC LIMIT 5" 2>/dev/null | jq -r '.results' 2>/dev/null || echo "[]")

    local count=$(echo "$anomalies" | jq 'length')

    if [[ "$count" == "0" ]]; then
        echo "│  No active anomalies"
    else
        echo "$anomalies" | jq -r '.[] | "│  [\(.severity | ascii_upcase)] \(.type): \(.metric_name)"' | head -5
    fi

    echo "└─────────────────────────────────────────────────────────────────────────────┘"
    echo ""
}

#
# Display recent errors widget
#
display_recent_errors() {
    echo "┌─ RECENT ERRORS (Last hour) ─────────────────────────────────────────────────┐"

    local errors=$("$OBS_QUERY" "SELECT * FROM events WHERE category=error AND timestamp > now-1h LIMIT 5" 2>/dev/null | jq -r '.results' 2>/dev/null || echo "[]")

    local count=$(echo "$errors" | jq 'length')

    if [[ "$count" == "0" ]]; then
        echo "│  No recent errors"
    else
        echo "$errors" | jq -r '.[] | "│  \(.event_type): \(.data.message // "No message")"' | head -5 | cut -c1-78
    fi

    echo "└─────────────────────────────────────────────────────────────────────────────┘"
    echo ""
}

#
# Display performance metrics widget
#
display_performance_metrics() {
    echo "┌─ PERFORMANCE METRICS ───────────────────────────────────────────────────────┐"

    # Try to get recent metrics
    local success_rate=$("$OBS_QUERY" "SELECT * FROM metrics WHERE metric_name=task_success_rate LIMIT 1" 2>/dev/null | jq -r '.results[0].value // "N/A"' 2>/dev/null || echo "N/A")
    local queue_depth=$("$OBS_QUERY" "SELECT * FROM metrics WHERE metric_name=task_queue_depth LIMIT 1" 2>/dev/null | jq -r '.results[0].value // "N/A"' 2>/dev/null || echo "N/A")
    local token_usage=$("$OBS_QUERY" "SELECT * FROM metrics WHERE metric_name=token_usage_total LIMIT 1" 2>/dev/null | jq -r '.results[0].value // "N/A"' 2>/dev/null || echo "N/A")

    echo "│  Task Success Rate: $success_rate"
    echo "│  Queue Depth: $queue_depth"
    echo "│  Token Usage: $token_usage"

    echo "└─────────────────────────────────────────────────────────────────────────────┘"
    echo ""
}

#
# Display slowest traces widget
#
display_slowest_traces() {
    echo "┌─ SLOWEST TRACES (Last hour) ────────────────────────────────────────────────┐"

    local traces=$("$OBS_QUERY" "SELECT * FROM traces WHERE timestamp > now-1h ORDER BY duration_ms DESC LIMIT 3" 2>/dev/null | jq -r '.results' 2>/dev/null || echo "[]")

    local count=$(echo "$traces" | jq 'length')

    if [[ "$count" == "0" ]]; then
        echo "│  No traces in last hour"
    else
        echo "$traces" | jq -r '.[] | "│  \(.trace_id): \(.duration_ms)ms (\(.span_count) spans)"' | head -3
    fi

    echo "└─────────────────────────────────────────────────────────────────────────────┘"
    echo ""
}

#
# Display footer
#
display_footer() {
    echo "Commands: [q] Quit  [r] Refresh  [c] Clear Cache  [h] Help"
    echo ""
}

#
# Main dashboard loop
#
run_dashboard() {
    local running=true

    # Trap Ctrl+C
    trap 'running=false' INT

    while $running; do
        clear_screen

        display_header
        display_system_health
        display_active_anomalies
        display_recent_errors
        display_performance_metrics
        display_slowest_traces
        display_footer

        # Wait for refresh interval or user input
        if read -t "$REFRESH_INTERVAL" -n 1 input 2>/dev/null; then
            case "$input" in
                q|Q)
                    running=false
                    ;;
                r|R)
                    # Immediate refresh
                    continue
                    ;;
                c|C)
                    "$OBS_QUERY" --clear-cache >/dev/null 2>&1
                    echo "Cache cleared"
                    sleep 1
                    ;;
                h|H)
                    clear_screen
                    show_help
                    read -p "Press any key to continue..."
                    ;;
            esac
        fi
    done

    clear_screen
    echo "Dashboard stopped."
}

#
# Show help
#
show_help() {
    cat <<EOF
Observability Dashboard Help
============================

The dashboard displays real-time system health and observability data:

Widgets:
  - System Health: Overall system status and anomaly counts
  - Active Anomalies: Top 5 current anomalies
  - Recent Errors: Last hour's error events
  - Performance Metrics: Key system metrics
  - Slowest Traces: Performance bottlenecks

Commands:
  q - Quit dashboard
  r - Refresh immediately
  c - Clear query cache
  h - Show this help

Configuration:
  Set REFRESH_INTERVAL to change update frequency (default: 5 seconds)
  Example: REFRESH_INTERVAL=10 $0

EOF
}

#
# Show dashboard snapshot (non-interactive)
#
show_snapshot() {
    display_header
    display_system_health
    display_active_anomalies
    display_recent_errors
    display_performance_metrics
    display_slowest_traces
}

#
# Main CLI
#
main() {
    local mode="${1:-live}"

    case "$mode" in
        live)
            run_dashboard
            ;;
        snapshot)
            show_snapshot
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            echo "Usage: $0 [live|snapshot|help]"
            echo ""
            echo "  live      - Run interactive dashboard (default)"
            echo "  snapshot  - Show single snapshot and exit"
            echo "  help      - Show help"
            exit 1
            ;;
    esac
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
