#!/usr/bin/env bash
# Handler for learning.model_updated events
# Tracks model updates and learning progress

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

log() {
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [on-learning-model-updated] $*" >&2
}

handle_learning_model_updated() {
    local event_file="$1"
    local event_json

    event_json=$(cat "$event_file")

    # Extract event data
    local event_id model_id model_type version performance_delta
    event_id=$(echo "$event_json" | jq -r '.event_id')
    model_id=$(echo "$event_json" | jq -r '.payload.model_id // "unknown"')
    model_type=$(echo "$event_json" | jq -r '.payload.model_type // "unknown"')
    version=$(echo "$event_json" | jq -r '.payload.version // "unknown"')
    performance_delta=$(echo "$event_json" | jq -r '.payload.performance_delta // 0')

    log "Learning model updated: $model_id (type: $model_type, version: $version, delta: $performance_delta)"

    # Record model update
    local updates_file="$PROJECT_ROOT/coordination/moe-learning/model-updates.jsonl"
    mkdir -p "$(dirname "$updates_file")"

    local update_entry
    update_entry=$(jq -n \
        --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --arg model "$model_id" \
        --arg type "$model_type" \
        --arg version "$version" \
        --argjson delta "$performance_delta" \
        --argjson payload "$(echo "$event_json" | jq '.payload')" \
        '{
            timestamp: $ts,
            model_id: $model,
            model_type: $type,
            version: $version,
            performance_delta: $delta,
            details: $payload
        }')

    echo "$update_entry" | jq -c '.' >> "$updates_file"
    log "Model update recorded"

    # Update model registry
    local registry_file="$PROJECT_ROOT/coordination/moe-learning/model-registry.json"
    mkdir -p "$(dirname "$registry_file")"

    if [[ ! -f "$registry_file" ]]; then
        echo '{"models": [], "last_updated": ""}' > "$registry_file"
    fi

    local temp_file
    temp_file=$(mktemp)

    # Update existing model or add new one
    jq --arg model "$model_id" \
        --arg type "$model_type" \
        --arg version "$version" \
        --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --argjson delta "$performance_delta" \
        '
        .models |= map(
            if .model_id == $model then
                .version = $version |
                .last_updated = $ts |
                .performance_delta = $delta
            else
                .
            end
        ) |
        if (.models | any(.model_id == $model)) | not then
            .models += [{
                model_id: $model,
                model_type: $type,
                version: $version,
                last_updated: $ts,
                performance_delta: $delta
            }]
        else
            .
        end |
        .last_updated = $ts
        ' "$registry_file" > "$temp_file"

    mv "$temp_file" "$registry_file"
    log "Model registry updated"

    # Update learning statistics
    local stats_file="$PROJECT_ROOT/coordination/metrics/learning-stats.json"
    mkdir -p "$(dirname "$stats_file")"

    if [[ ! -f "$stats_file" ]]; then
        echo '{"total_updates": 0, "by_model_type": {}, "total_performance_improvement": 0}' > "$stats_file"
    fi

    temp_file=$(mktemp)

    jq --arg type "$model_type" \
        --argjson delta "$performance_delta" \
        '
        .total_updates += 1 |
        .by_model_type[$type] = ((.by_model_type[$type] // 0) + 1) |
        .total_performance_improvement += $delta
        ' "$stats_file" > "$temp_file"

    mv "$temp_file" "$stats_file"
    log "Learning statistics updated"

    # Create performance tracking entry
    local performance_file="$PROJECT_ROOT/coordination/moe-learning/performance-tracking.jsonl"
    mkdir -p "$(dirname "$performance_file")"

    local performance_entry
    performance_entry=$(jq -n \
        --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --arg model "$model_id" \
        --arg type "$model_type" \
        --arg version "$version" \
        --argjson delta "$performance_delta" \
        '{
            timestamp: $ts,
            model_id: $model,
            model_type: $type,
            version: $version,
            performance_delta: $delta
        }')

    echo "$performance_entry" | jq -c '.' >> "$performance_file"
    log "Performance tracking entry recorded"

    # Check for significant improvement and create alert
    if (( $(echo "$performance_delta > 0.1" | bc -l) )); then
        log "Significant performance improvement detected: $performance_delta"

        local alert_event
        alert_event=$("$PROJECT_ROOT/scripts/events/lib/event-logger.sh" --create \
            "system.health_alert" \
            "on-learning-model-updated-handler" \
            "$(jq -n \
                --arg model "$model_id" \
                --arg type "$model_type" \
                --argjson delta "$performance_delta" \
                '{
                    alert_type: "learning_improvement",
                    model_id: $model,
                    model_type: $type,
                    performance_delta: $delta,
                    message: "Model showing significant improvement"
                }')" \
            "$event_id" \
            "medium")

        echo "$alert_event" | "$PROJECT_ROOT/scripts/events/lib/event-logger.sh"
        log "Performance improvement alert created"
    fi

    # Log to dashboard
    local dashboard_log="$PROJECT_ROOT/coordination/dashboard-events.jsonl"
    local dashboard_entry
    dashboard_entry=$(jq -n \
        --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --arg event_type "learning_model_updated" \
        --arg model "$model_id" \
        --arg type "$model_type" \
        --arg version "$version" \
        '{
            timestamp: $ts,
            event_type: $event_type,
            model_id: $model,
            model_type: $type,
            version: $version
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

handle_learning_model_updated "$1"
