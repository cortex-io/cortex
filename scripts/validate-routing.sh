#!/bin/bash
# Validate Hybrid Routing Performance
# Analyzes routing decisions across all 5 layers

set -euo pipefail

RESULTS_DIR="coordination/routing/validation"
REPORT_FILE="$RESULTS_DIR/validation-report-$(date +%Y%m%d).json"

mkdir -p "$RESULTS_DIR"

echo "=== Cortex Routing Validation ==="
echo "Analyzing routing decisions from the last 14 days..."
echo ""

# Get date range
END_DATE=$(date +%Y%m%d)
START_DATE=$(date -d '14 days ago' +%Y%m%d 2>/dev/null || date -v-14d +%Y%m%d)

# Collect routing decisions from performance logs
ROUTING_LOG="coordination/routing/performance.jsonl"

if [[ ! -f "$ROUTING_LOG" ]]; then
    echo "ERROR: No routing performance log found at $ROUTING_LOG"
    echo "Run some tasks first to generate routing data"
    exit 1
fi

# Analyze by layer
echo "=== Routing Accuracy by Layer ==="

jq -s '
    # Filter to date range and group by layer
    map(select(.timestamp >= "'$START_DATE'" and .timestamp <= "'$END_DATE'")) |
    group_by(.winning_layer) |
    map({
        layer: .[0].winning_layer,
        count: length,
        avg_confidence: (map(.confidence) | add / length),
        avg_latency_ms: (map(.latency_ms) | add / length),
        accuracy: (map(select(.was_correct == true)) | length / length * 100)
    }) |
    sort_by(.layer)
' "$ROUTING_LOG" > "$RESULTS_DIR/by-layer.json"

cat "$RESULTS_DIR/by-layer.json" | jq -r '.[] |
    "\(.layer): \(.count) tasks, \(.accuracy | floor)% accurate, \(.avg_latency_ms | floor)ms avg latency"'

echo ""
echo "=== Routing Performance Metrics ==="

# Calculate overall metrics
jq -s '
    map(select(.timestamp >= "'$START_DATE'" and .timestamp <= "'$END_DATE'")) |
    {
        total_tasks: length,
        overall_accuracy: (map(select(.was_correct == true)) | length / length * 100),
        avg_latency_ms: (map(.latency_ms) | add / length),
        p50_latency_ms: (map(.latency_ms) | sort | .[length / 2]),
        p95_latency_ms: (map(.latency_ms) | sort | .[length * 95 / 100 | floor]),
        p99_latency_ms: (map(.latency_ms) | sort | .[length * 99 / 100 | floor]),
        clarification_rate: (map(select(.required_clarification == true)) | length / length * 100),
        layer_distribution: (
            group_by(.winning_layer) |
            map({
                layer: .[0].winning_layer,
                percentage: (length / (reduce .[] as $x (0; . + 1)) * 100))
            })
        )
    }
' "$ROUTING_LOG" > "$RESULTS_DIR/overall-metrics.json"

cat "$RESULTS_DIR/overall-metrics.json" | jq '
    "Total Tasks: \(.total_tasks)\n" +
    "Overall Accuracy: \(.overall_accuracy | floor)%\n" +
    "Avg Latency: \(.avg_latency_ms | floor)ms\n" +
    "P95 Latency: \(.p95_latency_ms | floor)ms\n" +
    "P99 Latency: \(.p99_latency_ms | floor)ms\n" +
    "Clarification Rate: \(.clarification_rate | floor)%"
' -r

echo ""
echo "=== Layer Distribution ==="

jq -r '.layer_distribution[] | "\(.layer): \(.percentage | floor)%"' \
    "$RESULTS_DIR/overall-metrics.json"

echo ""
echo "=== Recommendations ==="

# Generate recommendations based on data
jq -s '
    map(select(.timestamp >= "'$START_DATE'" and .timestamp <= "'$END_DATE'")) |

    # Check if any layer is underperforming
    group_by(.winning_layer) |
    map({
        layer: .[0].winning_layer,
        accuracy: (map(select(.was_correct == true)) | length / length * 100)
    }) |

    # Generate recommendations
    map(
        if .accuracy < 85 then
            "⚠️  \(.layer) has low accuracy (\(.accuracy | floor)%) - consider tuning thresholds"
        elif .accuracy > 95 then
            "✅ \(.layer) performing well (\(.accuracy | floor)%)"
        else
            "✓  \(.layer) acceptable (\(.accuracy | floor)%)"
        end
    )
' "$ROUTING_LOG" -r

# Check P95 latency
P95=$(jq '.p95_latency_ms' "$RESULTS_DIR/overall-metrics.json")
if (( $(echo "$P95 > 100" | bc -l 2>/dev/null || echo 0) )); then
    echo "⚠️  P95 latency is ${P95}ms - consider optimization"
fi

# Check clarification rate
CLARIFICATION=$(jq '.clarification_rate' "$RESULTS_DIR/overall-metrics.json")
if (( $(echo "$CLARIFICATION > 5" | bc -l 2>/dev/null || echo 0) )); then
    echo "⚠️  Clarification rate is ${CLARIFICATION}% (target <5%)"
fi

echo ""
echo "=== Validation Report ==="
echo "Full report saved to: $REPORT_FILE"

# Create comprehensive report
jq -n \
    --slurpfile by_layer "$RESULTS_DIR/by-layer.json" \
    --slurpfile overall "$RESULTS_DIR/overall-metrics.json" \
    --arg start "$START_DATE" \
    --arg end "$END_DATE" \
    '{
        report_date: (now | strftime("%Y-%m-%d")),
        analysis_period: {
            start: $start,
            end: $end,
            days: 14
        },
        by_layer: $by_layer[0],
        overall: $overall[0],
        status: (
            if $overall[0].overall_accuracy > 90 and $overall[0].p95_latency_ms < 100 then
                "EXCELLENT"
            elif $overall[0].overall_accuracy > 85 and $overall[0].p95_latency_ms < 150 then
                "GOOD"
            elif $overall[0].overall_accuracy > 75 then
                "NEEDS_IMPROVEMENT"
            else
                "CRITICAL"
            end
        )
    }' > "$REPORT_FILE"

STATUS=$(jq -r '.status' "$REPORT_FILE")
echo "Overall Status: $STATUS"

echo ""
echo "Done!"
