#!/usr/bin/env bash
# Handler for worker.started events
# Tracks worker startups and initializes worker tracking

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

log() {
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [on-worker-started] $*" >&2
}

handle_worker_started() {
    local event_file="$1"
    local event_json

    event_json=$(cat "$event_file")

    # Extract event data
    local event_id worker_id task_id worker_type master
    event_id=$(echo "$event_json" | jq -r '.event_id')
    worker_id=$(echo "$event_json" | jq -r '.payload.worker_id // .source')
    task_id=$(echo "$event_json" | jq -r '.correlation_id // .payload.task_id // "unknown"')
    worker_type=$(echo "$event_json" | jq -r '.payload.worker_type // "unknown"')
    master=$(echo "$event_json" | jq -r '.metadata.master // "unknown"')

    log "Worker started: $worker_id (type: $worker_type, task: $task_id, master: $master)"

    # Record worker startup
    local startups_file="$PROJECT_ROOT/coordination/metrics/worker-startups.jsonl"
    mkdir -p "$(dirname "$startups_file")"

    local startup_entry
    startup_entry=$(jq -n \
        --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --arg worker "$worker_id" \
        --arg task "$task_id" \
        --arg type "$worker_type" \
        --arg master "$master" \
        '{
            timestamp: $ts,
            worker_id: $worker,
            task_id: $task,
            worker_type: $type,
            master: $master,
            event: "started"
        }')

    echo "$startup_entry" | jq -c '.' >> "$startups_file"
    log "Worker startup recorded"

    # Update worker pool status
    local pool_file="$PROJECT_ROOT/coordination/worker-pool.json"
    if [[ -f "$pool_file" ]]; then
        local temp_file
        temp_file=$(mktemp)

        # Check if worker exists, if not add it
        local worker_exists
        worker_exists=$(jq --arg worker "$worker_id" '.workers // [] | any(.id == $worker)' "$pool_file")

        if [[ "$worker_exists" == "true" ]]; then
            # Update existing worker
            jq --arg worker "$worker_id" \
                --arg task "$task_id" \
                --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
                '
                .workers |= map(
                    if .id == $worker then
                        .status = "running" |
                        .current_task = $task |
                        .last_started = $ts
                    else
                        .
                    end
                )
                ' "$pool_file" > "$temp_file"
        else
            # Add new worker
            jq --arg worker "$worker_id" \
                --arg task "$task_id" \
                --arg type "$worker_type" \
                --arg master "$master" \
                --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
                '
                .workers += [{
                    id: $worker,
                    type: $type,
                    master: $master,
                    status: "running",
                    current_task: $task,
                    last_started: $ts,
                    created_at: $ts
                }]
                ' "$pool_file" > "$temp_file"
        fi

        mv "$temp_file" "$pool_file"
        log "Worker pool updated: $worker_id marked running"
    fi

    # Update worker statistics
    local stats_file="$PROJECT_ROOT/coordination/metrics/worker-stats.json"
    mkdir -p "$(dirname "$stats_file")"

    if [[ ! -f "$stats_file" ]]; then
        echo '{"total_worker_starts": 0, "by_type": {}, "by_master": {}}' > "$stats_file"
    fi

    local temp_file
    temp_file=$(mktemp)

    jq --arg type "$worker_type" \
        --arg master "$master" \
        '
        .total_worker_starts += 1 |
        .by_type[$type] = ((.by_type[$type] // 0) + 1) |
        .by_master[$master] = ((.by_master[$master] // 0) + 1)
        ' "$stats_file" > "$temp_file"

    mv "$temp_file" "$stats_file"
    log "Worker statistics updated"

    # Log to dashboard
    local dashboard_log="$PROJECT_ROOT/coordination/dashboard-events.jsonl"
    local dashboard_entry
    dashboard_entry=$(jq -n \
        --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --arg event_type "worker_started" \
        --arg worker "$worker_id" \
        --arg task "$task_id" \
        --arg type "$worker_type" \
        --arg master "$master" \
        '{
            timestamp: $ts,
            event_type: $event_type,
            worker_id: $worker,
            task_id: $task,
            worker_type: $type,
            master: $master
        }')

    echo "$dashboard_entry" | jq -c '.' >> "$dashboard_log"
    log "Dashboard event logged"

    log "Handler completed successfully"
    return 0
}

# Main execution
if [[ $# -eq 0 ]]; then
    echo "Usage: $0 <event_file>" >&2
    exit 1
fi

handle_worker_started "$1"
