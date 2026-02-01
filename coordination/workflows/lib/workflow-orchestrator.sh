#!/usr/bin/env bash
# =============================================================================
# Cortex Workflow Orchestrator
# =============================================================================
# Autonomous workflow orchestration for Cortex masters.
# Matches events/alerts to intents and executes workflows automatically.
#
# Usage:
#   ./workflow-orchestrator.sh process-alert <alert_json>
#   ./workflow-orchestrator.sh process-event <event_type> <event_data>
#   ./workflow-orchestrator.sh daemon  # Run as background daemon
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_ROOT="${CORTEX_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"

# Source the n8n integration library
source "${SCRIPT_DIR}/n8n-integration.sh"

# Configuration
ORCHESTRATOR_STATE="${CORTEX_ROOT}/coordination/workflows/state/orchestrator-state.json"
ALERT_RULES="${CORTEX_ROOT}/coordination/workflows/alert-rules.json"
EVENT_QUEUE="${CORTEX_ROOT}/coordination/workflows/state/event-queue.json"

# Ensure state directory exists
mkdir -p "$(dirname "$ORCHESTRATOR_STATE")"

# =============================================================================
# Alert Matching
# =============================================================================

# Match alert to intent based on alert rules
# Usage: match_alert_to_intent <alertname>
match_alert_to_intent() {
    local alertname="$1"

    # Built-in alert mappings
    case "$alertname" in
        K3sNodeStorageLow|K3sStorageFull|PVCPending)
            echo "k3s_storage_expansion"
            ;;
        K3sHighCPU|K3sPendingPods|K3sNodePressure)
            echo "k3s_node_scale"
            ;;
        MCPServerDown|MCPServerUnhealthy)
            echo "mcp_server_lifecycle"
            ;;
        CertExpiringSoon|CertExpired)
            echo "certificate_renewal"
            ;;
        BackupFailed|BackupMissing)
            echo "backup_restore"
            ;;
        CodeQualityFailed|LintErrors|SecurityVulnerability)
            echo "code_validation"
            ;;
        *)
            # Check custom rules file if exists
            if [[ -f "$ALERT_RULES" ]]; then
                local intent
                intent=$(jq -r --arg alert "$alertname" '.rules[$alert] // empty' "$ALERT_RULES")
                if [[ -n "$intent" ]]; then
                    echo "$intent"
                    return 0
                fi
            fi
            return 1
            ;;
    esac
}

# Extract parameters from alert for workflow execution
# Usage: extract_alert_params <alertname> <alert_json>
extract_alert_params() {
    local alertname="$1"
    local alert_json="$2"

    case "$alertname" in
        K3sNodeStorageLow|K3sStorageFull)
            # Extract node info from alert labels
            echo "$alert_json" | jq '{
                node_name: .labels.node // .labels.instance,
                size_gb: (.annotations.recommended_size // "50" | tonumber),
                vm_id: .labels.vm_id,
                proxmox_node: .labels.proxmox_node // "pve01",
                dry_run: false,
                request_id: ("storage-alert-" + (.fingerprint // (now | tostring))),
                requested_by: "cortex-orchestrator",
                alert_fingerprint: .fingerprint
            }'
            ;;
        K3sHighCPU|K3sPendingPods)
            echo "$alert_json" | jq '{
                action: "scale_up",
                count: 1,
                request_id: ("scale-alert-" + (.fingerprint // (now | tostring))),
                requested_by: "cortex-orchestrator"
            }'
            ;;
        MCPServerDown)
            echo "$alert_json" | jq '{
                server_name: .labels.server // .labels.service,
                action: "restart",
                request_id: ("mcp-alert-" + (.fingerprint // (now | tostring))),
                requested_by: "cortex-orchestrator"
            }'
            ;;
        CertExpiringSoon)
            echo "$alert_json" | jq '{
                domain: .labels.domain // .labels.cn,
                provider: .labels.provider // "letsencrypt",
                request_id: ("cert-alert-" + (.fingerprint // (now | tostring))),
                requested_by: "cortex-orchestrator"
            }'
            ;;
        CodeQualityFailed|LintErrors)
            echo "$alert_json" | jq '{
                repo_url: .labels.repo // .labels.repository,
                branch: .labels.branch // "main",
                fix_mode: "fix-and-pr",
                request_id: ("code-alert-" + (.fingerprint // (now | tostring))),
                requested_by: "cortex-orchestrator"
            }'
            ;;
        *)
            # Generic parameter extraction
            echo "$alert_json" | jq '{
                alert_labels: .labels,
                alert_annotations: .annotations,
                request_id: ("generic-" + (.fingerprint // (now | tostring))),
                requested_by: "cortex-orchestrator"
            }'
            ;;
    esac
}

# =============================================================================
# Alert Processing
# =============================================================================

# Process an incoming alert
# Usage: process_alert <alert_json>
process_alert() {
    local alert_json="$1"

    # Extract alert details
    local alertname status
    alertname=$(echo "$alert_json" | jq -r '.labels.alertname // .alertname // "unknown"')
    status=$(echo "$alert_json" | jq -r '.status // "firing"')

    log_info "Processing alert: $alertname (status: $status)"

    # Only process firing alerts
    if [[ "$status" != "firing" ]]; then
        log_info "Skipping resolved alert: $alertname"
        echo '{"action":"skipped","reason":"alert_resolved"}'
        return 0
    fi

    # Match alert to intent
    local intent
    if ! intent=$(match_alert_to_intent "$alertname"); then
        log_warn "No workflow intent matched for alert: $alertname"
        echo '{"action":"skipped","reason":"no_matching_intent"}'
        return 0
    fi

    log_info "Alert $alertname matched to intent: $intent"

    # Check if intent allows autonomous execution
    if ! registry_can_auto_execute "$intent"; then
        log_warn "Autonomous execution not allowed for intent: $intent"
        echo '{"action":"blocked","reason":"autonomy_not_allowed","intent":"'"$intent"'"}'
        return 0
    fi

    # Extract parameters for the workflow
    local params
    params=$(extract_alert_params "$alertname" "$alert_json")

    log_info "Executing intent '$intent' with params: $params"

    # Execute the workflow
    local result
    result=$(execute_intent "$intent" "$params")

    # Audit the action
    audit_log "alert_response" "$intent" "$params" "$result"

    # Return result
    echo "$result"
}

# Process batch of alerts (Alertmanager format)
# Usage: process_alerts <alertmanager_payload>
process_alerts() {
    local payload="$1"
    local alerts
    alerts=$(echo "$payload" | jq -c '.alerts[]? // .')

    local results="[]"

    while IFS= read -r alert; do
        [[ -z "$alert" ]] && continue

        local result
        result=$(process_alert "$alert")

        results=$(echo "$results" | jq --argjson result "$result" '. + [$result]')
    done <<< "$alerts"

    echo "$results"
}

# =============================================================================
# Event Processing
# =============================================================================

# Process generic events (not alerts)
# Usage: process_event <event_type> <event_data>
process_event() {
    local event_type="$1"
    local event_data="$2"

    log_info "Processing event: $event_type"

    case "$event_type" in
        code_push)
            # Trigger code validation on push
            local repo branch
            repo=$(echo "$event_data" | jq -r '.repository.clone_url // .repo_url')
            branch=$(echo "$event_data" | jq -r '.ref | split("/") | last // "main"')

            if [[ -n "$repo" ]]; then
                validate_code "$repo" "$branch" "fix-and-pr"
            fi
            ;;
        pr_opened)
            # Validate PR code
            local repo branch
            repo=$(echo "$event_data" | jq -r '.pull_request.head.repo.clone_url // .repo_url')
            branch=$(echo "$event_data" | jq -r '.pull_request.head.ref // "main"')

            if [[ -n "$repo" ]]; then
                validate_code "$repo" "$branch" "report"
            fi
            ;;
        schedule_backup)
            execute_intent "backup_restore" '{"action":"backup","target":"all"}'
            ;;
        infra_request)
            # Generic infrastructure request
            local intent
            intent=$(echo "$event_data" | jq -r '.intent // empty')
            local params
            params=$(echo "$event_data" | jq -c '.params // {}')

            if [[ -n "$intent" ]]; then
                execute_intent "$intent" "$params"
            fi
            ;;
        *)
            log_warn "Unknown event type: $event_type"
            echo '{"action":"skipped","reason":"unknown_event_type"}'
            ;;
    esac
}

# =============================================================================
# State Management
# =============================================================================

# Initialize orchestrator state
init_state() {
    if [[ ! -f "$ORCHESTRATOR_STATE" ]]; then
        cat > "$ORCHESTRATOR_STATE" << 'EOF'
{
  "version": "1.0.0",
  "started_at": null,
  "status": "stopped",
  "stats": {
    "alerts_processed": 0,
    "events_processed": 0,
    "workflows_triggered": 0,
    "errors": 0
  },
  "last_activity": null
}
EOF
    fi
}

# Update state
update_state() {
    local key="$1"
    local value="$2"

    local tmp
    tmp=$(mktemp)
    jq --arg key "$key" --argjson value "$value" '.[$key] = $value' "$ORCHESTRATOR_STATE" > "$tmp"
    mv "$tmp" "$ORCHESTRATOR_STATE"
}

# Increment stat counter
increment_stat() {
    local stat="$1"
    local tmp
    tmp=$(mktemp)
    jq --arg stat "$stat" '.stats[$stat] += 1 | .last_activity = now' "$ORCHESTRATOR_STATE" > "$tmp"
    mv "$tmp" "$ORCHESTRATOR_STATE"
}

# =============================================================================
# Daemon Mode
# =============================================================================

# Run orchestrator in daemon mode
# Listens for events via webhook server (requires external HTTP server)
run_daemon() {
    init_state

    log_info "Starting Cortex Workflow Orchestrator daemon..."

    # Update state
    update_state "status" '"running"'
    update_state "started_at" "$(date +%s)"

    # Check n8n connectivity
    if ! n8n_health_check; then
        log_error "Cannot connect to n8n. Please check N8N_URL and N8N_API_KEY"
        exit 1
    fi

    log_info "Connected to n8n at: ${N8N_URL}"
    log_info "Orchestrator ready. Listening for events..."

    # Simple event loop - process queued events
    while true; do
        if [[ -f "$EVENT_QUEUE" ]] && [[ -s "$EVENT_QUEUE" ]]; then
            # Process queued events
            local event
            event=$(head -1 "$EVENT_QUEUE")

            if [[ -n "$event" ]]; then
                local event_type event_data
                event_type=$(echo "$event" | jq -r '.type')
                event_data=$(echo "$event" | jq -c '.data')

                process_event "$event_type" "$event_data"
                increment_stat "events_processed"

                # Remove processed event from queue
                tail -n +2 "$EVENT_QUEUE" > "${EVENT_QUEUE}.tmp"
                mv "${EVENT_QUEUE}.tmp" "$EVENT_QUEUE"
            fi
        fi

        sleep 5
    done
}

# =============================================================================
# CLI Interface
# =============================================================================

print_status() {
    init_state
    echo "=== Cortex Workflow Orchestrator Status ==="
    jq '.' "$ORCHESTRATOR_STATE"
    echo ""
    echo "=== N8N Status ==="
    n8n_status
}

# =============================================================================
# Main
# =============================================================================

case "${1:-help}" in
    process-alert)
        process_alert "${2:-}"
        ;;
    process-alerts)
        process_alerts "${2:-}"
        ;;
    process-event)
        process_event "${2:-}" "${3:-{}}"
        ;;
    validate)
        validate_code "${2:-}" "${3:-main}" "${4:-report}"
        ;;
    expand-storage)
        expand_k3s_storage "${2:-}" "${3:-50}" "${4:-}" "${5:-pve01}" "${6:-false}"
        ;;
    status)
        print_status
        ;;
    daemon)
        run_daemon
        ;;
    test-connection)
        n8n_health_check && echo "Connection OK" || echo "Connection FAILED"
        ;;
    *)
        cat << 'EOF'
Cortex Workflow Orchestrator
============================

Autonomous workflow orchestration for Cortex masters.

Usage:
  ./workflow-orchestrator.sh <command> [args...]

Commands:
  process-alert <alert_json>          Process a single alert
  process-alerts <payload>            Process Alertmanager payload
  process-event <type> <data>         Process a generic event
  validate <repo_url> [branch] [mode] Trigger code validation
  expand-storage <node> <gb> <vm_id>  Trigger storage expansion
  status                              Show orchestrator status
  daemon                              Run as background daemon
  test-connection                     Test n8n connectivity

Event Types:
  code_push         - Trigger validation on code push
  pr_opened         - Validate PR code
  schedule_backup   - Run scheduled backup
  infra_request     - Generic infrastructure request

Alert Mappings:
  K3sNodeStorageLow  -> k3s_storage_expansion
  K3sHighCPU         -> k3s_node_scale
  MCPServerDown      -> mcp_server_lifecycle
  CertExpiringSoon   -> certificate_renewal
  BackupFailed       -> backup_restore
  CodeQualityFailed  -> code_validation

Environment:
  N8N_URL       - n8n server URL (default: http://n8n.local:5678)
  N8N_API_KEY   - n8n API key for authentication
  CORTEX_ROOT   - Cortex project root directory

Examples:
  # Process an alert
  ./workflow-orchestrator.sh process-alert '{"labels":{"alertname":"K3sNodeStorageLow","node":"k3s-worker-01","vm_id":"105"},"status":"firing"}'

  # Validate a repository
  ./workflow-orchestrator.sh validate https://github.com/user/repo main fix-and-pr

  # Expand storage
  ./workflow-orchestrator.sh expand-storage k3s-worker-01 100 105 pve01 false

EOF
        ;;
esac
