#!/bin/bash
# Routing Telemetry Module
# Sends routing metrics to Elastic APM for analysis

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_HOME="${CORTEX_HOME:-$(cd "$SCRIPT_DIR/../../../.." && pwd)}"

# Elastic APM configuration
ELASTIC_APM_URL="${ELASTIC_APM_URL:-http://localhost:8200}"
ELASTIC_APM_TOKEN="${ELASTIC_APM_TOKEN:-}"
ELASTIC_APM_SERVICE_NAME="${ELASTIC_APM_SERVICE_NAME:-cortex-routing}"

# Telemetry log (local backup)
TELEMETRY_LOG="$CORTEX_HOME/coordination/logs/routing-telemetry.jsonl"
mkdir -p "$(dirname "$TELEMETRY_LOG")"

##############################################################################
# send_routing_telemetry: Send routing metrics to Elastic APM
# Args:
#   $1: routing_decision (JSON)
##############################################################################
send_routing_telemetry() {
  local routing_decision="$1"

  # Extract metrics from routing decision
  local query=$(echo "$routing_decision" | jq -r '.query // ""')
  local agent=$(echo "$routing_decision" | jq -r '.selected_agent // ""')
  local method=$(echo "$routing_decision" | jq -r '.routing_method // ""')
  local confidence=$(echo "$routing_decision" | jq -r '.confidence // 0')
  local latency=$(echo "$routing_decision" | jq -r '.latency_ms // 0')
  local timestamp=$(echo "$routing_decision" | jq -r '.timestamp // ""')

  # Create telemetry event for Elastic APM
  local telemetry_event=$(jq -n \
    --arg timestamp "$timestamp" \
    --arg service "$ELASTIC_APM_SERVICE_NAME" \
    --arg query "$query" \
    --arg agent "$agent" \
    --arg method "$method" \
    --argjson confidence "$confidence" \
    --argjson latency "$latency" \
    '{
      "@timestamp": $timestamp,
      "service": {
        "name": $service
      },
      "event": {
        "kind": "metric",
        "category": ["routing"],
        "type": ["routing_decision"]
      },
      "routing": {
        "query": $query,
        "agent": $agent,
        "method": $method,
        "confidence": $confidence,
        "latency_ms": $latency
      },
      "labels": {
        "routing_method": $method,
        "agent": $agent
      }
    }')

  # Log locally first
  echo "$telemetry_event" >> "$TELEMETRY_LOG"

  # Send to Elastic APM if configured
  if [ -n "$ELASTIC_APM_URL" ] && [ -n "$ELASTIC_APM_TOKEN" ]; then
    curl -X POST "$ELASTIC_APM_URL/intake/v2/events" \
      -H "Authorization: Bearer $ELASTIC_APM_TOKEN" \
      -H "Content-Type: application/x-ndjson" \
      --data-binary "$telemetry_event" \
      --silent \
      --show-error \
      --max-time 5 \
      2>&1 | head -5 || true  # Don't fail if Elastic unavailable
  fi
}

##############################################################################
# aggregate_routing_metrics: Generate routing cascade efficiency metrics
# Analyzes routing logs to compute cascade performance
##############################################################################
aggregate_routing_metrics() {
  local routing_log="$CORTEX_HOME/coordination/logs/routing-decisions.jsonl"

  if [ ! -f "$routing_log" ]; then
    echo "{}"
    return
  fi

  # Analyze last 100 routing decisions
  local decisions=$(tail -100 "$routing_log" 2>/dev/null || echo "")

  if [ -z "$decisions" ]; then
    echo "{}"
    return
  fi

  # Count decisions by routing method
  local keyword_count=$(echo "$decisions" | jq -r 'select(.routing_method == "keyword")' | wc -l | tr -d ' ')
  local semantic_count=$(echo "$decisions" | jq -r 'select(.routing_method == "semantic")' | wc -l | tr -d ' ')
  local rag_count=$(echo "$decisions" | jq -r 'select(.routing_method == "rag_enhanced")' | wc -l | tr -d ' ')
  local pytorch_count=$(echo "$decisions" | jq -r 'select(.routing_method == "pytorch")' | wc -l | tr -d ' ')
  local clarify_count=$(echo "$decisions" | jq -r 'select(.selected_agent == "CLARIFY")' | wc -l | tr -d ' ')
  local failed_count=$(echo "$decisions" | jq -r 'select(.selected_agent == "FAILED")' | wc -l | tr -d ' ')

  # Calculate total
  local total=$((keyword_count + semantic_count + rag_count + pytorch_count + clarify_count + failed_count))

  if [ "$total" -eq 0 ]; then
    echo "{}"
    return
  fi

  # Calculate percentages
  local keyword_pct=$(echo "scale=1; $keyword_count * 100 / $total" | bc 2>/dev/null || echo "0")
  local semantic_pct=$(echo "scale=1; $semantic_count * 100 / $total" | bc 2>/dev/null || echo "0")
  local rag_pct=$(echo "scale=1; $rag_count * 100 / $total" | bc 2>/dev/null || echo "0")
  local pytorch_pct=$(echo "scale=1; $pytorch_count * 100 / $total" | bc 2>/dev/null || echo "0")
  local clarify_pct=$(echo "scale=1; $clarify_count * 100 / $total" | bc 2>/dev/null || echo "0")

  # Calculate average latencies
  local avg_keyword_latency=$(echo "$decisions" | jq -r 'select(.routing_method == "keyword") | .latency_ms' | awk '{sum+=$1; count++} END {if(count>0) print sum/count; else print 0}')
  local avg_semantic_latency=$(echo "$decisions" | jq -r 'select(.routing_method == "semantic") | .latency_ms' | awk '{sum+=$1; count++} END {if(count>0) print sum/count; else print 0}')
  local avg_rag_latency=$(echo "$decisions" | jq -r 'select(.routing_method == "rag_enhanced") | .latency_ms' | awk '{sum+=$1; count++} END {if(count>0) print sum/count; else print 0}')

  # Generate metrics JSON
  jq -n \
    --argjson total "$total" \
    --argjson keyword_count "$keyword_count" \
    --argjson semantic_count "$semantic_count" \
    --argjson rag_count "$rag_count" \
    --argjson pytorch_count "$pytorch_count" \
    --argjson clarify_count "$clarify_count" \
    --argjson failed_count "$failed_count" \
    --argjson keyword_pct "$keyword_pct" \
    --argjson semantic_pct "$semantic_pct" \
    --argjson rag_pct "$rag_pct" \
    --argjson pytorch_pct "$pytorch_pct" \
    --argjson clarify_pct "$clarify_pct" \
    --argjson avg_keyword_latency "$avg_keyword_latency" \
    --argjson avg_semantic_latency "$avg_semantic_latency" \
    --argjson avg_rag_latency "$avg_rag_latency" \
    '{
      total_decisions: $total,
      cascade_distribution: {
        layer_1_keyword: {
          count: $keyword_count,
          percentage: $keyword_pct,
          avg_latency_ms: $avg_keyword_latency
        },
        layer_2_semantic: {
          count: $semantic_count,
          percentage: $semantic_pct,
          avg_latency_ms: $avg_semantic_latency
        },
        layer_3_rag: {
          count: $rag_count,
          percentage: $rag_pct,
          avg_latency_ms: $avg_rag_latency
        },
        layer_4_pytorch: {
          count: $pytorch_count,
          percentage: $pytorch_pct
        }
      },
      clarification_needed: {
        count: $clarify_count,
        percentage: $clarify_pct
      },
      failed_routing: {
        count: $failed_count
      }
    }'
}

##############################################################################
# Main execution (if run directly)
##############################################################################
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
  case "${1:-}" in
    aggregate)
      aggregate_routing_metrics | jq '.'
      ;;
    *)
      echo "Usage: $0 {aggregate}"
      echo "  aggregate - Generate cascade efficiency metrics"
      exit 1
      ;;
  esac
fi
