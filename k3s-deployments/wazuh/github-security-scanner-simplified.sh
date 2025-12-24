#!/bin/bash
#
# GitHub Security Scanner for Wazuh v4.7.0
# Simplified version that works with both user and org accounts
#
# Usage: ./github-security-scanner-simplified.sh
# Environment: GITHUB_TOKEN, GITHUB_ACCOUNT (user or org name)
#

set -e

GITHUB_TOKEN="${GITHUB_TOKEN:-}"
GITHUB_ACCOUNT="${GITHUB_ACCOUNT:-ry-ops}"
WAZUH_LOG_FILE="/var/ossec/logs/github-security.log"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
STATE_FILE="/tmp/github-scanner-state.json"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
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

log_info "Starting GitHub security scan for account: $GITHUB_ACCOUNT"

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

# Try both user and org endpoints
log_info "Fetching repositories for $GITHUB_ACCOUNT..."
repos=$(github_api_request "users/$GITHUB_ACCOUNT/repos?per_page=100&sort=updated")

# Check if API request was successful
if echo "$repos" | jq -e 'has("message")' > /dev/null 2>&1; then
  error_msg=$(echo "$repos" | jq -r '.message')

  # Try organization endpoint
  log_info "Trying organization endpoint..."
  repos=$(github_api_request "orgs/$GITHUB_ACCOUNT/repos?per_page=100&sort=updated")

  if echo "$repos" | jq -e 'has("message")' > /dev/null 2>&1; then
    error_msg=$(echo "$repos" | jq -r '.message')
    log_error "GitHub API error: $error_msg"
    exit 1
  fi
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

  # 1. Check for Dependabot alerts
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
      --arg account "$GITHUB_ACCOUNT" \
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
        "account": $account,
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
  else
    log_info "  No Dependabot alerts found"
  fi

  # 2. Check repository security settings
  log_info "  Checking repository security settings..."

  has_vulnerability_alerts=$(echo "$repo" | jq -r '.has_vulnerability_alerts // false')
  has_issues=$(echo "$repo" | jq -r '.has_issues')
  has_downloads=$(echo "$repo" | jq -r '.has_downloads')

  # Check branch protection
  branch_protection=$(github_api_request "repos/$repo_full_name/branches/$default_branch/protection")

  protected=false
  if ! echo "$branch_protection" | jq -e 'has("message")' > /dev/null 2>&1; then
    protected=true
  fi

  wazuh_event=$(jq -n \
    --arg ts "$TIMESTAMP" \
    --arg account "$GITHUB_ACCOUNT" \
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
      "account": $account,
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

  # 3. Check for recent commits (last 24 hours)
  log_info "  Checking recent commits..."
  since=$(date -u -d "24 hours ago" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -v-24H +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "")

  if [ -n "$since" ]; then
    commits=$(github_api_request "repos/$repo_full_name/commits?since=$since&per_page=100")

    if ! echo "$commits" | jq -e 'has("message")' > /dev/null 2>&1; then
      commit_count=$(echo "$commits" | jq '. | length')

      if [ "$commit_count" -gt 0 ]; then
        log_info "  Found $commit_count recent commits"

        wazuh_event=$(jq -n \
          --arg ts "$TIMESTAMP" \
          --arg account "$GITHUB_ACCOUNT" \
          --arg repo "$repo_name" \
          --arg full_name "$repo_full_name" \
          --argjson count "$commit_count" \
          '{
            "timestamp": $ts,
            "source": "github_security",
            "event_type": "repository_activity",
            "account": $account,
            "repository": $repo,
            "repository_full_name": $full_name,
            "activity": {
              "commits_last_24h": $count
            }
          }')

        send_to_wazuh "$wazuh_event"
        events_sent=$((events_sent + 1))
      fi
    fi
  fi

done

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
