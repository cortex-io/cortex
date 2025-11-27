#!/bin/bash
# Layer 1: Keyword Fast-Path Router
# Optimized for <1ms latency, deterministic routing

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_HOME="${CORTEX_HOME:-$(cd "$SCRIPT_DIR/../../../.." && pwd)}"

# Routing patterns
ROUTING_PATTERNS="$SCRIPT_DIR/../knowledge-base/routing-patterns.json"

##############################################################################
# keyword_fast_path: Deterministic keyword-based routing
# Args:
#   $1: query
# Returns: JSON with agent and confidence, or empty if no match
##############################################################################
keyword_fast_path() {
  local query="$1"
  local query_lower=$(echo "$query" | tr '[:upper:]' '[:lower:]')

  # ========================================================================
  # Priority 1: Explicit agent names (confidence: 0.98)
  # ========================================================================

  if echo "$query_lower" | grep -qE "use (unifi|netdata|github|gitlab|jira|proxmox)-mcp"; then
    local agent=$(echo "$query_lower" | grep -oE "(unifi|netdata|github|gitlab|jira|proxmox)-mcp")
    jq -n \
      --arg agent "$agent" \
      '{
        agent: $agent,
        confidence: 0.98,
        matched_pattern: "explicit_agent_name",
        metadata: {
          pattern_type: "explicit"
        }
      }'
    return 0
  fi

  # ========================================================================
  # Priority 2: Security patterns (CVE, vulnerability) → security-master
  # ========================================================================

  # CVE format: CVE-YYYY-NNNNN
  if echo "$query_lower" | grep -qE "cve-[0-9]{4}-[0-9]+"; then
    jq -n \
      '{
        agent: "security-master",
        confidence: 0.97,
        matched_pattern: "cve_format",
        metadata: {
          pattern_type: "security",
          keywords: ["cve"]
        }
      }'
    return 0
  fi

  # Vulnerability keywords
  if echo "$query_lower" | grep -qE "vulnerability|security audit|exploit|penetration test"; then
    jq -n \
      '{
        agent: "security-master",
        confidence: 0.96,
        matched_pattern: "security_keywords",
        metadata: {
          pattern_type: "security",
          keywords: ["vulnerability", "security", "audit"]
        }
      }'
    return 0
  fi

  # ========================================================================
  # Priority 3: Development commands (git, npm, docker) → development-master
  # ========================================================================

  if echo "$query_lower" | grep -qE "^(git|npm|docker|cargo|pip|yarn) "; then
    local cmd=$(echo "$query_lower" | grep -oE "^(git|npm|docker|cargo|pip|yarn)")
    jq -n \
      --arg cmd "$cmd" \
      '{
        agent: "development-master",
        confidence: 0.95,
        matched_pattern: "dev_command",
        metadata: {
          pattern_type: "development",
          command: $cmd
        }
      }'
    return 0
  fi

  # ========================================================================
  # Priority 4: Task types (feature, bug-fix, refactor) → development-master
  # ========================================================================

  if echo "$query_lower" | grep -qE "^(feature|bug-fix|refactor|optimization):"; then
    local task_type=$(echo "$query_lower" | grep -oE "^[^:]+")
    jq -n \
      --arg task_type "$task_type" \
      '{
        agent: "development-master",
        confidence: 0.95,
        matched_pattern: "task_type",
        metadata: {
          pattern_type: "development",
          task_type: $task_type
        }
      }'
    return 0
  fi

  # ========================================================================
  # Priority 5: Security task types → security-master
  # ========================================================================

  if echo "$query_lower" | grep -qE "^(security-scan|security-audit|security-fix|cve|vulnerability):"; then
    local task_type=$(echo "$query_lower" | grep -oE "^[^:]+")
    jq -n \
      --arg task_type "$task_type" \
      '{
        agent: "security-master",
        confidence: 0.95,
        matched_pattern: "security_task_type",
        metadata: {
          pattern_type: "security",
          task_type: $task_type
        }
      }'
    return 0
  fi

  # ========================================================================
  # Priority 6: CI/CD task types → cicd-master
  # ========================================================================

  if echo "$query_lower" | grep -qE "^(build|deploy|test|ci-cd|release):"; then
    local task_type=$(echo "$query_lower" | grep -oE "^[^:]+")
    jq -n \
      --arg task_type "$task_type" \
      '{
        agent: "cicd-master",
        confidence: 0.95,
        matched_pattern: "cicd_task_type",
        metadata: {
          pattern_type: "cicd",
          task_type: $task_type
        }
      }'
    return 0
  fi

  # ========================================================================
  # Priority 7: Documentation/Inventory → inventory-master
  # ========================================================================

  if echo "$query_lower" | grep -qE "^(inventory|catalog|discovery|documentation):"; then
    local task_type=$(echo "$query_lower" | grep -oE "^[^:]+")
    jq -n \
      --arg task_type "$task_type" \
      '{
        agent: "inventory-master",
        confidence: 0.95,
        matched_pattern: "inventory_task_type",
        metadata: {
          pattern_type: "inventory",
          task_type: $task_type
        }
      }'
    return 0
  fi

  # ========================================================================
  # Priority 8: High-confidence keyword clusters
  # ========================================================================

  # Development keywords (3+ matches → high confidence)
  local dev_count=0
  for kw in "implement" "fix bug" "refactor" "optimize" "code" "function" "class" "api" "endpoint"; do
    if echo "$query_lower" | grep -q "$kw"; then
      ((dev_count++))
    fi
  done

  if [ "$dev_count" -ge 3 ]; then
    jq -n \
      --argjson count "$dev_count" \
      '{
        agent: "development-master",
        confidence: 0.92,
        matched_pattern: "dev_keyword_cluster",
        metadata: {
          pattern_type: "development",
          keyword_count: $count
        }
      }'
    return 0
  fi

  # Security keywords (2+ matches → high confidence)
  local sec_count=0
  for kw in "security" "vulnerability" "cve" "audit" "scan" "penetration" "exploit" "patch"; do
    if echo "$query_lower" | grep -q "$kw"; then
      ((sec_count++))
    fi
  done

  if [ "$sec_count" -ge 2 ]; then
    jq -n \
      --argjson count "$sec_count" \
      '{
        agent: "security-master",
        confidence: 0.92,
        matched_pattern: "security_keyword_cluster",
        metadata: {
          pattern_type: "security",
          keyword_count: $count
        }
      }'
    return 0
  fi

  # ========================================================================
  # No high-confidence match - return empty (fall through to Layer 2)
  # ========================================================================

  return 1
}

##############################################################################
# Main execution (if run directly)
##############################################################################
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
  if [ $# -lt 1 ]; then
    echo "Usage: $0 <query>"
    echo "Example: $0 'Fix CVE-2024-1234 vulnerability'"
    exit 1
  fi

  query="$1"

  # Call keyword_fast_path and capture output
  if result=$(keyword_fast_path "$query" 2>/dev/null); then
    echo "$result" | jq '.'
    exit 0
  else
    # No match - return empty JSON
    echo "{}"
    exit 1
  fi
fi
