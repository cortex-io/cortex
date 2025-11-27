#!/bin/bash
# Routing Cascade Integration Module
# Bridges new routing cascade with existing moe-router.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_HOME="${CORTEX_HOME:-$(cd "$SCRIPT_DIR/../../../.." && pwd)}"

# Path to routing scripts (call as external scripts to avoid bash version issues)
ROUTING_CASCADE="$SCRIPT_DIR/routing-cascade.sh"
MOE_ROUTER="$SCRIPT_DIR/moe-router.sh"

# Integration configuration
ROUTING_CASCADE_ENABLED="${ROUTING_CASCADE_ENABLED:-true}"
ROUTING_AB_TEST_MODE="${ROUTING_AB_TEST_MODE:-false}"
ROUTING_AB_TEST_PERCENTAGE="${ROUTING_AB_TEST_PERCENTAGE:-10}"

##############################################################################
# route_task_integrated: Integrated routing with cascade and MoE
# Args:
#   $1: task_id
#   $2: task_description
# Returns: JSON routing decision
##############################################################################
route_task_integrated() {
  local task_id="$1"
  local task_description="$2"

  # Check if cascade is enabled
  if [ "$ROUTING_CASCADE_ENABLED" != "true" ]; then
    # Use legacy MoE routing only
    bash "$MOE_ROUTER" "$task_id" "$task_description"
    return $?
  fi

  # Check if A/B testing mode
  if [ "$ROUTING_AB_TEST_MODE" = "true" ]; then
    # Randomly route to cascade or legacy based on percentage
    local random=$((RANDOM % 100))

    if [ "$random" -lt "$ROUTING_AB_TEST_PERCENTAGE" ]; then
      # Route via new cascade
      echo "  [A/B Test] Routing via CASCADE (test group)" >&2

      local cascade_result=$(bash "$ROUTING_CASCADE" "$task_id" "$task_description")
      local cascade_agent=$(echo "$cascade_result" | jq -r '.agent // ""')

      # Also run legacy for comparison (don't use result)
      local legacy_result=$(bash "$MOE_ROUTER" "$task_id" "$task_description" 2>/dev/null || echo "{}")
      local legacy_agent=$(echo "$legacy_result" | jq -r '.decision.primary_expert // ""')

      # Log comparison for analysis
      log_ab_test_comparison "$task_id" "$cascade_agent" "$legacy_agent"

      # Return cascade result
      echo "$cascade_result"
    else
      # Route via legacy MoE
      echo "  [A/B Test] Routing via LEGACY (control group)" >&2
      bash "$MOE_ROUTER" "$task_id" "$task_description"
    fi
  else
    # Full cascade mode (cascade with MoE fallback)
    local cascade_result=$(bash "$ROUTING_CASCADE" "$task_id" "$task_description" 2>&1)
    local cascade_agent=$(echo "$cascade_result" | jq -r '.agent // ""' 2>/dev/null)

    # Check if cascade succeeded
    if [ -n "$cascade_agent" ] && [ "$cascade_agent" != "FAILED" ] && [ "$cascade_agent" != "CLARIFY" ]; then
      # Cascade succeeded - convert to MoE format for compatibility
      convert_cascade_to_moe_format "$cascade_result"
    else
      # Cascade failed or needs clarification - fallback to legacy MoE
      echo "  → Cascade fallback: Using legacy MoE router" >&2
      bash "$MOE_ROUTER" "$task_id" "$task_description"
    fi
  fi
}

##############################################################################
# convert_cascade_to_moe_format: Convert cascade result to MoE format
# Args:
#   $1: cascade_result JSON
# Returns: MoE-compatible JSON
##############################################################################
convert_cascade_to_moe_format() {
  local cascade_result="$1"

  local agent=$(echo "$cascade_result" | jq -r '.agent')
  local confidence=$(echo "$cascade_result" | jq -r '.confidence')
  local method=$(echo "$cascade_result" | jq -r '.method')
  local latency=$(echo "$cascade_result" | jq -r '.latency_ms')
  local layer=$(echo "$cascade_result" | jq -r '.layer // 0')

  # Map cascade agents to MoE experts
  local expert=""
  case "$agent" in
    *-master)
      expert="$agent"
      ;;
    *-mcp)
      # MCPs are infrastructure
      expert="infrastructure"
      ;;
    *)
      expert="$agent"
      ;;
  esac

  # Create MoE-compatible format
  jq -n \
    --arg task_id "$task_id" \
    --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg expert "$expert" \
    --arg agent "$agent" \
    --argjson confidence "$confidence" \
    --arg method "$method" \
    --argjson latency "$latency" \
    --argjson layer "$layer" \
    '{
      task_id: $task_id,
      timestamp: $timestamp,
      routing_strategy: "hybrid_cascade",
      routing_method: $method,
      decision: {
        primary_expert: $expert,
        primary_confidence: $confidence,
        strategy: "single_expert",
        cascade_layer: $layer,
        cascade_method: $method,
        cascade_latency_ms: $latency,
        explanation: ("Routed via hybrid cascade layer " + ($layer | tostring) + " using " + $method)
      }
    }'
}

##############################################################################
# log_ab_test_comparison: Log A/B test comparison for analysis
# Args:
#   $1: task_id
#   $2: cascade_agent
#   $3: legacy_agent
##############################################################################
log_ab_test_comparison() {
  local task_id="$1"
  local cascade_agent="$2"
  local legacy_agent="$3"

  local ab_test_log="$CORTEX_HOME/coordination/logs/ab-test-comparison.jsonl"

  local comparison=$(jq -n \
    --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg task_id "$task_id" \
    --arg cascade "$cascade_agent" \
    --arg legacy "$legacy_agent" \
    --arg agreement "$([ "$cascade_agent" = "$legacy_agent" ] && echo "true" || echo "false")" \
    '{
      timestamp: $timestamp,
      task_id: $task_id,
      cascade_agent: $cascade,
      legacy_agent: $legacy,
      agreement: ($agreement == "true")
    }')

  echo "$comparison" >> "$ab_test_log"
}

##############################################################################
# get_routing_mode_status: Get current routing mode configuration
##############################################################################
get_routing_mode_status() {
  jq -n \
    --arg cascade_enabled "$ROUTING_CASCADE_ENABLED" \
    --arg ab_test_mode "$ROUTING_AB_TEST_MODE" \
    --argjson ab_test_pct "$ROUTING_AB_TEST_PERCENTAGE" \
    '{
      cascade_enabled: ($cascade_enabled == "true"),
      ab_test_mode: ($ab_test_mode == "true"),
      ab_test_percentage: $ab_test_pct,
      mode: (
        if ($cascade_enabled == "false") then "legacy_only"
        elif ($ab_test_mode == "true") then "ab_testing"
        else "cascade_with_fallback"
        end
      )
    }'
}

##############################################################################
# Main execution (if run directly)
##############################################################################
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
  case "${1:-}" in
    status)
      get_routing_mode_status | jq '.'
      ;;
    route)
      if [ $# -lt 3 ]; then
        echo "Usage: $0 route <task_id> <task_description>"
        exit 1
      fi
      route_task_integrated "$2" "$3"
      ;;
    *)
      echo "Usage: $0 {status|route}"
      echo "  status - Show current routing mode"
      echo "  route <task_id> <description> - Route a task"
      exit 1
      ;;
  esac
fi
