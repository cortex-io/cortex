#!/usr/bin/env bash

# Documentation Generator
# Auto-generates documentation from code, templates, and knowledge bases

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Output directories
DOCS_DIR="${CORTEX_ROOT}/docs/auto-generated"
TEMPLATES_DIR="${CORTEX_ROOT}/coordination/templates"
MASTERS_DIR="${CORTEX_ROOT}/coordination/masters"

# Ensure output directory exists
mkdir -p "$DOCS_DIR"

# Generate master capabilities documentation
generate_master_capabilities() {
    local output_file="${DOCS_DIR}/master-capabilities.md"

    cat > "$output_file" <<'EOF'
# Master Capabilities Reference

Auto-generated documentation of all master agents and their capabilities.

> **Note**: This documentation is auto-generated. Do not edit manually.

---

EOF

    # Document each master
    for master_dir in "${MASTERS_DIR}"/*; do
        if [[ -d "$master_dir" ]]; then
            local master_name
            master_name=$(basename "$master_dir")

            echo "## ${master_name}" >> "$output_file"
            echo "" >> "$output_file"

            # Try to extract description from master state or config
            local master_desc=""
            local master_state="${master_dir}/context/master-state.json"
            local master_config="${master_dir}/config.json"

            if [[ -f "$master_state" ]]; then
                master_desc=$(jq -r '.description // ""' "$master_state" 2>/dev/null || echo "")
            elif [[ -f "$master_config" ]]; then
                master_desc=$(jq -r '.description // ""' "$master_config" 2>/dev/null || echo "")
            fi

            # Fallback descriptions
            case "$master_name" in
                coordinator-master)
                    master_desc=${master_desc:-"Task routing, MoE coordination, and CI/CD orchestration"}
                    ;;
                security-master)
                    master_desc=${master_desc:-"Security scans, vulnerability analysis, and compliance audits"}
                    ;;
                development-master)
                    master_desc=${master_desc:-"Feature implementation, bug fixes, and code refactoring"}
                    ;;
                inventory-master)
                    master_desc=${master_desc:-"Documentation, repository cataloging, and dependency management"}
                    ;;
            esac

            echo "**Description**: ${master_desc}" >> "$output_file"
            echo "" >> "$output_file"

            # List specializations
            echo "### Specializations" >> "$output_file"
            echo "" >> "$output_file"

            local kb_dir="${master_dir}/knowledge-base"
            if [[ -d "$kb_dir" ]]; then
                # Extract task types from knowledge base
                echo "Based on knowledge base analysis:" >> "$output_file"
                echo "" >> "$output_file"

                for kb_file in "$kb_dir"/*.jsonl; do
                    if [[ -f "$kb_file" ]]; then
                        local kb_name
                        kb_name=$(basename "$kb_file" .jsonl)

                        # Sample some entries
                        local sample_count
                        sample_count=$(wc -l < "$kb_file" | tr -d ' ')

                        if [[ $sample_count -gt 0 ]]; then
                            echo "- **${kb_name}**: ${sample_count} entries" >> "$output_file"

                            # Extract common task types
                            local task_types
                            task_types=$(grep -o '"task_type":"[^"]*"' "$kb_file" 2>/dev/null | cut -d'"' -f4 | sort -u | head -5 || true)

                            if [[ -n "$task_types" ]]; then
                                echo "  - Task types: $(echo "$task_types" | tr '\n' ',' | sed 's/,$//' | sed 's/,/, /g')" >> "$output_file"
                            fi
                        fi
                    fi
                done
                echo "" >> "$output_file"
            else
                echo "- General purpose agent" >> "$output_file"
                echo "" >> "$output_file"
            fi

            # Example tasks
            echo "### Example Tasks" >> "$output_file"
            echo "" >> "$output_file"

            case "$master_name" in
                coordinator-master)
                    cat >> "$output_file" <<'EXAMPLES'
- Deploy application to production
- Orchestrate multi-master workflows
- Configure CI/CD pipelines
- Route complex tasks to specialists

EXAMPLES
                    ;;
                security-master)
                    cat >> "$output_file" <<'EXAMPLES'
- Scan repository for vulnerabilities
- Analyze CVE impact
- Perform security audits
- Check compliance requirements

EXAMPLES
                    ;;
                development-master)
                    cat >> "$output_file" <<'EXAMPLES'
- Implement new features
- Fix bugs and issues
- Refactor existing code
- Optimize performance

EXAMPLES
                    ;;
                inventory-master)
                    cat >> "$output_file" <<'EXAMPLES'
- Generate API documentation
- Update dependency lists
- Catalog repository components
- Create user guides

EXAMPLES
                    ;;
            esac

            echo "" >> "$output_file"
            echo "---" >> "$output_file"
            echo "" >> "$output_file"
        fi
    done

    echo "Generated: $output_file"
}

# Generate task templates documentation
generate_task_templates() {
    local output_file="${DOCS_DIR}/task-templates.md"

    cat > "$output_file" <<'EOF'
# Task Templates Reference

Auto-generated documentation of all available task templates.

> **Note**: This documentation is auto-generated. Do not edit manually.

---

EOF

    # Document each template
    for template_file in "${TEMPLATES_DIR}"/*.json; do
        if [[ -f "$template_file" && "$template_file" != */validator.sh ]]; then
            local template_id
            template_id=$(basename "$template_file" .json)

            local template
            template=$(cat "$template_file")

            echo "## ${template_id}" >> "$output_file"
            echo "" >> "$output_file"

            # Extract fields
            local description
            description=$(echo "$template" | jq -r '.description')

            local master
            master=$(echo "$template" | jq -r '.master')

            local priority
            priority=$(echo "$template" | jq -r '.default_priority')

            local duration
            duration=$(echo "$template" | jq -r '.estimated_duration_minutes')

            echo "**Description**: ${description}" >> "$output_file"
            echo "" >> "$output_file"
            echo "**Master**: \`${master}\`" >> "$output_file"
            echo "" >> "$output_file"
            echo "**Default Priority**: ${priority}" >> "$output_file"
            echo "" >> "$output_file"
            echo "**Estimated Duration**: ${duration} minutes" >> "$output_file"
            echo "" >> "$output_file"

            # Required fields
            echo "### Required Fields" >> "$output_file"
            echo "" >> "$output_file"

            local required_fields
            required_fields=$(echo "$template" | jq -r '.required_fields[]' 2>/dev/null || echo "")

            if [[ -n "$required_fields" ]]; then
                while IFS= read -r field; do
                    if [[ -n "$field" ]]; then
                        local field_desc
                        field_desc=$(echo "$template" | jq -r ".field_descriptions.${field}" 2>/dev/null || echo "No description")

                        echo "- **${field}**: ${field_desc}" >> "$output_file"
                    fi
                done <<< "$required_fields"
            else
                echo "- None" >> "$output_file"
            fi

            echo "" >> "$output_file"

            # Optional fields
            echo "### Optional Fields" >> "$output_file"
            echo "" >> "$output_file"

            local optional_fields
            optional_fields=$(echo "$template" | jq -r '.optional_fields[]' 2>/dev/null || echo "")

            if [[ -n "$optional_fields" ]]; then
                while IFS= read -r field; do
                    if [[ -n "$field" ]]; then
                        local field_desc
                        field_desc=$(echo "$template" | jq -r ".field_descriptions.${field}" 2>/dev/null || echo "No description")

                        echo "- **${field}**: ${field_desc}" >> "$output_file"
                    fi
                done <<< "$optional_fields"
            else
                echo "- None" >> "$output_file"
            fi

            echo "" >> "$output_file"

            # Examples
            local examples_count
            examples_count=$(echo "$template" | jq '.examples | length' 2>/dev/null || echo "0")

            if [[ $examples_count -gt 0 ]]; then
                echo "### Usage Examples" >> "$output_file"
                echo "" >> "$output_file"

                for i in $(seq 0 $((examples_count - 1))); do
                    local example_desc
                    example_desc=$(echo "$template" | jq -r ".examples[${i}].description")

                    local example_fields
                    example_fields=$(echo "$template" | jq -c ".examples[${i}].fields")

                    echo "#### Example $((i + 1)): ${example_desc}" >> "$output_file"
                    echo "" >> "$output_file"
                    echo '```json' >> "$output_file"
                    echo "$example_fields" | jq '.' >> "$output_file"
                    echo '```' >> "$output_file"
                    echo "" >> "$output_file"
                done
            fi

            echo "---" >> "$output_file"
            echo "" >> "$output_file"
        fi
    done

    echo "Generated: $output_file"
}

# Generate API reference
generate_api_reference() {
    local output_file="${DOCS_DIR}/api-reference.md"

    cat > "$output_file" <<'EOF'
# API Reference

Auto-generated API documentation for Cortex scripts and functions.

> **Note**: This documentation is auto-generated. Do not edit manually.

---

## Core Scripts

EOF

    # Document key scripts
    local scripts=(
        "${CORTEX_ROOT}/coordination/masters/coordinator/lib/nlp-classifier.sh:NLP Task Classifier"
        "${CORTEX_ROOT}/coordination/templates/validator.sh:Template Validator"
        "${CORTEX_ROOT}/coordination/knowledge-base/search.sh:Knowledge Base Search"
        "${CORTEX_ROOT}/scripts/cortex-cli.sh:Cortex CLI"
    )

    for script_info in "${scripts[@]}"; do
        local script_path="${script_info%%:*}"
        local script_name="${script_info#*:}"

        if [[ -f "$script_path" ]]; then
            echo "### ${script_name}" >> "$output_file"
            echo "" >> "$output_file"
            echo "**Path**: \`${script_path#$CORTEX_ROOT/}\`" >> "$output_file"
            echo "" >> "$output_file"

            # Extract usage info from script header/help
            local usage_info
            usage_info=$(grep -A 10 "^# " "$script_path" | head -20 | sed 's/^# //g' | sed 's/^#//g' || echo "No description available")

            echo "**Description**:" >> "$output_file"
            echo "" >> "$output_file"
            echo "$usage_info" >> "$output_file"
            echo "" >> "$output_file"

            # Try to extract function signatures
            echo "**Functions**:" >> "$output_file"
            echo "" >> "$output_file"

            local functions
            functions=$(grep -E '^[a-z_]+\(\)' "$script_path" | sed 's/() {//g' | head -10 || true)

            if [[ -n "$functions" ]]; then
                while IFS= read -r func; do
                    if [[ -n "$func" ]]; then
                        echo "- \`${func}()\`" >> "$output_file"
                    fi
                done <<< "$functions"
                echo "" >> "$output_file"
            else
                echo "- See script for available functions" >> "$output_file"
                echo "" >> "$output_file"
            fi

            # Extract CLI usage if available
            local cli_usage
            cli_usage=$(grep -A 5 "Usage:" "$script_path" 2>/dev/null | head -10 || true)

            if [[ -n "$cli_usage" ]]; then
                echo "**CLI Usage**:" >> "$output_file"
                echo "" >> "$output_file"
                echo '```bash' >> "$output_file"
                echo "$cli_usage" >> "$output_file"
                echo '```' >> "$output_file"
                echo "" >> "$output_file"
            fi

            echo "---" >> "$output_file"
            echo "" >> "$output_file"
        fi
    done

    echo "Generated: $output_file"
}

# Generate system overview
generate_system_overview() {
    local output_file="${DOCS_DIR}/system-overview.md"

    cat > "$output_file" <<'EOF'
# Cortex System Overview

Auto-generated system overview and statistics.

> **Note**: This documentation is auto-generated. Do not edit manually.
> **Generated**: $(date)

---

## System Architecture

Cortex is a multi-agent system with a Master-Worker-Observer architecture:

### Masters

EOF

    # Count masters
    local master_count=0
    for master_dir in "${MASTERS_DIR}"/*; do
        if [[ -d "$master_dir" ]]; then
            master_count=$((master_count + 1))
        fi
    done

    echo "- Total Masters: **${master_count}**" >> "$output_file"
    echo "" >> "$output_file"

    # Count tasks
    local task_count=0
    if [[ -d "${CORTEX_ROOT}/coordination/tasks" ]]; then
        task_count=$(find "${CORTEX_ROOT}/coordination/tasks" -name "task-*.json" -type f 2>/dev/null | wc -l | tr -d ' ')
    fi

    echo "### Tasks" >> "$output_file"
    echo "" >> "$output_file"
    echo "- Total Tasks: **${task_count}**" >> "$output_file"
    echo "" >> "$output_file"

    # Count templates
    local template_count=0
    template_count=$(find "${TEMPLATES_DIR}" -name "*.json" -type f 2>/dev/null | wc -l | tr -d ' ')

    echo "### Templates" >> "$output_file"
    echo "" >> "$output_file"
    echo "- Available Templates: **${template_count}**" >> "$output_file"
    echo "" >> "$output_file"

    # Knowledge base stats
    echo "### Knowledge Base" >> "$output_file"
    echo "" >> "$output_file"

    local total_kb_entries=0
    for kb_file in "${MASTERS_DIR}"/*/knowledge-base/*.jsonl; do
        if [[ -f "$kb_file" ]]; then
            local entry_count
            entry_count=$(wc -l < "$kb_file" | tr -d ' ')
            total_kb_entries=$((total_kb_entries + entry_count))
        fi
    done

    echo "- Total Knowledge Base Entries: **${total_kb_entries}**" >> "$output_file"
    echo "" >> "$output_file"

    echo "## Quick Links" >> "$output_file"
    echo "" >> "$output_file"
    echo "- [Master Capabilities](./master-capabilities.md)" >> "$output_file"
    echo "- [Task Templates](./task-templates.md)" >> "$output_file"
    echo "- [API Reference](./api-reference.md)" >> "$output_file"
    echo "" >> "$output_file"

    echo "Generated: $output_file"
}

# Main function
main() {
    echo "Generating documentation..."
    echo ""

    generate_master_capabilities
    generate_task_templates
    generate_api_reference
    generate_system_overview

    echo ""
    echo "Documentation generation complete!"
    echo "Output directory: ${DOCS_DIR}"
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
