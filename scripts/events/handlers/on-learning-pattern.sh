#!/usr/bin/env bash
# Handler for learning.pattern_detected events
# Processes learning patterns and updates models
# Replaces: auto-learning-daemon.sh functionality

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

log() {
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [on-learning-pattern] $*" >&2
}

handle_learning_pattern() {
    local event_file="$1"
    local event_json

    event_json=$(cat "$event_file")

    # Extract event data
    local event_id pattern_type worker_id task_id outcome
    event_id=$(echo "$event_json" | jq -r '.event_id')
    pattern_type=$(echo "$event_json" | jq -r '.payload.pattern_type // "performance"')
    worker_id=$(echo "$event_json" | jq -r '.payload.worker_id // "unknown"')
    task_id=$(echo "$event_json" | jq -r '.correlation_id // .payload.task_id // "unknown"')
    outcome=$(echo "$event_json" | jq -r '.payload.outcome // "unknown"')

    log "Learning pattern detected: type=$pattern_type, worker=$worker_id, outcome=$outcome"

    # Record pattern in learning database
    local learning_db="$PROJECT_ROOT/coordination/moe-learning/patterns.jsonl"
    mkdir -p "$(dirname "$learning_db")"

    local pattern_entry
    pattern_entry=$(jq -n \
        --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --arg type "$pattern_type" \
        --arg worker "$worker_id" \
        --arg task "$task_id" \
        --arg outcome "$outcome" \
        --argjson payload "$(echo "$event_json" | jq '.payload')" \
        '{
            timestamp: $ts,
            pattern_type: $type,
            worker_id: $worker,
            task_id: $task,
            outcome: $outcome,
            details: $payload
        }')

    echo "$pattern_entry" | jq -c '.' >> "$learning_db"
    log "Pattern recorded in learning database"

    # Analyze patterns for worker optimization
    case "$pattern_type" in
        "performance")
            log "Analyzing performance pattern..."

            # Check if worker consistently performs well
            local recent_patterns
            recent_patterns=$(tail -100 "$learning_db" | \
                jq -s --arg worker "$worker_id" \
                'map(select(.worker_id == $worker)) |
                 map(select(.outcome == "success")) |
                 length')

            if [[ "$recent_patterns" -gt 10 ]]; then
                log "Worker $worker_id shows consistent good performance ($recent_patterns successful patterns)"

                # Update worker confidence score
                local worker_metrics="$PROJECT_ROOT/coordination/metrics/worker-confidence.json"
                mkdir -p "$(dirname "$worker_metrics")"

                if [[ ! -f "$worker_metrics" ]]; then
                    echo '{"workers": {}}' > "$worker_metrics"
                fi

                local temp_file
                temp_file=$(mktemp)

                jq --arg worker "$worker_id" \
                    --argjson confidence "0.95" \
                    '.workers[$worker] = {
                        confidence: $confidence,
                        last_updated: (now | todate),
                        successful_patterns: '"$recent_patterns"'
                    }' "$worker_metrics" > "$temp_file"

                mv "$temp_file" "$worker_metrics"
                log "Worker confidence updated: $worker_id -> 0.95"
            fi
            ;;

        "failure")
            log "Analyzing failure pattern..."

            # Check for repeated failures
            local recent_failures
            recent_failures=$(tail -100 "$learning_db" | \
                jq -s --arg worker "$worker_id" \
                'map(select(.worker_id == $worker and .outcome == "failure")) |
                 length')

            if [[ "$recent_failures" -gt 5 ]]; then
                log "WARNING: Worker $worker_id has $recent_failures recent failures"

                # Create health alert
                local alert_event
                alert_event=$("$PROJECT_ROOT/scripts/events/lib/event-logger.sh" --create \
                    "system.health_alert" \
                    "on-learning-pattern-handler" \
                    "$(jq -n \
                        --arg worker "$worker_id" \
                        --argjson count "$recent_failures" \
                        '{
                            alert_type: "repeated_worker_failures",
                            worker_id: $worker,
                            failure_count: $count,
                            recommendation: "Review worker configuration and reduce task allocation"
                        }')" \
                    "$worker_id" \
                    "high")

                echo "$alert_event" | "$PROJECT_ROOT/scripts/events/lib/event-logger.sh"
                log "Health alert created for worker failures"
            fi
            ;;

        "optimization")
            log "Processing optimization pattern..."

            # Extract optimization insights from pattern
            local optimization=$(echo "$event_json" | jq -r '.payload.optimization // "none"')

            if [[ "$optimization" != "none" ]]; then
                # Record optimization insight
                local insights_file="$PROJECT_ROOT/coordination/moe-insights.md"

                echo "## Optimization Insight - $(date -u +"%Y-%m-%d %H:%M:%S")" >> "$insights_file"
                echo "" >> "$insights_file"
                echo "**Worker**: $worker_id" >> "$insights_file"
                echo "**Task**: $task_id" >> "$insights_file"
                echo "**Optimization**: $optimization" >> "$insights_file"
                echo "" >> "$insights_file"

                log "Optimization insight recorded"
            fi
            ;;

        *)
            log "Unknown pattern type: $pattern_type"
            ;;
    esac

    # Update learning metrics
    local metrics_file="$PROJECT_ROOT/coordination/metrics/learning-stats.json"
    mkdir -p "$(dirname "$metrics_file")"

    if [[ ! -f "$metrics_file" ]]; then
        echo '{"total_patterns": 0, "by_type": {}, "last_updated": ""}' > "$metrics_file"
    fi

    local temp_file
    temp_file=$(mktemp)

    jq --arg type "$pattern_type" \
        '.total_patterns += 1 |
         .by_type[$type] = ((.by_type[$type] // 0) + 1) |
         .last_updated = (now | todate)' "$metrics_file" > "$temp_file"

    mv "$temp_file" "$metrics_file"

    log "Handler completed successfully"
    return 0
}

# Main execution
if [[ $# -eq 0 ]]; then
    echo "Usage: $0 <event_file>" >&2
    exit 1
fi

handle_learning_pattern "$1"
