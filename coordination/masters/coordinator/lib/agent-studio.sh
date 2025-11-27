#!/bin/bash
# Agent Studio - Dynamic Agent Registration and Discovery
#
# Enables dynamic addition of new agents to the routing cascade
# without requiring model retraining or system restart.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_HOME="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

# Configuration
AGENT_INDEX="$CORTEX_HOME/coordination/masters/coordinator/agent-index.json"
AGENT_REGISTRY="$CORTEX_HOME/coordination/masters/coordinator/agent-registry.json"
ROUTING_LOG="$CORTEX_HOME/coordination/logs/routing-decisions.jsonl"

# Ensure directories exist
mkdir -p "$(dirname "$AGENT_INDEX")"
mkdir -p "$(dirname "$ROUTING_LOG")"

##############################################################################
# initialize_agent_index: Create default agent index if not exists
##############################################################################
initialize_agent_index() {
  if [ ! -f "$AGENT_INDEX" ]; then
    cat > "$AGENT_INDEX" << 'EOF'
{
  "version": "1.0.0",
  "last_updated": "2025-11-27T00:00:00Z",
  "agents": {
    "development-master": {
      "description": "Handles feature development, bug fixes, code refactoring, and technical improvements",
      "capabilities": [
        "development",
        "implementation",
        "refactoring",
        "bug fixes",
        "feature development",
        "code improvements"
      ],
      "domains": ["infrastructure", "development"],
      "status": "active",
      "added_at": "2025-11-27T00:00:00Z"
    },
    "security-master": {
      "description": "Handles security vulnerabilities, CVE remediation, security audits, and compliance monitoring",
      "capabilities": [
        "security",
        "vulnerabilities",
        "CVE",
        "audits",
        "compliance",
        "vulnerability scanning",
        "security fixes"
      ],
      "domains": ["security"],
      "status": "active",
      "added_at": "2025-11-27T00:00:00Z"
    },
    "inventory-master": {
      "description": "Handles documentation, cataloging, repository metadata, and dependency tracking",
      "capabilities": [
        "documentation",
        "cataloging",
        "inventory",
        "metadata",
        "dependency tracking",
        "repository documentation"
      ],
      "domains": ["inventory"],
      "status": "active",
      "added_at": "2025-11-27T00:00:00Z"
    },
    "cicd-master": {
      "description": "Handles builds, tests, deployments, CI/CD pipelines, and release management",
      "capabilities": [
        "build",
        "test",
        "deploy",
        "CI/CD",
        "release",
        "pipeline management",
        "automated testing"
      ],
      "domains": ["cicd"],
      "status": "active",
      "added_at": "2025-11-27T00:00:00Z"
    }
  }
}
EOF
    echo "✅ Created default agent index: $AGENT_INDEX"
  fi
}

##############################################################################
# register_agent: Register a new agent dynamically
##############################################################################
register_agent() {
  local agent_name="$1"
  local description="$2"
  local capabilities_json="$3"  # JSON array of capabilities
  local domains_json="$4"        # JSON array of domains

  echo "🔧 Registering new agent: $agent_name"

  # Initialize if needed
  initialize_agent_index

  # Check if agent already exists
  local existing=$(jq -r ".agents.\"$agent_name\" // empty" "$AGENT_INDEX")
  if [ -n "$existing" ]; then
    echo "⚠️  Agent '$agent_name' already exists. Use update_agent to modify."
    return 1
  fi

  # Add agent to index
  local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  jq \
    --arg name "$agent_name" \
    --arg desc "$description" \
    --argjson caps "$capabilities_json" \
    --argjson domains "$domains_json" \
    --arg timestamp "$timestamp" \
    '.agents[$name] = {
      description: $desc,
      capabilities: $caps,
      domains: $domains,
      status: "active",
      added_at: $timestamp
    } | .last_updated = $timestamp' \
    "$AGENT_INDEX" > "$AGENT_INDEX.tmp"

  mv "$AGENT_INDEX.tmp" "$AGENT_INDEX"

  echo "✅ Agent '$agent_name' registered successfully"
  echo "   Description: $description"
  echo "   Capabilities: $(echo "$capabilities_json" | jq -r 'join(", ")')"
  echo "   Domains: $(echo "$domains_json" | jq -r 'join(", ")')"
  echo ""
  echo "   Cold start routing will now recognize this agent!"
}

##############################################################################
# list_agents: List all registered agents
##############################################################################
list_agents() {
  local filter="${1:-active}"

  initialize_agent_index

  echo ""
  echo "=========================================="
  echo "Registered Agents"
  echo "=========================================="
  echo ""

  local agents=$(jq -r ".agents | to_entries[] | select(.value.status == \"$filter\") | .key" "$AGENT_INDEX")

  if [ -z "$agents" ]; then
    echo "No agents found with status: $filter"
    return 0
  fi

  for agent in $agents; do
    local desc=$(jq -r ".agents.\"$agent\".description" "$AGENT_INDEX")
    local caps=$(jq -r ".agents.\"$agent\".capabilities | join(\", \")" "$AGENT_INDEX")
    local added=$(jq -r ".agents.\"$agent\".added_at" "$AGENT_INDEX")

    echo "📦 $agent"
    echo "   Description: $desc"
    echo "   Capabilities: $caps"
    echo "   Added: $added"
    echo ""
  done
}

##############################################################################
# deactivate_agent: Deactivate an agent (soft delete)
##############################################################################
deactivate_agent() {
  local agent_name="$1"

  echo "🔧 Deactivating agent: $agent_name"

  # Check if agent exists
  local existing=$(jq -r ".agents.\"$agent_name\" // empty" "$AGENT_INDEX")
  if [ -z "$existing" ]; then
    echo "❌ Agent '$agent_name' not found"
    return 1
  fi

  # Update status to inactive
  local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  jq \
    --arg name "$agent_name" \
    --arg timestamp "$timestamp" \
    '.agents[$name].status = "inactive" |
     .agents[$name].deactivated_at = $timestamp |
     .last_updated = $timestamp' \
    "$AGENT_INDEX" > "$AGENT_INDEX.tmp"

  mv "$AGENT_INDEX.tmp" "$AGENT_INDEX"

  echo "✅ Agent '$agent_name' deactivated"
}

##############################################################################
# get_agent_routing_stats: Get routing statistics for an agent
##############################################################################
get_agent_routing_stats() {
  local agent_name="$1"

  if [ ! -f "$ROUTING_LOG" ]; then
    echo "No routing log found"
    return 0
  fi

  echo ""
  echo "=========================================="
  echo "Routing Stats: $agent_name"
  echo "=========================================="
  echo ""

  local total=$(grep "\"selected_agent\":\"$agent_name\"" "$ROUTING_LOG" | wc -l | tr -d ' ')
  echo "Total routes: $total"

  if [ "$total" -gt 0 ]; then
    echo ""
    echo "By routing method:"
    jq -r "select(.selected_agent == \"$agent_name\") | .routing_method" "$ROUTING_LOG" 2>/dev/null | sort | uniq -c | sort -rn

    echo ""
    echo "Average confidence:"
    jq -r "select(.selected_agent == \"$agent_name\") | .confidence" "$ROUTING_LOG" 2>/dev/null | \
      awk '{sum+=$1; count++} END {if (count>0) printf "%.4f\n", sum/count; else print "N/A"}'

    echo ""
    echo "Recent queries (last 5):"
    jq -r "select(.selected_agent == \"$agent_name\") | .query" "$ROUTING_LOG" 2>/dev/null | tail -5 | nl
  fi

  echo ""
}

##############################################################################
# discover_agents: Auto-discover agents from system
##############################################################################
discover_agents() {
  echo "🔍 Auto-discovering agents..."
  echo ""

  # Look for master agents in coordination/masters/
  local masters_dir="$CORTEX_HOME/coordination/masters"

  if [ -d "$masters_dir" ]; then
    echo "Looking in: $masters_dir"

    for master_dir in "$masters_dir"/*; do
      if [ -d "$master_dir" ]; then
        local master_name=$(basename "$master_dir")

        # Check if agent already registered
        initialize_agent_index
        local existing=$(jq -r ".agents.\"$master_name\" // empty" "$AGENT_INDEX")

        if [ -z "$existing" ]; then
          echo "  Found new agent: $master_name"

          # Try to read agent description from README or agent.json
          local agent_desc="Specialized agent: $master_name"
          if [ -f "$master_dir/README.md" ]; then
            agent_desc=$(head -1 "$master_dir/README.md" | sed 's/^# //')
          fi

          echo "    → $agent_desc"
        fi
      fi
    done
  fi

  echo ""
  echo "Auto-discovery complete. Use 'register_agent' to add new agents."
}

##############################################################################
# Main CLI
##############################################################################
case "${1:-}" in
  init)
    initialize_agent_index
    ;;

  register)
    if [ $# -lt 5 ]; then
      echo "Usage: $0 register <agent_name> <description> <capabilities_json> <domains_json>"
      echo ""
      echo "Example:"
      echo "  $0 register monitoring-master \\"
      echo "    'Handles system monitoring and alerts' \\"
      echo "    '[\"monitoring\", \"alerts\", \"metrics\"]' \\"
      echo "    '[\"monitoring\"]'"
      exit 1
    fi
    register_agent "$2" "$3" "$4" "$5"
    ;;

  list)
    list_agents "${2:-active}"
    ;;

  deactivate)
    if [ $# -lt 2 ]; then
      echo "Usage: $0 deactivate <agent_name>"
      exit 1
    fi
    deactivate_agent "$2"
    ;;

  stats)
    if [ $# -lt 2 ]; then
      echo "Usage: $0 stats <agent_name>"
      exit 1
    fi
    get_agent_routing_stats "$2"
    ;;

  discover)
    discover_agents
    ;;

  *)
    echo "Agent Studio - Dynamic Agent Management"
    echo ""
    echo "Usage: $0 {init|register|list|deactivate|stats|discover}"
    echo ""
    echo "Commands:"
    echo "  init                         - Initialize agent index"
    echo "  register <name> <desc> ...   - Register new agent"
    echo "  list [status]                - List agents (default: active)"
    echo "  deactivate <name>            - Deactivate agent"
    echo "  stats <name>                 - Show routing statistics"
    echo "  discover                     - Auto-discover agents from system"
    echo ""
    echo "Examples:"
    echo "  $0 init"
    echo "  $0 list"
    echo "  $0 register monitoring-master 'Handles monitoring' '[\"alerts\"]' '[\"monitoring\"]'"
    echo "  $0 stats security-master"
    echo "  $0 discover"
    exit 1
    ;;
esac
