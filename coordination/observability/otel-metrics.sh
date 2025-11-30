#!/usr/bin/env bash
# OpenTelemetry Metrics
# Converts existing Cortex metrics to OpenTelemetry format

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/otel-context.sh"
source "$SCRIPT_DIR/otel-exporter.sh"

# Get project root
if [[ -z "${PROJECT_ROOT:-}" ]]; then
    PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
fi

METRICS_DIR="$PROJECT_ROOT/coordination/metrics"

# ==============================================================================
# METRIC TYPES
# ==============================================================================

# Create a counter metric
# Args: name, value, attributes_json, description
create_counter() {
    local name="$1"
    local value="$2"
    local attributes="${3:-{}}"
    local description="${4:-}"
    local timestamp=$(generate_timestamp_iso)

    jq -nc \
        --arg name "$name" \
        --argjson value "$value" \
        --arg timestamp "$timestamp" \
        --arg description "$description" \
        --argjson attributes "$attributes" \
        '{
            type: "counter",
            name: $name,
            description: $description,
            value: $value,
            timestamp: $timestamp,
            attributes: $attributes
        }'
}

# Create a gauge metric
# Args: name, value, attributes_json, description
create_gauge() {
    local name="$1"
    local value="$2"
    local attributes="${3:-{}}"
    local description="${4:-}"
    local timestamp=$(generate_timestamp_iso)

    jq -nc \
        --arg name "$name" \
        --argjson value "$value" \
        --arg timestamp "$timestamp" \
        --arg description "$description" \
        --argjson attributes "$attributes" \
        '{
            type: "gauge",
            name: $name,
            description: $description,
            value: $value,
            timestamp: $timestamp,
            attributes: $attributes
        }'
}

# Create a histogram metric
# Args: name, value, attributes_json, description
create_histogram() {
    local name="$1"
    local value="$2"
    local attributes="${3:-{}}"
    local description="${4:-}"
    local timestamp=$(generate_timestamp_iso)

    jq -nc \
        --arg name "$name" \
        --argjson value "$value" \
        --arg timestamp "$timestamp" \
        --arg description "$description" \
        --argjson attributes "$attributes" \
        '{
            type: "histogram",
            name: $name,
            description: $description,
            value: $value,
            timestamp: $timestamp,
            attributes: $attributes
        }'
}

# ==============================================================================
# CORTEX-SPECIFIC METRICS
# ==============================================================================

# Task completion counter
record_task_completed() {
    local task_id="$1"
    local master_name="$2"
    local duration_seconds="${3:-0}"

    local attributes=$(jq -nc \
        --arg task_id "$task_id" \
        --arg master "$master_name" \
        '{
            "cortex.task_id": $task_id,
            "cortex.master": $master
        }')

    local metric=$(create_counter "cortex.tasks.completed" 1 "$attributes" "Number of tasks completed")
    export_metric "$metric"

    # Also record duration as histogram
    if [[ "$duration_seconds" -gt 0 ]]; then
        local duration_metric=$(create_histogram "cortex.task.duration" "$duration_seconds" "$attributes" "Task duration in seconds")
        export_metric "$duration_metric"
    fi
}

# Task failure counter
record_task_failed() {
    local task_id="$1"
    local master_name="$2"
    local error_type="${3:-unknown}"

    local attributes=$(jq -nc \
        --arg task_id "$task_id" \
        --arg master "$master_name" \
        --arg error_type "$error_type" \
        '{
            "cortex.task_id": $task_id,
            "cortex.master": $master,
            "error.type": $error_type
        }')

    local metric=$(create_counter "cortex.tasks.failed" 1 "$attributes" "Number of tasks failed")
    export_metric "$metric"
}

# Worker pool size gauge
record_worker_pool_size() {
    local pool_size="$1"
    local worker_type="${2:-all}"

    local attributes=$(jq -nc \
        --arg worker_type "$worker_type" \
        '{
            "cortex.worker_type": $worker_type
        }')

    local metric=$(create_gauge "cortex.workers.active" "$pool_size" "$attributes" "Number of active workers")
    export_metric "$metric"
}

# Token usage counter
record_token_usage() {
    local tokens="$1"
    local model="${2:-unknown}"
    local operation="${3:-unknown}"

    local attributes=$(jq -nc \
        --arg model "$model" \
        --arg operation "$operation" \
        '{
            "llm.model": $model,
            "cortex.operation": $operation
        }')

    local metric=$(create_counter "cortex.tokens.used" "$tokens" "$attributes" "Number of LLM tokens used")
    export_metric "$metric"
}

# MoE routing confidence histogram
record_routing_confidence() {
    local confidence="$1"
    local selected_master="$2"
    local task_type="${3:-unknown}"

    local attributes=$(jq -nc \
        --arg master "$selected_master" \
        --arg task_type "$task_type" \
        '{
            "cortex.master": $master,
            "cortex.task_type": $task_type
        }')

    local metric=$(create_histogram "cortex.routing.confidence" "$confidence" "$attributes" "MoE routing confidence score")
    export_metric "$metric"
}

# ==============================================================================
# METRIC CONVERSION
# ==============================================================================

# Convert existing metrics file to OTel format
convert_metrics_file() {
    local input_file="$1"
    local output_file="${2:-}"

    if [[ ! -f "$input_file" ]]; then
        echo "Error: Metrics file not found: $input_file" >&2
        return 1
    fi

    local timestamp=$(generate_timestamp_iso)

    # Read existing metrics and convert
    jq -r 'to_entries[] | "\(.key):\(.value)"' "$input_file" | while IFS=: read -r key value; do
        # Determine metric type and convert
        case "$key" in
            *_count|*_total)
                create_counter "$key" "$value" "{}" "Converted from legacy metrics"
                ;;
            *_active|*_size|*_current)
                create_gauge "$key" "$value" "{}" "Converted from legacy metrics"
                ;;
            *_duration|*_latency|*_time)
                create_histogram "$key" "$value" "{}" "Converted from legacy metrics"
                ;;
            *)
                create_gauge "$key" "$value" "{}" "Converted from legacy metrics"
                ;;
        esac
    done
}

# Batch convert all metrics files
batch_convert_metrics() {
    local converted_count=0

    for metrics_file in "$METRICS_DIR"/*.json; do
        [[ ! -f "$metrics_file" ]] && continue

        echo "Converting: $(basename "$metrics_file")" >&2
        convert_metrics_file "$metrics_file" | while read -r metric; do
            export_metric "$metric"
            ((converted_count++))
        done
    done

    echo "Converted $converted_count metrics" >&2
}

# ==============================================================================
# EXPORTS
# ==============================================================================

export -f create_counter
export -f create_gauge
export -f create_histogram
export -f record_task_completed
export -f record_task_failed
export -f record_worker_pool_size
export -f record_token_usage
export -f record_routing_confidence
export -f convert_metrics_file
export -f batch_convert_metrics

# ==============================================================================
# MAIN (if executed directly)
# ==============================================================================

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    case "${1:-}" in
        convert)
            if [[ -n "${2:-}" ]]; then
                convert_metrics_file "$2"
            else
                batch_convert_metrics
            fi
            ;;
        test)
            # Test metric creation
            record_task_completed "test-task-001" "test-master" 45
            record_worker_pool_size 4 "implementation-worker"
            record_routing_confidence 0.92 "security-master" "vulnerability-scan"
            ;;
        *)
            echo "Usage: $0 {convert [file]|test}"
            exit 1
            ;;
    esac
fi
