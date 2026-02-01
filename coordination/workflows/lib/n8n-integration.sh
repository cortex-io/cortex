#!/usr/bin/env bash
# =============================================================================
# Cortex N8N Integration Library
# =============================================================================
# Provides functions for Cortex masters to autonomously interact with n8n
# via the n8n-mcp-server or direct API calls.
#
# Usage: source this file in master scripts
#   source "${CORTEX_ROOT}/coordination/workflows/lib/n8n-integration.sh"
# =============================================================================

set -euo pipefail

# Configuration
CORTEX_ROOT="${CORTEX_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
WORKFLOW_REGISTRY="${CORTEX_ROOT}/coordination/workflows/registry.json"
WORKFLOW_TEMPLATES="${CORTEX_ROOT}/coordination/workflows/templates"

# N8N Configuration (from environment or defaults)
N8N_URL="${N8N_URL:-http://n8n.local:5678}"
N8N_API_KEY="${N8N_API_KEY:-}"

# Logging
log_info() { echo "[n8n-integration] INFO: $*" >&2; }
log_warn() { echo "[n8n-integration] WARN: $*" >&2; }
log_error() { echo "[n8n-integration] ERROR: $*" >&2; }

# =============================================================================
# Core API Functions
# =============================================================================

# List all workflows, optionally filtered by name or tag
# Usage: n8n_list_workflows [filter_name]
n8n_list_workflows() {
    local filter="${1:-}"
    local url="${N8N_URL}/api/v1/workflows"

    if [[ -n "$filter" ]]; then
        url="${url}?name=${filter}"
    fi

    curl -s -X GET "$url" \
        -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
        -H "Accept: application/json"
}

# Get workflow by ID
# Usage: n8n_get_workflow <workflow_id>
n8n_get_workflow() {
    local workflow_id="$1"

    curl -s -X GET "${N8N_URL}/api/v1/workflows/${workflow_id}" \
        -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
        -H "Accept: application/json"
}

# Check if workflow exists by name
# Usage: n8n_workflow_exists <workflow_name>
# Returns: 0 if exists, 1 if not
n8n_workflow_exists() {
    local workflow_name="$1"
    local result

    result=$(n8n_list_workflows | jq -r --arg name "$workflow_name" '.data[]? | select(.name == $name) | .id')

    if [[ -n "$result" ]]; then
        echo "$result"
        return 0
    else
        return 1
    fi
}

# Create workflow from JSON
# Usage: n8n_create_workflow <workflow_json>
n8n_create_workflow() {
    local workflow_json="$1"

    curl -s -X POST "${N8N_URL}/api/v1/workflows" \
        -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
        -H "Content-Type: application/json" \
        -d "$workflow_json"
}

# Create workflow from template file
# Usage: n8n_create_from_template <template_name>
n8n_create_from_template() {
    local template_name="$1"
    local template_path="${WORKFLOW_TEMPLATES}/${template_name}"

    if [[ ! -f "$template_path" ]]; then
        log_error "Template not found: $template_path"
        return 1
    fi

    local workflow_json
    workflow_json=$(cat "$template_path")

    n8n_create_workflow "$workflow_json"
}

# Update existing workflow
# Usage: n8n_update_workflow <workflow_id> <workflow_json>
n8n_update_workflow() {
    local workflow_id="$1"
    local workflow_json="$2"

    curl -s -X PATCH "${N8N_URL}/api/v1/workflows/${workflow_id}" \
        -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
        -H "Content-Type: application/json" \
        -d "$workflow_json"
}

# Activate workflow
# Usage: n8n_activate_workflow <workflow_id>
n8n_activate_workflow() {
    local workflow_id="$1"

    curl -s -X POST "${N8N_URL}/api/v1/workflows/${workflow_id}/activate" \
        -H "X-N8N-API-KEY: ${N8N_API_KEY}"
}

# Deactivate workflow
# Usage: n8n_deactivate_workflow <workflow_id>
n8n_deactivate_workflow() {
    local workflow_id="$1"

    curl -s -X POST "${N8N_URL}/api/v1/workflows/${workflow_id}/deactivate" \
        -H "X-N8N-API-KEY: ${N8N_API_KEY}"
}

# Execute workflow manually
# Usage: n8n_execute_workflow <workflow_id> [data_json]
n8n_execute_workflow() {
    local workflow_id="$1"
    local data="${2:-{}}"

    curl -s -X POST "${N8N_URL}/api/v1/workflows/${workflow_id}/run" \
        -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
        -H "Content-Type: application/json" \
        -d "$data"
}

# Trigger webhook workflow
# Usage: n8n_trigger_webhook <webhook_path> <data_json>
n8n_trigger_webhook() {
    local webhook_path="$1"
    local data="${2:-{}}"

    curl -s -X POST "${N8N_URL}/webhook/${webhook_path}" \
        -H "Content-Type: application/json" \
        -d "$data"
}

# Get execution status
# Usage: n8n_get_execution <execution_id>
n8n_get_execution() {
    local execution_id="$1"

    curl -s -X GET "${N8N_URL}/api/v1/executions/${execution_id}" \
        -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
        -H "Accept: application/json"
}

# List recent executions for a workflow
# Usage: n8n_list_executions <workflow_id> [limit]
n8n_list_executions() {
    local workflow_id="$1"
    local limit="${2:-10}"

    curl -s -X GET "${N8N_URL}/api/v1/executions?workflowId=${workflow_id}&limit=${limit}" \
        -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
        -H "Accept: application/json"
}

# =============================================================================
# Registry Functions
# =============================================================================

# Get intent configuration from registry
# Usage: registry_get_intent <intent_name>
registry_get_intent() {
    local intent="$1"

    if [[ ! -f "$WORKFLOW_REGISTRY" ]]; then
        log_error "Registry not found: $WORKFLOW_REGISTRY"
        return 1
    fi

    jq -r --arg intent "$intent" '.intents[$intent] // empty' "$WORKFLOW_REGISTRY"
}

# Get template filename for intent
# Usage: registry_get_template <intent_name>
registry_get_template() {
    local intent="$1"
    registry_get_intent "$intent" | jq -r '.template // empty'
}

# Get n8n workflow name for intent
# Usage: registry_get_n8n_name <intent_name>
registry_get_n8n_name() {
    local intent="$1"
    registry_get_intent "$intent" | jq -r '.n8n_name // empty'
}

# Check if intent allows auto-creation
# Usage: registry_can_auto_create <intent_name>
registry_can_auto_create() {
    local intent="$1"
    local result
    result=$(registry_get_intent "$intent" | jq -r '.autonomy.can_auto_create // false')
    [[ "$result" == "true" ]]
}

# Check if intent allows auto-execution
# Usage: registry_can_auto_execute <intent_name>
registry_can_auto_execute() {
    local intent="$1"
    local result
    result=$(registry_get_intent "$intent" | jq -r '.autonomy.can_auto_execute // false')
    [[ "$result" == "true" ]]
}

# List all registered intents
# Usage: registry_list_intents
registry_list_intents() {
    jq -r '.intents | keys[]' "$WORKFLOW_REGISTRY"
}

# =============================================================================
# High-Level Orchestration Functions
# =============================================================================

# Ensure workflow exists (create if missing)
# Usage: ensure_workflow <intent_name>
# Returns: workflow_id
ensure_workflow() {
    local intent="$1"
    local workflow_name
    local workflow_id
    local template

    workflow_name=$(registry_get_n8n_name "$intent")
    if [[ -z "$workflow_name" ]]; then
        log_error "Unknown intent: $intent"
        return 1
    fi

    # Check if workflow already exists
    if workflow_id=$(n8n_workflow_exists "$workflow_name"); then
        log_info "Workflow '$workflow_name' exists with ID: $workflow_id"
        echo "$workflow_id"
        return 0
    fi

    # Check if we can auto-create
    if ! registry_can_auto_create "$intent"; then
        log_error "Auto-creation not allowed for intent: $intent"
        return 1
    fi

    # Create from template
    template=$(registry_get_template "$intent")
    log_info "Creating workflow '$workflow_name' from template: $template"

    local create_result
    create_result=$(n8n_create_from_template "$template")

    workflow_id=$(echo "$create_result" | jq -r '.id // empty')
    if [[ -z "$workflow_id" ]]; then
        log_error "Failed to create workflow: $create_result"
        return 1
    fi

    # Activate the workflow
    log_info "Activating workflow: $workflow_id"
    n8n_activate_workflow "$workflow_id" >/dev/null

    echo "$workflow_id"
}

# Execute intent with automatic workflow creation
# Usage: execute_intent <intent_name> <params_json>
# Example: execute_intent "k3s_storage_expansion" '{"node_name":"k3s-worker-01","size_gb":50}'
execute_intent() {
    local intent="$1"
    local params="${2:-{}}"
    local workflow_id
    local webhook_path

    # Check if we can auto-execute
    if ! registry_can_auto_execute "$intent"; then
        log_error "Auto-execution not allowed for intent: $intent"
        return 1
    fi

    # Ensure workflow exists
    workflow_id=$(ensure_workflow "$intent")
    if [[ -z "$workflow_id" ]]; then
        return 1
    fi

    # Determine webhook path from template
    local template
    template=$(registry_get_template "$intent")
    webhook_path=$(jq -r '.nodes[]? | select(.type == "n8n-nodes-base.webhook") | .parameters.path // empty' "${WORKFLOW_TEMPLATES}/${template}" | head -1)

    if [[ -n "$webhook_path" ]]; then
        # Trigger via webhook
        log_info "Triggering workflow via webhook: /${webhook_path}"
        n8n_trigger_webhook "$webhook_path" "$params"
    else
        # Execute directly via API
        log_info "Executing workflow directly: $workflow_id"
        n8n_execute_workflow "$workflow_id" "$params"
    fi
}

# Validate code repository
# Usage: validate_code <repo_url> [branch] [fix_mode]
# fix_mode: "report" | "fix" | "fix-and-pr"
validate_code() {
    local repo_url="$1"
    local branch="${2:-main}"
    local fix_mode="${3:-report}"
    local request_id="val-$(date +%s)"

    local params
    params=$(jq -n \
        --arg repo "$repo_url" \
        --arg branch "$branch" \
        --arg fix_mode "$fix_mode" \
        --arg request_id "$request_id" \
        '{
            repo_url: $repo,
            branch: $branch,
            fix_mode: $fix_mode,
            request_id: $request_id,
            requested_by: "cortex"
        }')

    execute_intent "code_validation" "$params"
}

# Expand storage on k3s node
# Usage: expand_k3s_storage <node_name> <size_gb> <vm_id> [proxmox_node] [dry_run]
expand_k3s_storage() {
    local node_name="$1"
    local size_gb="$2"
    local vm_id="$3"
    local proxmox_node="${4:-pve01}"
    local dry_run="${5:-false}"
    local request_id="storage-$(date +%s)"

    local params
    params=$(jq -n \
        --arg node "$node_name" \
        --arg size "$size_gb" \
        --arg vm_id "$vm_id" \
        --arg pve "$proxmox_node" \
        --argjson dry_run "$dry_run" \
        --arg request_id "$request_id" \
        '{
            node_name: $node,
            size_gb: ($size | tonumber),
            vm_id: $vm_id,
            proxmox_node: $pve,
            dry_run: $dry_run,
            request_id: $request_id,
            requested_by: "cortex"
        }')

    execute_intent "k3s_storage_expansion" "$params"
}

# =============================================================================
# Health Check Functions
# =============================================================================

# Check n8n connectivity
# Usage: n8n_health_check
n8n_health_check() {
    local result
    result=$(curl -s -o /dev/null -w "%{http_code}" "${N8N_URL}/healthz" 2>/dev/null || echo "000")

    if [[ "$result" == "200" ]]; then
        log_info "N8N is healthy"
        return 0
    else
        log_error "N8N health check failed (HTTP $result)"
        return 1
    fi
}

# List all workflows and their status
# Usage: n8n_status
n8n_status() {
    echo "=== N8N Workflow Status ==="
    echo "URL: ${N8N_URL}"
    echo ""

    if ! n8n_health_check; then
        return 1
    fi

    echo ""
    echo "Workflows:"
    n8n_list_workflows | jq -r '.data[]? | "  [\(.active | if . then "ACTIVE" else "INACTIVE" end)] \(.name) (ID: \(.id))"'
}

# =============================================================================
# Audit Functions
# =============================================================================

# Log workflow action to audit trail
# Usage: audit_log <action> <intent> <params> <result>
audit_log() {
    local action="$1"
    local intent="$2"
    local params="$3"
    local result="$4"
    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    local audit_dir="${CORTEX_ROOT}/coordination/workflows/audit"
    mkdir -p "$audit_dir"

    local audit_file="${audit_dir}/$(date +%Y-%m-%d).jsonl"

    jq -n -c \
        --arg action "$action" \
        --arg intent "$intent" \
        --arg timestamp "$timestamp" \
        --argjson params "$params" \
        --argjson result "$result" \
        '{
            timestamp: $timestamp,
            action: $action,
            intent: $intent,
            params: $params,
            result: $result
        }' >> "$audit_file"

    log_info "Audit logged: $action $intent"
}

# =============================================================================
# Main (for testing)
# =============================================================================

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    case "${1:-help}" in
        health)
            n8n_health_check
            ;;
        status)
            n8n_status
            ;;
        list)
            n8n_list_workflows | jq .
            ;;
        intents)
            echo "Registered intents:"
            registry_list_intents
            ;;
        ensure)
            ensure_workflow "${2:-}"
            ;;
        execute)
            execute_intent "${2:-}" "${3:-{}}"
            ;;
        validate)
            validate_code "${2:-}" "${3:-main}" "${4:-report}"
            ;;
        expand-storage)
            expand_k3s_storage "${2:-}" "${3:-50}" "${4:-}" "${5:-pve01}" "${6:-false}"
            ;;
        *)
            echo "Cortex N8N Integration Library"
            echo ""
            echo "Usage: $0 <command> [args...]"
            echo ""
            echo "Commands:"
            echo "  health               Check n8n connectivity"
            echo "  status               Show all workflows and status"
            echo "  list                 List all workflows (JSON)"
            echo "  intents              List registered workflow intents"
            echo "  ensure <intent>      Ensure workflow exists (create if needed)"
            echo "  execute <intent> [params_json]  Execute workflow by intent"
            echo "  validate <repo_url> [branch] [fix_mode]  Validate code repository"
            echo "  expand-storage <node> <size_gb> <vm_id> [pve_node] [dry_run]"
            echo ""
            echo "Environment variables:"
            echo "  N8N_URL      n8n server URL (default: http://n8n.local:5678)"
            echo "  N8N_API_KEY  n8n API key for authentication"
            ;;
    esac
fi
