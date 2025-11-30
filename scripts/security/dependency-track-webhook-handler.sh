#!/usr/bin/env bash
#
# Dependency-Track Webhook Handler
# Receives webhook notifications from Dependency-Track and integrates with Cortex
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
EVENTS_LOG="$CORTEX_ROOT/coordination/dashboard-events.jsonl"
WEBHOOK_LOG="$CORTEX_ROOT/coordination/security/dependency-track/webhook-log.jsonl"

# Ensure log files exist
mkdir -p "$(dirname "$WEBHOOK_LOG")"
touch "$WEBHOOK_LOG"
touch "$EVENTS_LOG"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Function to emit Cortex event
emit_cortex_event() {
  local event_type="$1"
  local severity="$2"
  local message="$3"
  local metadata="$4"

  local event=$(cat <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "event_type": "$event_type",
  "severity": "$severity",
  "source": "dependency-track",
  "message": "$message",
  "metadata": $metadata
}
EOF
)

  echo "$event" >> "$EVENTS_LOG"
}

# Function to send Cortex notification
send_cortex_notification() {
  local project="$1"
  local severity="$2"
  local cve_id="$3"
  local component="$4"

  # Create task for security master to handle
  local task_id="vuln-alert-$(date +%s)-$$"
  local task_file="$CORTEX_ROOT/coordination/tasks/task-$task_id.json"

  cat > "$task_file" <<EOF
{
  "task_id": "$task_id",
  "task_type": "vulnerability_alert",
  "priority": "high",
  "source": "dependency-track",
  "target_master": "security-master",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "status": "pending",
  "payload": {
    "project": "$project",
    "severity": "$severity",
    "cve_id": "$cve_id",
    "component": "$component",
    "action_required": "review_and_remediate"
  }
}
EOF

  echo -e "${BLUE}Created security task: $task_id${NC}" >&2
}

# Main webhook handler
handle_webhook() {
  local payload="$1"

  # Log webhook
  echo "$payload" >> "$WEBHOOK_LOG"

  # Parse notification type
  notification_type=$(echo "$payload" | jq -r '.notification.level // "INFO"')
  notification_group=$(echo "$payload" | jq -r '.notification.group // "UNKNOWN"')
  notification_title=$(echo "$payload" | jq -r '.notification.title // "Notification"')

  echo -e "${BLUE}Received webhook:${NC}" >&2
  echo -e "  Type:  $notification_type" >&2
  echo -e "  Group: $notification_group" >&2
  echo -e "  Title: $notification_title" >&2

  # Handle different notification types
  case "$notification_group" in
    "NEW_VULNERABILITY")
      handle_new_vulnerability "$payload"
      ;;
    "NEW_VULNERABLE_DEPENDENCY")
      handle_vulnerable_dependency "$payload"
      ;;
    "POLICY_VIOLATION")
      handle_policy_violation "$payload"
      ;;
    "BOM_CONSUMED" | "BOM_PROCESSED")
      handle_bom_processed "$payload"
      ;;
    *)
      echo -e "${YELLOW}Unhandled notification group: $notification_group${NC}" >&2
      ;;
  esac
}

# Handle new vulnerability
handle_new_vulnerability() {
  local payload="$1"

  local project_name=$(echo "$payload" | jq -r '.project.name // "unknown"')
  local project_version=$(echo "$payload" | jq -r '.project.version // "unknown"')
  local component=$(echo "$payload" | jq -r '.component.name // "unknown"')
  local vuln_id=$(echo "$payload" | jq -r '.vulnerability.vulnId // "unknown"')
  local severity=$(echo "$payload" | jq -r '.vulnerability.severity // "UNASSIGNED"')

  echo -e "${YELLOW}New vulnerability detected:${NC}" >&2
  echo -e "  Project:   $project_name v$project_version" >&2
  echo -e "  Component: $component" >&2
  echo -e "  Vuln ID:   $vuln_id" >&2
  echo -e "  Severity:  $severity" >&2

  # Emit Cortex event
  local metadata=$(cat <<EOF
{
  "project": "$project_name",
  "version": "$project_version",
  "component": "$component",
  "vulnerability_id": "$vuln_id",
  "severity": "$severity"
}
EOF
)

  emit_cortex_event "security.vulnerability.new" "$severity" \
    "New $severity vulnerability $vuln_id in $project_name: $component" \
    "$metadata"

  # Create task for critical/high vulnerabilities
  if [[ "$severity" == "CRITICAL" || "$severity" == "HIGH" ]]; then
    send_cortex_notification "$project_name" "$severity" "$vuln_id" "$component"
  fi
}

# Handle vulnerable dependency
handle_vulnerable_dependency() {
  local payload="$1"

  local project_name=$(echo "$payload" | jq -r '.project.name // "unknown"')
  local component=$(echo "$payload" | jq -r '.component.name // "unknown"')

  echo -e "${YELLOW}Vulnerable dependency:${NC}" >&2
  echo -e "  Project:   $project_name" >&2
  echo -e "  Component: $component" >&2

  # Emit event
  local metadata=$(cat <<EOF
{
  "project": "$project_name",
  "component": "$component"
}
EOF
)

  emit_cortex_event "security.dependency.vulnerable" "MEDIUM" \
    "Vulnerable dependency in $project_name: $component" \
    "$metadata"
}

# Handle policy violation
handle_policy_violation() {
  local payload="$1"

  local project_name=$(echo "$payload" | jq -r '.project.name // "unknown"')
  local policy_name=$(echo "$payload" | jq -r '.policyViolation.policyCondition.policy.name // "unknown"')

  echo -e "${RED}Policy violation:${NC}" >&2
  echo -e "  Project: $project_name" >&2
  echo -e "  Policy:  $policy_name" >&2

  # Emit event
  local metadata=$(cat <<EOF
{
  "project": "$project_name",
  "policy": "$policy_name"
}
EOF
)

  emit_cortex_event "security.policy.violation" "HIGH" \
    "Policy violation in $project_name: $policy_name" \
    "$metadata"
}

# Handle BOM processed
handle_bom_processed() {
  local payload="$1"

  local project_name=$(echo "$payload" | jq -r '.project.name // "unknown"')
  local project_version=$(echo "$payload" | jq -r '.project.version // "unknown"')

  echo -e "${GREEN}BOM processed:${NC}" >&2
  echo -e "  Project: $project_name v$project_version" >&2

  # Emit event
  local metadata=$(cat <<EOF
{
  "project": "$project_name",
  "version": "$project_version"
}
EOF
)

  emit_cortex_event "security.bom.processed" "INFO" \
    "SBOM processed for $project_name v$project_version" \
    "$metadata"
}

# Main execution
if [ $# -eq 0 ]; then
  # Read from stdin (for webhook server)
  payload=$(cat)
else
  # Read from file (for testing)
  payload=$(cat "$1")
fi

handle_webhook "$payload"

echo -e "${GREEN}✓ Webhook processed${NC}" >&2
