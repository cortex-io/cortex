#!/usr/bin/env bash
# Routing Threshold Auto-Tuner
# Automatically tunes confidence thresholds based on performance data

set -euo pipefail

CORTEX_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PERFORMANCE_LOG="${CORTEX_ROOT}/coordination/routing/performance.jsonl"
CONFIG_FILE="${CORTEX_ROOT}/coordination/routing/config.json"
BACKUP_DIR="${CORTEX_ROOT}/coordination/routing/backups"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Tuning parameters
MIN_SAMPLES=100
WINDOW_HOURS=168  # 7 days
ADJUSTMENT_STEP=0.05
DRY_RUN=false
AGGRESSIVE=false

usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Auto-tune routing confidence thresholds based on performance data

OPTIONS:
    -w, --window HOURS       Analysis window (default: 168 = 7 days)
    -s, --step FLOAT         Adjustment step size (default: 0.05)
    -m, --min-samples N      Minimum samples required (default: 100)
    -a, --aggressive         Aggressive tuning (larger adjustments)
    -d, --dry-run            Show recommendations without applying
    -h, --help               Show this help

EXAMPLES:
    $0 -d                    # Dry run to preview changes
    $0 -w 72                 # Tune based on last 3 days
    $0 -a                    # Aggressive tuning

ALGORITHM:
    For each layer:
    1. Analyze missed opportunities (correct answer below threshold)
    2. Analyze false positives (incorrect answer above threshold)
    3. Calculate optimal threshold to maximize accuracy
    4. Apply threshold adjustment if confidence is high enough

EOF
    exit 0
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -w|--window)
            WINDOW_HOURS="$2"
            shift 2
            ;;
        -s|--step)
            ADJUSTMENT_STEP="$2"
            shift 2
            ;;
        -m|--min-samples)
            MIN_SAMPLES="$2"
            shift 2
            ;;
        -a|--aggressive)
            AGGRESSIVE=true
            ADJUSTMENT_STEP=0.10
            shift
            ;;
        -d|--dry-run)
            DRY_RUN=true
            shift
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
    echo -e "${RED}Error: Performance log not found at $PERFORMANCE_LOG${NC}"
    echo "No routing data available for tuning."
    exit 1
fi

# Backup current config
backup_config() {
    mkdir -p "$BACKUP_DIR"
    local backup_file="${BACKUP_DIR}/config-$(date +%Y%m%d-%H%M%S).json"
    cp "$CONFIG_FILE" "$backup_file"
    echo -e "${GREEN}Backed up config to: $backup_file${NC}"
}

# Calculate optimal threshold for a layer
calculate_optimal_threshold() {
    local layer="$1"
    local cutoff_ts=$(date -u -v-${WINDOW_HOURS}H +%s 2>/dev/null || date -u -d "${WINDOW_HOURS} hours ago" +%s)

    # Collect confidence scores with outcomes
    local temp_file=$(mktemp)

    while IFS= read -r line; do
        event_ts=$(echo "$line" | jq -r '.timestamp' | xargs -I{} date -u -j -f "%Y-%m-%dT%H:%M:%S" "{}" +%s 2>/dev/null || echo 0)
        [[ $event_ts -lt $cutoff_ts ]] && continue

        # Check if this layer made the final decision
        final_layer=$(echo "$line" | jq -r '.final_decision.routing_layer // "null"')
        [[ "$final_layer" != "$layer" ]] && continue

        # Get confidence and outcome
        confidence=$(echo "$line" | jq -r '.final_decision.confidence // "0"')
        was_correct=$(echo "$line" | jq -r '.outcome.was_correct_master // "null"')

        [[ "$was_correct" == "null" ]] && continue
        [[ "$confidence" == "0" ]] && continue

        echo "$confidence $was_correct" >> "$temp_file"
    done < "$PERFORMANCE_LOG"

    # Check if we have enough samples
    local sample_count=$(wc -l < "$temp_file" | tr -d ' ')
    if [[ $sample_count -lt $MIN_SAMPLES ]]; then
        rm "$temp_file"
        echo "insufficient_samples|$sample_count|0|0|0"
        return
    fi

    # Sort by confidence
    sort -n "$temp_file" > "${temp_file}.sorted"
    mv "${temp_file}.sorted" "$temp_file"

    # Find threshold that maximizes accuracy
    # Try different thresholds and calculate accuracy for each
    local best_threshold=0
    local best_accuracy=0
    local best_precision=0
    local best_recall=0

    for threshold in $(seq 0.5 0.05 0.95); do
        local tp=0  # True positives (correct, above threshold)
        local fp=0  # False positives (incorrect, above threshold)
        local tn=0  # True negatives (correct, below threshold - would go to next layer)
        local fn=0  # False negatives (incorrect, below threshold)

        while read -r conf correct; do
            if (( $(echo "$conf >= $threshold" | bc -l) )); then
                # Above threshold - layer makes decision
                if [[ "$correct" == "true" ]]; then
                    ((tp++))
                else
                    ((fp++))
                fi
            else
                # Below threshold - would pass to next layer
                if [[ "$correct" == "true" ]]; then
                    ((tn++))
                else
                    ((fn++))
                fi
            fi
        done < "$temp_file"

        # Calculate metrics
        local total=$((tp + fp + tn + fn))
        if [[ $total -eq 0 ]]; then
            continue
        fi

        local accuracy=$(echo "scale=4; ($tp + $tn) / $total" | bc)
        local precision=0
        local recall=0

        if [[ $((tp + fp)) -gt 0 ]]; then
            precision=$(echo "scale=4; $tp / ($tp + $fp)" | bc)
        fi

        if [[ $((tp + fn)) -gt 0 ]]; then
            recall=$(echo "scale=4; $tp / ($tp + $fn)" | bc)
        fi

        # Update best if this is better
        if (( $(echo "$accuracy > $best_accuracy" | bc -l) )); then
            best_threshold=$threshold
            best_accuracy=$accuracy
            best_precision=$precision
            best_recall=$recall
        fi
    done

    rm "$temp_file"

    echo "success|$sample_count|$best_threshold|$best_accuracy|$best_precision"
}

# Analyze and recommend threshold adjustment
analyze_layer() {
    local layer="$1"

    echo -e "${BLUE}=== Analyzing Layer: $layer ===${NC}"

    # Get current threshold
    local current_threshold=$(jq -r --arg layer "$layer" '.routing_layers[] | select(.layer_name == $layer) | .confidence_threshold' "$CONFIG_FILE")
    echo "Current threshold: $current_threshold"

    # Calculate optimal threshold
    local result=$(calculate_optimal_threshold "$layer")
    IFS='|' read -r status samples optimal accuracy precision <<< "$result"

    if [[ "$status" == "insufficient_samples" ]]; then
        echo -e "${YELLOW}Insufficient samples: $samples (need $MIN_SAMPLES)${NC}"
        echo "No adjustment recommended"
        echo ""
        return
    fi

    echo "Sample size: $samples events"
    echo "Optimal threshold: $optimal (accuracy: $(echo "scale=1; $accuracy * 100" | bc)%)"
    echo "Current accuracy at threshold: $(echo "scale=1; $precision * 100" | bc)%"

    # Calculate recommended adjustment
    local diff=$(echo "$optimal - $current_threshold" | bc)
    local abs_diff=$(echo "$diff" | sed 's/-//')

    # Only adjust if difference is significant
    if (( $(echo "$abs_diff < 0.02" | bc -l) )); then
        echo -e "${GREEN}No adjustment needed (difference < 0.02)${NC}"
        echo ""
        return
    fi

    # Calculate new threshold (bounded adjustment)
    local adjustment=0
    if (( $(echo "$diff > 0" | bc -l) )); then
        adjustment=$ADJUSTMENT_STEP
    else
        adjustment=$(echo "-1 * $ADJUSTMENT_STEP" | bc)
    fi

    local new_threshold=$(echo "$current_threshold + $adjustment" | bc)

    # Bound between 0.5 and 0.95
    if (( $(echo "$new_threshold < 0.5" | bc -l) )); then
        new_threshold=0.5
    elif (( $(echo "$new_threshold > 0.95" | bc -l) )); then
        new_threshold=0.95
    fi

    # Show recommendation
    if (( $(echo "$adjustment > 0" | bc -l) )); then
        echo -e "${YELLOW}Recommendation: INCREASE threshold${NC}"
    else
        echo -e "${YELLOW}Recommendation: DECREASE threshold${NC}"
    fi
    echo "  From: $current_threshold"
    echo "  To:   $new_threshold"
    echo "  Expected accuracy improvement: $(echo "scale=1; ($accuracy - $precision) * 100" | bc)%"

    # Apply if not dry run
    if [[ "$DRY_RUN" == "false" ]]; then
        # Update config
        jq --arg layer "$layer" --arg new_threshold "$new_threshold" \
            '(.routing_layers[] | select(.layer_name == $layer) | .confidence_threshold) = ($new_threshold | tonumber)' \
            "$CONFIG_FILE" > "${CONFIG_FILE}.tmp"
        mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"
        echo -e "${GREEN}Applied threshold adjustment${NC}"
    else
        echo -e "${BLUE}(Dry run - no changes made)${NC}"
    fi

    echo ""
}

# Generate tuning report
generate_report() {
    echo -e "${GREEN}=== Threshold Tuning Report ===${NC}"
    echo "Generated: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "Analysis window: ${WINDOW_HOURS}h"
    echo "Minimum samples: $MIN_SAMPLES"
    echo "Adjustment step: $ADJUSTMENT_STEP"
    echo ""

    for layer in keyword semantic rag pytorch; do
        analyze_layer "$layer"
    done

    if [[ "$DRY_RUN" == "false" ]]; then
        echo -e "${GREEN}Tuning complete. Updated config: $CONFIG_FILE${NC}"
        echo "Run routing-dashboard.sh to see the impact."
    else
        echo -e "${BLUE}Dry run complete. Use without -d flag to apply changes.${NC}"
    fi
}

# Main execution
if [[ "$DRY_RUN" == "false" ]]; then
    backup_config
fi

generate_report
