# Week 2: Five Agent Types Architecture Design

**Date**: 2025-11-19
**Meta-Agent**: commit-relay orchestration system
**Roadmap**: Q1 Implementation (12 weeks) - Week 2 of 12
**Status**: DESIGN PHASE

---

## Executive Summary

This document provides the complete architectural design for implementing the Five Agent Types system in commit-relay, based on AI agent fundamentals. This work will span Weeks 2-7 of the Q1 roadmap.

### Goals

1. Classify all agents into proper types based on capabilities
2. Upgrade workers from simple execution to goal-based planning
3. Add utility-based optimization to master agents
4. Complete the learning agent architecture with exploration
5. Enable sophisticated multi-agent coordination

---

## Background: Five Agent Types

Based on AI agent theory, there are five fundamental agent architectures, each with increasing sophistication:

### 1. Simple Reflex Agents

**Characteristics**:
- Condition-action rules (if-then)
- No internal state tracking
- React to current percept only
- Fast, predictable, limited

**Use Cases**:
- Quality gate checks (syntax, linting, security scans)
- Simple validation rules
- Binary decisions (pass/fail)

**Example**:
```bash
# Simple reflex: if syntax error, fail
if ! jq empty "$file"; then
  echo "FAIL: Invalid JSON"
  exit 1
fi
```

### 2. Model-Based Reflex Agents

**Characteristics**:
- Maintains internal state (world model)
- Updates model based on percepts
- Uses state to make decisions
- More robust than simple reflex

**Use Cases**:
- Progress tracking workers
- State-aware coordination
- Context accumulation across steps

**Example**:
```bash
# Model-based: track state across iterations
STATE_FILE="worker-state.json"
CURRENT_STEP=$(jq -r '.current_step' "$STATE_FILE")

case $CURRENT_STEP in
  "scan") do_scan && update_state "analyze" ;;
  "analyze") do_analysis && update_state "fix" ;;
  "fix") do_fix && update_state "complete" ;;
esac
```

### 3. Goal-Based Agents

**Characteristics**:
- Has explicit goals/objectives
- Plans actions to achieve goals
- Evaluates goal satisfaction
- Flexible, adaptable

**Use Cases**:
- Worker agents (current implementation missing this)
- Task execution with clear deliverables
- Multi-step workflows toward outcome

**Example**:
```bash
# Goal-based: plan to achieve goal
GOAL="Fix all high-priority CVEs"

plan_actions() {
  # Simulate different strategies
  strategies=("patch-first" "test-driven" "research-first")
  for strategy in "${strategies[@]}"; do
    simulate_strategy "$strategy"
    score_strategy "$strategy"
  done
  select_best_strategy
}

execute_plan() {
  for action in $(get_planned_actions); do
    execute_action "$action"
    if goal_achieved; then
      return 0
    fi
  done
}
```

### 4. Utility-Based Agents

**Characteristics**:
- Multi-objective optimization
- Utility function ranks alternatives
- Balances competing concerns
- Optimal decision-making

**Use Cases**:
- Master agents choosing between workers
- MoE routing decisions
- Resource allocation

**Example**:
```bash
# Utility-based: optimize across multiple objectives
calculate_utility() {
  local speed_score=$1
  local quality_score=$2
  local cost_score=$3
  local success_prob=$4

  # Weighted utility function
  local utility=$(awk "BEGIN {
    print ($speed_score * 0.3) + \
          ($quality_score * 0.4) + \
          ($cost_score * 0.2) + \
          ($success_prob * 0.1)
  }")

  echo "$utility"
}

# Choose option with highest utility
best_option=$(for opt in "${options[@]}"; do
  util=$(calculate_utility "$opt")
  echo "$util|$opt"
done | sort -rn | head -1 | cut -d'|' -f2)
```

### 5. Learning Agents

**Characteristics**:
- Performance element (current actions)
- Learning element (improve from experience)
- Critic (evaluate performance)
- Problem generator (exploration)
- Continuous improvement

**Use Cases**:
- MoE routing optimization
- Worker performance improvement
- System-wide learning

**Example**:
```bash
# Learning agent: complete cycle
performance_element() {
  # Current best routing strategy
  route_task_using_current_model "$task"
}

critic() {
  # Evaluate how well we did
  actual_success=$1
  expected_success=$2
  performance_delta=$((actual_success - expected_success))
  echo "$performance_delta" >> learning/performance-log.jsonl
}

learning_element() {
  # Update model based on critic feedback
  analyze_performance_log
  update_routing_model
  update_confidence_scores
}

problem_generator() {
  # 10% exploration: try new routing strategies
  if (( RANDOM % 100 < 10 )); then
    try_exploratory_routing "$task"
  fi
}
```

---

## Current State Analysis

### Existing Agents by Type

#### Simple Reflex Agents (Partial)
- ✅ Quality gate checks in `agents/code-runner/`
- ✅ Pre-commit hooks (JSON validation)
- ✅ Basic security scans

**Assessment**: Working well, no changes needed

#### Model-Based Reflex Agents (Missing)
- ❌ Workers don't maintain state across iterations
- ❌ No world model updates
- ❌ Context not passed between worker steps

**Assessment**: Need to implement

#### Goal-Based Agents (Missing)
- ❌ Workers execute without explicit goals
- ❌ No planning before execution
- ❌ Success criteria not formally defined
- ❌ No strategy simulation

**Assessment**: Critical gap - workers are "executors" not "planners"

#### Utility-Based Agents (Partial)
- 🟡 MoE router has basic utility (confidence scores)
- ❌ Masters don't use multi-objective optimization
- ❌ No utility function for resource allocation
- ❌ Competing objectives not balanced

**Assessment**: Basic concept exists, needs formalization

#### Learning Agents (Partial)
- ✅ Performance element: MoE routing
- 🟡 Learning element: `moe-code-learner.sh` (basic)
- ❌ Critic: Missing
- ❌ Problem generator: Missing (no exploration)

**Assessment**: 40% implemented, needs completion

---

## Proposed Architecture

### Phase 1: Worker Goal-Based Planning (Weeks 2-3)

**Objective**: Upgrade workers from "executors" to "planners"

#### 1.1 Goal Specification Schema

**File**: `coordination/schemas/worker-goal-schema.json`

```json
{
  "goal": {
    "type": "fix-cve",
    "description": "Fix CVE-2024-12345 in authentication module",
    "success_criteria": [
      "CVE no longer detected by scanner",
      "All tests passing",
      "No new vulnerabilities introduced"
    ],
    "deliverables": [
      "Patched code file",
      "Test coverage report",
      "Security scan results"
    ]
  },
  "constraints": {
    "max_tokens": 10000,
    "max_duration_minutes": 45,
    "required_tools": ["git", "npm", "security-scanner"]
  },
  "context": {
    "priority": "critical",
    "deadline": "2025-11-20T17:00:00Z",
    "dependencies": []
  }
}
```

#### 1.2 Planning Component

**File**: `agents/workers/lib/goal-planner.sh`

```bash
#!/bin/bash
# Goal-based planning for workers

plan_to_achieve_goal() {
  local goal_spec=$1

  # Extract goal details
  local goal_type=$(jq -r '.goal.type' "$goal_spec")
  local success_criteria=$(jq -r '.goal.success_criteria[]' "$goal_spec")

  # Generate candidate strategies
  local strategies=(
    "test-driven-development"
    "research-first"
    "direct-implementation"
    "iterative-refinement"
  )

  # Simulate each strategy
  local best_strategy=""
  local best_score=0

  for strategy in "${strategies[@]}"; do
    local score=$(simulate_strategy "$strategy" "$goal_spec")
    if (( $(echo "$score > $best_score" | bc -l) )); then
      best_strategy="$strategy"
      best_score="$score"
    fi
  done

  # Generate action plan
  generate_action_plan "$best_strategy" "$goal_spec"
}

simulate_strategy() {
  local strategy=$1
  local goal_spec=$2

  # Simulate strategy execution
  case $strategy in
    "test-driven-development")
      # Estimate: write tests first, then implement
      local estimated_tokens=8000
      local estimated_success_prob=0.85
      local estimated_duration=30
      ;;
    "research-first")
      # Estimate: research solutions, then implement
      local estimated_tokens=12000
      local estimated_success_prob=0.90
      local estimated_duration=40
      ;;
    "direct-implementation")
      # Estimate: implement directly
      local estimated_tokens=6000
      local estimated_success_prob=0.70
      local estimated_duration=20
      ;;
    "iterative-refinement")
      # Estimate: quick first pass, iterate
      local estimated_tokens=10000
      local estimated_success_prob=0.80
      local estimated_duration=35
      ;;
  esac

  # Score strategy based on constraints
  local max_tokens=$(jq -r '.constraints.max_tokens' "$goal_spec")
  local max_duration=$(jq -r '.constraints.max_duration_minutes' "$goal_spec")

  # Feasibility check
  if (( estimated_tokens > max_tokens )) || (( estimated_duration > max_duration )); then
    echo "0"  # Infeasible strategy
    return
  fi

  # Utility score: balance success probability and resource usage
  local utility=$(awk "BEGIN {
    print ($estimated_success_prob * 0.6) + \
          ((1 - $estimated_tokens / $max_tokens) * 0.2) + \
          ((1 - $estimated_duration / $max_duration) * 0.2)
  }")

  echo "$utility"
}

generate_action_plan() {
  local strategy=$1
  local goal_spec=$2

  # Generate step-by-step plan based on strategy
  case $strategy in
    "test-driven-development")
      cat <<EOF
{
  "strategy": "test-driven-development",
  "steps": [
    {"action": "read_specification", "estimated_tokens": 500},
    {"action": "write_failing_tests", "estimated_tokens": 2000},
    {"action": "implement_fix", "estimated_tokens": 3000},
    {"action": "verify_tests_pass", "estimated_tokens": 500},
    {"action": "run_security_scan", "estimated_tokens": 1000},
    {"action": "generate_report", "estimated_tokens": 1000}
  ],
  "estimated_total_tokens": 8000,
  "estimated_success_probability": 0.85
}
EOF
      ;;
    # ... other strategies
  esac
}
```

#### 1.3 Worker Launcher Integration

**File**: `scripts/spawn-worker.sh` (modification)

Add planning step before worker launch:

```bash
# After creating worker spec, generate goal-based plan
if [ -f "agents/workers/lib/goal-planner.sh" ]; then
  source "agents/workers/lib/goal-planner.sh"

  # Create goal specification from task
  create_goal_spec "$TASK_ID" > "${WORKER_SPEC_FILE%.json}-goal.json"

  # Generate execution plan
  plan_to_achieve_goal "${WORKER_SPEC_FILE%.json}-goal.json" > "${WORKER_SPEC_FILE%.json}-plan.json"

  # Add plan reference to worker spec
  jq --arg plan "${WORKER_SPEC_FILE%.json}-plan.json" \
     '.execution_plan = $plan' \
     "$WORKER_SPEC_FILE" > "${WORKER_SPEC_FILE}.tmp"
  mv "${WORKER_SPEC_FILE}.tmp" "$WORKER_SPEC_FILE"
fi
```

#### 1.4 Success Metrics (Phase 1)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Workers with plans | >80% | Count workers with execution_plan field |
| Planning overhead | <10% tokens | Tokens used for planning vs execution |
| Success rate improvement | +15% | Compare planned vs unplanned workers |
| Strategy selection accuracy | >70% | Actual success matches predicted |

---

### Phase 2: Utility-Based Masters (Weeks 4-5)

**Objective**: Add multi-objective optimization to master agents

#### 2.1 Utility Function Framework

**File**: `coordination/masters/lib/utility-optimizer.sh`

```bash
#!/bin/bash
# Multi-objective utility optimization for masters

calculate_utility() {
  local option=$1

  # Extract objectives
  local speed=$(get_speed_score "$option")
  local quality=$(get_quality_score "$option")
  local cost=$(get_cost_score "$option")
  local success_prob=$(get_success_probability "$option")

  # Configurable weights per master
  local master_type=$(get_master_type)
  case $master_type in
    "security-master")
      # Security prioritizes quality and success
      local weights="0.1 0.5 0.1 0.3"  # speed quality cost success
      ;;
    "development-master")
      # Development balances all factors
      local weights="0.25 0.25 0.25 0.25"
      ;;
    "coordinator-master")
      # Coordinator optimizes for success
      local weights="0.2 0.2 0.1 0.5"
      ;;
  esac

  # Calculate weighted utility
  read speed_weight quality_weight cost_weight success_weight <<< "$weights"

  local utility=$(awk "BEGIN {
    print ($speed * $speed_weight) + \
          ($quality * $quality_weight) + \
          ($cost * $cost_weight) + \
          ($success_prob * $success_weight)
  }")

  echo "$utility"
}

optimize_worker_assignment() {
  local task=$1

  # Get candidate workers
  local candidates=$(get_available_workers "$task")

  # Calculate utility for each candidate
  local best_worker=""
  local best_utility=0

  for candidate in $candidates; do
    local utility=$(calculate_utility "$candidate")
    if (( $(echo "$utility > $best_utility" | bc -l) )); then
      best_worker="$candidate"
      best_utility="$utility"
    fi
  done

  echo "$best_worker"
}
```

#### 2.2 MoE Router Integration

**File**: `coordination/masters/coordinator/lib/moe-router.sh` (modification)

Enhance routing to use utility-based selection:

```bash
route_task() {
  local task=$1

  # Get candidate masters
  local candidates=$(get_candidate_masters "$task")

  # For each candidate, calculate utility
  for candidate in $candidates; do
    # Objectives for routing decision
    local speed=$(estimate_completion_time "$candidate" "$task")
    local quality=$(get_master_quality_score "$candidate" "$task")
    local cost=$(estimate_token_cost "$candidate" "$task")
    local success=$(get_master_success_rate "$candidate" "$task")

    local utility=$(calculate_routing_utility "$speed" "$quality" "$cost" "$success")

    echo "$utility|$candidate"
  done | sort -rn | head -1 | cut -d'|' -f2
}
```

#### 2.3 Success Metrics (Phase 2)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Routing considers 4+ objectives | 100% | All routing decisions use utility function |
| Master specialization | >80% | Security tasks go to security master |
| Resource efficiency | +20% | Tokens per task reduced |
| Task success rate | >90% | Overall task completion rate |

---

### Phase 3: Complete Learning Agent (Weeks 5-6)

**Objective**: Implement full learning cycle with exploration

#### 3.1 Critic Component

**File**: `coordination/masters/coordinator/lib/learning/critic.sh`

```bash
#!/bin/bash
# Critic: Evaluate performance and provide feedback

evaluate_performance() {
  local worker_id=$1
  local task_id=$2

  # Get actual outcomes
  local worker_spec="coordination/worker-specs/completed/${worker_id}.json"
  local actual_success=$(jq -r '.results.status == "success"' "$worker_spec")
  local actual_tokens=$(jq -r '.execution.tokens_used' "$worker_spec")
  local actual_duration=$(jq -r '.execution.duration_minutes' "$worker_spec")

  # Get predictions (from plan)
  local plan_file="coordination/worker-specs/plans/${worker_id}-plan.json"
  local predicted_success=$(jq -r '.estimated_success_probability' "$plan_file")
  local predicted_tokens=$(jq -r '.estimated_total_tokens' "$plan_file")

  # Calculate performance delta
  local success_delta=$(awk "BEGIN { print $actual_success - $predicted_success }")
  local token_delta=$(awk "BEGIN { print $actual_tokens - $predicted_tokens }")

  # Generate feedback
  cat <<EOF
{
  "worker_id": "$worker_id",
  "task_id": "$task_id",
  "evaluation": {
    "success_prediction_error": $success_delta,
    "token_prediction_error": $token_delta,
    "overall_performance": $(calculate_performance_score "$success_delta" "$token_delta")
  },
  "feedback": "$(generate_feedback "$success_delta" "$token_delta")",
  "timestamp": "$(date +%Y-%m-%dT%H:%M:%S%z)"
}
EOF
}

generate_feedback() {
  local success_delta=$1
  local token_delta=$2

  if (( $(echo "$success_delta < -0.2" | bc -l) )); then
    echo "Overestimated success probability - need more conservative estimates"
  elif (( $(echo "$success_delta > 0.2" | bc -l) )); then
    echo "Underestimated success probability - can be more confident"
  elif (( $(echo "$token_delta > 2000" | bc -l) )); then
    echo "Significantly over budget - refine cost estimates"
  else
    echo "Performance within acceptable range"
  fi
}
```

#### 3.2 Learning Element

**File**: `coordination/masters/coordinator/lib/learning/learner.sh`

```bash
#!/bin/bash
# Learning element: Update models based on critic feedback

update_models() {
  local feedback_file=$1

  # Extract feedback
  local worker_id=$(jq -r '.worker_id' "$feedback_file")
  local worker_type=$(jq -r '.worker_type' "$feedback_file")
  local success_error=$(jq -r '.evaluation.success_prediction_error' "$feedback_file")

  # Update worker type model
  local model_file="coordination/masters/coordinator/knowledge-base/worker-models/${worker_type}.json"

  # Adjust success probability estimates
  jq --argjson error "$success_error" \
     '.success_probability_baseline += ($error * 0.1) |  # Learning rate: 0.1
      .observations += 1' \
     "$model_file" > "${model_file}.tmp"

  mv "${model_file}.tmp" "$model_file"

  # Log learning event
  echo "Updated $worker_type model based on $worker_id performance" >> \
    coordination/masters/coordinator/knowledge-base/learning-log.jsonl
}
```

#### 3.3 Problem Generator

**File**: `coordination/masters/coordinator/lib/learning/problem-generator.sh`

```bash
#!/bin/bash
# Problem generator: Create exploratory tasks to discover better strategies

EXPLORATION_RATE=0.10  # 10% of tasks are exploratory

should_explore() {
  # 10% chance of exploration
  if (( RANDOM % 100 < 10 )); then
    return 0  # True - explore
  else
    return 1  # False - exploit current knowledge
  fi
}

generate_exploratory_task() {
  local base_task=$1

  # Try alternative routing
  local candidate_masters=$(get_all_masters)
  local current_best=$(get_current_best_master "$base_task")

  # Filter out current best
  local alternatives=$(echo "$candidate_masters" | grep -v "$current_best")

  # Pick random alternative
  local exploratory_master=$(echo "$alternatives" | shuf -n 1)

  # Create exploration note
  cat <<EOF
{
  "task_id": "${base_task}-exploration",
  "original_task": "$base_task",
  "exploration_type": "alternative_routing",
  "assigned_to": "$exploratory_master",
  "reason": "Exploration to gather performance data",
  "exploration_rate": $EXPLORATION_RATE
}
EOF
}
```

#### 3.4 Integration: Complete Learning Cycle

**File**: `coordination/masters/coordinator/lib/learning-agent-cycle.sh`

```bash
#!/bin/bash
# Complete learning agent cycle

run_learning_cycle() {
  # 1. Performance element: Execute current best strategy
  local task=$1

  if should_explore; then
    # Problem generator: Explore alternative
    local exploratory_task=$(generate_exploratory_task "$task")
    execute_task "$exploratory_task"
  else
    # Exploit current knowledge
    local worker=$(optimize_worker_assignment "$task")
    execute_task_with_worker "$task" "$worker"
  fi

  # 2. Wait for task completion
  wait_for_completion "$task"

  # 3. Critic: Evaluate performance
  local feedback=$(evaluate_performance "$worker" "$task")

  # 4. Learning element: Update models
  update_models "$feedback"

  # 5. Emit learning event
  broadcast_learning_event "$feedback"
}
```

#### 3.5 Success Metrics (Phase 3)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Exploration rate | 10% | Count exploratory vs exploitative tasks |
| Performance improvement | +10% weekly | Compare week-over-week success rates |
| Model accuracy | Improving | Prediction error decreasing over time |
| Learning events logged | 100% | All completed tasks trigger learning |

---

### Phase 4: Multi-Agent Coordination (Week 7)

**Objective**: Enable sophisticated agent-to-agent collaboration

#### 4.1 Communication Bus

**File**: `coordination/multi-agent/communication-bus.jsonl`

JSONL event log for agent-to-agent messages:

```jsonl
{"from": "security-master", "to": "development-master", "type": "handoff", "task_id": "task-001", "message": "CVE fixed, ready for testing", "timestamp": "2025-11-19T10:00:00Z"}
{"from": "development-master", "to": "coordinator-master", "type": "escalation", "task_id": "task-002", "message": "Blocked on external API", "timestamp": "2025-11-19T10:05:00Z"}
```

#### 4.2 Collaboration Patterns

**File**: `coordination/masters/lib/collaboration-patterns.sh`

```bash
# Pattern 1: Sequential handoff
sequential_handoff() {
  local task=$1

  # Step 1: Security scan
  assign_to_master "$task" "security"
  wait_for_completion "$task"

  # Step 2: If vulnerabilities found, hand off to development
  if has_vulnerabilities "$task"; then
    send_message "security-master" "development-master" "handoff" \
      "Found CVEs, requesting fixes"
    assign_to_master "$task" "development"
    wait_for_completion "$task"
  fi
}

# Pattern 2: Parallel split
parallel_split() {
  local task=$1

  # Split task into subtasks
  local security_subtask=$(create_subtask "$task" "security-scan")
  local quality_subtask=$(create_subtask "$task" "quality-check")

  # Execute in parallel
  assign_to_master "$security_subtask" "security" &
  assign_to_master "$quality_subtask" "development" &

  # Wait for both
  wait

  # Merge results
  merge_results "$security_subtask" "$quality_subtask"
}

# Pattern 3: Coordinator mediation
coordinator_mediation() {
  local task=$1

  # Masters negotiate through coordinator
  local security_bid=$(get_master_bid "security" "$task")
  local dev_bid=$(get_master_bid "development" "$task")

  # Coordinator decides based on bids
  if (( $(echo "$security_bid > $dev_bid" | bc -l) )); then
    assign_to_master "$task" "security"
  else
    assign_to_master "$task" "development"
  fi
}
```

#### 4.3 Success Metrics (Phase 4)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Multi-agent task success | >90% | Tasks involving 2+ masters |
| Handoff latency | <5 min | Time between master transitions |
| Message delivery | 100% | All messages received and logged |
| Collaboration patterns used | 3+ | Count of pattern invocations |

---

## Implementation Timeline

### Week 2: Design & Scaffolding
- ✅ Create design document (this document)
- [ ] Review and approve architecture
- [ ] Create directory structure
- [ ] Write schemas (goal, utility, learning)
- [ ] Create stub implementations

### Week 3: Goal-Based Workers
- [ ] Implement goal-planner.sh
- [ ] Add strategy simulation
- [ ] Integrate with worker launcher
- [ ] Test with 5 different task types
- [ ] Measure planning overhead

### Week 4: Utility-Based Masters
- [ ] Implement utility-optimizer.sh
- [ ] Add multi-objective scoring
- [ ] Integrate with MoE router
- [ ] Configure weights per master type
- [ ] Benchmark routing quality

### Week 5: Learning Agent - Critic & Learner
- [ ] Implement critic.sh
- [ ] Implement learner.sh
- [ ] Create performance evaluation framework
- [ ] Add model update mechanisms
- [ ] Test feedback loop

### Week 6: Learning Agent - Problem Generator
- [ ] Implement problem-generator.sh
- [ ] Add epsilon-greedy exploration
- [ ] Integrate complete learning cycle
- [ ] Monitor exploration vs exploitation
- [ ] Validate learning improvements

### Week 7: Multi-Agent Coordination
- [ ] Create communication bus
- [ ] Implement collaboration patterns
- [ ] Add handoff mechanisms
- [ ] Test parallel execution
- [ ] Benchmark coordination overhead

---

## File Structure

```
commit-relay/
├── coordination/
│   ├── schemas/
│   │   ├── worker-goal-schema.json
│   │   ├── utility-function-schema.json
│   │   └── learning-feedback-schema.json
│   ├── masters/
│   │   ├── lib/
│   │   │   ├── utility-optimizer.sh
│   │   │   └── collaboration-patterns.sh
│   │   └── coordinator/
│   │       ├── lib/
│   │       │   ├── learning-agent-cycle.sh
│   │       │   └── learning/
│   │       │       ├── critic.sh
│   │       │       ├── learner.sh
│   │       │       └── problem-generator.sh
│   │       └── knowledge-base/
│   │           ├── worker-models/
│   │           │   ├── scan-worker.json
│   │           │   ├── fix-worker.json
│   │           │   └── implementation-worker.json
│   │           └── learning-log.jsonl
│   ├── multi-agent/
│   │   └── communication-bus.jsonl
│   └── worker-specs/
│       └── plans/
│           └── {worker-id}-plan.json
├── agents/
│   └── workers/
│       └── lib/
│           ├── goal-planner.sh
│           └── strategy-simulator.sh
└── scripts/
    └── test-agent-types.sh
```

---

## Success Criteria (Weeks 2-7)

### Technical Criteria

- [ ] All 5 agent types implemented and documented
- [ ] 80%+ of workers use goal-based planning
- [ ] Masters use utility-based optimization for all routing
- [ ] Learning agent shows measurable improvement (10%+ per week)
- [ ] Multi-agent coordination patterns tested and working

### Performance Criteria

- [ ] Worker success rate: >90% (up from current)
- [ ] Planning overhead: <10% of total tokens
- [ ] Routing quality: >80% optimal decisions
- [ ] Learning rate: 10% improvement per week
- [ ] Multi-agent task latency: <30 min average

### Code Quality Criteria

- [ ] All new code has inline documentation
- [ ] Test suite covers all new functionality
- [ ] Schemas validated and enforced
- [ ] Git commits follow conventional commits
- [ ] Pre-commit hooks pass

---

## Risks and Mitigations

### Risk: Planning Overhead Too High

**Description**: Goal-based planning could consume significant tokens

**Mitigation**:
- Set planning token budget cap (max 10% of task budget)
- Cache plans for similar tasks
- Use lightweight heuristics for plan generation

**Monitoring**: Track planning tokens vs execution tokens

### Risk: Utility Function Imbalance

**Description**: Weights may favor one objective too heavily

**Mitigation**:
- Start with balanced weights (0.25 each)
- Tune weights based on observed performance
- Allow per-task weight overrides

**Monitoring**: Track utility score distribution

### Risk: Learning Too Slow

**Description**: Models may not improve at 10% per week target

**Mitigation**:
- Increase learning rate if improvement stagnates
- Add more diverse exploratory tasks
- Analyze learning-log.jsonl for patterns

**Monitoring**: Weekly performance review

### Risk: Exploration Too Disruptive

**Description**: 10% exploration may reduce short-term success rate

**Mitigation**:
- Start with 5% exploration, increase gradually
- Skip exploration for critical/urgent tasks
- Track exploration vs exploitation success rates separately

**Monitoring**: Compare exploratory vs exploitative task outcomes

---

## Testing Strategy

### Unit Tests

- Test goal-planner.sh with various task types
- Test utility function calculations
- Test critic performance evaluations
- Test problem generator exploration logic

### Integration Tests

- End-to-end worker with goal-based planning
- MoE routing with utility optimization
- Complete learning cycle (performance → critic → learning → problem)
- Multi-agent handoff scenarios

### Performance Tests

- Benchmark planning overhead
- Measure routing decision quality
- Track learning improvement rate
- Monitor multi-agent coordination latency

### Acceptance Tests

- 10 real tasks through goal-based workers
- 50 routing decisions through utility-based masters
- 100 learning cycles with measurable improvement
- 5 multi-agent collaborative tasks

---

## Documentation Requirements

### User Documentation

- [ ] How to define worker goals
- [ ] How to configure utility weights
- [ ] How to interpret learning metrics
- [ ] How to use collaboration patterns

### Developer Documentation

- [ ] Agent type classification guide
- [ ] Planning algorithm documentation
- [ ] Utility function formula reference
- [ ] Learning cycle architecture diagram

### Operational Documentation

- [ ] Monitoring learning agent performance
- [ ] Tuning utility function weights
- [ ] Troubleshooting planning failures
- [ ] Analyzing multi-agent coordination

---

## Dependencies

### Internal Dependencies

- ✅ Week 1: Worker daemon operational (prerequisite)
- [ ] Week 6-11: Observability platform (metrics for learning)

### External Dependencies

- bash 4.0+ (for associative arrays)
- jq 1.6+ (for JSON processing)
- bc (for floating-point calculations)
- awk (for numerical operations)

---

## Rollout Plan

### Phase 0: Preparation (Week 2)

1. Get design approval
2. Create directory structure
3. Write all schema files
4. Create stub implementations

### Phase 1: Limited Rollout (Week 3)

1. Deploy goal-based planning for test-worker only
2. Monitor 10 test tasks
3. Validate planning quality
4. Tune strategy simulation
5. Full rollout to all worker types

### Phase 2: Gradual Expansion (Weeks 4-5)

1. Enable utility-based optimization for coordinator-master
2. Monitor 50 routing decisions
3. Adjust utility weights based on feedback
4. Expand to development-master, then security-master

### Phase 3: Learning Activation (Week 6)

1. Activate critic evaluation (all tasks)
2. Enable learning element (model updates)
3. Start with 5% exploration
4. Increase to 10% after validation

### Phase 4: Full Deployment (Week 7)

1. Enable multi-agent coordination
2. Activate all collaboration patterns
3. Monitor system-wide performance
4. Declare Five Agent Types implementation complete

---

## Approval and Sign-off

**Design Status**: PENDING APPROVAL

**Reviewers**:
- [ ] Human Operator (strategic approval)
- [ ] Coordinator-Master (architectural review)
- [ ] Development-Master (implementation feasibility)

**Next Steps After Approval**:
1. Begin Week 2 implementation
2. Create schemas and directory structure
3. Write stub implementations
4. Begin Week 3 goal-based planning work

---

**Document Version**: 1.0
**Created**: 2025-11-19
**Last Updated**: 2025-11-19
**Status**: DESIGN - PENDING APPROVAL
