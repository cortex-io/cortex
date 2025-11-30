#!/usr/bin/env bash

# Template Validator
# Validates task submissions against templates

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATES_DIR="$SCRIPT_DIR"

# Validate a task against a template
validate_task() {
    local template_id="$1"
    local task_json="$2"

    local template_file="${TEMPLATES_DIR}/${template_id}.json"

    if [[ ! -f "$template_file" ]]; then
        echo "{\"valid\":false,\"errors\":[\"Template '${template_id}' not found\"]}"
        return 1
    fi

    # Load template
    local template
    template=$(cat "$template_file")

    # Extract required and optional fields
    local required_fields
    required_fields=$(echo "$template" | jq -r '.required_fields[]' 2>/dev/null || echo "")

    local optional_fields
    optional_fields=$(echo "$template" | jq -r '.optional_fields[]' 2>/dev/null || echo "")

    local errors=()
    local warnings=()

    # Check required fields
    while IFS= read -r field; do
        if [[ -n "$field" ]]; then
            local value
            value=$(echo "$task_json" | jq -r ".${field}" 2>/dev/null || echo "null")

            if [[ "$value" == "null" || -z "$value" ]]; then
                errors+=("Required field '${field}' is missing")
            fi
        fi
    done <<< "$required_fields"

    # Check for unknown fields (not in required or optional)
    local all_valid_fields
    all_valid_fields=$(echo "$template" | jq -r '.required_fields + .optional_fields | .[]' 2>/dev/null || echo "")

    local task_fields
    task_fields=$(echo "$task_json" | jq -r 'keys[]' 2>/dev/null || echo "")

    while IFS= read -r field; do
        if [[ -n "$field" ]]; then
            if ! echo "$all_valid_fields" | grep -q "^${field}$"; then
                warnings+=("Unknown field '${field}' - not in template specification")
            fi
        fi
    done <<< "$task_fields"

    # Build result
    local valid="true"
    if [[ ${#errors[@]} -gt 0 ]]; then
        valid="false"
    fi

    # Format errors array
    local errors_json="[]"
    if [[ ${#errors[@]} -gt 0 ]]; then
        errors_json="[\"$(IFS='","'; echo "${errors[*]}")\"]"
    fi

    # Format warnings array
    local warnings_json="[]"
    if [[ ${#warnings[@]} -gt 0 ]]; then
        warnings_json="[\"$(IFS='","'; echo "${warnings[*]}")\"]"
    fi

    echo "{\"valid\":${valid},\"errors\":${errors_json},\"warnings\":${warnings_json},\"template_id\":\"${template_id}\"}"
}

# List all available templates
list_templates() {
    local templates=()

    for template_file in "${TEMPLATES_DIR}"/*.json; do
        if [[ -f "$template_file" ]]; then
            local template_id
            template_id=$(basename "$template_file" .json)

            local description
            description=$(jq -r '.description' "$template_file" 2>/dev/null || echo "No description")

            local master
            master=$(jq -r '.master' "$template_file" 2>/dev/null || echo "unknown")

            templates+=("{\"template_id\":\"${template_id}\",\"description\":\"${description}\",\"master\":\"${master}\"}")
        fi
    done

    if [[ ${#templates[@]} -gt 0 ]]; then
        echo "[$(IFS=','; echo "${templates[*]}")]" | jq '.'
    else
        echo "[]"
    fi
}

# Get template details
get_template() {
    local template_id="$1"
    local template_file="${TEMPLATES_DIR}/${template_id}.json"

    if [[ ! -f "$template_file" ]]; then
        echo "{\"error\":\"Template '${template_id}' not found\"}"
        return 1
    fi

    cat "$template_file" | jq '.'
}

# Suggest template based on task description
suggest_template() {
    local task_description="$1"
    local task_lower
    task_lower=$(echo "$task_description" | tr '[:upper:]' '[:lower:]')

    local suggested_template=""
    local confidence=0.0

    # Simple keyword-based suggestion
    if [[ "$task_lower" =~ (scan|vulnerability|cve|audit|security) ]]; then
        suggested_template="security-scan"
        confidence=0.85
    elif [[ "$task_lower" =~ (implement|feature|add|create.*feature) ]]; then
        suggested_template="feature-implementation"
        confidence=0.80
    elif [[ "$task_lower" =~ (fix|bug|issue|error|crash) ]]; then
        suggested_template="bug-fix"
        confidence=0.82
    elif [[ "$task_lower" =~ (deploy|deployment|release) ]]; then
        suggested_template="deployment"
        confidence=0.88
    elif [[ "$task_lower" =~ (document|documentation|readme|guide) ]]; then
        suggested_template="documentation"
        confidence=0.83
    elif [[ "$task_lower" =~ (dependency|dependencies|update.*package|upgrade) ]]; then
        suggested_template="dependency-update"
        confidence=0.81
    fi

    if [[ -n "$suggested_template" ]]; then
        echo "{\"suggested_template\":\"${suggested_template}\",\"confidence\":${confidence}}"
    else
        echo "{\"suggested_template\":null,\"confidence\":0.0}"
    fi
}

# Generate task from template
generate_task_from_template() {
    local template_id="$1"
    local fields_json="$2"

    local template_file="${TEMPLATES_DIR}/${template_id}.json"

    if [[ ! -f "$template_file" ]]; then
        echo "{\"error\":\"Template '${template_id}' not found\"}" >&2
        return 1
    fi

    local template
    template=$(cat "$template_file")

    # Extract metadata
    local description
    description=$(echo "$template" | jq -r '.description')

    local master
    master=$(echo "$template" | jq -r '.master')

    local priority
    priority=$(echo "$template" | jq -r '.default_priority')

    local estimated_duration
    estimated_duration=$(echo "$template" | jq -r '.estimated_duration_minutes')

    local tags
    tags=$(echo "$template" | jq -c '.tags')

    # Create task object
    local task_id
    task_id="task-$(date +%s)-$(head -c 4 /dev/urandom | xxd -p)"

    local task=$(cat <<EOF
{
  "task_id": "${task_id}",
  "template_id": "${template_id}",
  "description": "${description}",
  "master": "${master}",
  "priority": "${priority}",
  "estimated_duration_minutes": ${estimated_duration},
  "tags": ${tags},
  "fields": ${fields_json},
  "created_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "status": "pending"
}
EOF
)

    # Validate the generated task
    local validation
    validation=$(validate_task "$template_id" "$fields_json")

    local is_valid
    is_valid=$(echo "$validation" | jq -r '.valid')

    if [[ "$is_valid" != "true" ]]; then
        echo "{\"error\":\"Task validation failed\",\"validation\":${validation}}" >&2
        return 1
    fi

    echo "$task" | jq '.'
}

# CLI interface
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    case "${1:-}" in
        validate)
            if [[ $# -lt 3 ]]; then
                echo "Usage: $0 validate <template_id> <task_json>"
                exit 1
            fi
            validate_task "$2" "$3"
            ;;

        list)
            list_templates
            ;;

        get)
            if [[ $# -lt 2 ]]; then
                echo "Usage: $0 get <template_id>"
                exit 1
            fi
            get_template "$2"
            ;;

        suggest)
            if [[ $# -lt 2 ]]; then
                echo "Usage: $0 suggest <task_description>"
                exit 1
            fi
            shift
            suggest_template "$*"
            ;;

        generate)
            if [[ $# -lt 3 ]]; then
                echo "Usage: $0 generate <template_id> <fields_json>"
                exit 1
            fi
            generate_task_from_template "$2" "$3"
            ;;

        *)
            echo "Usage: $0 {validate|list|get|suggest|generate} [args...]"
            echo ""
            echo "Commands:"
            echo "  validate <template_id> <task_json>  - Validate task against template"
            echo "  list                                 - List all available templates"
            echo "  get <template_id>                    - Get template details"
            echo "  suggest <task_description>           - Suggest template for task"
            echo "  generate <template_id> <fields_json> - Generate task from template"
            exit 1
            ;;
    esac
fi
