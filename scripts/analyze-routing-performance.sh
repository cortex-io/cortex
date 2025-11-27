#!/bin/bash
# Routing Performance Analyzer
# Analyzes routing decisions and provides insights for optimization

set -euo pipefail

CORTEX_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PERFORMANCE_LOG="${CORTEX_ROOT}/coordination/routing/performance.jsonl"
CONFIG_FILE="${CORTEX_ROOT}/coordination/routing/config.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Default options
WINDOW_HOURS=24
OUTPUT_FORMAT="text"
SHOW_RECOMMENDATIONS=true

usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Analyze routing performance across the 5-layer cascade

OPTIONS:
    -w, --window HOURS       Time window for analysis (default: 24)
    -f, --format FORMAT      Output format: text, json (default: text)
    -r, --no-recommendations Disable recommendations
    -l, --layer LAYER        Analyze specific layer only
    -h, --help               Show this help message

EXAMPLES:
    $0                       # Analyze last 24 hours
    $0 -w 72                 # Analyze last 72 hours
    $0 -l semantic           # Analyze semantic layer only
    $0 -f json               # Output as JSON

EOF
    exit 0
}

# Parse arguments
SPECIFIC_LAYER=""
while [[ $# -gt 0 ]]; do
    case $1 in
        -w|--window)
            WINDOW_HOURS="$2"
            shift 2
            ;;
        -f|--format)
            OUTPUT_FORMAT="$2"
            shift 2
            ;;
        -r|--no-recommendations)
            SHOW_RECOMMENDATIONS=false
            shift
            ;;
        -l|--layer)
            SPECIFIC_LAYER="$2"
            shift 2
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo "Unknown option: $1"
            usage
            ;;
    esac
done

# Check if log exists
if [[ ! -f "$PERFORMANCE_LOG" ]]; then
    echo -e "${YELLOW}Warning: Performance log not found at $PERFORMANCE_LOG${NC}"
    echo "No routing decisions have been logged yet."
    exit 1
fi

# Calculate cutoff timestamp
CUTOFF_TS=$(date -u -v-${WINDOW_HOURS}H +%s 2>/dev/null || date -u -d "${WINDOW_HOURS} hours ago" +%s)

# Analyze routing data
analyze_routing() {
    local layer="$1"
    local total_events=0
    local layer_attempts=0
    local layer_successes=0
    local total_confidence=0
    local total_latency=0
    local correct_routings=0
    local total_outcomes=0

    # Process each event
    while IFS= read -r line; do
        # Parse event timestamp
        event_ts=$(echo "$line" | jq -r '.timestamp' | xargs -I{} date -u -j -f "%Y-%m-%dT%H:%M:%S" "{}" +%s 2>/dev/null || echo 0)

        # Skip if outside window
        [[ $event_ts -lt $CUTOFF_TS ]] && continue

        ((total_events++))

        # Check if layer was attempted
        attempted=$(echo "$line" | jq -r --arg layer "$layer" '.routing_layers[] | select(.layer_name == $layer) | .attempted')
        if [[ "$attempted" == "true" ]]; then
            ((layer_attempts++))

            # Get layer stats
            success=$(echo "$line" | jq -r --arg layer "$layer" '.routing_layers[] | select(.layer_name == $layer) | .success')
            confidence=$(echo "$line" | jq -r --arg layer "$layer" '.routing_layers[] | select(.layer_name == $layer) | .confidence')
            latency=$(echo "$line" | jq -r --arg layer "$layer" '.routing_layers[] | select(.layer_name == $layer) | .latency_ms')

            [[ "$success" == "true" ]] && ((layer_successes++))
            total_confidence=$(echo "$total_confidence + $confidence" | bc)
            total_latency=$(echo "$total_latency + $latency" | bc)
        fi

        # Check outcome if available
        was_correct=$(echo "$line" | jq -r '.outcome.was_correct_master // "null"')
        if [[ "$was_correct" != "null" ]]; then
            ((total_outcomes++))
            [[ "$was_correct" == "true" ]] && ((correct_routings++))
        fi
    done < "$PERFORMANCE_LOG"

    # Calculate stats
    local success_rate=0
    local avg_confidence=0
    local avg_latency=0
    local accuracy=0

    if [[ $layer_attempts -gt 0 ]]; then
        success_rate=$(echo "scale=4; $layer_successes / $layer_attempts" | bc)
        avg_confidence=$(echo "scale=4; $total_confidence / $layer_attempts" | bc)
        avg_latency=$(echo "scale=2; $total_latency / $layer_attempts" | bc)
    fi

    if [[ $total_outcomes -gt 0 ]]; then
        accuracy=$(echo "scale=4; $correct_routings / $total_outcomes" | bc)
    fi

    # Output results
    if [[ "$OUTPUT_FORMAT" == "json" ]]; then
        cat << EOF
{
  "layer_name": "$layer",
  "window_hours": $WINDOW_HOURS,
  "total_events": $total_events,
  "layer_attempts": $layer_attempts,
  "layer_successes": $layer_successes,
  "success_rate": $success_rate,
  "avg_confidence": $avg_confidence,
  "avg_latency_ms": $avg_latency,
  "accuracy": $accuracy,
  "total_outcomes": $total_outcomes,
  "correct_routings": $correct_routings
}
EOF
    else
        echo -e "${BLUE}=== Layer: $layer ===${NC}"
        echo "Total events in window: $total_events"
        echo "Layer attempts: $layer_attempts"
        echo "Layer successes: $layer_successes"
        echo -e "Success rate: ${GREEN}$(echo "scale=1; $success_rate * 100" | bc)%${NC}"
        echo "Avg confidence: $(printf "%.3f" $avg_confidence)"
        echo "Avg latency: ${avg_latency}ms"
        if [[ $total_outcomes -gt 0 ]]; then
            echo -e "Accuracy: ${GREEN}$(echo "scale=1; $accuracy * 100" | bc)%${NC} (based on $total_outcomes outcomes)"
        else
            echo -e "${YELLOW}Accuracy: N/A (no outcome data)${NC}"
        fi
        echo ""
    fi
}

# Analyze threshold effectiveness
analyze_thresholds() {
    local layer="$1"

    # Get current threshold
    local threshold=$(jq -r --arg layer "$layer" '.routing_layers[] | select(.layer_name == $layer) | .confidence_threshold' "$CONFIG_FILE")

    # Count events just below/above threshold
    local below_threshold=0
    local above_threshold=0
    local below_and_correct=0
    local above_and_wrong=0

    while IFS= read -r line; do
        event_ts=$(echo "$line" | jq -r '.timestamp' | xargs -I{} date -u -j -f "%Y-%m-%dT%H:%M:%S" "{}" +%s 2>/dev/null || echo 0)
        [[ $event_ts -lt $CUTOFF_TS ]] && continue

        confidence=$(echo "$line" | jq -r --arg layer "$layer" '.routing_layers[] | select(.layer_name == $layer) | .confidence // "0"')
        was_correct=$(echo "$line" | jq -r '.outcome.was_correct_master // "null"')

        if [[ "$confidence" != "0" ]] && [[ "$was_correct" != "null" ]]; then
            if (( $(echo "$confidence < $threshold" | bc -l) )); then
                ((below_threshold++))
                [[ "$was_correct" == "true" ]] && ((below_and_correct++))
            else
                ((above_threshold++))
                [[ "$was_correct" == "false" ]] && ((above_and_wrong++))
            fi
        fi
    done < "$PERFORMANCE_LOG"

    echo -e "${BLUE}=== Threshold Analysis: $layer ===${NC}"
    echo "Current threshold: $threshold"
    echo "Events below threshold: $below_threshold"
    if [[ $below_threshold -gt 0 ]]; then
        echo "  - Would have been correct: $below_and_correct ($(echo "scale=1; $below_and_correct * 100 / $below_threshold" | bc)%)"
    fi
    echo "Events above threshold: $above_threshold"
    if [[ $above_threshold -gt 0 ]]; then
        echo "  - Were incorrect: $above_and_wrong ($(echo "scale=1; $above_and_wrong * 100 / $above_threshold" | bc)%)"
    fi
    echo ""
}

# Generate recommendations
generate_recommendations() {
    echo -e "${BLUE}=== Recommendations ===${NC}"

    # Analyze each layer
    for layer in keyword semantic rag pytorch clarification; do
        local threshold=$(jq -r --arg layer "$layer" '.routing_layers[] | select(.layer_name == $layer) | .confidence_threshold' "$CONFIG_FILE")

        # Count missed opportunities
        local missed=0
        local false_positives=0

        while IFS= read -r line; do
            event_ts=$(echo "$line" | jq -r '.timestamp' | xargs -I{} date -u -j -f "%Y-%m-%dT%H:%M:%S" "{}" +%s 2>/dev/null || echo 0)
            [[ $event_ts -lt $CUTOFF_TS ]] && continue

            feedback=$(echo "$line" | jq -r '.learning_feedback // "null"')
            [[ "$feedback" == "null" ]] && continue

            threshold_too_high=$(echo "$line" | jq -r --arg layer "$layer" '.learning_feedback.threshold_too_high // "false"')
            threshold_too_low=$(echo "$line" | jq -r --arg layer "$layer" '.learning_feedback.threshold_too_low // "false"')
            layer_caught=$(echo "$line" | jq -r '.learning_feedback.layer_should_have_caught // "null"')

            [[ "$threshold_too_high" == "true" ]] && [[ "$layer_caught" == "$layer" ]] && ((missed++))
            [[ "$threshold_too_low" == "true" ]] && ((false_positives++))
        done < "$PERFORMANCE_LOG"

        # Generate recommendation
        if [[ $missed -gt 5 ]]; then
            local new_threshold=$(echo "$threshold - 0.05" | bc)
            echo -e "${YELLOW}[$layer]${NC} Lower threshold from $threshold to $new_threshold"
            echo "  Reason: $missed missed opportunities (correct routing below threshold)"
        elif [[ $false_positives -gt 5 ]]; then
            local new_threshold=$(echo "$threshold + 0.05" | bc)
            echo -e "${YELLOW}[$layer]${NC} Raise threshold from $threshold to $new_threshold"
            echo "  Reason: $false_positives false positives (incorrect routing above threshold)"
        fi
    done

    echo ""
}

# Main execution
echo -e "${GREEN}Routing Performance Analysis${NC}"
echo "Time window: Last $WINDOW_HOURS hours"
echo "Log file: $PERFORMANCE_LOG"
echo ""

if [[ -n "$SPECIFIC_LAYER" ]]; then
    # Analyze specific layer
    analyze_routing "$SPECIFIC_LAYER"
    if [[ "$SHOW_RECOMMENDATIONS" == "true" ]]; then
        analyze_thresholds "$SPECIFIC_LAYER"
    fi
else
    # Analyze all layers
    for layer in keyword semantic rag pytorch clarification; do
        analyze_routing "$layer"
    done

    if [[ "$SHOW_RECOMMENDATIONS" == "true" ]] && [[ "$OUTPUT_FORMAT" == "text" ]]; then
        generate_recommendations
    fi
fi

echo -e "${GREEN}Analysis complete${NC}"
