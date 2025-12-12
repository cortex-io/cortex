#!/usr/bin/env bash
# RLHF Feedback Collector - "Thumbs Up/Thumbs Down" System
# Implements Reinforcement Learning with Human Feedback
# Inspired by AI Agent Anatomy: "After completion, ask: 'How did I do?'"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_HOME="${CORTEX_HOME:-$(cd "$SCRIPT_DIR/../.." && pwd)}"

# Feedback storage locations
FEEDBACK_PENDING_DIR="$CORTEX_HOME/coordination/feedback/pending"
FEEDBACK_PROCESSED_DIR="$CORTEX_HOME/coordination/feedback/processed"
FEEDBACK_LOG="$CORTEX_HOME/coordination/knowledge-base/feedback-reports/rlhf-feedback.jsonl"
FEEDBACK_SUMMARY="$CORTEX_HOME/coordination/knowledge-base/feedback-reports/rlhf-summary.json"

# Ensure directories exist
mkdir -p "$FEEDBACK_PENDING_DIR" "$FEEDBACK_PROCESSED_DIR" "$(dirname "$FEEDBACK_LOG")"

##############################################################################
# request_task_feedback: Request human feedback on completed task
# This is the "How did I do?" moment from the AI Agent transcript
# Args:
#   $1: task_id
#   $2: task_title
#   $3: expert_assigned (which master handled it)
#   $4: routing_confidence (0-1)
#   $5: outcome_status (success|failure|partial)
# Returns: Creates feedback request file in pending directory
##############################################################################
request_task_feedback() {
    local task_id="$1"
    local task_title="$2"
    local expert_assigned="$3"
    local routing_confidence="$4"
    local outcome_status="$5"
    local timestamp=$(date +"%Y-%m-%dT%H:%M:%S%z")

    # Create feedback request
    local feedback_request=$(jq -n \
        --arg task_id "$task_id" \
        --arg timestamp "$timestamp" \
        --arg title "$task_title" \
        --arg expert "$expert_assigned" \
        --argjson confidence "$routing_confidence" \
        --arg status "$outcome_status" \
        '{
            feedback_request_id: ("fbr-" + ($timestamp | gsub("[^0-9]"; "")[0:14])),
            task_id: $task_id,
            task_title: $title,
            expert_assigned: $expert,
            routing_confidence: $confidence,
            outcome_status: $status,
            created_at: $timestamp,
            feedback_status: "pending",
            questions: {
                routing_quality: {
                    question: "Was the task routed to the correct expert?",
                    options: [
                        "✅ Correct expert (boost confidence)",
                        "⚠️ Acceptable but not ideal (neutral)",
                        "❌ Wrong expert (penalize routing)"
                    ],
                    answer: null,
                    impact: "routing_learning"
                },
                outcome_quality: {
                    question: "Did the task outcome meet your expectations?",
                    options: [
                        "🌟 Excellent - exceeded expectations",
                        "✅ Good - met expectations",
                        "⚠️ Acceptable - some issues",
                        "❌ Poor - did not meet needs"
                    ],
                    answer: null,
                    impact: "quality_metrics"
                },
                task_difficulty: {
                    question: "How would you rate the task complexity?",
                    options: [
                        "Simple (1-3)",
                        "Moderate (4-6)",
                        "Complex (7-9)",
                        "Very Complex (10)"
                    ],
                    answer: null,
                    impact: "complexity_calibration"
                },
                would_retry: {
                    question: "Would you route this type of task the same way again?",
                    options: [
                        "Yes, same expert",
                        "Yes, but different expert",
                        "No, needs decomposition",
                        "No, needs human intervention"
                    ],
                    answer: null,
                    impact: "routing_policy"
                }
            },
            open_feedback: {
                question: "Any additional comments or suggestions?",
                answer: null
            }
        }')

    # Write to pending feedback directory
    local feedback_file="$FEEDBACK_PENDING_DIR/${task_id}-feedback.json"
    echo "$feedback_request" > "$feedback_file"

    # Log feedback request
    echo "📋 Feedback requested for task: $task_id ($expert_assigned)" >&2
    echo "   View at: $feedback_file" >&2

    # Return feedback request ID
    echo "$feedback_request" | jq -r '.feedback_request_id'
}

##############################################################################
# record_feedback_response: Process human feedback response
# This is where "thumbs up/thumbs down" gets recorded
# Args:
#   $1: feedback_request_id
#   $2: routing_quality_answer (0-2: wrong, acceptable, correct)
#   $3: outcome_quality_answer (0-3: poor, acceptable, good, excellent)
#   $4: task_difficulty_answer (1-10)
#   $5: would_retry_answer (string)
#   $6: open_feedback (optional)
# Returns: Updates learning systems with feedback
##############################################################################
record_feedback_response() {
    local feedback_request_id="$1"
    local routing_quality="${2:-1}"  # Default: acceptable
    local outcome_quality="${3:-1}"  # Default: acceptable
    local task_difficulty="${4:-5}"  # Default: moderate
    local would_retry="${5:-Yes, same expert}"
    local open_feedback="${6:-}"
    local timestamp=$(date +"%Y-%m-%dT%H:%M:%S%z")

    # Find feedback request file
    local feedback_file=$(find "$FEEDBACK_PENDING_DIR" -name "*-feedback.json" | xargs grep -l "$feedback_request_id" 2>/dev/null | head -1)

    if [ -z "$feedback_file" ]; then
        echo "❌ Error: Feedback request $feedback_request_id not found" >&2
        return 1
    fi

    # Load original request
    local original=$(cat "$feedback_file")
    local task_id=$(echo "$original" | jq -r '.task_id')
    local expert=$(echo "$original" | jq -r '.expert_assigned')
    local confidence=$(echo "$original" | jq -r '.routing_confidence')

    # Create feedback response
    local feedback_response=$(echo "$original" | jq \
        --arg timestamp "$timestamp" \
        --argjson routing_quality "$routing_quality" \
        --argjson outcome_quality "$outcome_quality" \
        --argjson difficulty "$task_difficulty" \
        --arg retry "$would_retry" \
        --arg comments "$open_feedback" \
        '.feedback_status = "completed" |
         .completed_at = $timestamp |
         .questions.routing_quality.answer = $routing_quality |
         .questions.outcome_quality.answer = $outcome_quality |
         .questions.task_difficulty.answer = $difficulty |
         .questions.would_retry.answer = $retry |
         .open_feedback.answer = $comments')

    # Calculate feedback scores
    local routing_score=0
    case "$routing_quality" in
        0) routing_score=-1.0 ;;  # Wrong expert - penalize
        1) routing_score=0.0 ;;   # Acceptable - neutral
        2) routing_score=1.0 ;;   # Correct - boost
    esac

    local quality_score=0.0
    case "$outcome_quality" in
        0) quality_score=0.25 ;;  # Poor
        1) quality_score=0.5 ;;   # Acceptable
        2) quality_score=0.75 ;;  # Good
        3) quality_score=1.0 ;;   # Excellent
    esac

    # Create learning update
    local learning_update=$(echo "$feedback_response" | jq \
        --arg expert "$expert" \
        --argjson routing_score "$routing_score" \
        --argjson quality_score "$quality_score" \
        --argjson actual_difficulty "$task_difficulty" \
        '.learning_update = {
            expert: $expert,
            routing_feedback: $routing_score,
            quality_feedback: $quality_score,
            complexity_calibration: $actual_difficulty,
            learning_signals: {
                boost_routing: ($routing_score > 0),
                penalize_routing: ($routing_score < 0),
                update_complexity_model: true,
                update_quality_expectations: true
            }
        }')

    # Log to RLHF feedback log (JSONL)
    echo "$learning_update" | jq -c '.' >> "$FEEDBACK_LOG"

    # Move from pending to processed
    local processed_file="$FEEDBACK_PROCESSED_DIR/$(basename "$feedback_file")"
    echo "$learning_update" > "$processed_file"
    rm "$feedback_file"

    echo "✅ Feedback recorded for task: $task_id" >&2
    echo "   Routing score: $routing_score | Quality score: $quality_score" >&2

    # Trigger learning system updates
    apply_feedback_to_learning_systems "$task_id" "$expert" "$routing_score" "$quality_score" "$task_difficulty"

    return 0
}

##############################################################################
# apply_feedback_to_learning_systems: Update routing weights based on feedback
# This is the "course correction" mechanism from the transcript
# Args:
#   $1: task_id
#   $2: expert
#   $3: routing_score (-1.0 to 1.0)
#   $4: quality_score (0.0 to 1.0)
#   $5: actual_difficulty (1-10)
##############################################################################
apply_feedback_to_learning_systems() {
    local task_id="$1"
    local expert="$2"
    local routing_score="$3"
    local quality_score="$4"
    local actual_difficulty="$5"

    # Update routing patterns with feedback
    local routing_feedback_file="$CORTEX_HOME/coordination/masters/coordinator/knowledge-base/feedback-reports/routing-feedback-$(date +%Y%m%d).jsonl"

    local routing_update=$(jq -n \
        --arg task_id "$task_id" \
        --arg expert "$expert" \
        --argjson routing_score "$routing_score" \
        --argjson quality_score "$quality_score" \
        --arg timestamp "$(date +%Y-%m-%dT%H:%M:%S%z)" \
        '{
            task_id: $task_id,
            expert: $expert,
            routing_feedback_score: $routing_score,
            outcome_quality_score: $quality_score,
            timestamp: $timestamp,
            feedback_type: "rlhf_human",
            learning_weight: 2.0
        }')

    echo "$routing_update" >> "$routing_feedback_file"

    # Trigger MoE router weight reload if routing feedback script exists
    if [ -f "$CORTEX_HOME/coordination/masters/coordinator/lib/moe-router.sh" ]; then
        # Router will pick up feedback on next reload
        echo "🔄 Routing weights will update on next MoE router reload" >&2
    fi

    echo "✅ Feedback applied to learning systems" >&2
}

##############################################################################
# get_pending_feedback_count: Get count of pending feedback requests
# Returns: Number of pending feedback requests
##############################################################################
get_pending_feedback_count() {
    find "$FEEDBACK_PENDING_DIR" -name "*-feedback.json" 2>/dev/null | wc -l | tr -d ' '
}

##############################################################################
# list_pending_feedback: List all pending feedback requests
# Returns: JSON array of pending feedback requests
##############################################################################
list_pending_feedback() {
    local requests=()

    # Use nullglob to handle no matches gracefully
    shopt -s nullglob
    for file in "$FEEDBACK_PENDING_DIR"/*-feedback.json; do
        if [ -f "$file" ]; then
            requests+=("$(cat "$file")")
        fi
    done
    shopt -u nullglob

    if [ ${#requests[@]} -eq 0 ]; then
        echo "[]"
    else
        printf '%s\n' "${requests[@]}" | jq -s '.'
    fi
}

##############################################################################
# generate_feedback_summary: Generate summary of RLHF feedback over time
# Returns: Summary statistics and trends
##############################################################################
generate_feedback_summary() {
    if [ ! -f "$FEEDBACK_LOG" ]; then
        echo '{"error": "No feedback data available"}' | jq '.'
        return 1
    fi

    local total_feedback=$(wc -l < "$FEEDBACK_LOG" | tr -d ' ')
    local positive_routing=$(grep -c '"routing_feedback":1' "$FEEDBACK_LOG" 2>/dev/null || echo "0")
    local negative_routing=$(grep -c '"routing_feedback":-1' "$FEEDBACK_LOG" 2>/dev/null || echo "0")

    jq -n \
        --argjson total "$total_feedback" \
        --argjson positive "$positive_routing" \
        --argjson negative "$negative_routing" \
        --arg timestamp "$(date +%Y-%m-%dT%H:%M:%S%z)" \
        '{
            generated_at: $timestamp,
            total_feedback_received: $total,
            routing_accuracy: {
                positive_feedback: $positive,
                negative_feedback: $negative,
                accuracy_rate: (if $total > 0 then ($positive / $total) else 0 end)
            },
            learning_status: "active",
            next_meta_learning_run: "daily@02:00"
        }' | tee "$FEEDBACK_SUMMARY"
}

##############################################################################
# Main CLI
##############################################################################
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    command="${1:-help}"

    case "$command" in
        request)
            if [ $# -lt 5 ]; then
                echo "Usage: $0 request <task_id> <task_title> <expert> <confidence> <status>"
                exit 1
            fi
            request_task_feedback "$2" "$3" "$4" "$5" "$6"
            ;;
        respond)
            if [ $# -lt 5 ]; then
                echo "Usage: $0 respond <feedback_request_id> <routing_quality> <outcome_quality> <difficulty> [retry] [comments]"
                exit 1
            fi
            record_feedback_response "$2" "$3" "$4" "$5" "${6:-}" "${7:-}"
            ;;
        list)
            list_pending_feedback
            ;;
        count)
            get_pending_feedback_count
            ;;
        summary)
            generate_feedback_summary
            ;;
        *)
            cat << EOF
RLHF Feedback Collector - Reinforcement Learning with Human Feedback

Usage:
  $0 request <task_id> <title> <expert> <confidence> <status>
      Request feedback on completed task

  $0 respond <feedback_request_id> <routing_quality> <outcome_quality> <difficulty> [retry] [comments]
      Record human feedback response

  $0 list
      List pending feedback requests

  $0 count
      Get count of pending feedback

  $0 summary
      Generate feedback summary and statistics

Example:
  $0 request task-001 "Security scan" security 0.85 success
  $0 respond fbr-20251212202821 2 3 5 "Yes, same expert" "Great job!"
EOF
            ;;
    esac
fi
