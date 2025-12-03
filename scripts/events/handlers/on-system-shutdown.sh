#!/usr/bin/env bash
# Handler for daemon.stopped / system shutdown events
# Performs cleanup, saves state, and logs shutdown

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

log() {
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [on-system-shutdown] $*" >&2
}

handle_system_shutdown() {
    local event_file="$1"
    local event_json

    event_json=$(cat "$event_file")

    # Extract event data
    local event_id component shutdown_reason graceful
    event_id=$(echo "$event_json" | jq -r '.event_id')
    component=$(echo "$event_json" | jq -r '.source // "cortex"')
    shutdown_reason=$(echo "$event_json" | jq -r '.payload.reason // "unknown"')
    graceful=$(echo "$event_json" | jq -r '.payload.graceful // "true"')

    log "System shutdown: $component (reason: $shutdown_reason, graceful: $graceful)"

    # Record shutdown event
    local shutdown_log="$PROJECT_ROOT/coordination/metrics/system-shutdowns.jsonl"
    mkdir -p "$(dirname "$shutdown_log")"

    local shutdown_entry
    shutdown_entry=$(jq -n \
        --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --arg component "$component" \
        --arg reason "$shutdown_reason" \
        --arg graceful "$graceful" \
        '{
            timestamp: $ts,
            component: $component,
            reason: $reason,
            graceful: $graceful,
            event: "shutdown"
        }')

    echo "$shutdown_entry" | jq -c '.' >> "$shutdown_log"
    log "Shutdown event recorded"

    # Save current system state
    log "Saving system state..."
    local state_backup_dir="$PROJECT_ROOT/coordination/history/shutdown-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$state_backup_dir"

    # Backup critical state files
    local critical_files=(
        "coordination/task-queue.json"
        "coordination/worker-pool.json"
        "coordination/status.json"
        "coordination/system-health.json"
        "coordination/pm-state.json"
    )

    for file in "${critical_files[@]}"; do
        local full_path="$PROJECT_ROOT/$file"
        if [[ -f "$full_path" ]]; then
            cp "$full_path" "$state_backup_dir/$(basename "$file")"
            log "Backed up: $file"
        fi
    done
    log "State backup complete: $state_backup_dir"

    # Cleanup temporary files
    log "Cleaning up temporary files..."
    local cleanup_patterns=(
        "$PROJECT_ROOT/coordination/events/queue/*.tmp"
        "$PROJECT_ROOT/coordination/temp/*"
        "/tmp/cortex-*.tmp"
    )

    local cleaned_count=0
    for pattern in "${cleanup_patterns[@]}"; do
        for file in $pattern 2>/dev/null; do
            if [[ -f "$file" ]]; then
                rm -f "$file"
                ((cleaned_count++))
            fi
        done
    done
    log "Cleanup complete: $cleaned_count temporary files removed"

    # Archive old events if graceful shutdown
    if [[ "$graceful" == "true" ]]; then
        log "Performing graceful shutdown cleanup..."

        # Archive events older than 7 days
        local archive_dir="$PROJECT_ROOT/coordination/events/archive"
        local cutoff_date
        cutoff_date=$(date -v-7d +%Y-%m-%d 2>/dev/null || date -d '7 days ago' +%Y-%m-%d 2>/dev/null || echo "")

        if [[ -n "$cutoff_date" && -d "$archive_dir" ]]; then
            local archived_count=0
            while IFS= read -r -d '' old_dir; do
                local dir_date
                dir_date=$(basename "$old_dir")
                if [[ "$dir_date" < "$cutoff_date" ]]; then
                    # Move to compressed archive
                    local archive_file="$archive_dir/../archive/${dir_date}.tar.gz"
                    mkdir -p "$archive_dir/../archive"
                    tar -czf "$archive_file" -C "$archive_dir" "$dir_date" 2>/dev/null || true
                    if [[ -f "$archive_file" ]]; then
                        rm -rf "$old_dir"
                        ((archived_count++))
                    fi
                fi
            done < <(find "$archive_dir" -mindepth 1 -maxdepth 1 -type d -print0 2>/dev/null || true)
            log "Archived $archived_count old event directories"
        fi
    fi

    # Check for active workers
    log "Checking for active workers..."
    local pool_file="$PROJECT_ROOT/coordination/worker-pool.json"
    local active_workers=0

    if [[ -f "$pool_file" ]]; then
        active_workers=$(jq -r '.workers // [] | map(select(.status == "busy" or .status == "running")) | length' "$pool_file" 2>/dev/null || echo "0")
    fi

    if [[ "$active_workers" -gt 0 ]]; then
        log "WARNING: $active_workers workers still active during shutdown"

        # Create alert for ungraceful shutdown with active workers
        local alert_event
        alert_event=$("$PROJECT_ROOT/scripts/events/lib/event-logger.sh" --create \
            "system.health_alert" \
            "on-system-shutdown-handler" \
            "$(jq -n \
                --argjson count "$active_workers" \
                --arg graceful "$graceful" \
                '{
                    alert_type: "shutdown_with_active_workers",
                    active_worker_count: $count,
                    graceful_shutdown: $graceful,
                    requires_investigation: true
                }')" \
            "$event_id" \
            "high")

        echo "$alert_event" | "$PROJECT_ROOT/scripts/events/lib/event-logger.sh"
        log "Alert created for active workers during shutdown"
    else
        log "All workers idle - clean shutdown"
    fi

    # Update system status
    local status_file="$PROJECT_ROOT/coordination/status.json"
    if [[ -f "$status_file" ]]; then
        local temp_file
        temp_file=$(mktemp)

        jq --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
            --arg reason "$shutdown_reason" \
            '
            .state = "stopped" |
            .last_shutdown = $ts |
            .shutdown_reason = $reason
            ' "$status_file" > "$temp_file"

        mv "$temp_file" "$status_file"
        log "System status updated"
    fi

    # Generate shutdown report
    local report_file="$state_backup_dir/shutdown-report.json"
    local report_data
    report_data=$(jq -n \
        --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --arg component "$component" \
        --arg reason "$shutdown_reason" \
        --arg graceful "$graceful" \
        --argjson active_workers "$active_workers" \
        --argjson cleaned "$cleaned_count" \
        '{
            timestamp: $ts,
            component: $component,
            shutdown_reason: $reason,
            graceful: $graceful,
            active_workers_at_shutdown: $active_workers,
            temp_files_cleaned: $cleaned,
            state_backup_location: "'"$state_backup_dir"'"
        }')

    echo "$report_data" > "$report_file"
    log "Shutdown report generated: $report_file"

    # Update shutdown statistics
    local stats_file="$PROJECT_ROOT/coordination/metrics/shutdown-stats.json"
    mkdir -p "$(dirname "$stats_file")"

    if [[ ! -f "$stats_file" ]]; then
        echo '{"total_shutdowns": 0, "graceful": 0, "ungraceful": 0, "by_reason": {}, "last_shutdown": ""}' > "$stats_file"
    fi

    local temp_file
    temp_file=$(mktemp)

    jq --arg graceful "$graceful" \
        --arg reason "$shutdown_reason" \
        --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        '
        .total_shutdowns += 1 |
        if $graceful == "true" then
            .graceful += 1
        else
            .ungraceful += 1
        end |
        .by_reason[$reason] = ((.by_reason[$reason] // 0) + 1) |
        .last_shutdown = $ts
        ' "$stats_file" > "$temp_file"

    mv "$temp_file" "$stats_file"
    log "Shutdown statistics updated"

    # Log to dashboard events
    local dashboard_log="$PROJECT_ROOT/coordination/dashboard-events.jsonl"
    local dashboard_entry
    dashboard_entry=$(jq -n \
        --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --arg event_type "system_shutdown" \
        --arg component "$component" \
        --arg reason "$shutdown_reason" \
        --arg graceful "$graceful" \
        '{
            timestamp: $ts,
            event_type: $event_type,
            component: $component,
            reason: $reason,
            graceful: $graceful
        }')

    echo "$dashboard_entry" | jq -c '.' >> "$dashboard_log"
    log "Dashboard event logged"

    log "System shutdown complete - $component has stopped"
    log "Handler completed successfully"
    return 0
}

# Main execution
if [[ $# -eq 0 ]]; then
    echo "Usage: $0 <event_file>" >&2
    exit 1
fi

handle_system_shutdown "$1"
