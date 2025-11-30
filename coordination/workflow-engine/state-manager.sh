#!/usr/bin/env bash
#
# State Manager - Atomic workflow state management with durability
# Part of Cortex Workflow Executor
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
STATE_DIR="${CORTEX_ROOT}/coordination/workflow-state"

##############################################################################
# init_workflow_state: Initialize new workflow execution state
# Arguments:
#   $1 - Workflow run ID
#   $2 - Workflow JSON (parsed workflow)
#   $3 - Input values JSON
# Returns:
#   Initial state JSON
##############################################################################
init_workflow_state() {
    local workflow_run_id="$1"
    local workflow_json="$2"
    local inputs_json="$3"

    local run_dir="${STATE_DIR}/active/${workflow_run_id}"
    mkdir -p "$run_dir"/{steps,outputs}

    local workflow_name=$(echo "$workflow_json" | jq -r '.name')
    local total_groups=$(echo "$workflow_json" | jq '.execution_groups | length' 2>/dev/null || echo "1")

    # Initialize step states
    local steps_state="{}"
    local steps=$(echo "$workflow_json" | jq -c '.steps[]' 2>/dev/null || echo "")
    while IFS= read -r step; do
        if [[ -n "$step" ]]; then
            local step_id=$(echo "$step" | jq -r '.id')
            steps_state=$(echo "$steps_state" | jq \
                --arg id "$step_id" \
                '. + {($id): {status: "pending", retry_count: 0}}')
        fi
    done <<< "$steps"

    # Create initial state
    local initial_state
    initial_state=$(jq -n \
        --arg run_id "$workflow_run_id" \
        --arg name "$workflow_name" \
        --argjson inputs "$inputs_json" \
        --argjson steps "$steps_state" \
        --arg total_groups "$total_groups" \
        '{
            workflow_run_id: $run_id,
            workflow_name: $name,
            status: "initialized",
            started_at: (now | strftime("%Y-%m-%dT%H:%M:%SZ")),
            updated_at: (now | strftime("%Y-%m-%dT%H:%M:%SZ")),
            current_execution_group: 0,
            total_execution_groups: ($total_groups | tonumber),
            inputs: $inputs,
            steps: $steps,
            outputs: {}
        }')

    # Write state atomically
    local state_file="${run_dir}/state.json"
    local temp_file="${state_file}.tmp.$$"
    echo "$initial_state" > "$temp_file"
    mv "$temp_file" "$state_file"
    sync

    echo "$initial_state"
}

##############################################################################
# update_workflow_state: Update workflow state atomically
# Arguments:
#   $1 - Workflow run ID
#   $2 - Updates JSON (will be merged with current state)
# Returns:
#   Updated state JSON
##############################################################################
update_workflow_state() {
    local workflow_run_id="$1"
    local updates="$2"

    local state_file="${STATE_DIR}/active/${workflow_run_id}/state.json"

    if [[ ! -f "$state_file" ]]; then
        echo "ERROR: Workflow state not found: $workflow_run_id" >&2
        return 1
    fi

    # Read current state
    local current_state
    current_state=$(cat "$state_file")

    # Apply updates (merge)
    local new_state
    new_state=$(echo "$current_state" | jq \
        --argjson updates "$updates" \
        '. * $updates | .updated_at = (now | strftime("%Y-%m-%dT%H:%M:%SZ"))')

    # Atomic write
    local temp_file="${state_file}.tmp.$$"
    echo "$new_state" > "$temp_file"
    mv "$temp_file" "$state_file"
    sync

    echo "$new_state"
}

##############################################################################
# get_workflow_state: Get current workflow state
# Arguments:
#   $1 - Workflow run ID
# Returns:
#   Current state JSON
##############################################################################
get_workflow_state() {
    local workflow_run_id="$1"
    local state_file="${STATE_DIR}/active/${workflow_run_id}/state.json"

    if [[ ! -f "$state_file" ]]; then
        # Check completed
        state_file="${STATE_DIR}/completed/${workflow_run_id}/state.json"
        if [[ ! -f "$state_file" ]]; then
            # Check failed
            state_file="${STATE_DIR}/failed/${workflow_run_id}/state.json"
            if [[ ! -f "$state_file" ]]; then
                echo "ERROR: Workflow not found: $workflow_run_id" >&2
                return 1
            fi
        fi
    fi

    local content
    content=$(cat "$state_file")
    echo "$content"
}

##############################################################################
# complete_workflow: Move workflow to completed state
# Arguments:
#   $1 - Workflow run ID
#   $2 - Final outputs JSON
# Returns:
#   0 on success
##############################################################################
complete_workflow() {
    local workflow_run_id="$1"
    local outputs="$2"

    # Ensure outputs is valid JSON (default to empty object if not provided)
    if [[ -z "$outputs" || "$outputs" == "null" ]]; then
        outputs="{}"
    fi

    # Update state to completed
    local updates
    updates=$(jq -n --argjson outputs "$outputs" '{status: "completed", completed_at: (now | strftime("%Y-%m-%dT%H:%M:%SZ")), outputs: $outputs}')

    update_workflow_state "$workflow_run_id" "$updates" > /dev/null

    # Move to completed directory
    local active_dir="${STATE_DIR}/active/${workflow_run_id}"
    local completed_dir="${STATE_DIR}/completed/${workflow_run_id}"

    mkdir -p "${STATE_DIR}/completed"
    mv "$active_dir" "$completed_dir"

    return 0
}

##############################################################################
# fail_workflow: Move workflow to failed state
# Arguments:
#   $1 - Workflow run ID
#   $2 - Error message
# Returns:
#   0 on success
##############################################################################
fail_workflow() {
    local workflow_run_id="$1"
    local error_message="$2"

    # Update state to failed
    local updates=$(jq -n \
        --arg error "$error_message" \
        '{
            status: "failed",
            failed_at: (now | strftime("%Y-%m-%dT%H:%M:%SZ")),
            error: $error
        }')

    update_workflow_state "$workflow_run_id" "$updates" > /dev/null

    # Move to failed directory
    local active_dir="${STATE_DIR}/active/${workflow_run_id}"
    local failed_dir="${STATE_DIR}/failed/${workflow_run_id}"

    mkdir -p "${STATE_DIR}/failed"
    mv "$active_dir" "$failed_dir"

    return 0
}

# Allow running as standalone script for testing
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    case "${1:-}" in
        init)
            init_workflow_state "$2" "$3" "${4:-{}}"
            ;;
        update)
            update_workflow_state "$2" "$3"
            ;;
        get)
            get_workflow_state "$2"
            ;;
        complete)
            complete_workflow "$2" "${3:-{}}"
            ;;
        fail)
            fail_workflow "$2" "${3:-Unknown error}"
            ;;
        *)
            echo "Usage: $0 {init|update|get|complete|fail} <workflow_run_id> [args...]"
            exit 1
            ;;
    esac
fi
