#!/usr/bin/env bash
#
# Step Runner - Execute individual workflow steps
# Supports: bash, delegate, http_request, aggregate
# Part of Cortex Workflow Executor
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Import dependencies
source "${SCRIPT_DIR}/output-resolver.sh"
source "${SCRIPT_DIR}/state-manager.sh"

##############################################################################
# execute_step: Execute a single workflow step
# Arguments:
#   $1 - Step JSON
#   $2 - Workflow run ID
#   $3 - Workflow state JSON
# Returns:
#   Step output JSON
##############################################################################
execute_step() {
    local step="$1"
    local workflow_run_id="$2"
    local workflow_state="$3"

    local step_id=$(echo "$step" | jq -r '.id')
    local action=$(echo "$step" | jq -r '.action')

    # Update state: running
    update_workflow_state "$workflow_run_id" "$(jq -n \
        --arg id "$step_id" \
        '{steps: {($id): {status: "running", started_at: (now | strftime("%Y-%m-%dT%H:%M:%SZ"))}}}')" > /dev/null

    local result=""
    local exit_code=0

    case "$action" in
        bash)
            result=$(execute_bash_step "$step" "$workflow_state") || exit_code=$?
            ;;
        delegate)
            result=$(execute_delegate_step "$step" "$workflow_state") || exit_code=$?
            ;;
        http_request)
            result=$(execute_http_step "$step" "$workflow_state") || exit_code=$?
            ;;
        aggregate)
            result=$(execute_aggregate_step "$step" "$workflow_state") || exit_code=$?
            ;;
        *)
            echo "ERROR: Unknown action type: $action" >&2
            exit_code=1
            ;;
    esac

    # Update state: completed or failed
    if [[ $exit_code -eq 0 ]]; then
        update_workflow_state "$workflow_run_id" "$(jq -n \
            --arg id "$step_id" \
            --argjson outputs "$result" \
            '{steps: {($id): {status: "completed", completed_at: (now | strftime("%Y-%m-%dT%H:%M:%SZ")), outputs: $outputs}}}')" > /dev/null
    else
        update_workflow_state "$workflow_run_id" "$(jq -n \
            --arg id "$step_id" \
            --arg error "$result" \
            '{steps: {($id): {status: "failed", failed_at: (now | strftime("%Y-%m-%dT%H:%M:%SZ")), error: $error}}}')" > /dev/null
    fi

    echo "$result"
    return $exit_code
}

##############################################################################
# execute_bash_step: Execute bash command
##############################################################################
execute_bash_step() {
    local step="$1"
    local workflow_state="$2"

    local command=$(echo "$step" | jq -r '.command // .inputs.command // empty')

    if [[ -z "$command" ]]; then
        echo '{"error": "No command specified"}'
        return 1
    fi

    # Resolve template variables
    command=$(resolve_template "$command" "$workflow_state")

    # Execute command
    local output=""
    local exit_code=0
    output=$(eval "$command" 2>&1) || exit_code=$?

    if [[ $exit_code -eq 0 ]]; then
        jq -n --arg output "$output" '{stdout: $output}'
    else
        echo "{\"error\": \"Command failed with exit code $exit_code\", \"output\": \"$output\"}"
        return 1
    fi
}

##############################################################################
# execute_delegate_step: Delegate to Cortex master
##############################################################################
execute_delegate_step() {
    local step="$1"
    local workflow_state="$2"

    local master=$(echo "$step" | jq -r '.master // empty')

    if [[ -z "$master" ]]; then
        echo '{"error": "No master specified"}'
        return 1
    fi

    # For now, return placeholder (would spawn worker via spawn-worker.sh)
    jq -n \
        --arg master "$master" \
        --arg status "delegated" \
        '{master: $master, status: $status, message: "Worker delegation not yet implemented"}'
}

##############################################################################
# execute_http_step: Make HTTP request
##############################################################################
execute_http_step() {
    local step="$1"
    local workflow_state="$2"

    local url=$(echo "$step" | jq -r '.inputs.url // .url // empty')
    local method=$(echo "$step" | jq -r '.inputs.method // .method // "GET"')

    if [[ -z "$url" ]]; then
        echo '{"error": "No URL specified"}'
        return 1
    fi

    # Resolve template in URL
    url=$(resolve_template "$url" "$workflow_state")

    # Make request
    local response=""
    local exit_code=0

    if [[ "$method" == "GET" ]]; then
        response=$(curl -s -w "\n%{http_code}" "$url") || exit_code=$?
    elif [[ "$method" == "POST" ]]; then
        local body=$(echo "$step" | jq -c '.inputs.body // {}')
        body=$(resolve_template "$body" "$workflow_state")
        response=$(curl -s -w "\n%{http_code}" -X POST -H "Content-Type: application/json" -d "$body" "$url") || exit_code=$?
    fi

    if [[ $exit_code -eq 0 ]]; then
        local http_code=$(echo "$response" | tail -n1)
        local body=$(echo "$response" | head -n-1)
        jq -n --arg code "$http_code" --arg body "$body" '{http_code: $code, body: $body}'
    else
        echo '{"error": "HTTP request failed"}'
        return 1
    fi
}

##############################################################################
# execute_aggregate_step: Aggregate results from multiple steps
##############################################################################
execute_aggregate_step() {
    local step="$1"
    local workflow_state="$2"

    local step_ids=$(echo "$step" | jq -r '.inputs.steps // .steps // [] | .[]')
    local aggregated="[]"

    while IFS= read -r step_id; do
        if [[ -n "$step_id" ]]; then
            local step_output=$(echo "$workflow_state" | jq -c ".steps.${step_id}.outputs // {}")
            aggregated=$(echo "$aggregated" | jq --argjson output "$step_output" '. + [$output]')
        fi
    done <<< "$step_ids"

    jq -n --argjson results "$aggregated" '{results: $results, count: ($results | length)}'
}

# Allow running as standalone for testing
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    if [[ $# -lt 3 ]]; then
        echo "Usage: $0 <step.json> <workflow_run_id> <state.json>"
        exit 1
    fi

    execute_step "$1" "$2" "$3"
fi
