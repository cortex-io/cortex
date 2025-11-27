#!/bin/bash
# Hybrid Routing Cascade - Master Orchestration
# Implements 4-layer cascade: Keyword → Semantic → RAG → PyTorch

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_HOME="${CORTEX_HOME:-$(cd "$SCRIPT_DIR/../../../.." && pwd)}"

# Python interpreter (use venv if available)
if [ -f "$CORTEX_HOME/venv/bin/python" ]; then
  PYTHON="$CORTEX_HOME/venv/bin/python"
else
  PYTHON="python3"
fi

# Routing logs
ROUTING_LOG="$CORTEX_HOME/coordination/logs/routing-decisions.jsonl"
mkdir -p "$(dirname "$ROUTING_LOG")"

# Layer implementations
KEYWORD_ROUTER="$SCRIPT_DIR/keyword-router.sh"
SEMANTIC_ROUTER="$CORTEX_HOME/llm-mesh/lib/routing/run_semantic.py"
RAG_ROUTER="$CORTEX_HOME/llm-mesh/lib/routing/run_rag_enhanced.py"
PYTORCH_ROUTER="$CORTEX_HOME/llm-mesh/lib/routing/run_pytorch.py"

# Confidence thresholds (exit early when confidence high)
KEYWORD_THRESHOLD=0.95
SEMANTIC_THRESHOLD=0.7
RAG_THRESHOLD=0.8
PYTORCH_THRESHOLD=0.9

##############################################################################
# log_routing_decision: Log routing decision to JSONL
# Args:
#   $1: query
#   $2: selected_agent
#   $3: routing_method
#   $4: confidence (0.0-1.0)
#   $5: latency_ms
#   $6: metadata (optional JSON string)
##############################################################################
log_routing_decision() {
  local query="$1"
  local agent="$2"
  local method="$3"
  local confidence="$4"
  local latency="$5"
  local metadata="${6:-{}}"

  local log_entry=$(jq -n \
    --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg query "$query" \
    --arg agent "$agent" \
    --arg method "$method" \
    --argjson confidence "$confidence" \
    --argjson latency "$latency" \
    --argjson metadata "$metadata" \
    '{
      timestamp: $timestamp,
      query: $query,
      selected_agent: $agent,
      routing_method: $method,
      confidence: $confidence,
      latency_ms: $latency,
      metadata: $metadata
    }')

  echo "$log_entry" >> "$ROUTING_LOG"
}

##############################################################################
# route_query_cascade: Execute full routing cascade
# Args:
#   $1: task_id
#   $2: task_description
# Returns: JSON with routing decision
##############################################################################
route_query_cascade() {
  local task_id="$1"
  local query="$2"
  # Get timestamp in milliseconds (cross-platform)
  local routing_start=$("$PYTHON" -c "import time; print(int(time.time() * 1000))")

  echo "🔍 Starting routing cascade for task: $task_id" >&2

  # ========================================================================
  # Layer 1: Keyword Fast-Path (<1ms, 95% accuracy)
  # ========================================================================

  if [ -f "$KEYWORD_ROUTER" ]; then
    echo "  → Layer 1: Keyword fast-path..." >&2

    local keyword_result=$(bash "$KEYWORD_ROUTER" "$query" 2>/dev/null || echo "")

    if [ -n "$keyword_result" ]; then
      local keyword_agent=$(echo "$keyword_result" | jq -r '.agent // empty' 2>/dev/null)
      local keyword_conf=$(echo "$keyword_result" | jq -r '.confidence // 0' 2>/dev/null)

      if [ -n "$keyword_agent" ] && [ "$keyword_agent" != "null" ]; then
        if (( $(echo "$keyword_conf >= $KEYWORD_THRESHOLD" | bc -l 2>/dev/null || echo 0) )); then
          local latency=$(($("$PYTHON" -c "import time; print(int(time.time() * 1000))") - routing_start))
          echo "  ✅ Keyword match: $keyword_agent (${latency}ms, confidence: $keyword_conf)" >&2

          log_routing_decision "$query" "$keyword_agent" "keyword" "$keyword_conf" "$latency" \
            "$(echo "$keyword_result" | jq -c '.metadata // {}')"

          # Return decision JSON
          jq -n \
            --arg agent "$keyword_agent" \
            --arg method "keyword" \
            --argjson confidence "$keyword_conf" \
            --argjson latency "$latency" \
            '{
              agent: $agent,
              method: $method,
              confidence: $confidence,
              latency_ms: $latency,
              layer: 1
            }'
          return 0
        fi
      fi
    fi

    echo "  ⏭  Keyword confidence too low, falling through to Layer 2..." >&2
  else
    echo "  ⚠️  Keyword router not found, skipping Layer 1" >&2
  fi

  # ========================================================================
  # Layer 2: Semantic Routing (10-50ms, 85-90% accuracy)
  # ========================================================================

  if [ -f "$SEMANTIC_ROUTER" ]; then
    echo "  → Layer 2: Semantic routing with hierarchical clustering..." >&2

    local semantic_result=$("$PYTHON" "$SEMANTIC_ROUTER" \
      --query "$query" \
      --confidence-threshold "$SEMANTIC_THRESHOLD" \
      2>/dev/null || echo "")

    if [ -n "$semantic_result" ]; then
      local semantic_agent=$(echo "$semantic_result" | jq -r '.agent // empty' 2>/dev/null)
      local semantic_conf=$(echo "$semantic_result" | jq -r '.confidence // 0' 2>/dev/null)

      if [ -n "$semantic_agent" ] && [ "$semantic_agent" != "null" ]; then
        if (( $(echo "$semantic_conf >= $SEMANTIC_THRESHOLD" | bc -l 2>/dev/null || echo 0) )); then
          local latency=$(($("$PYTHON" -c "import time; print(int(time.time() * 1000))") - routing_start))
          echo "  ✅ Semantic match: $semantic_agent (${latency}ms, confidence: $semantic_conf)" >&2

          log_routing_decision "$query" "$semantic_agent" "semantic" "$semantic_conf" "$latency" \
            "$(echo "$semantic_result" | jq -c '.metadata // {}')"

          jq -n \
            --arg agent "$semantic_agent" \
            --arg method "semantic" \
            --argjson confidence "$semantic_conf" \
            --argjson latency "$latency" \
            '{
              agent: $agent,
              method: $method,
              confidence: $confidence,
              latency_ms: $latency,
              layer: 2
            }'
          return 0
        fi
      fi
    fi

    echo "  ⏭  Semantic confidence too low, falling through to Layer 3..." >&2
  else
    echo "  ⚠️  Semantic router not found, skipping Layer 2" >&2
  fi

  # ========================================================================
  # Layer 3: RAG Context Enrichment (50-150ms, 90-95% accuracy)
  # ========================================================================

  if [ -f "$RAG_ROUTER" ]; then
    echo "  → Layer 3: RAG-enhanced routing with context..." >&2

    local rag_result=$("$PYTHON" "$RAG_ROUTER" \
      --query "$query" \
      --confidence-threshold "$RAG_THRESHOLD" \
      2>/dev/null || echo "")

    if [ -n "$rag_result" ]; then
      local rag_agent=$(echo "$rag_result" | jq -r '.agent // empty' 2>/dev/null)
      local rag_conf=$(echo "$rag_result" | jq -r '.confidence // 0' 2>/dev/null)

      if [ -n "$rag_agent" ] && [ "$rag_agent" != "null" ]; then
        if (( $(echo "$rag_conf >= $RAG_THRESHOLD" | bc -l 2>/dev/null || echo 0) )); then
          local latency=$(($("$PYTHON" -c "import time; print(int(time.time() * 1000))") - routing_start))
          echo "  ✅ RAG-enhanced match: $rag_agent (${latency}ms, confidence: $rag_conf)" >&2

          log_routing_decision "$query" "$rag_agent" "rag_enhanced" "$rag_conf" "$latency" \
            "$(echo "$rag_result" | jq -c '.metadata // {}')"

          jq -n \
            --arg agent "$rag_agent" \
            --arg method "rag_enhanced" \
            --argjson confidence "$rag_conf" \
            --argjson latency "$latency" \
            '{
              agent: $agent,
              method: $method,
              confidence: $confidence,
              latency_ms: $latency,
              layer: 3
            }'
          return 0
        fi
      fi
    fi

    echo "  ⏭  RAG confidence too low, falling through to Layer 4..." >&2
  else
    echo "  ⚠️  RAG router not found, skipping Layer 3" >&2
  fi

  # ========================================================================
  # Layer 4: PyTorch Routing Head (100-300ms, 95-98% accuracy)
  # ========================================================================

  if [ -f "$PYTORCH_ROUTER" ]; then
    echo "  → Layer 4: PyTorch neural routing (final decision)..." >&2

    local pytorch_result=$("$PYTHON" "$PYTORCH_ROUTER" \
      --query "$query" \
      --rag-context "${rag_result:-{}}" \
      2>/dev/null || echo "")

    if [ -n "$pytorch_result" ]; then
      local pytorch_agent=$(echo "$pytorch_result" | jq -r '.agent // empty' 2>/dev/null)
      local pytorch_conf=$(echo "$pytorch_result" | jq -r '.confidence // 0' 2>/dev/null)
      local needs_clarification=$(echo "$pytorch_result" | jq -r '.needs_clarification // false' 2>/dev/null)

      local latency=$(($("$PYTHON" -c "import time; print(int(time.time() * 1000))") - routing_start))

      if [ "$needs_clarification" = "true" ]; then
        echo "  ⚠️  Low confidence ($pytorch_conf), requesting clarification" >&2

        log_routing_decision "$query" "clarification_needed" "pytorch" "$pytorch_conf" "$latency" \
          '{"needs_clarification": true}'

        jq -n \
          --arg method "pytorch" \
          --argjson confidence "$pytorch_conf" \
          --argjson latency "$latency" \
          '{
            agent: "CLARIFY",
            method: $method,
            confidence: $confidence,
            latency_ms: $latency,
            layer: 4,
            needs_clarification: true
          }'
        return 1
      else
        echo "  ✅ PyTorch match: $pytorch_agent (${latency}ms, confidence: $pytorch_conf)" >&2

        log_routing_decision "$query" "$pytorch_agent" "pytorch" "$pytorch_conf" "$latency" \
          "$(echo "$pytorch_result" | jq -c '.metadata // {}')"

        jq -n \
          --arg agent "$pytorch_agent" \
          --arg method "pytorch" \
          --argjson confidence "$pytorch_conf" \
          --argjson latency "$latency" \
          '{
            agent: $agent,
            method: $method,
            confidence: $confidence,
            latency_ms: $latency,
            layer: 4
          }'
        return 0
      fi
    fi
  else
    echo "  ⚠️  PyTorch router not found, skipping Layer 4" >&2
  fi

  # ========================================================================
  # Layer 5: Cold Start Handler (Zero-Shot Routing)
  # ~10-50ms latency, ~70-80% accuracy for new agents
  # ========================================================================

  echo "  → Layer 5: Cold Start Handler (zero-shot routing)" >&2

  local cold_start_handler="$CORTEX_HOME/llm-mesh/lib/routing/cold_start_handler.py"

  if [ -f "$cold_start_handler" ]; then
    local cold_start_result=$("$PYTHON" "$cold_start_handler" "$query" --confidence-threshold 0.6 2>/dev/null || echo "")

    if [ -n "$cold_start_result" ]; then
      local cold_start_agent=$(echo "$cold_start_result" | jq -r '.agent // empty' 2>/dev/null)
      local cold_start_conf=$(echo "$cold_start_result" | jq -r '.confidence // 0' 2>/dev/null)

      if [ -n "$cold_start_agent" ] && [ "$cold_start_agent" != "null" ]; then
        local latency=$(($("$PYTHON" -c "import time; print(int(time.time() * 1000))") - routing_start))
        echo "  ✅ Cold start match: $cold_start_agent (${latency}ms, confidence: $cold_start_conf)" >&2

        log_routing_decision "$query" "$cold_start_agent" "cold_start" "$cold_start_conf" "$latency"

        jq -n \
          --arg agent "$cold_start_agent" \
          --argjson confidence "$cold_start_conf" \
          --argjson latency "$latency" \
          '{
            agent: $agent,
            method: "cold_start",
            confidence: $confidence,
            latency_ms: $latency,
            layer: 5,
            note: "Zero-shot routing to new agent"
          }'
        return 0
      fi
    fi
  else
    echo "  ⚠️  Cold start handler not found, skipping Layer 5" >&2
  fi

  # ========================================================================
  # Fallback: No routing method succeeded
  # ========================================================================

  local latency=$(($("$PYTHON" -c "import time; print(int(time.time() * 1000))") - routing_start))
  echo "  ❌ All routing layers failed or unavailable (${latency}ms)" >&2

  log_routing_decision "$query" "routing_failed" "fallback" "0.0" "$latency" \
    '{"error": "all routing layers failed"}'

  jq -n \
    --argjson latency "$latency" \
    '{
      agent: "FAILED",
      method: "fallback",
      confidence: 0.0,
      latency_ms: $latency,
      layer: 0,
      error: "all routing layers failed"
    }'
  return 1
}

##############################################################################
# Main execution (if run directly)
##############################################################################
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
  if [ $# -lt 2 ]; then
    echo "Usage: $0 <task_id> <task_description>"
    echo "Example: $0 task-123 'Fix security vulnerability in authentication module'"
    exit 1
  fi

  task_id="$1"
  task_description="$2"

  routing_result=$(route_query_cascade "$task_id" "$task_description")

  # Output result
  echo "$routing_result" | jq '.'

  exit_code=$?
  exit $exit_code
fi
