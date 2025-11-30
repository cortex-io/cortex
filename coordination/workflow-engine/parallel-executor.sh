#!/usr/bin/env bash
#
# Parallel Executor - Execute multiple steps concurrently
# Part of Cortex Workflow Executor
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

##############################################################################
# execute_parallel: Execute multiple steps in parallel
# Arguments:
#   $1 - Steps JSON array
#   $2 - Workflow run ID
#   $3 - Workflow state JSON
#   $4 - Step executor command
# Returns:
#   Results JSON with success/failure counts
##############################################################################
execute_parallel() {
    local steps_json="$1"
    local workflow_run_id="$2"
    local workflow_state="$3"
    local step_executor="$4"

    local steps_count=$(echo "$steps_json" | jq 'length')

    if [[ $steps_count -eq 0 ]]; then
        echo '{"completed": 0, "failed": 0, "total": 0}'
        return 0
    fi

    # Track PIDs and outputs
    local temp_dir=$(mktemp -d)
    local pids_file="${temp_dir}/pids"
    local results_file="${temp_dir}/results"

    # Spawn all jobs in background
    for ((i=0; i<steps_count; i++)); do
        local step=$(echo "$steps_json" | jq -c ".[$i]")
        local step_id=$(echo "$step" | jq -r '.id')
        local output_file="${temp_dir}/${step_id}.out"
        local exitcode_file="${temp_dir}/${step_id}.exit"

        echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ▶ Step: $step_id (parallel)" >&2

        # Execute step in background
        (
            set +e
            "$step_executor" "$step" "$workflow_run_id" "$workflow_state" > "$output_file" 2>&1
            echo $? > "$exitcode_file"
        ) &

        local pid=$!
        echo "${step_id}|${pid}|$(date +%s)" >> "$pids_file"
    done

    # Wait for all jobs and collect results
    local completed=0
    local failed=0

    while IFS='|' read -r step_id pid start_time; do
        wait "$pid" 2>/dev/null || true

        local exit_code=$(cat "${temp_dir}/${step_id}.exit" 2>/dev/null || echo "1")
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))

        if [[ "$exit_code" -eq 0 ]]; then
            echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ✓ Step: $step_id (${duration}s)" >&2
            completed=$((completed + 1))
            echo "${step_id}|success" >> "$results_file"
        else
            echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ✗ Step: $step_id (${duration}s, exit: $exit_code)" >&2
            failed=$((failed + 1))
            echo "${step_id}|failed" >> "$results_file"
        fi
    done < "$pids_file"

    # Cleanup
    rm -rf "$temp_dir"

    # Return results
    jq -n \
        --arg completed "$completed" \
        --arg failed "$failed" \
        --arg total "$steps_count" \
        '{
            completed: ($completed | tonumber),
            failed: ($failed | tonumber),
            total: ($total | tonumber)
        }'

    [[ $failed -eq 0 ]]
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    echo "Parallel Executor - Use via main executor"
    exit 1
fi
