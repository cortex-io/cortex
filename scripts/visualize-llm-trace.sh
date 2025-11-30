#!/usr/bin/env bash
# Visualize LLM Trace
# Phase 1: Foundation & Observability
# Creates visual ASCII representation of task execution traces

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_HOME="${CORTEX_HOME:-$(cd "$SCRIPT_DIR/.." && pwd)}"

# Load trace correlator
TRACE_CORRELATOR="$CORTEX_HOME/scripts/lib/trace-correlator.sh"

# Colors for terminal output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

##############################################################################
# visualize_trace: Create visual representation of task trace
# Args:
#   $1: task_id
##############################################################################
visualize_trace() {
    local task_id="$1"

    if [ ! -f "$TRACE_CORRELATOR" ]; then
        echo "Error: Trace correlator not found: $TRACE_CORRELATOR"
        return 1
    fi

    # Get trace data
    local trace=$(bash "$TRACE_CORRELATOR" correlate "$task_id" 2>/dev/null)

    if [ -z "$trace" ] || [ "$trace" = "{}" ]; then
        echo "No trace data found for task: $task_id"
        return 1
    fi

    # Extract trace components
    local task_desc=$(echo "$trace" | jq -r '.task.description // "No description"')
    local task_status=$(echo "$trace" | jq -r '.task.status // "unknown"')
    local task_created=$(echo "$trace" | jq -r '.task.created_at // "unknown"')
    local routing_expert=$(echo "$trace" | jq -r '.routing.decision.primary_expert // "unknown"')
    local routing_confidence=$(echo "$trace" | jq -r '.routing.decision.primary_confidence // 0')
    local routing_strategy=$(echo "$trace" | jq -r '.routing.decision.strategy // "unknown"')
    local worker_count=$(echo "$trace" | jq '.workers | length')
    local total_tokens=$(echo "$trace" | jq '.trace_summary.total_tokens')
    local total_cost=$(echo "$trace" | jq -r '.trace_summary.total_cost_usd')

    # Print header
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC}                           ${CYAN}TASK EXECUTION TRACE${NC}                                ${BLUE}║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    # Task Info
    echo -e "${YELLOW}📋 TASK: $task_id${NC}"
    echo -e "${GRAY}   Description: $task_desc${NC}"
    echo -e "${GRAY}   Status: $task_status${NC}"
    echo -e "${GRAY}   Created: $task_created${NC}"
    echo ""

    # Routing Decision
    echo -e "${CYAN}🧭 ROUTING DECISION${NC}"
    echo -e "${GRAY}   ┌─ Expert: $routing_expert${NC}"
    echo -e "${GRAY}   ├─ Confidence: $(printf '%.0f%%' $(echo "$routing_confidence * 100" | bc))${NC}"
    echo -e "${GRAY}   └─ Strategy: $routing_strategy${NC}"
    echo ""

    # Worker Execution
    echo -e "${GREEN}⚙️  WORKER EXECUTION${NC}"

    if [ "$worker_count" -eq 0 ]; then
        echo -e "${GRAY}   └─ No workers spawned yet${NC}"
    else
        local workers=$(echo "$trace" | jq -c '.workers[]')
        local worker_idx=1

        while IFS= read -r worker; do
            local worker_id=$(echo "$worker" | jq -r '.worker_id')
            local worker_status=$(echo "$worker" | jq -r '.status // "pending"')
            local tokens_used=$(echo "$worker" | jq -r '.execution.tokens_used // 0')
            local duration=$(echo "$worker" | jq -r '.execution.duration_minutes // 0')

            if [ $worker_idx -eq $worker_count ]; then
                echo -e "${GRAY}   └─ $worker_id${NC}"
            else
                echo -e "${GRAY}   ├─ $worker_id${NC}"
            fi

            echo -e "${GRAY}      ├─ Status: $worker_status${NC}"
            echo -e "${GRAY}      ├─ Tokens: $tokens_used${NC}"
            echo -e "${GRAY}      └─ Duration: ${duration}m${NC}"

            worker_idx=$((worker_idx + 1))
        done <<< "$workers"
    fi

    echo ""

    # LLM Operations
    local llm_ops_count=$(echo "$trace" | jq '.llm_operations | length')

    echo -e "${BLUE}🤖 LLM OPERATIONS ($llm_ops_count)${NC}"

    if [ "$llm_ops_count" -eq 0 ]; then
        echo -e "${GRAY}   └─ No LLM operations recorded${NC}"
    else
        local llm_ops=$(echo "$trace" | jq -c '.llm_operations[]')
        local op_idx=1

        while IFS= read -r op; do
            local op_type=$(echo "$op" | jq -r '.operation_type')
            local op_model=$(echo "$op" | jq -r '.model.id')
            local op_tokens=$(echo "$op" | jq -r '.tokens.total')
            local op_latency=$(echo "$op" | jq -r '.performance.latency_ms')

            if [ $op_idx -eq $llm_ops_count ]; then
                echo -e "${GRAY}   └─ $op_type${NC}"
            else
                echo -e "${GRAY}   ├─ $op_type${NC}"
            fi

            echo -e "${GRAY}      ├─ Model: $op_model${NC}"
            echo -e "${GRAY}      ├─ Tokens: $op_tokens${NC}"
            echo -e "${GRAY}      └─ Latency: ${op_latency}ms${NC}"

            op_idx=$((op_idx + 1))
        done <<< "$llm_ops"
    fi

    echo ""

    # Trace Summary
    echo -e "${YELLOW}📊 TRACE SUMMARY${NC}"
    echo -e "${GRAY}   ├─ Total Workers: $worker_count${NC}"
    echo -e "${GRAY}   ├─ Total Tokens: $total_tokens${NC}"
    echo -e "${GRAY}   └─ Total Cost: \$$total_cost${NC}"

    echo ""

    # Flow Diagram
    echo -e "${CYAN}📈 EXECUTION FLOW${NC}"
    echo -e "${GRAY}   ┌─────────────┐${NC}"
    echo -e "${GRAY}   │   ${YELLOW}TASK${GRAY}     │${NC}"
    echo -e "${GRAY}   │  $task_id │${NC}"
    echo -e "${GRAY}   └──────┬──────┘${NC}"
    echo -e "${GRAY}          │${NC}"
    echo -e "${GRAY}          ▼${NC}"
    echo -e "${GRAY}   ┌─────────────┐${NC}"
    echo -e "${GRAY}   │ ${CYAN}MoE ROUTER${GRAY}  │${NC}"
    echo -e "${GRAY}   │ $routing_expert │${NC}"
    echo -e "${GRAY}   └──────┬──────┘${NC}"
    echo -e "${GRAY}          │${NC}"
    echo -e "${GRAY}          ▼${NC}"
    echo -e "${GRAY}   ┌─────────────┐${NC}"
    echo -e "${GRAY}   │  ${GREEN}WORKERS${GRAY}   │${NC}"
    echo -e "${GRAY}   │  Count: $worker_count   │${NC}"
    echo -e "${GRAY}   └──────┬──────┘${NC}"
    echo -e "${GRAY}          │${NC}"
    echo -e "${GRAY}          ▼${NC}"
    echo -e "${GRAY}   ┌─────────────┐${NC}"
    echo -e "${GRAY}   │   ${BLUE}RESULT${GRAY}   │${NC}"
    echo -e "${GRAY}   │  $task_status  │${NC}"
    echo -e "${GRAY}   └─────────────┘${NC}"

    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

##############################################################################
# visualize_recent_traces: Show traces for recent tasks
# Args:
#   $1: count (default: 5)
##############################################################################
visualize_recent_traces() {
    local count="${1:-5}"

    local tasks_dir="$CORTEX_HOME/coordination/tasks"

    if [ ! -d "$tasks_dir" ]; then
        echo "Tasks directory not found"
        return 1
    fi

    local task_files=$(ls -t "$tasks_dir"/task-*.json 2>/dev/null | head -"$count")

    if [ -z "$task_files" ]; then
        echo "No tasks found"
        return 1
    fi

    for task_file in $task_files; do
        local task_id=$(basename "$task_file" .json)
        visualize_trace "$task_id"
        echo ""
    done
}

##############################################################################
# Main execution
##############################################################################
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    case "${1:-help}" in
        trace)
            if [ -z "${2:-}" ]; then
                echo "Error: task_id required"
                exit 1
            fi
            visualize_trace "$2"
            ;;
        recent)
            visualize_recent_traces "${2:-5}"
            ;;
        *)
            cat <<EOF
Usage: $0 <command> [arguments]

Commands:
  trace <task_id>
    Visualize execution trace for a specific task

  recent [count]
    Visualize traces for recent tasks (default: 5)

Examples:
  # Visualize specific task
  $0 trace task-metrics-collector

  # Visualize 10 recent tasks
  $0 recent 10

Visualization includes:
  - Task information
  - Routing decision
  - Worker execution
  - LLM operations
  - Trace summary
  - Flow diagram
EOF
            ;;
    esac
fi
