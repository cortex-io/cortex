#!/usr/bin/env bash
# Handler for system.cleanup_needed events
# Performs system cleanup tasks
# Replaces: cleanup-daemon.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

log() {
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [on-cleanup-needed] $*" >&2
}

handle_cleanup() {
    local event_file="$1"
    local event_json

    event_json=$(cat "$event_file")

    # Extract event data
    local event_id cleanup_type target
    event_id=$(echo "$event_json" | jq -r '.event_id')
    cleanup_type=$(echo "$event_json" | jq -r '.payload.cleanup_type // "general"')
    target=$(echo "$event_json" | jq -r '.payload.target // "all"')

    log "Cleanup requested: type=$cleanup_type, target=$target"

    # Perform cleanup based on type
    case "$cleanup_type" in
        "old_events")
            log "Cleaning up old events..."
            # Archive events older than 30 days
            local archive_date
            archive_date=$(date -u -d "30 days ago" +"%Y-%m-%d" 2>/dev/null || date -u -v-30d +"%Y-%m-%d")

            local events_dir="$PROJECT_ROOT/coordination/events"
            local archive_dir="$events_dir/archive"

            mkdir -p "$archive_dir"

            # Compress old event logs
            for event_log in "$events_dir"/*.jsonl; do
                if [[ -f "$event_log" ]]; then
                    local base_name
                    base_name=$(basename "$event_log")

                    # Create date-based archive
                    gzip -c "$event_log" > "$archive_dir/${base_name%.jsonl}-$archive_date.jsonl.gz" 2>/dev/null || true

                    # Keep only recent events (last 10000 lines)
                    tail -10000 "$event_log" > "${event_log}.tmp"
                    mv "${event_log}.tmp" "$event_log"

                    log "Archived and rotated: $base_name"
                fi
            done
            ;;

        "failed_workers")
            log "Cleaning up failed workers..."
            # Archive failed worker data
            local workers_dir="$PROJECT_ROOT/coordination/workers"
            local failed_archive="$workers_dir/failed-archive"

            mkdir -p "$failed_archive"

            # Move failed worker files to archive
            find "$workers_dir" -name "*failed*" -type f -mtime +7 -exec mv {} "$failed_archive/" \; 2>/dev/null || true
            log "Failed workers archived"
            ;;

        "stale_tasks")
            log "Cleaning up stale tasks..."
            # Remove tasks stuck in pending for too long
            local task_queue="$PROJECT_ROOT/coordination/task-queue.json"

            if [[ -f "$task_queue" ]]; then
                local temp_file
                temp_file=$(mktemp)

                local cutoff_time
                cutoff_time=$(date -u -d "24 hours ago" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -v-24H +"%Y-%m-%dT%H:%M:%SZ")

                jq --arg cutoff "$cutoff_time" '
                    .tasks |= map(
                        if (.status == "pending" and .created_at < $cutoff) then
                            .status = "expired" |
                            .expired_at = (now | todate)
                        else
                            .
                        end
                    )
                ' "$task_queue" > "$temp_file"

                mv "$temp_file" "$task_queue"
                log "Stale tasks marked as expired"
            fi
            ;;

        "temp_files")
            log "Cleaning up temporary files..."
            # Remove old temp files
            find /tmp -name "cortex-*" -type f -mtime +1 -delete 2>/dev/null || true
            find "$PROJECT_ROOT" -name "*.tmp" -type f -mtime +1 -delete 2>/dev/null || true
            log "Temporary files cleaned"
            ;;

        "general")
            log "Performing general cleanup..."
            # Run all cleanup tasks
            handle_cleanup "$(echo '{"payload":{"cleanup_type":"old_events"}}' | jq '.')"
            handle_cleanup "$(echo '{"payload":{"cleanup_type":"failed_workers"}}' | jq '.')"
            handle_cleanup "$(echo '{"payload":{"cleanup_type":"stale_tasks"}}' | jq '.')"
            handle_cleanup "$(echo '{"payload":{"cleanup_type":"temp_files"}}' | jq '.')"
            ;;

        *)
            log "Unknown cleanup type: $cleanup_type"
            return 1
            ;;
    esac

    # Record cleanup completion
    local cleanup_log="$PROJECT_ROOT/coordination/system-maintenance.jsonl"
    mkdir -p "$(dirname "$cleanup_log")"

    local cleanup_entry
    cleanup_entry=$(jq -n \
        --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --arg type "$cleanup_type" \
        --arg target "$target" \
        '{
            timestamp: $ts,
            action: "cleanup",
            cleanup_type: $type,
            target: $target,
            status: "completed"
        }')

    echo "$cleanup_entry" | jq -c '.' >> "$cleanup_log"

    log "Cleanup completed: $cleanup_type"
    return 0
}

# Main execution
if [[ $# -eq 0 ]]; then
    echo "Usage: $0 <event_file>" >&2
    exit 1
fi

handle_cleanup "$1"
