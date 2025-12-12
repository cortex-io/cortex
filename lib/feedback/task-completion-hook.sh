#!/usr/bin/env bash
# Task Completion Hook - Automatically request RLHF feedback
# Integrates with worker completion to trigger "How did I do?" feedback

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RLHF_COLLECTOR="$SCRIPT_DIR/rlhf-collector.sh"

##############################################################################
# on_task_complete: Hook called when task completes
# Args:
#   $1: task_json (JSON object with task details)
# Returns: Feedback request ID if created
##############################################################################
on_task_complete() {
    local task_json="$1"

    # Extract task details
    local task_id=$(echo "$task_json" | jq -r '.id // .task_id')
    local task_title=$(echo "$task_json" | jq -r '.title // "Untitled task"')
    local expert=$(echo "$task_json" | jq -r '.assigned_to // .expert // "unknown"')
    local confidence=$(echo "$task_json" | jq -r '.routing_confidence // 0.5')
    local status=$(echo "$task_json" | jq -r '.status // .result.status // "unknown"')

    # Convert status to outcome
    local outcome="partial"
    case "$status" in
        completed|success) outcome="success" ;;
        failed|failure|error) outcome="failure" ;;
    esac

    # Determine if feedback should be requested
    local should_request_feedback=false

    # Always request feedback for:
    # 1. Tasks with low routing confidence (<0.7)
    # 2. Failed tasks
    # 3. High priority tasks
    # 4. Random 10% sample of all tasks

    local priority=$(echo "$task_json" | jq -r '.priority // "medium"')
    local random=$((RANDOM % 100))

    if (( $(echo "$confidence < 0.7" | bc -l 2>/dev/null || echo 0) )); then
        should_request_feedback=true
        echo "🎯 Low confidence routing - requesting feedback" >&2
    elif [ "$outcome" = "failure" ]; then
        should_request_feedback=true
        echo "🎯 Failed task - requesting feedback" >&2
    elif [ "$priority" = "high" ] || [ "$priority" = "critical" ]; then
        should_request_feedback=true
        echo "🎯 High priority task - requesting feedback" >&2
    elif [ $random -lt 10 ]; then
        should_request_feedback=true
        echo "🎯 Random sample - requesting feedback" >&2
    fi

    # Request feedback if criteria met
    if [ "$should_request_feedback" = true ]; then
        "$RLHF_COLLECTOR" request "$task_id" "$task_title" "$expert" "$confidence" "$outcome"
    else
        echo "ℹ️ Feedback not requested for task $task_id (confidence: $confidence)" >&2
        return 0
    fi
}

##############################################################################
# Main execution
##############################################################################
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    if [ $# -lt 1 ]; then
        cat << EOF
Task Completion Hook - RLHF Feedback Integration

Usage:
  $0 <task_json>
      Process task completion and request feedback if appropriate

  $0 test
      Run test with sample task

Example:
  echo '{"id":"task-001","title":"Test","assigned_to":"security","routing_confidence":0.6,"status":"completed"}' | $0 -

EOF
        exit 1
    fi

    if [ "$1" = "test" ]; then
        # Test mode
        test_task='{
            "id": "task-test-001",
            "title": "Test security scan",
            "assigned_to": "security",
            "routing_confidence": 0.6,
            "status": "completed",
            "priority": "high"
        }'
        echo "Running test with sample task..." >&2
        echo "$test_task" | on_task_complete "$test_task"
    elif [ "$1" = "-" ]; then
        # Read from stdin
        task_json=$(cat)
        on_task_complete "$task_json"
    else
        # Read from argument
        on_task_complete "$1"
    fi
fi
