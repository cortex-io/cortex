#!/usr/bin/env bash
#
# Dependency Resolver - Build execution DAG and identify parallel groups
# Uses Kahn's topological sorting algorithm
# Part of Cortex Workflow Executor
#

set -euo pipefail

##############################################################################
# resolve_dependencies: Build DAG and create execution plan
# Arguments:
#   $1 - Workflow JSON (parsed workflow with steps array)
# Returns:
#   JSON with execution_groups array
##############################################################################
resolve_dependencies() {
    local workflow_json="$1"

    # Extract steps
    local steps=$(echo "$workflow_json" | jq -c '.steps[]')
    local step_count=$(echo "$workflow_json" | jq '.steps | length')

    if [[ $step_count -eq 0 ]]; then
        echo '{"execution_groups": []}'
        return 0
    fi

    # Build adjacency list and in-degree map using temporary files
    # (Bash associative arrays don't work well in subshells)
    local temp_dir=$(mktemp -d)
    local adj_list_file="$temp_dir/adj_list"
    local in_degree_file="$temp_dir/in_degree"
    local step_list_file="$temp_dir/steps"

    # Initialize
    echo "$steps" | while IFS= read -r step; do
        local step_id=$(echo "$step" | jq -r '.id')
        echo "$step_id" >> "$step_list_file"
        echo "$step_id|0" >> "$in_degree_file"
        echo "$step_id|" >> "$adj_list_file"
    done

    # Build graph from depends_on relationships
    echo "$steps" | while IFS= read -r step; do
        local step_id=$(echo "$step" | jq -r '.id')
        local dependencies=$(echo "$step" | jq -r '.depends_on[]?' 2>/dev/null || echo "")

        if [[ -n "$dependencies" ]]; then
            while IFS= read -r dep; do
                if [[ -n "$dep" ]]; then
                    # Add edge: dep → step_id
                    # Update adjacency list (append step_id to the line for dep)
                    sed -i.bak "s/^${dep}|.*/&${step_id} /" "$adj_list_file" 2>/dev/null || \
                        sed -i "" "s/^${dep}|.*/&${step_id} /" "$adj_list_file"

                    # Increment in-degree
                    local current_degree=$(grep "^${step_id}|" "$in_degree_file" | cut -d'|' -f2)
                    local new_degree=$((current_degree + 1))
                    sed -i.bak "s/^${step_id}|.*/${step_id}|${new_degree}/" "$in_degree_file" 2>/dev/null || \
                        sed -i "" "s/^${step_id}|.*/${step_id}|${new_degree}/" "$in_degree_file"
                fi
            done <<< "$dependencies"
        fi
    done

    # Kahn's algorithm: Topological sort
    local queue=()
    local execution_groups=()
    local group_num=0

    # Find all nodes with in-degree 0
    while IFS='|' read -r step_id degree; do
        if [[ "$degree" -eq 0 ]]; then
            queue+=("$step_id")
        fi
    done < "$in_degree_file"

    # Process nodes level by level (execution groups)
    while [[ ${#queue[@]} -gt 0 ]]; do
        # Current group = all items in queue (can run in parallel)
        local current_group=("${queue[@]}")
        local group_json=$(printf '%s\n' "${current_group[@]}" | jq -R . | jq -s '.')
        execution_groups[$group_num]="$group_json"

        # Clear queue for next level
        queue=()

        # Process each step in current group
        for step_id in "${current_group[@]}"; do
            # Get neighbors from adjacency list
            local neighbors=$(grep "^${step_id}|" "$adj_list_file" | cut -d'|' -f2)

            for neighbor in $neighbors; do
                if [[ -n "$neighbor" ]]; then
                    # Decrement in-degree
                    local current_degree=$(grep "^${neighbor}|" "$in_degree_file" | cut -d'|' -f2)
                    local new_degree=$((current_degree - 1))
                    sed -i.bak "s/^${neighbor}|.*/${neighbor}|${new_degree}/" "$in_degree_file" 2>/dev/null || \
                        sed -i "" "s/^${neighbor}|.*/${neighbor}|${new_degree}/" "$in_degree_file"

                    # If in-degree becomes 0, add to queue
                    if [[ $new_degree -eq 0 ]]; then
                        queue+=("$neighbor")
                    fi
                fi
            done
        done

        group_num=$((group_num + 1))
    done

    # Check for cycles
    local has_cycle=false
    while IFS='|' read -r step_id degree; do
        if [[ "$degree" -gt 0 ]]; then
            echo "ERROR: Circular dependency detected involving step '$step_id'" >&2
            has_cycle=true
        fi
    done < "$in_degree_file"

    # Cleanup
    rm -rf "$temp_dir"

    if [[ "$has_cycle" == "true" ]]; then
        return 1
    fi

    # Generate execution plan JSON
    local plan='{"execution_groups": []}'
    for ((i=0; i<group_num; i++)); do
        local group_steps="${execution_groups[$i]}"
        local parallelism=$(echo "$group_steps" | jq 'length')
        local group_json=$(jq -n \
            --arg group_id "$i" \
            --argjson parallelism "$parallelism" \
            --argjson steps "$group_steps" \
            '{group_id: ($group_id | tonumber), parallelism: $parallelism, steps: $steps}')
        plan=$(echo "$plan" | jq ".execution_groups += [$group_json]")
    done

    echo "$plan"
}

# Allow running as standalone script
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    if [[ $# -lt 1 ]]; then
        echo "Usage: $0 <workflow.json>"
        echo ""
        echo "Expects parsed workflow JSON on stdin or as argument"
        exit 1
    fi

    workflow_json=$(cat "$1")
    resolve_dependencies "$workflow_json"
fi
