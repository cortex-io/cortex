#!/usr/bin/env bash

# Cortex CLI - Interactive Task Management
# Enhanced CLI with wizard-based task submission and management

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Import dependencies
NLP_CLASSIFIER="${CORTEX_ROOT}/coordination/masters/coordinator/lib/nlp-classifier.sh"
TEMPLATE_VALIDATOR="${CORTEX_ROOT}/coordination/templates/validator.sh"
KB_SEARCH="${CORTEX_ROOT}/coordination/knowledge-base/search.sh"
SPAWN_WORKER="${CORTEX_ROOT}/scripts/spawn-worker.sh"
WORKFLOW_EXECUTOR="${CORTEX_ROOT}/coordination/workflow-engine/executor.sh"

# Configuration
TASKS_DIR="${CORTEX_ROOT}/coordination/tasks"
WORKERS_DIR="${CORTEX_ROOT}/coordination/worker-specs/active"
WORKFLOWS_DIR="${CORTEX_ROOT}/coordination/workflows"
WORKFLOW_STATE_DIR="${CORTEX_ROOT}/coordination/workflow-state"

# Color output (if terminal supports it)
if [[ -t 1 ]]; then
    BOLD='\033[1m'
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[0;33m'
    BLUE='\033[0;34m'
    CYAN='\033[0;36m'
    RESET='\033[0m'
else
    BOLD=''
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    CYAN=''
    RESET=''
fi

# Utility functions
print_header() {
    echo -e "${BOLD}${BLUE}$1${RESET}"
}

print_success() {
    echo -e "${GREEN}✓ $1${RESET}"
}

print_error() {
    echo -e "${RED}✗ $1${RESET}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${RESET}"
}

print_info() {
    echo -e "${CYAN}ℹ $1${RESET}"
}

# Interactive task submission wizard
cmd_submit() {
    print_header "=== Cortex Task Submission Wizard ==="
    echo ""

    # Get task description
    echo -n "Task description: "
    read -r task_description

    if [[ -z "$task_description" ]]; then
        print_error "Task description cannot be empty"
        exit 1
    fi

    echo ""
    print_info "Analyzing task..."

    # Run NLP classifier
    local classification
    classification=$("$NLP_CLASSIFIER" "$task_description" 2>/dev/null || echo '{"recommended_master":"coordinator-master","confidence":0.5}')

    local recommended_master
    recommended_master=$(echo "$classification" | jq -r '.recommended_master')

    local confidence
    confidence=$(echo "$classification" | jq -r '.confidence')

    local method
    method=$(echo "$classification" | jq -r '.classification_method')

    print_info "Classification method: ${method}"
    print_info "Recommended master: ${recommended_master} (confidence: ${confidence})"

    # Suggest template
    local template_suggestion
    template_suggestion=$("$TEMPLATE_VALIDATOR" suggest "$task_description" 2>/dev/null || echo '{"suggested_template":null}')

    local suggested_template
    suggested_template=$(echo "$template_suggestion" | jq -r '.suggested_template')

    local use_template="n"
    if [[ "$suggested_template" != "null" && -n "$suggested_template" ]]; then
        local template_confidence
        template_confidence=$(echo "$template_suggestion" | jq -r '.confidence')

        print_info "Suggested template: ${suggested_template} (confidence: ${template_confidence})"
        echo -n "Use this template? [y/N]: "
        read -r use_template
    fi

    local task_json="{}"
    local template_id=""

    if [[ "${use_template,,}" == "y" && -n "$suggested_template" ]]; then
        # Use template workflow
        template_id="$suggested_template"
        print_header "Template: ${template_id}"
        echo ""

        # Get template details
        local template
        template=$("$TEMPLATE_VALIDATOR" get "$template_id" 2>/dev/null)

        # Collect required fields
        local fields="{}"
        local required_fields
        required_fields=$(echo "$template" | jq -r '.required_fields[]' 2>/dev/null || echo "")

        while IFS= read -r field; do
            if [[ -n "$field" ]]; then
                local field_desc
                field_desc=$(echo "$template" | jq -r ".field_descriptions.${field}" 2>/dev/null || echo "$field")

                echo -n "${field} (${field_desc}): "
                read -r field_value

                if [[ -z "$field_value" ]]; then
                    print_error "Required field '${field}' cannot be empty"
                    exit 1
                fi

                fields=$(echo "$fields" | jq --arg key "$field" --arg val "$field_value" '. + {($key): $val}')
            fi
        done <<< "$required_fields"

        # Optional fields
        local optional_fields
        optional_fields=$(echo "$template" | jq -r '.optional_fields[]' 2>/dev/null || echo "")

        echo ""
        print_info "Optional fields (press Enter to skip):"

        while IFS= read -r field; do
            if [[ -n "$field" ]]; then
                local field_desc
                field_desc=$(echo "$template" | jq -r ".field_descriptions.${field}" 2>/dev/null || echo "$field")

                echo -n "${field} (${field_desc}): "
                read -r field_value

                if [[ -n "$field_value" ]]; then
                    fields=$(echo "$fields" | jq --arg key "$field" --arg val "$field_value" '. + {($key): $val}')
                fi
            fi
        done <<< "$optional_fields"

        # Validate against template
        local validation
        validation=$("$TEMPLATE_VALIDATOR" validate "$template_id" "$fields" 2>/dev/null)

        local is_valid
        is_valid=$(echo "$validation" | jq -r '.valid')

        if [[ "$is_valid" != "true" ]]; then
            print_error "Validation failed:"
            echo "$validation" | jq -r '.errors[]' | while read -r error; do
                print_error "  $error"
            done
            exit 1
        fi

        # Generate task from template
        task_json=$("$TEMPLATE_VALIDATOR" generate "$template_id" "$fields" 2>/dev/null)

        if [[ $? -ne 0 ]]; then
            print_error "Failed to generate task from template"
            exit 1
        fi

    else
        # Manual workflow
        echo ""
        echo -n "Priority [medium]: "
        read -r priority
        priority=${priority:-medium}

        # Create simple task JSON
        local task_id
        task_id="task-$(date +%s)-$(head -c 4 /dev/urandom | xxd -p)"

        task_json=$(cat <<EOF
{
  "task_id": "${task_id}",
  "description": "${task_description}",
  "master": "${recommended_master}",
  "priority": "${priority}",
  "created_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "status": "pending",
  "metadata": {
    "classification": ${classification}
  }
}
EOF
)
    fi

    # Confirm task creation
    echo ""
    print_header "Task Summary:"
    echo "$task_json" | jq '.'
    echo ""

    echo -n "Create task? [Y/n]: "
    read -r confirm
    confirm=${confirm:-y}

    if [[ "${confirm,,}" != "y" ]]; then
        print_warning "Task creation cancelled"
        exit 0
    fi

    # Save task
    local task_id
    task_id=$(echo "$task_json" | jq -r '.task_id')

    mkdir -p "$TASKS_DIR"
    echo "$task_json" > "${TASKS_DIR}/${task_id}.json"

    print_success "Task created: ${task_id}"

    # Spawn worker
    echo ""
    print_info "Spawning worker..."

    local master
    master=$(echo "$task_json" | jq -r '.master')

    # Call spawn-worker (this would need to be implemented/updated)
    local worker_type="generic-worker"
    if [[ "$master" == "security-master" ]]; then
        worker_type="security-scanner"
    elif [[ "$master" == "development-master" ]]; then
        worker_type="feature-implementer"
    elif [[ "$master" == "inventory-master" ]]; then
        worker_type="documentor"
    fi

    # For now, just create a worker spec
    local worker_id="worker-${task_id#task-}"
    local worker_spec="${WORKERS_DIR}/${worker_id}.json"

    mkdir -p "$WORKERS_DIR"
    cat > "$worker_spec" <<EOF
{
  "worker_id": "${worker_id}",
  "worker_type": "${worker_type}",
  "task_id": "${task_id}",
  "master": "${master}",
  "status": "spawned",
  "created_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF

    print_success "Worker spawned: ${worker_id}"
    echo ""
    print_info "Track status: cortex status ${task_id}"
}

# Show task status
cmd_status() {
    local task_id="$1"

    if [[ -z "$task_id" ]]; then
        print_error "Usage: cortex status <task_id>"
        exit 1
    fi

    local task_file="${TASKS_DIR}/${task_id}.json"

    if [[ ! -f "$task_file" ]]; then
        print_error "Task ${task_id} not found"
        exit 1
    fi

    print_header "=== Task Status: ${task_id} ==="
    echo ""

    local task
    task=$(cat "$task_file")

    # Display task info
    local description
    description=$(echo "$task" | jq -r '.description')

    local status
    status=$(echo "$task" | jq -r '.status')

    local master
    master=$(echo "$task" | jq -r '.master')

    local priority
    priority=$(echo "$task" | jq -r '.priority // "medium"')

    local created_at
    created_at=$(echo "$task" | jq -r '.created_at')

    echo "Description: ${description}"
    echo "Status: ${status}"
    echo "Master: ${master}"
    echo "Priority: ${priority}"
    echo "Created: ${created_at}"

    # Find associated worker
    echo ""
    print_header "Worker Information:"

    local worker_found=false
    for worker_file in "${WORKERS_DIR}"/worker-*.json; do
        if [[ -f "$worker_file" ]]; then
            local worker_task_id
            worker_task_id=$(jq -r '.task_id' "$worker_file" 2>/dev/null || echo "")

            if [[ "$worker_task_id" == "$task_id" ]]; then
                worker_found=true
                local worker_id
                worker_id=$(jq -r '.worker_id' "$worker_file")

                local worker_type
                worker_type=$(jq -r '.worker_type' "$worker_file")

                local worker_status
                worker_status=$(jq -r '.status' "$worker_file")

                echo "Worker ID: ${worker_id}"
                echo "Worker Type: ${worker_type}"
                echo "Worker Status: ${worker_status}"
                break
            fi
        fi
    done

    if [[ "$worker_found" == "false" ]]; then
        print_warning "No worker assigned to this task"
    fi

    echo ""
    print_header "Full Task JSON:"
    echo "$task" | jq '.'
}

# List tasks
cmd_list() {
    local filter_master="${1:-}"
    local filter_status="${2:-}"

    print_header "=== Task List ==="
    echo ""

    if [[ ! -d "$TASKS_DIR" ]]; then
        print_warning "No tasks found"
        exit 0
    fi

    printf "%-20s %-15s %-20s %-10s %s\n" "TASK_ID" "MASTER" "CREATED" "STATUS" "DESCRIPTION"
    printf "%-20s %-15s %-20s %-10s %s\n" "-------" "------" "-------" "------" "-----------"

    for task_file in "$TASKS_DIR"/task-*.json; do
        if [[ -f "$task_file" ]]; then
            local task
            task=$(cat "$task_file")

            local task_id
            task_id=$(echo "$task" | jq -r '.task_id')

            local master
            master=$(echo "$task" | jq -r '.master')

            local status
            status=$(echo "$task" | jq -r '.status // "unknown"')

            local created_at
            created_at=$(echo "$task" | jq -r '.created_at' | cut -d'T' -f1)

            local description
            description=$(echo "$task" | jq -r '.description' | cut -c1-50)

            # Apply filters
            if [[ -n "$filter_master" && "$master" != "$filter_master" ]]; then
                continue
            fi

            if [[ -n "$filter_status" && "$status" != "$filter_status" ]]; then
                continue
            fi

            printf "%-20s %-15s %-20s %-10s %s\n" "$task_id" "$master" "$created_at" "$status" "$description"
        fi
    done
}

# Show workers
cmd_workers() {
    print_header "=== Worker Pool ==="
    echo ""

    if [[ ! -d "$WORKERS_DIR" ]]; then
        print_warning "No active workers"
        exit 0
    fi

    printf "%-25s %-20s %-20s %-15s %s\n" "WORKER_ID" "TYPE" "TASK_ID" "MASTER" "STATUS"
    printf "%-25s %-20s %-20s %-15s %s\n" "---------" "----" "-------" "------" "------"

    local total_workers=0

    for worker_file in "$WORKERS_DIR"/worker-*.json; do
        if [[ -f "$worker_file" ]]; then
            local worker
            worker=$(cat "$worker_file")

            local worker_id
            worker_id=$(echo "$worker" | jq -r '.worker_id')

            local worker_type
            worker_type=$(echo "$worker" | jq -r '.worker_type')

            local task_id
            task_id=$(echo "$worker" | jq -r '.task_id // "none"')

            local master
            master=$(echo "$worker" | jq -r '.master')

            local status
            status=$(echo "$worker" | jq -r '.status // "unknown"')

            printf "%-25s %-20s %-20s %-15s %s\n" "$worker_id" "$worker_type" "$task_id" "$master" "$status"
            total_workers=$((total_workers + 1))
        fi
    done

    echo ""
    print_info "Total active workers: ${total_workers}"
}

# Show master capabilities
cmd_masters() {
    print_header "=== Master Capabilities ==="
    echo ""

    local masters=(
        "coordinator-master:Task routing and CI/CD orchestration"
        "security-master:Security scans, audits, and CVE analysis"
        "development-master:Feature implementation and bug fixes"
        "inventory-master:Documentation and dependency management"
    )

    for master_info in "${masters[@]}"; do
        local master_name="${master_info%%:*}"
        local master_desc="${master_info#*:}"

        print_header "${master_name}"
        echo "  ${master_desc}"
        echo ""

        # Check if master has knowledge base
        local kb_dir="${CORTEX_ROOT}/coordination/masters/${master_name}/knowledge-base"
        if [[ -d "$kb_dir" ]]; then
            local kb_count
            kb_count=$(find "$kb_dir" -name "*.jsonl" -type f 2>/dev/null | wc -l | tr -d ' ')
            print_info "  Knowledge base files: ${kb_count}"
        fi

        # Count active workers
        local worker_count=0
        if [[ -d "$WORKERS_DIR" ]]; then
            for worker_file in "$WORKERS_DIR"/worker-*.json; do
                if [[ -f "$worker_file" ]]; then
                    local worker_master
                    worker_master=$(jq -r '.master' "$worker_file" 2>/dev/null || echo "")
                    if [[ "$worker_master" == "$master_name" ]]; then
                        worker_count=$((worker_count + 1))
                    fi
                fi
            done
        fi
        print_info "  Active workers: ${worker_count}"
        echo ""
    done
}

# Run a workflow
cmd_workflow_run() {
    local workflow_file="${1:-}"
    local inputs_json="$2"
    if [[ -z "$inputs_json" ]]; then
        inputs_json="{}"
    fi
    shift 2 || true

    if [[ -z "$workflow_file" ]]; then
        print_error "Usage: cortex workflow run <workflow_file> [inputs_json] [--dry-run] [--visualize]"
        exit 1
    fi

    # Check if workflow file exists
    if [[ ! -f "$workflow_file" ]]; then
        # Try looking in workflows directory
        if [[ -f "$WORKFLOWS_DIR/$workflow_file" ]]; then
            workflow_file="$WORKFLOWS_DIR/$workflow_file"
        else
            print_error "Workflow file not found: $workflow_file"
            exit 1
        fi
    fi

    print_header "=== Running Workflow ==="
    echo ""

    "$WORKFLOW_EXECUTOR" "$workflow_file" "$inputs_json" "$@"
}

# Show workflow run status
cmd_workflow_status() {
    local run_id="${1:-}"

    if [[ -z "$run_id" ]]; then
        print_error "Usage: cortex workflow status <run_id>"
        exit 1
    fi

    print_header "=== Workflow Run Status: ${run_id} ==="
    echo ""

    # Find the workflow state file
    local state_file=""
    for status_dir in active completed failed; do
        if [[ -f "$WORKFLOW_STATE_DIR/$status_dir/$run_id/state.json" ]]; then
            state_file="$WORKFLOW_STATE_DIR/$status_dir/$run_id/state.json"
            break
        fi
    done

    if [[ -z "$state_file" ]]; then
        print_error "Workflow run not found: $run_id"
        exit 1
    fi

    local state
    state=$(cat "$state_file")

    local workflow_name
    workflow_name=$(echo "$state" | jq -r '.workflow_name')

    local status
    status=$(echo "$state" | jq -r '.status')

    local started_at
    started_at=$(echo "$state" | jq -r '.started_at')

    local completed_at
    completed_at=$(echo "$state" | jq -r '.completed_at // "N/A"')

    print_info "Workflow: $workflow_name"
    print_info "Status: $status"
    print_info "Started: $started_at"
    print_info "Completed: $completed_at"
    echo ""

    # Show steps
    print_header "Steps:"
    local steps
    steps=$(echo "$state" | jq -r '.steps | to_entries[] | "\(.key): \(.value.status)"')
    echo "$steps"
    echo ""

    # Show inputs
    print_header "Inputs:"
    echo "$state" | jq '.inputs'
    echo ""

    # Show outputs if completed
    if [[ "$status" == "completed" ]]; then
        print_header "Outputs:"
        echo "$state" | jq '.outputs'
    fi
}

# List workflow runs
cmd_workflow_list() {
    local filter_status="${1:-}"

    print_header "=== Workflow Runs ==="
    echo ""

    printf "%-40s %-25s %-15s %-20s %s\n" "RUN_ID" "WORKFLOW" "STATUS" "STARTED" "GROUPS"
    printf "%-40s %-25s %-15s %-20s %s\n" "------" "--------" "------" "-------" "------"

    for status_dir in active completed failed; do
        if [[ ! -d "$WORKFLOW_STATE_DIR/$status_dir" ]]; then
            continue
        fi

        for run_dir in "$WORKFLOW_STATE_DIR/$status_dir"/wf-run-*; do
            if [[ ! -d "$run_dir" ]]; then
                continue
            fi

            local state_file="$run_dir/state.json"
            if [[ ! -f "$state_file" ]]; then
                continue
            fi

            local state
            state=$(cat "$state_file")

            local run_id
            run_id=$(basename "$run_dir")

            local workflow_name
            workflow_name=$(echo "$state" | jq -r '.workflow_name // "unknown"')

            local status
            status=$(echo "$state" | jq -r '.status // "unknown"')

            local started_at
            started_at=$(echo "$state" | jq -r '.started_at // "N/A"')

            local groups
            groups=$(echo "$state" | jq -r '.current_execution_group // 0')/$(echo "$state" | jq -r '.total_execution_groups // 0')

            if [[ -n "$filter_status" && "$status" != "$filter_status" ]]; then
                continue
            fi

            printf "%-40s %-25s %-15s %-20s %s\n" "$run_id" "$workflow_name" "$status" "$started_at" "$groups"
        done
    done
}

# List available workflows
cmd_workflow_catalog() {
    print_header "=== Available Workflows ==="
    echo ""

    if [[ ! -d "$WORKFLOWS_DIR" ]]; then
        print_warning "No workflows directory found"
        exit 0
    fi

    printf "%-30s %-50s %s\n" "WORKFLOW" "DESCRIPTION" "STEPS"
    printf "%-30s %-50s %s\n" "--------" "-----------" "-----"

    shopt -s nullglob 2>/dev/null || true
    for workflow_file in "$WORKFLOWS_DIR"/*.json "$WORKFLOWS_DIR"/*.yaml "$WORKFLOWS_DIR"/*.yml; do
        if [[ ! -f "$workflow_file" ]]; then
            continue
        fi

        local filename
        filename=$(basename "$workflow_file")

        local workflow_json=""
        if [[ "$workflow_file" == *.json ]]; then
            workflow_json=$(cat "$workflow_file")
        elif command -v yq &>/dev/null; then
            workflow_json=$(yq eval -o=json "$workflow_file" 2>/dev/null || echo "")
        fi

        if [[ -z "$workflow_json" ]]; then
            continue
        fi

        local name
        name=$(echo "$workflow_json" | jq -r '.name // "unknown"')

        local description
        description=$(echo "$workflow_json" | jq -r '.description // "N/A"')

        local steps_count
        steps_count=$(echo "$workflow_json" | jq '.steps | length')

        printf "%-30s %-50s %s\n" "$filename" "${description:0:50}" "$steps_count"
    done
}

# Show help
cmd_help() {
    cat <<EOF
${BOLD}Cortex CLI - Task Management & Workflows${RESET}

${BOLD}USAGE:${RESET}
  cortex <command> [options]

${BOLD}TASK COMMANDS:${RESET}
  ${CYAN}submit${RESET}                     Interactive task submission wizard
  ${CYAN}status${RESET} <task_id>           Show detailed task status
  ${CYAN}list${RESET} [master] [status]     List all tasks (optionally filtered)
  ${CYAN}workers${RESET}                    Show active worker pool
  ${CYAN}masters${RESET}                    Show master capabilities

${BOLD}WORKFLOW COMMANDS:${RESET}
  ${CYAN}workflow run${RESET} <file> [inputs] [options]
                                  Run a workflow with optional inputs
  ${CYAN}workflow status${RESET} <run_id>   Show workflow run status
  ${CYAN}workflow list${RESET} [status]     List workflow runs
  ${CYAN}workflow catalog${RESET}           List available workflows

${BOLD}GENERAL:${RESET}
  ${CYAN}help${RESET}                       Show this help message

${BOLD}TASK EXAMPLES:${RESET}
  cortex submit
  cortex status task-1234567890-abcd
  cortex list security-master
  cortex list "" pending
  cortex workers
  cortex masters

${BOLD}WORKFLOW EXAMPLES:${RESET}
  cortex workflow catalog
  cortex workflow run test-hello.json '{"name":"World"}'
  cortex workflow run security-audit.yaml '{"repo":"user/repo"}' --visualize
  cortex workflow status wf-run-20251130-064919-88453
  cortex workflow list completed

${BOLD}WORKFLOW OPTIONS:${RESET}
  --dry-run     Validate workflow without executing
  --visualize   Show ASCII workflow diagram

EOF
}

# Main CLI router
main() {
    local command="${1:-help}"

    case "$command" in
        submit)
            cmd_submit
            ;;

        status)
            if [[ $# -lt 2 ]]; then
                print_error "Usage: cortex status <task_id>"
                exit 1
            fi
            cmd_status "$2"
            ;;

        list)
            cmd_list "${2:-}" "${3:-}"
            ;;

        workers)
            cmd_workers
            ;;

        masters)
            cmd_masters
            ;;

        workflow)
            local subcommand="${2:-}"
            shift 2 || shift 1 || true

            case "$subcommand" in
                run)
                    cmd_workflow_run "$@"
                    ;;
                status)
                    cmd_workflow_status "$@"
                    ;;
                list)
                    cmd_workflow_list "$@"
                    ;;
                catalog)
                    cmd_workflow_catalog
                    ;;
                *)
                    print_error "Unknown workflow subcommand: ${subcommand}"
                    echo ""
                    echo "Available: run, status, list, catalog"
                    exit 1
                    ;;
            esac
            ;;

        help|--help|-h)
            cmd_help
            ;;

        *)
            print_error "Unknown command: ${command}"
            echo ""
            cmd_help
            exit 1
            ;;
    esac
}

# Run main
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
