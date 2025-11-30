#!/usr/bin/env bash
#
# Output Resolver - Template variable substitution for {{ }} patterns
# Part of Cortex Workflow Executor
#

set -euo pipefail

##############################################################################
# resolve_template: Resolve {{ variable }} patterns in a string
# Arguments:
#   $1 - Template string with {{ }} patterns
#   $2 - Workflow state JSON (contains inputs and step outputs)
# Returns:
#   Resolved string on stdout
##############################################################################
resolve_template() {
    local template="$1"
    local workflow_state="$2"

    # If no templates, return as-is
    if [[ ! "$template" =~ \{\{ ]]; then
        echo "$template"
        return 0
    fi

    # Extract all {{ variable }} patterns
    local variables=$(echo "$template" | grep -oE '\{\{[^}]+\}\}' || echo "")

    if [[ -z "$variables" ]]; then
        echo "$template"
        return 0
    fi

    local resolved="$template"

    while IFS= read -r var_pattern; do
        if [[ -z "$var_pattern" ]]; then
            continue
        fi

        # Remove {{ and }}
        local var_expr="${var_pattern:2:-2}"
        var_expr=$(echo "$var_expr" | xargs)  # Trim whitespace

        local value=""

        # Check pattern type
        if [[ "$var_expr" == inputs.* ]]; then
            # Workflow input: {{ inputs.repository_url }}
            local input_key="${var_expr#inputs.}"
            value=$(echo "$workflow_state" | jq -r ".inputs.${input_key} // empty" 2>/dev/null || echo "")

        elif [[ "$var_expr" == steps.*.outputs.* ]]; then
            # Step output: {{ steps.clone_repo.outputs.repo_path }}
            local step_id=$(echo "$var_expr" | cut -d'.' -f2)
            local output_key=$(echo "$var_expr" | cut -d'.' -f4)
            value=$(echo "$workflow_state" | jq -r ".steps.${step_id}.outputs.${output_key} // empty" 2>/dev/null || echo "")

        elif [[ "$var_expr" == env.* ]]; then
            # Environment variable: {{ env.SLACK_WEBHOOK }}
            local env_var="${var_expr#env.}"
            value="${!env_var:-}"

        elif [[ "$var_expr" == *"|"* ]]; then
            # Filter expression: {{ inputs.url | hash }}
            local base_expr=$(echo "$var_expr" | cut -d'|' -f1 | xargs)
            local filter=$(echo "$var_expr" | cut -d'|' -f2- | xargs)

            # Recursively resolve base expression
            local base_value=$(resolve_template "{{ $base_expr }}" "$workflow_state")

            # Apply filter
            case "$filter" in
                hash)
                    value=$(echo -n "$base_value" | md5sum 2>/dev/null | cut -d' ' -f1 || echo -n "$base_value" | md5 | cut -d' ' -f1)
                    ;;
                upper)
                    value=$(echo "$base_value" | tr '[:lower:]' '[:upper:]')
                    ;;
                lower)
                    value=$(echo "$base_value" | tr '[:upper:]' '[:lower:]')
                    ;;
                base64)
                    value=$(echo -n "$base_value" | base64)
                    ;;
                trim)
                    value=$(echo "$base_value" | xargs)
                    ;;
                *)
                    echo "WARN: Unknown filter '$filter', using value as-is" >&2
                    value="$base_value"
                    ;;
            esac
        else
            echo "WARN: Unknown template pattern '$var_expr'" >&2
        fi

        # Escape special characters for sed
        local escaped_pattern=$(echo "$var_pattern" | sed 's/[]\/$*.^[]/\\&/g')
        local escaped_value=$(echo "$value" | sed 's/[\/&]/\\&/g')

        # Replace pattern with value
        resolved=$(echo "$resolved" | sed "s/${escaped_pattern}/${escaped_value}/g")
    done <<< "$variables"

    echo "$resolved"
}

##############################################################################
# resolve_command: Resolve templates in a bash command
# Arguments:
#   $1 - Command with {{ }} patterns
#   $2 - Workflow state JSON
# Returns:
#   Resolved command on stdout
##############################################################################
resolve_command() {
    resolve_template "$1" "$2"
}

# Allow running as standalone script
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    if [[ $# -lt 2 ]]; then
        echo "Usage: $0 <template> <state.json>"
        echo ""
        echo "Examples:"
        echo "  $0 'Hello {{ inputs.name }}' '{\"inputs\":{\"name\":\"World\"}}'"
        echo "  $0 '{{ inputs.url | hash }}' '{\"inputs\":{\"url\":\"example.com\"}}'"
        exit 1
    fi

    template="$1"
    state="$2"

    resolve_template "$template" "$state"
fi
