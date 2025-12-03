#!/usr/bin/env bash
# Handler for daemon.started / system startup events
# Initializes state, performs health checks, and logs startup

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

log() {
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [on-system-startup] $*" >&2
}

handle_system_startup() {
    local event_file="$1"
    local event_json

    event_json=$(cat "$event_file")

    # Extract event data
    local event_id component version startup_mode
    event_id=$(echo "$event_json" | jq -r '.event_id')
    component=$(echo "$event_json" | jq -r '.source // "cortex"')
    version=$(echo "$event_json" | jq -r '.payload.version // "unknown"')
    startup_mode=$(echo "$event_json" | jq -r '.payload.startup_mode // "normal"')

    log "System startup: $component (version: $version, mode: $startup_mode)"

    # Record startup event
    local startup_log="$PROJECT_ROOT/coordination/metrics/system-startups.jsonl"
    mkdir -p "$(dirname "$startup_log")"

    local startup_entry
    startup_entry=$(jq -n \
        --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --arg component "$component" \
        --arg version "$version" \
        --arg mode "$startup_mode" \
        '{
            timestamp: $ts,
            component: $component,
            version: $version,
            startup_mode: $mode,
            event: "startup"
        }')

    echo "$startup_entry" | jq -c '.' >> "$startup_log"
    log "Startup event recorded"

    # Initialize or verify critical directories
    log "Verifying critical directories..."
    local critical_dirs=(
        "$PROJECT_ROOT/coordination/events/queue"
        "$PROJECT_ROOT/coordination/events/archive"
        "$PROJECT_ROOT/coordination/metrics"
        "$PROJECT_ROOT/coordination/security"
        "$PROJECT_ROOT/coordination/routing"
        "$PROJECT_ROOT/coordination/patterns"
        "$PROJECT_ROOT/coordination/pids"
    )

    for dir in "${critical_dirs[@]}"; do
        if [[ ! -d "$dir" ]]; then
            mkdir -p "$dir"
            log "Created missing directory: $dir"
        fi
    done
    log "Directory verification complete"

    # Perform health check
    log "Performing startup health check..."
    local health_status="healthy"
    local health_issues=()

    # Check if event dispatcher is available
    if [[ ! -x "$PROJECT_ROOT/scripts/events/event-dispatcher.sh" ]]; then
        health_status="degraded"
        health_issues+=("Event dispatcher not executable")
    fi

    # Check if required config files exist
    if [[ ! -f "$PROJECT_ROOT/coordination/cortex-config.json" ]]; then
        health_status="degraded"
        health_issues+=("Main config file missing")
    fi

    # Check disk space (warn if < 1GB free)
    local free_space
    free_space=$(df -k "$PROJECT_ROOT" | awk 'NR==2 {print $4}')
    if [[ "$free_space" -lt 1048576 ]]; then
        health_status="warning"
        health_issues+=("Low disk space: $(( free_space / 1024 ))MB remaining")
    fi

    # Record health check results
    local health_file="$PROJECT_ROOT/coordination/system-health.json"
    local health_data
    health_data=$(jq -n \
        --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --arg status "$health_status" \
        --argjson issues "$(printf '%s\n' "${health_issues[@]}" | jq -R . | jq -s .)" \
        '{
            timestamp: $ts,
            status: $status,
            issues: $issues,
            last_startup: $ts
        }')

    echo "$health_data" > "$health_file"
    log "Health check complete: $health_status"

    # Create health alert if issues detected
    if [[ ${#health_issues[@]} -gt 0 ]]; then
        log "Health issues detected: ${#health_issues[@]}"

        local alert_event
        alert_event=$("$PROJECT_ROOT/scripts/events/lib/event-logger.sh" --create \
            "system.health_alert" \
            "on-system-startup-handler" \
            "$(jq -n \
                --arg status "$health_status" \
                --argjson issues "$(printf '%s\n' "${health_issues[@]}" | jq -R . | jq -s .)" \
                '{
                    alert_type: "startup_health_check",
                    status: $status,
                    issues: $issues,
                    requires_attention: true
                }')" \
            "$event_id" \
            "high")

        echo "$alert_event" | "$PROJECT_ROOT/scripts/events/lib/event-logger.sh"
        log "Health alert created"
    fi

    # Initialize/update system status
    local status_file="$PROJECT_ROOT/coordination/status.json"
    local status_data
    status_data=$(jq -n \
        --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --arg component "$component" \
        --arg version "$version" \
        --arg health "$health_status" \
        '{
            last_startup: $ts,
            component: $component,
            version: $version,
            health_status: $health,
            state: "running"
        }')

    echo "$status_data" > "$status_file"
    log "System status updated"

    # Clean up stale PID files if this is a restart
    if [[ "$startup_mode" == "restart" ]]; then
        log "Cleaning up stale PID files..."
        local pid_dir="$PROJECT_ROOT/coordination/pids"
        if [[ -d "$pid_dir" ]]; then
            for pid_file in "$pid_dir"/*.pid; do
                if [[ -f "$pid_file" ]]; then
                    local pid
                    pid=$(cat "$pid_file" 2>/dev/null || echo "")
                    if [[ -n "$pid" ]] && ! ps -p "$pid" > /dev/null 2>&1; then
                        rm -f "$pid_file"
                        log "Removed stale PID file: $(basename "$pid_file")"
                    fi
                fi
            done
        fi
        log "PID cleanup complete"
    fi

    # Update startup statistics
    local stats_file="$PROJECT_ROOT/coordination/metrics/startup-stats.json"
    mkdir -p "$(dirname "$stats_file")"

    if [[ ! -f "$stats_file" ]]; then
        echo '{"total_startups": 0, "by_mode": {}, "last_startup": ""}' > "$stats_file"
    fi

    local temp_file
    temp_file=$(mktemp)

    jq --arg mode "$startup_mode" \
        --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        '
        .total_startups += 1 |
        .by_mode[$mode] = ((.by_mode[$mode] // 0) + 1) |
        .last_startup = $ts
        ' "$stats_file" > "$temp_file"

    mv "$temp_file" "$stats_file"
    log "Startup statistics updated"

    # Log to dashboard events
    local dashboard_log="$PROJECT_ROOT/coordination/dashboard-events.jsonl"
    local dashboard_entry
    dashboard_entry=$(jq -n \
        --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --arg event_type "system_startup" \
        --arg component "$component" \
        --arg version "$version" \
        --arg health "$health_status" \
        '{
            timestamp: $ts,
            event_type: $event_type,
            component: $component,
            version: $version,
            health_status: $health
        }')

    echo "$dashboard_entry" | jq -c '.' >> "$dashboard_log"
    log "Dashboard event logged"

    log "System startup complete - $component is now running"
    log "Handler completed successfully"
    return 0
}

# Main execution
if [[ $# -eq 0 ]]; then
    echo "Usage: $0 <event_file>" >&2
    exit 1
fi

handle_system_startup "$1"
