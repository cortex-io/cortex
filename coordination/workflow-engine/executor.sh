#!/usr/bin/env bash
#
# Main Workflow Executor - Orchestrates workflow execution
# Part of Cortex Workflow Executor
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Import all components
source "${SCRIPT_DIR}/parser.sh"
source "${SCRIPT_DIR}/dependency-resolver.sh"
source "${SCRIPT_DIR}/state-manager.sh"
source "${SCRIPT_DIR}/step-runner.sh"
source "${SCRIPT_DIR}/parallel-executor.sh"
source "${SCRIPT_DIR}/visualizer.sh"

##############################################################################
# execute_workflow: Main workflow execution function
# Arguments:
#   $1 - Workflow YAML file path
#   $2 - Input values JSON (optional, defaults to {})
#   $3 - Options: --dry-run, --visualize
# Returns:
#   Workflow run ID on success
##############################################################################
execute_workflow() {
    local workflow_file="$1"
    local inputs_json="$2"
    if [[ -z "$inputs_json" ]]; then
        inputs_json="{}"
    fi
    local dry_run=false
    local visualize=false

    # Parse options
    shift 2 || true
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --dry-run) dry_run=true ;;
            --visualize) visualize=true ;;
            *) ;;
        esac
        shift
    done

    echo "════════════════════════════════════════════════════════════"
    echo "  Cortex Workflow Executor"
    echo "════════════════════════════════════════════════════════════"
    echo ""

    # Step 1: Parse workflow
    echo "[1/6] Parsing workflow..."
    local parsed_workflow=$(parse_workflow "$workflow_file")

    if [[ $? -ne 0 ]]; then
        echo "ERROR: Failed to parse workflow"
        return 1
    fi

    local workflow_name=$(echo "$parsed_workflow" | jq -r '.name')
    echo "      Workflow: $workflow_name"

    # Step 2: Validate inputs
    echo "[2/6] Validating inputs..."
    if ! validate_workflow_inputs "$parsed_workflow" "$inputs_json"; then
        return 1
    fi
    echo "      ✓ Inputs valid"

    # Step 3: Build execution plan (DAG resolution)
    echo "[3/6] Building execution plan..."
    local execution_plan=$(resolve_dependencies "$parsed_workflow")

    if [[ $? -ne 0 ]]; then
        echo "ERROR: Failed to resolve dependencies"
        return 1
    fi

    local total_groups=$(echo "$execution_plan" | jq '.execution_groups | length')
    local total_steps=$(echo "$parsed_workflow" | jq '.steps | length')
    echo "      Steps: $total_steps"
    echo "      Execution groups: $total_groups"

    # Visualize if requested
    if [[ "$visualize" == "true" ]]; then
        visualize_workflow "$execution_plan"
    fi

    # Dry run exits here
    if [[ "$dry_run" == "true" ]]; then
        echo ""
        echo "✓ Dry run successful - workflow is valid"
        return 0
    fi

    # Step 4: Initialize workflow state
    echo "[4/6] Initializing workflow state..."
    local workflow_run_id="wf-run-$(date +%Y%m%d-%H%M%S)-$$"
    local state=$(init_workflow_state "$workflow_run_id" "$parsed_workflow" "$inputs_json")
    echo "      Run ID: $workflow_run_id"

    # Step 5: Execute workflow
    echo "[5/6] Executing workflow..."
    echo ""

    local current_state="$state"
    local failed=false

    for ((g=0; g<total_groups; g++)); do
        local group=$(echo "$execution_plan" | jq ".execution_groups[$g]")
        local parallelism=$(echo "$group" | jq '.parallelism')
        local group_steps=$(echo "$group" | jq -c '.steps')

        echo "═══ Execution Group $((g + 1))/$total_groups (parallelism: $parallelism) ═══"

        # Get full step definitions for this group
        local steps_to_execute="[]"
        echo "$group_steps" | jq -r '.[]' | while read -r step_id; do
            local step_def=$(echo "$parsed_workflow" | jq -c ".steps[] | select(.id == \"$step_id\")")
            steps_to_execute=$(echo "$steps_to_execute" | jq --argjson step "$step_def" '. + [$step]')
        done

        # Execute group
        if [[ $parallelism -eq 1 ]]; then
            # Sequential execution
            local step_id=$(echo "$group_steps" | jq -r '.[0]')
            local step=$(echo "$parsed_workflow" | jq -c ".steps[] | select(.id == \"$step_id\")")

            if ! execute_step "$step" "$workflow_run_id" "$current_state"; then
                failed=true
                break
            fi
        else
            # Parallel execution
            if ! execute_parallel "$steps_to_execute" "$workflow_run_id" "$current_state" "${SCRIPT_DIR}/step-runner.sh execute_step"; then
                failed=true
                break
            fi
        fi

        # Update current state
        current_state=$(get_workflow_state "$workflow_run_id")

        # Update execution group progress
        update_workflow_state "$workflow_run_id" "{\"current_execution_group\": $((g + 1))}" > /dev/null

        echo ""
    done

    # Step 6: Finalize workflow
    echo "[6/6] Finalizing workflow..."

    if [[ "$failed" == "true" ]]; then
        fail_workflow "$workflow_run_id" "One or more steps failed"
        echo ""
        echo "✗ Workflow FAILED"
        echo "   Run ID: $workflow_run_id"
        return 1
    else
        # Extract outputs
        local outputs=$(echo "$current_state" | jq '.steps | to_entries | map({key: .key, value: .value.outputs}) | from_entries')
        complete_workflow "$workflow_run_id" "$outputs"

        echo ""
        echo "════════════════════════════════════════════════════════════"
        echo "✓ Workflow COMPLETED successfully"
        echo "  Run ID: $workflow_run_id"
        echo "════════════════════════════════════════════════════════════"
        echo ""

        echo "$workflow_run_id"
        return 0
    fi
}

# Main entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    if [[ $# -lt 1 ]]; then
        cat <<EOF
Usage: $0 <workflow.yaml> [inputs.json] [options]

Options:
  --dry-run     Validate workflow without executing
  --visualize   Show ASCII workflow diagram

Examples:
  $0 coordination/workflows/security-audit.yaml
  $0 my-workflow.yaml '{"repo": "github.com/user/repo"}'
  $0 workflow.yaml '{}' --dry-run --visualize

EOF
        exit 1
    fi

    execute_workflow "$@"
fi
