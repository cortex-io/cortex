#!/usr/bin/env bash
#
# Workflow Parser - Converts YAML workflows to JSON execution plans
# Part of Cortex Workflow Executor
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

##############################################################################
# parse_workflow: Parse YAML workflow and generate execution plan
# Arguments:
#   $1 - Path to workflow YAML file
# Returns:
#   JSON execution plan on stdout
##############################################################################
parse_workflow() {
    local workflow_file="$1"

    if [[ ! -f "$workflow_file" ]]; then
        echo "ERROR: Workflow file not found: $workflow_file" >&2
        return 1
    fi

    # Step 1: Load YAML and convert to JSON
    local workflow_json=""

    # Check if file is already JSON
    if [[ "$workflow_file" == *.json ]]; then
        workflow_json=$(cat "$workflow_file")
    # Try yq first (preferred), fall back to python
    elif command -v yq &>/dev/null; then
        workflow_json=$(yq eval -o=json "$workflow_file" 2>/dev/null)
    elif command -v python3 &>/dev/null && python3 -c "import yaml" 2>/dev/null; then
        workflow_json=$(python3 -c "import yaml, json, sys; print(json.dumps(yaml.safe_load(open('$workflow_file'))))" 2>/dev/null)
    else
        echo "ERROR: For YAML files, install 'yq' or 'python3' with 'pyyaml' module." >&2
        echo "       Alternatively, use JSON format (.json extension)" >&2
        return 1
    fi

    # Step 2: Validate required fields
    local name=$(echo "$workflow_json" | jq -r '.name // empty')
    if [[ -z "$name" ]]; then
        echo "ERROR: Workflow must have a 'name' field" >&2
        return 1
    fi

    # Step 3: Validate steps array exists and is not empty
    local steps_count=$(echo "$workflow_json" | jq '.steps | length' 2>/dev/null || echo "0")
    if [[ "$steps_count" -eq 0 ]]; then
        echo "ERROR: Workflow must have at least one step" >&2
        return 1
    fi

    # Step 4: Validate each step
    local i=0
    while [[ $i -lt $steps_count ]]; do
        local step=$(echo "$workflow_json" | jq ".steps[$i]")
        local step_id=$(echo "$step" | jq -r '.id // empty')
        local action=$(echo "$step" | jq -r '.action // empty')

        # Validate step has id and action
        if [[ -z "$step_id" ]]; then
            echo "ERROR: Step $i missing 'id' field" >&2
            return 1
        fi

        if [[ -z "$action" ]]; then
            echo "ERROR: Step '$step_id' missing 'action' field" >&2
            return 1
        fi

        # Validate action type
        case "$action" in
            bash|delegate|http_request|aggregate)
                : # Valid action
                ;;
            *)
                echo "ERROR: Invalid action type '$action' in step '$step_id'" >&2
                echo "       Valid actions: bash, delegate, http_request, aggregate" >&2
                return 1
                ;;
        esac

        i=$((i + 1))
    done

    # Step 5: Extract metadata
    local version=$(echo "$workflow_json" | jq -r '.version // "1.0.0"')
    local description=$(echo "$workflow_json" | jq -r '.description // ""')

    # Step 6: Generate execution plan
    local execution_plan=$(jq -n \
        --arg name "$name" \
        --arg version "$version" \
        --arg description "$description" \
        --argjson steps "$(echo "$workflow_json" | jq '.steps')" \
        --argjson inputs "$(echo "$workflow_json" | jq '.inputs // {}')" \
        --argjson outputs "$(echo "$workflow_json" | jq '.outputs // {}')" \
        --argjson triggers "$(echo "$workflow_json" | jq '.triggers // []')" \
        --argjson on_failure "$(echo "$workflow_json" | jq '.on_failure // {}')" \
        --arg timeout "$(echo "$workflow_json" | jq -r '.timeout_minutes // 60')" \
        '{
            name: $name,
            version: $version,
            description: $description,
            steps: $steps,
            inputs: $inputs,
            outputs: $outputs,
            triggers: $triggers,
            on_failure: $on_failure,
            timeout_minutes: ($timeout | tonumber),
            parsed_at: (now | strftime("%Y-%m-%dT%H:%M:%SZ"))
        }')

    echo "$execution_plan"
}

##############################################################################
# validate_workflow_inputs: Validate provided inputs match workflow schema
# Arguments:
#   $1 - Workflow JSON (from parse_workflow)
#   $2 - Provided inputs JSON
# Returns:
#   0 if valid, 1 if invalid
##############################################################################
validate_workflow_inputs() {
    local workflow_json="$1"
    local provided_inputs="$2"

    # Get required inputs from workflow
    local required_inputs=$(echo "$workflow_json" | jq -r '.inputs | to_entries[] | select(.value.required == true) | .key' 2>/dev/null || echo "")

    # Check each required input is provided
    while IFS= read -r required_key; do
        if [[ -n "$required_key" ]]; then
            local provided_value=$(echo "$provided_inputs" | jq -r ".[\"$required_key\"] // empty")
            if [[ -z "$provided_value" ]]; then
                echo "ERROR: Required input '$required_key' not provided" >&2
                return 1
            fi
        fi
    done <<< "$required_inputs"

    return 0
}

# Allow running as standalone script
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    if [[ $# -lt 1 ]]; then
        echo "Usage: $0 <workflow.yaml> [inputs.json]"
        echo ""
        echo "Examples:"
        echo "  $0 coordination/workflows/security-audit.yaml"
        echo "  $0 my-workflow.yaml '{\"repo\":\"github.com/user/repo\"}'"
        exit 1
    fi

    workflow_file="$1"
    inputs_json="${2:-{}}"

    # Parse workflow
    parsed=$(parse_workflow "$workflow_file")

    # Validate inputs if provided
    if [[ "$inputs_json" != "{}" ]]; then
        if ! validate_workflow_inputs "$parsed" "$inputs_json"; then
            exit 1
        fi
    fi

    # Output parsed workflow
    echo "$parsed" | jq '.'
fi
