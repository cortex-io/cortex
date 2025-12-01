#!/usr/bin/env bash
# Handler for worker.heartbeat events
# Monitors worker health and detects stale workers
# Replaces: heartbeat-monitor-daemon.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

log() {
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [on-worker-heartbeat] $*" >&2
}

handle_worker_heartbeat() {
    local event_file="$1"
    local event_json

    event_json=$(cat "$event_file")

    # Extract event data
    local event_id worker_id timestamp heartbeat_time
    event_id=$(echo "$event_json" | jq -r '.event_id')
    worker_id=$(echo "$event_json" | jq -r '.source // .payload.worker_id')
    timestamp=$(echo "$event_json" | jq -r '.timestamp')
    heartbeat_time=$(echo "$event_json" | jq -r '.payload.heartbeat_time // .timestamp')

    log "Heartbeat received: $worker_id at $heartbeat_time"

    # Update worker health status
    local health_file="$PROJECT_ROOT/coordination/worker-health-metrics.jsonl"
    mkdir -p "$(dirname "$health_file")"

    local health_entry
    health_entry=$(jq -n \
        --arg ts "$timestamp" \
        --arg worker "$worker_id" \
        --arg hb_time "$heartbeat_time" \
        '{
            timestamp: $ts,
            worker_id: $worker,
            heartbeat_time: $hb_time,
            status: "healthy"
        }')

    echo "$health_entry" | jq -c '.' >> "$health_file"

    # Update worker pool with last heartbeat
    local pool_file="$PROJECT_ROOT/coordination/worker-pool.json"
    if [[ -f "$pool_file" ]]; then
        local temp_file
        temp_file=$(mktemp)

        jq --arg worker "$worker_id" \
            --arg ts "$timestamp" \
            '
            .workers |= map(
                if .id == $worker then
                    .last_heartbeat = $ts |
                    .status = "healthy"
                else
                    .
                end
            )
            ' "$pool_file" > "$temp_file"

        mv "$temp_file" "$pool_file"
        log "Worker pool updated: $worker_id heartbeat recorded"
    fi

    # Check for stale workers (no heartbeat in last 5 minutes)
    local stale_threshold
    stale_threshold=$(date -u -d "5 minutes ago" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -v-5M +"%Y-%m-%dT%H:%M:%SZ")

    if [[ -f "$health_file" ]]; then
        # Find workers that haven't sent heartbeat recently
        local stale_workers
        stale_workers=$(tail -100 "$health_file" | jq -s \
            --arg threshold "$stale_threshold" \
            'group_by(.worker_id) |
             map({
                 worker_id: .[0].worker_id,
                 last_heartbeat: (.[0].heartbeat_time // .[0].timestamp)
             }) |
             map(select(.last_heartbeat < $threshold)) |
             .[].worker_id' 2>/dev/null || echo "[]")

        if [[ "$stale_workers" != "[]" && "$stale_workers" != "" ]]; then
            log "WARNING: Stale workers detected: $stale_workers"

            # Create health alert event for stale workers
            local alert_event
            alert_event=$("$PROJECT_ROOT/scripts/events/lib/event-logger.sh" --create \
                "system.health_alert" \
                "on-worker-heartbeat-handler" \
                "$(jq -n \
                    --argjson workers "$stale_workers" \
                    '{
                        alert_type: "stale_workers",
                        workers: $workers,
                        threshold_minutes: 5
                    }')" \
                "system" \
                "high")

            echo "$alert_event" | "$PROJECT_ROOT/scripts/events/lib/event-logger.sh"
            log "Health alert created for stale workers"
        fi
    fi

    log "Handler completed successfully"
    return 0
}

# Main execution
if [[ $# -eq 0 ]]; then
    echo "Usage: $0 <event_file>" >&2
    exit 1
fi

handle_worker_heartbeat "$1"
