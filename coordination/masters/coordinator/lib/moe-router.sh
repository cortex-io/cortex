#!/bin/bash
# MoE-Inspired Router for Commit-Relay
# Implements Mixture of Experts routing logic with confidence scoring

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KB_DIR="$SCRIPT_DIR/../knowledge-base"
ROUTING_PATTERNS="$KB_DIR/routing-patterns.json"
ROUTING_LOG="$SCRIPT_DIR/../logs/routing-decisions.jsonl"
COMMIT_RELAY_HOME="${COMMIT_RELAY_HOME:-$(cd "$SCRIPT_DIR/../../../.." && pwd)}"

# Governance bypass mode (for bootstrapping governance system itself)
GOVERNANCE_BYPASS="${GOVERNANCE_BYPASS:-false}"

# Load access control (skip if in bypass mode or file doesn't exist)
if [ "$GOVERNANCE_BYPASS" != "true" ] && [ -f "$COMMIT_RELAY_HOME/scripts/lib/access-check.sh" ]; then
    source "$COMMIT_RELAY_HOME/scripts/lib/access-check.sh"
else
    # Stub function for bypass mode or when access-check doesn't exist
    check_permission() {
        return 0  # Always allow in bypass mode
    }
fi

# Ensure log directory exists
mkdir -p "$(dirname "$ROUTING_LOG")"

# Load thresholds from patterns file
SINGLE_EXPERT_THRESHOLD=$(jq -r '.thresholds.single_expert' "$ROUTING_PATTERNS")
MULTI_EXPERT_THRESHOLD=$(jq -r '.thresholds.multi_expert' "$ROUTING_PATTERNS")
MINIMUM_ACTIVATION=$(jq -r '.thresholds.minimum_activation' "$ROUTING_PATTERNS")

##############################################################################
# calculate_expert_score: Score a task description against an expert's patterns
# Args:
#   $1: task_description
#   $2: expert_name (development|security|inventory)
# Returns: confidence score (0-100)
##############################################################################
calculate_expert_score() {
    local task_description="$1"
    local expert="$2"

    # Convert to lowercase for matching
    local task_lower=$(echo "$task_description" | tr '[:upper:]' '[:lower:]')

    # Initialize scores
    local keyword_score=0
    local keyword_total=0
    local booster_score=0
    local booster_total=0
    local negative_score=0
    local negative_total=0

    # Score activation keywords
    while IFS= read -r keyword; do
        if echo "$task_lower" | grep -qw "$keyword"; then
            ((keyword_score++))
        fi
        ((keyword_total++))
    done < <(jq -r ".experts.$expert.activation_keywords[]" "$ROUTING_PATTERNS")

    # Score confidence boosters (higher weight)
    while IFS= read -r booster; do
        if echo "$task_lower" | grep -qw "$booster"; then
            ((booster_score++))
        fi
        ((booster_total++))
    done < <(jq -r ".experts.$expert.confidence_boosters[]" "$ROUTING_PATTERNS")

    # Score negative indicators (subtract from confidence)
    while IFS= read -r negative; do
        if echo "$task_lower" | grep -qw "$negative"; then
            ((negative_score++))
        fi
        ((negative_total++))
    done < <(jq -r ".experts.$expert.negative_indicators[]" "$ROUTING_PATTERNS")

    # Calculate weighted confidence score
    # Formula: (keyword_match% * 50 + booster_match% * 50) - (negative_match% * 30)
    local keyword_percentage=0
    local booster_percentage=0
    local negative_percentage=0

    if [ $keyword_total -gt 0 ]; then
        keyword_percentage=$((keyword_score * 100 / keyword_total))
    fi

    if [ $booster_total -gt 0 ]; then
        booster_percentage=$((booster_score * 100 / booster_total))
    fi

    if [ $negative_total -gt 0 ]; then
        negative_percentage=$((negative_score * 100 / negative_total))
    fi

    # Calculate final confidence (0-100)
    local base_confidence=$(( (keyword_percentage * 50 + booster_percentage * 50) / 100 ))
    local negative_penalty=$((negative_percentage * 30 / 100))
    local final_confidence=$((base_confidence - negative_penalty))

    # Clamp to 0-100
    if [ $final_confidence -lt 0 ]; then
        final_confidence=0
    fi
    if [ $final_confidence -gt 100 ]; then
        final_confidence=100
    fi

    echo $final_confidence
}

##############################################################################
# route_task_moe: Perform MoE-style routing with sparse activation
# Args:
#   $1: task_id
#   $2: task_description (format: "type: title description")
# Outputs: JSON routing decision
##############################################################################
route_task_moe() {
    local task_id="$1"
    local task_description="$2"
    local timestamp=$(date +"%Y-%m-%dT%H:%M:%S%z")

    # Permission check: Can coordinator read routing patterns?
    check_permission "coordinator-master" "routing-patterns" "read" || {
        echo '{"error": "Permission denied to access routing patterns"}' >&2
        return 1
    }

    # v5.0 CAG Enhancement: Extract task type for direct routing
    local task_type=""
    if [[ "$task_description" =~ ^([a-z0-9-]+): ]]; then
        task_type="${BASH_REMATCH[1]}"
    fi

    # v5.0 CAG Enhancement: Type-based routing (high confidence)
    local type_routed_expert=""
    local type_confidence=0

    if [ -n "$task_type" ]; then
        # Normalize task type for matching (handle CVE-YYYY-NNNN format)
        local normalized_type="$task_type"
        if [[ "$task_type" =~ ^cve- ]]; then
            normalized_type="cve"
        elif [[ "$task_type" =~ ^vulnerability- ]]; then
            normalized_type="vulnerability"
        fi

        case "$normalized_type" in
            security-scan|security-audit|security-fix|cve|vulnerability|security)
                type_routed_expert="security"
                type_confidence=95
                ;;
            feature|bug-fix|refactor|optimization|development)
                type_routed_expert="development"
                type_confidence=95
                ;;
            inventory|catalog|discovery|documentation)
                type_routed_expert="inventory"
                type_confidence=95
                ;;
            build|deploy|test|ci-cd|release)
                type_routed_expert="cicd"
                type_confidence=95
                ;;
        esac
    fi

    # Calculate confidence scores for all experts (keyword-based)
    local dev_score=$(calculate_expert_score "$task_description" "development")
    local sec_score=$(calculate_expert_score "$task_description" "security")
    local inv_score=$(calculate_expert_score "$task_description" "inventory")

    # v5.0 CAG: Boost scores with type-based routing
    if [ "$type_routed_expert" = "development" ]; then
        dev_score=$((dev_score > type_confidence ? dev_score : type_confidence))
    elif [ "$type_routed_expert" = "security" ]; then
        sec_score=$((sec_score > type_confidence ? sec_score : type_confidence))
    elif [ "$type_routed_expert" = "inventory" ]; then
        inv_score=$((inv_score > type_confidence ? inv_score : type_confidence))
    fi

    # Convert to decimal for jq (0.0 - 1.0 scale)
    local dev_conf=$(echo "scale=2; $dev_score / 100" | bc)
    local sec_conf=$(echo "scale=2; $sec_score / 100" | bc)
    local inv_conf=$(echo "scale=2; $inv_score / 100" | bc)

    # Determine activation strategy (sparse activation)
    local activated_experts=()
    local primary_expert=""
    local primary_confidence=0

    # Find highest scoring expert
    if (( $(echo "$dev_conf >= $sec_conf && $dev_conf >= $inv_conf" | bc -l) )); then
        primary_expert="development"
        primary_confidence=$dev_conf
    elif (( $(echo "$sec_conf >= $dev_conf && $sec_conf >= $inv_conf" | bc -l) )); then
        primary_expert="security"
        primary_confidence=$sec_conf
    else
        primary_expert="inventory"
        primary_confidence=$inv_conf
    fi

    # Sparse activation: only activate experts above minimum threshold
    if (( $(echo "$dev_conf >= $MINIMUM_ACTIVATION" | bc -l) )); then
        activated_experts+=("development:$dev_conf")
    fi

    if (( $(echo "$sec_conf >= $MINIMUM_ACTIVATION" | bc -l) )); then
        activated_experts+=("security:$sec_conf")
    fi

    if (( $(echo "$inv_conf >= $MINIMUM_ACTIVATION" | bc -l) )); then
        activated_experts+=("inventory:$inv_conf")
    fi

    # Determine routing strategy
    local strategy=""
    local parallel_experts=()

    if (( $(echo "$primary_confidence >= $SINGLE_EXPERT_THRESHOLD" | bc -l) )); then
        strategy="single_expert"
    elif [ ${#activated_experts[@]} -gt 1 ]; then
        strategy="multi_expert_parallel"
        # Add secondary experts for parallel activation
        for expert_conf in "${activated_experts[@]}"; do
            local expert="${expert_conf%:*}"
            if [ "$expert" != "$primary_expert" ]; then
                parallel_experts+=("$expert")
            fi
        done
    else
        strategy="single_expert_low_confidence"
    fi

    # Build routing decision JSON
    local parallel_json="[]"
    if [ ${#parallel_experts[@]} -gt 0 ]; then
        parallel_json="$(printf '%s\n' "${parallel_experts[@]}" | jq -R . | jq -s .)"
    fi

    local routing_decision=$(jq -n \
        --arg task_id "$task_id" \
        --arg timestamp "$timestamp" \
        --arg primary "$primary_expert" \
        --argjson primary_conf "$primary_confidence" \
        --arg strategy "$strategy" \
        --argjson dev_conf "$dev_conf" \
        --argjson sec_conf "$sec_conf" \
        --argjson inv_conf "$inv_conf" \
        --argjson parallel "$parallel_json" \
        '{
            task_id: $task_id,
            timestamp: $timestamp,
            routing_strategy: "mixture_of_experts",
            decision: {
                primary_expert: $primary,
                primary_confidence: $primary_conf,
                strategy: $strategy,
                parallel_experts: $parallel,
                scores: {
                    development: $dev_conf,
                    security: $sec_conf,
                    inventory: $inv_conf
                }
            }
        }')

    # Log routing decision (with immediate flush)
    echo "$routing_decision" >> "$ROUTING_LOG"

    # Force immediate flush to disk (prevents buffering issues during tests)
    sync "$ROUTING_LOG" 2>/dev/null || true

    # Emit event for real-time dashboard updates
    local events_file="$SCRIPT_DIR/../../dashboard-events.jsonl"
    if [ -w "$(dirname "$events_file")" ] || [ -w "$events_file" ]; then
        local event_json=$(jq -n \
            --arg timestamp "$(date +%Y-%m-%dT%H:%M:%S%z)" \
            --arg task_id "$task_id" \
            --arg primary "$primary_expert" \
            --argjson confidence "$primary_confidence" \
            --arg strategy "$strategy" \
            '{
                timestamp: $timestamp,
                type: "moe_routing_decision",
                data: {
                    task_id: $task_id,
                    expert: $primary,
                    confidence: $confidence,
                    strategy: $strategy
                }
            }')
        echo "$event_json" >> "$events_file" 2>/dev/null || true
    fi

    # Output decision
    echo "$routing_decision"
}

##############################################################################
# get_activated_experts: Extract list of experts to activate
# Args:
#   $1: routing_decision JSON
# Outputs: Space-separated list of expert names
##############################################################################
get_activated_experts() {
    local routing_decision="$1"

    local primary=$(echo "$routing_decision" | jq -r '.decision.primary_expert')
    local parallel=$(echo "$routing_decision" | jq -r '.decision.parallel_experts[]' 2>/dev/null || echo "")

    local experts="$primary"
    if [ -n "$parallel" ] && [ "$parallel" != "null" ]; then
        experts="$experts $parallel"
    fi

    echo "$experts"
}

##############################################################################
# Main execution (if run directly)
##############################################################################
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    if [ $# -lt 2 ]; then
        echo "Usage: $0 <task_id> <task_description>"
        echo "Example: $0 task-123 'Fix security vulnerability in authentication module'"
        exit 1
    fi

    task_id="$1"
    task_description="$2"

    routing_decision=$(route_task_moe "$task_id" "$task_description")

    # Output compact JSON for machine consumption
    echo "$routing_decision"

    # If running interactively, show pretty output to stderr
    if [ -t 1 ]; then
        echo "$routing_decision" | jq '.' >&2
        echo "" >&2
        echo "Activated experts:" >&2
        get_activated_experts "$routing_decision" >&2
    fi
fi
