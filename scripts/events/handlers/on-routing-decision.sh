#!/usr/bin/env bash
# Handler for routing.decision_made events
# Updates routing models and confidence scores
# Replaces: moe-learning-daemon.sh functionality

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

log() {
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [on-routing-decision] $*" >&2
}

handle_routing_decision() {
    local event_file="$1"
    local event_json

    event_json=$(cat "$event_file")

    # Extract event data
    local event_id task_id master confidence routing_reason
    event_id=$(echo "$event_json" | jq -r '.event_id')
    task_id=$(echo "$event_json" | jq -r '.correlation_id // .payload.task_id')
    master=$(echo "$event_json" | jq -r '.metadata.master // .payload.master')
    confidence=$(echo "$event_json" | jq -r '.payload.confidence // 0')
    routing_reason=$(echo "$event_json" | jq -r '.payload.routing_reason // "unspecified"')

    log "Routing decision: task=$task_id, master=$master, confidence=$confidence"

    # Record routing decision
    local routing_log="$PROJECT_ROOT/coordination/routing/routing-decisions.jsonl"
    mkdir -p "$(dirname "$routing_log")"

    local routing_entry
    routing_entry=$(jq -n \
        --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --arg task "$task_id" \
        --arg master "$master" \
        --argjson confidence "$confidence" \
        --arg reason "$routing_reason" \
        '{
            timestamp: $ts,
            task_id: $task,
            master: $master,
            confidence: $confidence,
            routing_reason: $reason
        }')

    echo "$routing_entry" | jq -c '.' >> "$routing_log"
    log "Routing decision recorded"

    # Update master routing statistics
    local routing_stats="$PROJECT_ROOT/coordination/metrics/routing-stats.json"
    mkdir -p "$(dirname "$routing_stats")"

    if [[ ! -f "$routing_stats" ]]; then
        echo '{"masters": {}, "total_decisions": 0}' > "$routing_stats"
    fi

    local temp_file
    temp_file=$(mktemp)

    jq --arg master "$master" \
        --argjson confidence "$confidence" \
        '
        .total_decisions += 1 |
        .masters[$master] = {
            decision_count: ((.masters[$master].decision_count // 0) + 1),
            avg_confidence: (
                ((.masters[$master].avg_confidence // 0) * (.masters[$master].decision_count // 0) + $confidence) /
                ((.masters[$master].decision_count // 0) + 1)
            ),
            last_updated: (now | todate)
        }
        ' "$routing_stats" > "$temp_file"

    mv "$temp_file" "$routing_stats"
    log "Routing statistics updated for master: $master"

    # Analyze routing confidence trends
    local recent_decisions
    recent_decisions=$(tail -50 "$routing_log" | \
        jq -s --arg master "$master" \
        'map(select(.master == $master)) | length')

    local avg_recent_confidence
    avg_recent_confidence=$(tail -50 "$routing_log" | \
        jq -s --arg master "$master" \
        'map(select(.master == $master)) |
         if length > 0 then (map(.confidence) | add / length) else 0 end')

    log "Master $master: $recent_decisions recent decisions, avg confidence: $avg_recent_confidence"

    # Alert if confidence is declining
    if (( $(echo "$avg_recent_confidence < 0.5" | bc -l 2>/dev/null || echo "0") )); then
        log "WARNING: Low routing confidence for master $master: $avg_recent_confidence"

        # Create health alert
        local alert_event
        alert_event=$("$PROJECT_ROOT/scripts/events/lib/event-logger.sh" --create \
            "system.health_alert" \
            "on-routing-decision-handler" \
            "$(jq -n \
                --arg master "$master" \
                --argjson confidence "$avg_recent_confidence" \
                '{
                    alert_type: "low_routing_confidence",
                    master: $master,
                    avg_confidence: $confidence,
                    recommendation: "Review routing thresholds and master capabilities"
                }')" \
            "$master" \
            "medium")

        echo "$alert_event" | "$PROJECT_ROOT/scripts/events/lib/event-logger.sh"
        log "Health alert created for low routing confidence"
    fi

    # Check for routing imbalance
    if [[ -f "$routing_stats" ]]; then
        # Get total decisions per master
        local decision_counts
        decision_counts=$(jq -r '.masters | to_entries[] | "\(.key):\(.value.decision_count)"' "$routing_stats")

        local max_decisions=0
        local min_decisions=999999

        while IFS=: read -r master_name count; do
            if [[ $count -gt $max_decisions ]]; then
                max_decisions=$count
            fi
            if [[ $count -lt $min_decisions ]]; then
                min_decisions=$count
            fi
        done <<< "$decision_counts"

        # Alert if imbalance is significant (>80% difference)
        if [[ $min_decisions -gt 0 ]]; then
            local imbalance_ratio
            imbalance_ratio=$(echo "scale=2; ($max_decisions - $min_decisions) / $min_decisions * 100" | bc -l 2>/dev/null || echo "0")

            if (( $(echo "$imbalance_ratio > 80" | bc -l 2>/dev/null || echo "0") )); then
                log "WARNING: Routing imbalance detected: ${imbalance_ratio}% difference"

                # Create performance insight
                local insight_event
                insight_event=$("$PROJECT_ROOT/scripts/events/lib/event-logger.sh" --create \
                    "learning.pattern_detected" \
                    "on-routing-decision-handler" \
                    "$(jq -n \
                        --argjson ratio "$imbalance_ratio" \
                        --argjson max "$max_decisions" \
                        --argjson min "$min_decisions" \
                        '{
                            pattern_type: "routing_imbalance",
                            imbalance_ratio: $ratio,
                            max_decisions: $max,
                            min_decisions: $min,
                            recommendation: "Consider adjusting routing thresholds to balance load"
                        }')" \
                    "routing-system" \
                    "low")

                echo "$insight_event" | "$PROJECT_ROOT/scripts/events/lib/event-logger.sh"
                log "Routing imbalance pattern recorded"
            fi
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

handle_routing_decision "$1"
