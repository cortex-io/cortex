#!/usr/bin/env bash
set -euo pipefail

workflow_json='{"name":"test","steps":[{"id":"step1"}]}'
inputs_json='{"name":"TestInput"}'
workflow_run_id="test-debug-001"
workflow_name=$(echo "$workflow_json" | jq -r '.name')
total_groups="1"

# Initialize step states
steps_state="{}"
steps=$(echo "$workflow_json" | jq -c '.steps[]' 2>/dev/null || echo "")
while IFS= read -r step; do
    if [[ -n "$step" ]]; then
        step_id=$(echo "$step" | jq -r '.id')
        steps_state=$(echo "$steps_state" | jq \
            --arg id "$step_id" \
            '. + {($id): {status: "pending", retry_count: 0}}')
    fi
done <<< "$steps"

echo "Steps state: $steps_state"

# Try to create initial state
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

echo "Initial state created successfully"
echo "$initial_state" | jq '.'
