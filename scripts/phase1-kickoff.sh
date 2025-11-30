#!/usr/bin/env bash
# Phase 1 Parallel Execution Kickoff Script
# Implements observability infrastructure using parallel workers + MoE routing

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_HOME="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$CORTEX_HOME"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Configuration
PHASE="phase1-observability"
MAX_PARALLEL_WORKERS=4
TOKEN_BUDGET_THRESHOLD=0.80

# Phase 1 task definitions
PHASE1_TASKS=(
  "task-metrics-collector:Create scripts/lib/llm-metrics-collector.sh for capturing LLM operation metrics"
  "task-metrics-schema:Design coordination/metrics/llm-operations.jsonl schema with comprehensive fields"
  "task-health-monitor:Implement scripts/lib/worker-health-monitor.sh for real-time worker health tracking"
  "task-health-schema:Design coordination/worker-health-metrics.jsonl schema for health data"
  "task-dashboard-api:Create dashboard/server/api/observability.js REST API endpoints"
  "task-dashboard-aggregation:Implement metrics aggregation and real-time update logic"
  "task-dashboard-component:Create dashboard/components/ObservabilityOverview.jsx with charts"
  "task-trace-correlator:Implement scripts/lib/trace-correlator.sh for end-to-end trace correlation"
  "task-trace-viz:Create scripts/visualize-llm-trace.sh for visual trace representation"
  "task-integration-tests:Create comprehensive integration test suite for Phase 1"
)

##############################################################################
# Utilities
##############################################################################

print_header() {
  echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}  $1${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

check_token_budget() {
  if [ ! -f "coordination/token-budget.json" ]; then
    echo -e "${YELLOW}Warning: Token budget file not found, skipping check${NC}"
    return 0
  fi

  local current_usage=$(jq '.total_used // 0' coordination/token-budget.json)
  local budget_limit=$(jq '.budget_limit // 1000000' coordination/token-budget.json)

  if [ "$budget_limit" -eq 0 ]; then
    return 0
  fi

  local usage_pct=$(echo "scale=2; $current_usage / $budget_limit" | bc -l)

  if [ "$(echo "$usage_pct > $TOKEN_BUDGET_THRESHOLD" | bc -l)" -eq 1 ]; then
    echo -e "${RED}ERROR: Token budget at $(echo "$usage_pct * 100" | bc)% - exceeds threshold${NC}"
    return 1
  fi

  echo -e "${GREEN}Token budget OK: $(echo "$usage_pct * 100" | bc)% used${NC}"
  return 0
}

##############################################################################
# Phase 1: Create Task Specifications
##############################################################################

create_task_specs() {
  print_header "Creating Phase 1 Task Specifications"

  mkdir -p coordination/tasks

  for task_line in "${PHASE1_TASKS[@]}"; do
    local task_id=$(echo "$task_line" | cut -d: -f1)
    local task_desc=$(echo "$task_line" | cut -d: -f2-)
    local timestamp=$(date -Iseconds)

    echo "Creating task: $task_id"

    cat > "coordination/tasks/${task_id}.json" <<EOF
{
  "task_id": "$task_id",
  "description": "$task_desc",
  "phase": "$PHASE",
  "priority": "high",
  "created_at": "$timestamp",
  "status": "pending",
  "dependencies": [],
  "assigned_workers": [],
  "quality_score": null,
  "completion_time": null
}
EOF
  done

  echo -e "${GREEN}✓ Created ${#PHASE1_TASKS[@]} task specifications${NC}\n"
}

##############################################################################
# Phase 2: Route Tasks Through MoE
##############################################################################

route_tasks_moe() {
  print_header "Routing Tasks Through MoE Router"

  local moe_router="coordination/masters/coordinator/lib/moe-router.sh"

  if [ ! -f "$moe_router" ]; then
    echo -e "${RED}ERROR: MoE router not found: $moe_router${NC}"
    return 1
  fi

  echo -e "${BLUE}Task Routing Summary:${NC}\n"
  printf "%-30s %-15s %-10s %s\n" "TASK_ID" "PRIMARY_EXPERT" "STRATEGY" "PARALLEL_EXPERTS"
  printf "%-30s %-15s %-10s %s\n" "----------" "-------------" "--------" "----------------"

  for task_line in "${PHASE1_TASKS[@]}"; do
    local task_id=$(echo "$task_line" | cut -d: -f1)
    local task_desc=$(echo "$task_line" | cut -d: -f2-)

    # Get MoE routing decision
    local routing=$(GOVERNANCE_BYPASS=true bash "$moe_router" "$task_id" "$task_desc" 2>/dev/null)

    if [ $? -ne 0 ] || [ -z "$routing" ]; then
      echo -e "${YELLOW}Warning: MoE routing failed for $task_id, using default${NC}"
      continue
    fi

    local primary_expert=$(echo "$routing" | jq -r '.decision.primary_expert')
    local strategy=$(echo "$routing" | jq -r '.decision.strategy')
    local parallel_experts=$(echo "$routing" | jq -r '.decision.parallel_experts | join(", ")' 2>/dev/null || echo "none")

    # Update task spec with routing decision
    local tmp_file=$(mktemp)
    jq --arg expert "$primary_expert" \
       --arg strategy "$strategy" \
       --arg parallel "$parallel_experts" \
       '.routing = {primary_expert: $expert, strategy: $strategy, parallel_experts: $parallel}' \
       "coordination/tasks/${task_id}.json" > "$tmp_file"
    mv "$tmp_file" "coordination/tasks/${task_id}.json"

    printf "%-30s %-15s %-10s %s\n" "$task_id" "$primary_expert" "$strategy" "$parallel_experts"
  done

  echo -e "\n${GREEN}✓ All tasks routed through MoE${NC}\n"
}

##############################################################################
# Phase 3: Execute Tasks in Parallel Batches
##############################################################################

spawn_worker_batch() {
  local batch_name="$1"
  shift
  local task_ids=("$@")

  echo -e "${YELLOW}Spawning batch: $batch_name (${#task_ids[@]} workers)${NC}"

  local pids=()

  for task_id in "${task_ids[@]}"; do
    # Get routing info
    local task_file="coordination/tasks/${task_id}.json"
    local primary_expert=$(jq -r '.routing.primary_expert // "development"' "$task_file")
    local master="${primary_expert}-master"

    echo "  Spawning worker for $task_id → $master"

    # Spawn worker in background
    GOVERNANCE_BYPASS=true ./scripts/spawn-worker.sh \
      --type implementation-worker \
      --task-id "$task_id" \
      --master "$master" \
      --priority high > "logs/${task_id}.log" 2>&1 &

    pids+=($!)

    # Rate limiting: don't spawn more than MAX_PARALLEL_WORKERS at once
    if [ ${#pids[@]} -ge $MAX_PARALLEL_WORKERS ]; then
      echo "  Waiting for batch to complete..."
      wait "${pids[@]}"
      pids=()
    fi
  done

  # Wait for remaining workers
  if [ ${#pids[@]} -gt 0 ]; then
    echo "  Waiting for final workers in batch..."
    wait "${pids[@]}"
  fi

  echo -e "${GREEN}✓ Batch complete: $batch_name${NC}\n"
}

execute_parallel_batches() {
  print_header "Executing Tasks in Parallel Batches"

  mkdir -p logs

  # Check token budget before starting
  if ! check_token_budget; then
    echo -e "${RED}Aborting due to token budget constraints${NC}"
    return 1
  fi

  # Batch 1: Metrics Infrastructure (4 tasks)
  spawn_worker_batch "Metrics Infrastructure" \
    task-metrics-collector \
    task-metrics-schema \
    task-health-monitor \
    task-health-schema

  # Batch 2: Dashboard Backend (3 tasks)
  spawn_worker_batch "Dashboard Backend" \
    task-dashboard-api \
    task-dashboard-aggregation \
    task-dashboard-component

  # Batch 3: Trace Correlation (2 tasks)
  spawn_worker_batch "Trace Correlation" \
    task-trace-correlator \
    task-trace-viz

  # Batch 4: Integration Testing (1 task)
  spawn_worker_batch "Integration Testing" \
    task-integration-tests

  echo -e "${GREEN}✓ All parallel batches complete${NC}\n"
}

##############################################################################
# Phase 4: Collect Results and Track Outcomes
##############################################################################

collect_results() {
  print_header "Collecting Results and Tracking Outcomes"

  local total_tasks=${#PHASE1_TASKS[@]}
  local completed=0
  local failed=0
  local total_quality=0

  echo -e "${BLUE}Task Completion Summary:${NC}\n"
  printf "%-30s %-12s %-10s\n" "TASK_ID" "STATUS" "QUALITY"
  printf "%-30s %-12s %-10s\n" "----------" "------" "-------"

  for task_line in "${PHASE1_TASKS[@]}"; do
    local task_id=$(echo "$task_line" | cut -d: -f1)
    local task_file="coordination/tasks/${task_id}.json"

    if [ ! -f "$task_file" ]; then
      echo -e "${RED}Missing task file: $task_file${NC}"
      ((failed++))
      continue
    fi

    local status=$(jq -r '.status // "pending"' "$task_file")
    local quality=$(jq -r '.quality_score // 0' "$task_file")

    if [ "$status" = "completed" ]; then
      ((completed++))
      total_quality=$(echo "$total_quality + $quality" | bc -l)

      # Track outcome in MoE learning system
      if [ -f "llm-mesh/moe-learning/moe-learn.sh" ]; then
        bash llm-mesh/moe-learning/moe-learn.sh track "$task_id" "completed" "$quality" 2>/dev/null || true
      fi
    elif [ "$status" = "failed" ]; then
      ((failed++))

      # Track failure in MoE learning system
      if [ -f "llm-mesh/moe-learning/moe-learn.sh" ]; then
        bash llm-mesh/moe-learning/moe-learn.sh track "$task_id" "failed" "$quality" 2>/dev/null || true
      fi
    fi

    printf "%-30s %-12s %-10s\n" "$task_id" "$status" "$quality"
  done

  echo ""
  echo -e "${BLUE}Overall Statistics:${NC}"
  echo "  Total Tasks: $total_tasks"
  echo "  Completed: $completed"
  echo "  Failed: $failed"
  echo "  Pending: $((total_tasks - completed - failed))"

  if [ $completed -gt 0 ]; then
    local avg_quality=$(echo "scale=2; $total_quality / $completed" | bc -l)
    echo "  Average Quality: $avg_quality"
  fi

  echo ""

  if [ $completed -eq $total_tasks ]; then
    echo -e "${GREEN}✓ Phase 1 complete - all tasks succeeded!${NC}"
    return 0
  elif [ $failed -gt 0 ]; then
    echo -e "${YELLOW}⚠ Phase 1 complete with failures - review logs${NC}"
    return 1
  else
    echo -e "${YELLOW}⚠ Phase 1 incomplete - some tasks still pending${NC}"
    return 1
  fi
}

##############################################################################
# Phase 5: Run MoE Learning Cycle
##############################################################################

run_moe_learning() {
  print_header "Running MoE Learning Cycle"

  if [ ! -f "llm-mesh/moe-learning/moe-learn.sh" ]; then
    echo -e "${YELLOW}MoE learning system not available, skipping${NC}"
    return 0
  fi

  echo "Analyzing routing outcomes and generating improvements..."
  bash llm-mesh/moe-learning/moe-learn.sh learn

  echo -e "${GREEN}✓ MoE learning cycle complete${NC}\n"
}

##############################################################################
# Main Execution
##############################################################################

main() {
  print_header "Phase 1: Parallel Implementation Kickoff"

  echo "Configuration:"
  echo "  Phase: $PHASE"
  echo "  Total Tasks: ${#PHASE1_TASKS[@]}"
  echo "  Max Parallel Workers: $MAX_PARALLEL_WORKERS"
  echo "  Token Budget Threshold: $(echo "$TOKEN_BUDGET_THRESHOLD * 100" | bc)%"
  echo ""

  read -p "Proceed with Phase 1 parallel execution? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted by user"
    exit 0
  fi

  # Execute phases
  create_task_specs
  route_tasks_moe
  execute_parallel_batches
  collect_results
  run_moe_learning

  print_header "Phase 1 Execution Complete"

  echo "Next steps:"
  echo "  1. Review task results in coordination/tasks/"
  echo "  2. Check worker logs in logs/"
  echo "  3. Verify metrics collection in coordination/metrics/"
  echo "  4. Test observability dashboard"
  echo "  5. Proceed to Phase 2"
}

# Run main function
main "$@"
