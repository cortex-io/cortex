#!/usr/bin/env bash
#
# Workflow Visualizer - ASCII DAG visualization
# Part of Cortex Workflow Executor
#

set -euo pipefail

##############################################################################
# visualize_workflow: Generate ASCII DAG visualization
# Arguments:
#   $1 - Execution plan JSON (with execution_groups)
# Returns:
#   ASCII diagram on stdout
##############################################################################
visualize_workflow() {
    local execution_plan="$1"

    local total_groups=$(echo "$execution_plan" | jq '.execution_groups | length')

    echo ""
    echo "Execution Plan ($total_groups groups):"
    echo ""

    for ((g=0; g<total_groups; g++)); do
        local group=$(echo "$execution_plan" | jq ".execution_groups[$g]")
        local parallelism=$(echo "$group" | jq '.parallelism')
        local steps=$(echo "$group" | jq -r '.steps[]')

        if [[ $parallelism -eq 1 ]]; then
            # Sequential step
            local step_id=$(echo "$steps" | head -1)
            echo "  [$g] $step_id"
        else
            # Parallel steps
            echo "  ┌────┴$(printf '─%.0s' $(seq 1 $((parallelism * 8))))┐"
            local i=0
            while IFS= read -r step_id; do
                if [[ $i -eq 0 ]]; then
                    echo -n "  [$g"
                else
                    echo -n "      "
                fi
                echo "${step_id:0:1}] $step_id"
                i=$((i + 1))
            done <<< "$steps"
            echo "  └────┬$(printf '─%.0s' $(seq 1 $((parallelism * 8))))┘"
        fi

        # Arrow to next group
        if [[ $((g + 1)) -lt $total_groups ]]; then
            echo "       ↓"
        fi
    done

    echo ""
}

##############################################################################
# visualize_workflow_status: Show workflow execution status
# Arguments:
#   $1 - Workflow state JSON
# Returns:
#   Status visualization
##############################################################################
visualize_workflow_status() {
    local state="$1"

    local workflow_name=$(echo "$state" | jq -r '.workflow_name')
    local status=$(echo "$state" | jq -r '.status')
    local current_group=$(echo "$state" | jq -r '.current_execution_group')
    local total_groups=$(echo "$state" | jq -r '.total_execution_groups')

    echo ""
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║  Workflow: $workflow_name"
    echo "║  Status: $status"
    echo "║  Progress: Group $current_group / $total_groups"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""

    # Show step statuses
    echo "Steps:"
    echo "$state" | jq -r '.steps | to_entries[] | "  [\(.value.status)] \(.key)"'
    echo ""
}

# Allow running as standalone
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    if [[ $# -lt 1 ]]; then
        echo "Usage: $0 <execution_plan.json|state.json>"
        exit 1
    fi

    input="$1"

    # Determine if it's execution plan or state
    if echo "$input" | jq -e '.execution_groups' > /dev/null 2>&1; then
        visualize_workflow "$input"
    elif echo "$input" | jq -e '.workflow_name' > /dev/null 2>&1; then
        visualize_workflow_status "$input"
    else
        echo "ERROR: Invalid input format"
        exit 1
    fi
fi
