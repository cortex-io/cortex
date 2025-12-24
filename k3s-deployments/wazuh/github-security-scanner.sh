#!/bin/bash
#
# GitHub Security Scanner for Wazuh v4.7.0
# Polls GitHub API for security events and sends to Wazuh
#
# Usage: ./github-security-scanner.sh
# Environment: GITHUB_TOKEN, GITHUB_ORG
#

set -e

GITHUB_TOKEN="${GITHUB_TOKEN:-}"
GITHUB_ORG="${GITHUB_ORG:-ry-ops}"
WAZUH_LOG_FILE="/var/ossec/logs/github-security.log"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
STATE_FILE="/tmp/github-scanner-state.json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# Check for required tools
for cmd in curl jq; do
  if ! command -v $cmd &> /dev/null; then
    log_error "$cmd is required but not installed"
    exit 1
  fi
done

if [ -z "$GITHUB_TOKEN" ]; then
  log_error "GITHUB_TOKEN environment variable is required"
  exit 1
fi

# GitHub API base URL
GITHUB_API="https://api.github.com"

# Initialize state file
if [ ! -f "$STATE_FILE" ]; then
  echo '{"last_scan": null, "repositories_scanned": [], "events_processed": 0}' > "$STATE_FILE"
fi

log_info "Starting GitHub security scan for organization: $GITHUB_ORG"

# Function to make GitHub API requests
github_api_request() {
  local endpoint="$1"
  local response

  response=$(curl -s -H "Authorization: token $GITHUB_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "$GITHUB_API/$endpoint")

  echo "$response"
}

# Function to send event to Wazuh
send_to_wazuh() {
  local event_json="$1"
  echo "$event_json" >> "$WAZUH_LOG_FILE"
}

# Get all repositories in the organization
log_info "Fetching repositories for $GITHUB_ORG..."
repos=$(github_api_request "orgs/$GITHUB_ORG/repos?per_page=100&sort=updated")

# Check if API request was successful
if echo "$repos" | jq -e 'has("message")' > /dev/null 2>&1; then
  error_msg=$(echo "$repos" | jq -r '.message')
  log_error "GitHub API error: $error_msg"
  exit 1
fi

repo_count=$(echo "$repos" | jq '. | length')
log_info "Found $repo_count repositories"

events_sent=0

# Process each repository
echo "$repos" | jq -c '.[]' | while read -r repo; do
  repo_name=$(echo "$repo" | jq -r '.name')
  repo_full_name=$(echo "$repo" | jq -r '.full_name')
  repo_private=$(echo "$repo" | jq -r '.private')
  repo_updated=$(echo "$repo" | jq -r '.updated_at')
  repo_visibility=$(echo "$repo" | jq -r '.visibility')
  default_branch=$(echo "$repo" | jq -r '.default_branch')

  log_info "Processing repository: $repo_name"

  # 1. Check for security advisories
  log_info "  Checking security advisories..."
  advisories=$(github_api_request "repos/$repo_full_name/security-advisories?state=published&per_page=10")

  if echo "$advisories" | jq -e '. | length > 0' > /dev/null 2>&1; then
    advisory_count=$(echo "$advisories" | jq '. | length')
    log_warn "  Found $advisory_count security advisories"

    echo "$advisories" | jq -c '.[]' | while read -r advisory; do
      severity=$(echo "$advisory" | jq -r '.severity')
      summary=$(echo "$advisory" | jq -r '.summary')
      ghsa_id=$(echo "$advisory" | jq -r '.ghsa_id')
      published_at=$(echo "$advisory" | jq -r '.published_at')

      wazuh_event=$(jq -n \
        --arg ts "$TIMESTAMP" \
        --arg org "$GITHUB_ORG" \
        --arg repo "$repo_name" \
        --arg full_name "$repo_full_name" \
        --arg severity "$severity" \
        --arg summary "$summary" \
        --arg ghsa_id "$ghsa_id" \
        --arg published "$published_at" \
        '{
          "timestamp": $ts,
          "source": "github_security",
          "event_type": "security_advisory",
          "organization": $org,
          "repository": $repo,
          "repository_full_name": $full_name,
          "advisory": {
            "ghsa_id": $ghsa_id,
            "severity": $severity,
            "summary": $summary,
            "published_at": $published
          }
        }')

      send_to_wazuh "$wazuh_event"
      events_sent=$((events_sent + 1))
    done
  fi

  # 2. Check for Dependabot alerts (requires vulnerability_alerts scope)
  log_info "  Checking Dependabot alerts..."
  dependabot_alerts=$(github_api_request "repos/$repo_full_name/dependabot/alerts?state=open&per_page=50")

  if echo "$dependabot_alerts" | jq -e 'has("message")' > /dev/null 2>&1; then
    log_warn "  Dependabot alerts not accessible (may need additional permissions)"
  elif echo "$dependabot_alerts" | jq -e '. | length > 0' > /dev/null 2>&1; then
    alert_count=$(echo "$dependabot_alerts" | jq '. | length')
    log_warn "  Found $alert_count Dependabot alerts"

    # Aggregate by severity
    critical_count=$(echo "$dependabot_alerts" | jq '[.[] | select(.security_advisory.severity == "critical")] | length')
    high_count=$(echo "$dependabot_alerts" | jq '[.[] | select(.security_advisory.severity == "high")] | length')
    medium_count=$(echo "$dependabot_alerts" | jq '[.[] | select(.security_advisory.severity == "medium")] | length')
    low_count=$(echo "$dependabot_alerts" | jq '[.[] | select(.security_advisory.severity == "low")] | length')

    wazuh_event=$(jq -n \
      --arg ts "$TIMESTAMP" \
      --arg org "$GITHUB_ORG" \
      --arg repo "$repo_name" \
      --arg full_name "$repo_full_name" \
      --argjson critical "$critical_count" \
      --argjson high "$high_count" \
      --argjson medium "$medium_count" \
      --argjson low "$low_count" \
      --argjson total "$alert_count" \
      '{
        "timestamp": $ts,
        "source": "github_security",
        "event_type": "dependabot_alerts",
        "organization": $org,
        "repository": $repo,
        "repository_full_name": $full_name,
        "vulnerabilities": {
          "critical": $critical,
          "high": $high,
          "medium": $medium,
          "low": $low,
          "total": $total
        }
      }')

    send_to_wazuh "$wazuh_event"
    events_sent=$((events_sent + 1))
  fi

  # 3. Check for code scanning alerts (requires security_events scope)
  log_info "  Checking code scanning alerts..."
  code_scan_alerts=$(github_api_request "repos/$repo_full_name/code-scanning/alerts?state=open&per_page=50")

  if echo "$code_scan_alerts" | jq -e 'has("message")' > /dev/null 2>&1; then
    log_warn "  Code scanning alerts not accessible (may need GitHub Advanced Security)"
  elif echo "$code_scan_alerts" | jq -e '. | length > 0' > /dev/null 2>&1; then
    alert_count=$(echo "$code_scan_alerts" | jq '. | length')
    log_warn "  Found $alert_count code scanning alerts"

    # Aggregate by severity
    critical_count=$(echo "$code_scan_alerts" | jq '[.[] | select(.rule.severity == "error")] | length')
    warning_count=$(echo "$code_scan_alerts" | jq '[.[] | select(.rule.severity == "warning")] | length')
    note_count=$(echo "$code_scan_alerts" | jq '[.[] | select(.rule.severity == "note")] | length')

    wazuh_event=$(jq -n \
      --arg ts "$TIMESTAMP" \
      --arg org "$GITHUB_ORG" \
      --arg repo "$repo_name" \
      --arg full_name "$repo_full_name" \
      --argjson errors "$critical_count" \
      --argjson warnings "$warning_count" \
      --argjson notes "$note_count" \
      --argjson total "$alert_count" \
      '{
        "timestamp": $ts,
        "source": "github_security",
        "event_type": "code_scanning_alerts",
        "organization": $org,
        "repository": $repo,
        "repository_full_name": $full_name,
        "alerts": {
          "errors": $errors,
          "warnings": $warnings,
          "notes": $notes,
          "total": $total
        }
      }')

    send_to_wazuh "$wazuh_event"
    events_sent=$((events_sent + 1))
  fi

  # 4. Check for secret scanning alerts (requires secret_scanning scope)
  log_info "  Checking secret scanning alerts..."
  secret_alerts=$(github_api_request "repos/$repo_full_name/secret-scanning/alerts?state=open&per_page=50")

  if echo "$secret_alerts" | jq -e 'has("message")' > /dev/null 2>&1; then
    log_warn "  Secret scanning alerts not accessible (may need GitHub Advanced Security)"
  elif echo "$secret_alerts" | jq -e '. | length > 0' > /dev/null 2>&1; then
    alert_count=$(echo "$secret_alerts" | jq '. | length')
    log_warn "  Found $alert_count secret scanning alerts"

    wazuh_event=$(jq -n \
      --arg ts "$TIMESTAMP" \
      --arg org "$GITHUB_ORG" \
      --arg repo "$repo_name" \
      --arg full_name "$repo_full_name" \
      --argjson total "$alert_count" \
      '{
        "timestamp": $ts,
        "source": "github_security",
        "event_type": "secret_scanning_alerts",
        "organization": $org,
        "repository": $repo,
        "repository_full_name": $full_name,
        "alerts": {
          "total": $total
        },
        "severity": "critical"
      }')

    send_to_wazuh "$wazuh_event"
    events_sent=$((events_sent + 1))
  fi

  # 5. Check repository security settings
  log_info "  Checking repository security settings..."

  has_vulnerability_alerts=$(echo "$repo" | jq -r '.has_vulnerability_alerts // false')
  has_issues=$(echo "$repo" | jq -r '.has_issues')

  # Check branch protection
  branch_protection=$(github_api_request "repos/$repo_full_name/branches/$default_branch/protection")

  protected=false
  if ! echo "$branch_protection" | jq -e 'has("message")' > /dev/null 2>&1; then
    protected=true
  fi

  wazuh_event=$(jq -n \
    --arg ts "$TIMESTAMP" \
    --arg org "$GITHUB_ORG" \
    --arg repo "$repo_name" \
    --arg full_name "$repo_full_name" \
    --arg visibility "$repo_visibility" \
    --argjson is_private "$repo_private" \
    --argjson vuln_alerts "$has_vulnerability_alerts" \
    --argjson branch_protected "$protected" \
    --arg default_branch "$default_branch" \
    '{
      "timestamp": $ts,
      "source": "github_security",
      "event_type": "repository_security_status",
      "organization": $org,
      "repository": $repo,
      "repository_full_name": $full_name,
      "security_settings": {
        "visibility": $visibility,
        "is_private": $is_private,
        "vulnerability_alerts_enabled": $vuln_alerts,
        "default_branch_protected": $branch_protected,
        "default_branch": $default_branch
      }
    }')

  send_to_wazuh "$wazuh_event"
  events_sent=$((events_sent + 1))

  # 6. Get recent audit events (organization level - do once outside loop)
  # We'll do this separately after the loop

done

# Get organization audit log (last 24 hours)
log_info "Fetching organization audit log..."
yesterday=$(date -u -v-24H +"%Y-%m-%d" 2>/dev/null || date -u -d "yesterday" +"%Y-%m-%d")
audit_log=$(github_api_request "orgs/$GITHUB_ORG/audit-log?phrase=created:>=$yesterday&per_page=100")

if ! echo "$audit_log" | jq -e 'has("message")' > /dev/null 2>&1; then
  if echo "$audit_log" | jq -e '. | length > 0' > /dev/null 2>&1; then
    audit_count=$(echo "$audit_log" | jq '. | length')
    log_info "Found $audit_count audit log entries"

    # Filter for security-relevant events
    security_events=$(echo "$audit_log" | jq '[.[] | select(
      .action | contains("oauth") or
      contains("repo") or
      contains("org") or
      contains("team") or
      contains("member") or
      contains("secret") or
      contains("security")
    )]')

    security_count=$(echo "$security_events" | jq '. | length')

    if [ "$security_count" -gt 0 ]; then
      log_info "Found $security_count security-relevant audit events"

      wazuh_event=$(jq -n \
        --arg ts "$TIMESTAMP" \
        --arg org "$GITHUB_ORG" \
        --argjson total "$security_count" \
        --argjson events "$security_events" \
        '{
          "timestamp": $ts,
          "source": "github_security",
          "event_type": "audit_log_summary",
          "organization": $org,
          "audit_events": {
            "total": $total,
            "events": $events
          }
        }')

      send_to_wazuh "$wazuh_event"
      events_sent=$((events_sent + 1))
    fi
  fi
else
  log_warn "Organization audit log not accessible (requires admin permissions)"
fi

# Update state file
jq -n \
  --arg ts "$TIMESTAMP" \
  --argjson events "$events_sent" \
  '{
    "last_scan": $ts,
    "events_processed": $events,
    "scan_status": "completed"
  }' > "$STATE_FILE"

log_info "Scan complete! Sent $events_sent events to Wazuh"
log_info "Events logged to: $WAZUH_LOG_FILE"

exit 0
