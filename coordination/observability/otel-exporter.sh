#!/usr/bin/env bash
# OpenTelemetry Exporter
# Exports spans and metrics to configured backends

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/otel-config.json"

# Get project root
if [[ -z "${PROJECT_ROOT:-}" ]]; then
    PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
fi

# ==============================================================================
# CONFIGURATION LOADING
# ==============================================================================

load_config() {
    if [[ ! -f "$CONFIG_FILE" ]]; then
        echo "Error: Config file not found: $CONFIG_FILE" >&2
        return 1
    fi

    cat "$CONFIG_FILE"
}

is_exporter_enabled() {
    local exporter_type="$1"
    local config=$(load_config)

    echo "$config" | jq -r ".exporters.${exporter_type}.enabled // false"
}

get_exporter_config() {
    local exporter_type="$1"
    local config=$(load_config)

    echo "$config" | jq ".exporters.${exporter_type}"
}

# ==============================================================================
# STDOUT EXPORTER
# ==============================================================================

export_to_stdout() {
    local span="$1"
    local format=$(get_exporter_config "stdout" | jq -r '.format // "json"')

    if [[ "$format" == "json" ]]; then
        echo "$span" | jq '.'
    else
        # Pretty format
        local trace_id=$(echo "$span" | jq -r '.trace_id')
        local span_id=$(echo "$span" | jq -r '.span_id')
        local name=$(echo "$span" | jq -r '.name')
        local status=$(echo "$span" | jq -r '.status.code')

        echo "[OTEL] Trace: $trace_id | Span: $span_id | Name: $name | Status: $status"
    fi
}

# ==============================================================================
# FILE EXPORTER
# ==============================================================================

export_to_file() {
    local span="$1"
    local data_type="${2:-trace}"  # trace or metric

    local config=$(get_exporter_config "file")
    local traces_path=$(echo "$config" | jq -r ".traces_path // \"coordination/observability/traces\"")
    local metrics_path=$(echo "$config" | jq -r ".metrics_path // \"coordination/observability/metrics\"")

    if [[ "$data_type" == "trace" ]]; then
        local output_dir="$PROJECT_ROOT/$traces_path"
        local trace_id=$(echo "$span" | jq -r '.trace_id')
        local output_file="$output_dir/${trace_id}.jsonl"

        mkdir -p "$output_dir"
        echo "$span" | jq -c '.' >> "$output_file"
    else
        local output_dir="$PROJECT_ROOT/$metrics_path"
        local timestamp=$(date +%Y%m%d)
        local output_file="$output_dir/metrics-${timestamp}.jsonl"

        mkdir -p "$output_dir"
        echo "$span" | jq -c '.' >> "$output_file"
    fi
}

# ==============================================================================
# OTLP EXPORTER (gRPC/HTTP)
# ==============================================================================

export_to_otlp() {
    local span="$1"

    local config=$(get_exporter_config "otlp")
    local endpoint=$(echo "$config" | jq -r '.endpoint')
    local protocol=$(echo "$config" | jq -r '.protocol // "grpc"')
    local timeout=$(echo "$config" | jq -r '.timeout_seconds // 10')

    # Convert span to OTLP format
    local otlp_payload=$(convert_to_otlp_format "$span")

    if [[ "$protocol" == "grpc" ]]; then
        # gRPC export (requires grpcurl or similar)
        echo "OTLP gRPC export not yet implemented" >&2
        return 1
    else
        # HTTP export
        local http_endpoint="${endpoint}/v1/traces"

        curl -X POST "$http_endpoint" \
            -H "Content-Type: application/json" \
            --max-time "$timeout" \
            --data "$otlp_payload" \
            2>/dev/null || {
                echo "Error: OTLP export failed" >&2
                return 1
            }
    fi
}

# Convert internal span format to OTLP JSON format
convert_to_otlp_format() {
    local span="$1"

    # OTLP format expects resourceSpans structure
    echo "$span" | jq '{
        resourceSpans: [{
            resource: {
                attributes: [
                    {key: "service.name", value: {stringValue: "cortex"}}
                ]
            },
            scopeSpans: [{
                scope: {name: "cortex", version: "1.0.0"},
                spans: [{
                    traceId: .trace_id,
                    spanId: .span_id,
                    parentSpanId: (.parent_span_id // ""),
                    name: .name,
                    kind: (
                        if .kind == "INTERNAL" then 1
                        elif .kind == "SERVER" then 2
                        elif .kind == "CLIENT" then 3
                        elif .kind == "PRODUCER" then 4
                        elif .kind == "CONSUMER" then 5
                        else 0 end
                    ),
                    startTimeUnixNano: .start_time,
                    endTimeUnixNano: .end_time,
                    attributes: [.attributes | to_entries[] | {key: .key, value: {stringValue: .value}}],
                    status: {code: (if .status.code == "OK" then 1 elif .status.code == "ERROR" then 2 else 0 end)}
                }]
            }]
        }]
    }'
}

# ==============================================================================
# UNIFIED EXPORT
# ==============================================================================

export_span() {
    local span="$1"
    local export_count=0

    # Export to stdout if enabled
    if [[ "$(is_exporter_enabled "stdout")" == "true" ]]; then
        export_to_stdout "$span"
        ((export_count++))
    fi

    # Export to file if enabled
    if [[ "$(is_exporter_enabled "file")" == "true" ]]; then
        export_to_file "$span" "trace"
        ((export_count++))
    fi

    # Export to OTLP if enabled
    if [[ "$(is_exporter_enabled "otlp")" == "true" ]]; then
        export_to_otlp "$span" || true  # Don't fail if OTLP unavailable
        ((export_count++))
    fi

    if [[ $export_count -eq 0 ]]; then
        echo "Warning: No exporters enabled" >&2
    fi
}

export_metric() {
    local metric="$1"

    # Export to stdout if enabled
    if [[ "$(is_exporter_enabled "stdout")" == "true" ]]; then
        echo "$metric" | jq '.'
    fi

    # Export to file if enabled
    if [[ "$(is_exporter_enabled "file")" == "true" ]]; then
        export_to_file "$metric" "metric"
    fi
}

# ==============================================================================
# BATCH PROCESSING
# ==============================================================================

# Batch export spans from directory
batch_export_spans() {
    local traces_dir="$PROJECT_ROOT/coordination/observability/traces"
    local processed_dir="$traces_dir/.processed"

    mkdir -p "$processed_dir"

    # Find all unprocessed span files
    local span_count=0
    for span_file in "$traces_dir"/*.jsonl; do
        [[ ! -f "$span_file" ]] && continue

        # Read and export each span in file
        while IFS= read -r span; do
            export_span "$span"
            ((span_count++))
        done < "$span_file"

        # Move to processed
        mv "$span_file" "$processed_dir/"
    done

    echo "Exported $span_count spans" >&2
}

# ==============================================================================
# EXPORTS
# ==============================================================================

export -f load_config
export -f is_exporter_enabled
export -f get_exporter_config
export -f export_to_stdout
export -f export_to_file
export -f export_to_otlp
export -f export_span
export -f export_metric
export -f batch_export_spans

# ==============================================================================
# MAIN (if executed directly)
# ==============================================================================

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    case "${1:-}" in
        batch)
            batch_export_spans
            ;;
        test)
            # Test export with sample span
            source "$SCRIPT_DIR/otel-span.sh"
            test_span=$(create_span "test.operation" "INTERNAL" "{}" '{"test": "true"}')
            test_span=$(end_span "$test_span" "OK")
            export_span "$test_span"
            ;;
        *)
            echo "Usage: $0 {batch|test}"
            exit 1
            ;;
    esac
fi
