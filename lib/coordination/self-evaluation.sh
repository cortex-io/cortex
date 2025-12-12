#!/usr/bin/env bash
# Self-Evaluation Gates - "Am I confident enough to proceed?"
# Implements pre-action confidence evaluation from AI Agent transcript
# Before spawning workers or making decisions, evaluate confidence

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_HOME="${CORTEX_HOME:-$(cd "$SCRIPT_DIR/../.." && pwd)}"

# Confidence thresholds
HIGH_CONFIDENCE_THRESHOLD="${HIGH_CONFIDENCE_THRESHOLD:-0.80}"
MEDIUM_CONFIDENCE_THRESHOLD="${MEDIUM_CONFIDENCE_THRESHOLD:-0.60}"
LOW_CONFIDENCE_THRESHOLD="${LOW_CONFIDENCE_THRESHOLD:-0.40}"

# Evaluation log
EVALUATION_LOG="$CORTEX_HOME/coordination/knowledge-base/self-evaluation-log.jsonl"
mkdir -p "$(dirname "$EVALUATION_LOG")"

##############################################################################
# evaluate_decision_confidence: Evaluate if decision is confident enough
# This is the "Am I confident enough to proceed?" gate
# Args:
#   $1: decision_type (routing|decomposition|model_selection|worker_spawn)
#   $2: confidence_score (0-1)
#   $3: context_json (additional decision context)
# Returns:
#   0 = Proceed (confidence acceptable)
#   1 = Escalate to human (confidence too low)
#   2 = Request more information (confidence uncertain)
##############################################################################
evaluate_decision_confidence() {
    local decision_type="$1"
    local confidence="$2"
    local context_json="${3:-{}}"
    local timestamp=$(date +"%Y-%m-%dT%H:%M:%S%z")

    # Parse context
    local task_id=$(echo "$context_json" | jq -r '.task_id // "unknown"')
    local priority=$(echo "$context_json" | jq -r '.priority // "medium"')

    # Determine action based on confidence and priority
    local action="proceed"
    local reason=""
    local return_code=0

    # High confidence - always proceed
    if (( $(echo "$confidence >= $HIGH_CONFIDENCE_THRESHOLD" | bc -l) )); then
        action="proceed"
        reason="High confidence ($confidence >= $HIGH_CONFIDENCE_THRESHOLD)"
        return_code=0

    # Medium confidence - proceed with caution
    elif (( $(echo "$confidence >= $MEDIUM_CONFIDENCE_THRESHOLD" | bc -l) )); then
        # For high/critical priority tasks, escalate if confidence not high
        if [ "$priority" = "high" ] || [ "$priority" = "critical" ]; then
            action="escalate"
            reason="Medium confidence for high priority task (requires human review)"
            return_code=1
        else
            action="proceed_with_caution"
            reason="Medium confidence ($confidence >= $MEDIUM_CONFIDENCE_THRESHOLD), monitoring enabled"
            return_code=0
        fi

    # Low confidence - request more info or escalate
    elif (( $(echo "$confidence >= $LOW_CONFIDENCE_THRESHOLD" | bc -l) )); then
        action="request_more_info"
        reason="Low confidence ($confidence < $MEDIUM_CONFIDENCE_THRESHOLD), need more context"
        return_code=2

    # Very low confidence - always escalate
    else
        action="escalate"
        reason="Very low confidence ($confidence < $LOW_CONFIDENCE_THRESHOLD), human intervention required"
        return_code=1
    fi

    # Log evaluation
    local evaluation=$(jq -n \
        --arg timestamp "$timestamp" \
        --arg decision_type "$decision_type" \
        --arg confidence_str "$confidence" \
        --arg action "$action" \
        --arg reason "$reason" \
        --arg task_id "$task_id" \
        --arg priority "$priority" \
        --arg high_thresh "$HIGH_CONFIDENCE_THRESHOLD" \
        --arg medium_thresh "$MEDIUM_CONFIDENCE_THRESHOLD" \
        --arg low_thresh "$LOW_CONFIDENCE_THRESHOLD" \
        --arg context_str "$context_json" \
        '{
            timestamp: $timestamp,
            decision_type: $decision_type,
            confidence: ($confidence_str | tonumber),
            action: $action,
            reason: $reason,
            task_id: $task_id,
            priority: $priority,
            thresholds: {
                high: $high_thresh,
                medium: $medium_thresh,
                low: $low_thresh
            },
            context: ($context_str | fromjson)
        }')

    echo "$evaluation" | jq -c '.' >> "$EVALUATION_LOG"

    # Output evaluation result
    echo "$evaluation" | jq '.'

    return $return_code
}

##############################################################################
# should_proceed_with_routing: Gate before routing task to expert
# Args:
#   $1: routing_decision_json (from MoE router)
# Returns: 0 = proceed, 1 = escalate, 2 = need more info
##############################################################################
should_proceed_with_routing() {
    local routing_decision="$1"

    local confidence=$(echo "$routing_decision" | jq -r '.decision.primary_confidence // 0')
    local task_id=$(echo "$routing_decision" | jq -r '.task_id')
    local expert=$(echo "$routing_decision" | jq -r '.decision.primary_expert')
    local strategy=$(echo "$routing_decision" | jq -r '.decision.strategy')

    local context=$(jq -n \
        --arg task_id "$task_id" \
        --arg expert "$expert" \
        --arg strategy "$strategy" \
        '{task_id: $task_id, expert: $expert, strategy: $strategy}')

    evaluate_decision_confidence "routing" "$confidence" "$context"
}

##############################################################################
# should_proceed_with_worker_spawn: Gate before spawning worker
# Args:
#   $1: worker_spec_json
# Returns: 0 = proceed, 1 = escalate, 2 = need more info
##############################################################################
should_proceed_with_worker_spawn() {
    local worker_spec="$1"

    local task_id=$(echo "$worker_spec" | jq -r '.task_id')
    local worker_type=$(echo "$worker_spec" | jq -r '.worker_type')
    local token_budget=$(echo "$worker_spec" | jq -r '.token_budget // 8000')
    local priority=$(echo "$worker_spec" | jq -r '.context.priority // "medium"')

    # Estimate confidence based on worker type success history
    local confidence=$(get_worker_type_success_rate "$worker_type")

    local context=$(jq -n \
        --arg task_id "$task_id" \
        --arg worker_type "$worker_type" \
        --argjson token_budget "$token_budget" \
        --arg priority "$priority" \
        '{task_id: $task_id, worker_type: $worker_type, token_budget: $token_budget, priority: $priority}')

    evaluate_decision_confidence "worker_spawn" "$confidence" "$context"
}

##############################################################################
# should_proceed_with_decomposition: Gate before task decomposition
# Args:
#   $1: decomposition_plan_json
# Returns: 0 = proceed, 1 = escalate, 2 = need more info
##############################################################################
should_proceed_with_decomposition() {
    local decomposition_plan="$1"

    local task_id=$(echo "$decomposition_plan" | jq -r '.task_id')
    local subtask_count=$(echo "$decomposition_plan" | jq -r '.subtasks | length')
    local estimated_complexity=$(echo "$decomposition_plan" | jq -r '.estimated_complexity // 5')

    # Calculate confidence based on complexity vs. historical success
    local confidence=0.7  # Default medium confidence

    # Higher complexity → lower confidence
    if [ "$estimated_complexity" -gt 8 ]; then
        confidence=0.5
    elif [ "$estimated_complexity" -lt 4 ]; then
        confidence=0.85
    fi

    local context=$(jq -n \
        --arg task_id "$task_id" \
        --argjson subtask_count "$subtask_count" \
        --argjson complexity "$estimated_complexity" \
        '{task_id: $task_id, subtask_count: $subtask_count, complexity: $complexity}')

    evaluate_decision_confidence "decomposition" "$confidence" "$context"
}

##############################################################################
# get_worker_type_success_rate: Get historical success rate for worker type
# Args:
#   $1: worker_type
# Returns: Success rate (0-1)
##############################################################################
get_worker_type_success_rate() {
    local worker_type="$1"

    # TODO: Query actual worker history
    # For now, return defaults based on worker type
    case "$worker_type" in
        scan-worker) echo "0.90" ;;
        fix-worker) echo "0.75" ;;
        implementation-worker) echo "0.70" ;;
        analysis-worker) echo "0.85" ;;
        *) echo "0.65" ;;
    esac
}

##############################################################################
# get_evaluation_summary: Get summary of self-evaluations
# Returns: JSON summary of evaluation outcomes
##############################################################################
get_evaluation_summary() {
    if [ ! -f "$EVALUATION_LOG" ]; then
        echo '{"error": "No evaluations recorded"}' | jq '.'
        return 1
    fi

    local total=$(wc -l < "$EVALUATION_LOG" | tr -d ' ')
    local proceeded=$(grep -c '"action":"proceed"' "$EVALUATION_LOG" 2>/dev/null || echo "0")
    local escalated=$(grep -c '"action":"escalate"' "$EVALUATION_LOG" 2>/dev/null || echo "0")
    local requested_info=$(grep -c '"action":"request_more_info"' "$EVALUATION_LOG" 2>/dev/null || echo "0")

    jq -n \
        --argjson total "$total" \
        --argjson proceeded "$proceeded" \
        --argjson escalated "$escalated" \
        --argjson requested_info "$requested_info" \
        --arg timestamp "$(date +%Y-%m-%dT%H:%M:%S%z)" \
        --arg high_thresh "$HIGH_CONFIDENCE_THRESHOLD" \
        --arg medium_thresh "$MEDIUM_CONFIDENCE_THRESHOLD" \
        --arg low_thresh "$LOW_CONFIDENCE_THRESHOLD" \
        '{
            generated_at: $timestamp,
            total_evaluations: $total,
            actions: {
                proceeded: $proceeded,
                escalated: $escalated,
                requested_more_info: $requested_info
            },
            rates: {
                proceed_rate: (if $total > 0 then ($proceeded / $total) else 0 end),
                escalation_rate: (if $total > 0 then ($escalated / $total) else 0 end),
                info_request_rate: (if $total > 0 then ($requested_info / $total) else 0 end)
            },
            thresholds: {
                high: $high_thresh,
                medium: $medium_thresh,
                low: $low_thresh
            }
        }'
}

##############################################################################
# Main CLI
##############################################################################
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    command="${1:-help}"

    case "$command" in
        evaluate)
            if [ $# -lt 3 ]; then
                echo "Usage: $0 evaluate <decision_type> <confidence> [context_json]"
                exit 1
            fi
            evaluate_decision_confidence "$2" "$3" "${4:-{}}"
            ;;
        routing)
            if [ $# -lt 2 ]; then
                echo "Usage: $0 routing <routing_decision_json>"
                exit 1
            fi
            should_proceed_with_routing "$2"
            ;;
        worker)
            if [ $# -lt 2 ]; then
                echo "Usage: $0 worker <worker_spec_json>"
                exit 1
            fi
            should_proceed_with_worker_spawn "$2"
            ;;
        decomposition)
            if [ $# -lt 2 ]; then
                echo "Usage: $0 decomposition <decomposition_plan_json>"
                exit 1
            fi
            should_proceed_with_decomposition "$2"
            ;;
        summary)
            get_evaluation_summary
            ;;
        *)
            cat << EOF
Self-Evaluation Gates - Confidence-Based Decision Making

Usage:
  $0 evaluate <decision_type> <confidence> [context_json]
      Evaluate decision confidence

  $0 routing <routing_decision_json>
      Evaluate routing decision confidence

  $0 worker <worker_spec_json>
      Evaluate worker spawn confidence

  $0 decomposition <decomposition_plan_json>
      Evaluate decomposition confidence

  $0 summary
      Get evaluation summary

Return Codes:
  0 = Proceed (confidence acceptable)
  1 = Escalate to human (confidence too low)
  2 = Request more information (confidence uncertain)

Examples:
  $0 evaluate routing 0.85 '{"task_id":"task-001","priority":"high"}'
  $0 summary
EOF
            ;;
    esac
fi
