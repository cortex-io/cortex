# Five Agent Types Architecture Implementation for commit-relay

## Executive Summary

This document maps the five fundamental AI agent types to commit-relay's autonomous orchestration system, providing a framework for upgrading agents from simple reflex patterns to sophisticated learning agents.

**Core Insight**: AI agents are classified by their decision-making processes and intelligence level. commit-relay currently uses a mix of agent types without clear architectural boundaries. This implementation guide will:

1. **Classify existing components** by agent type
2. **Upgrade agents** to higher intelligence levels where appropriate
3. **Implement learning mechanisms** for continuous improvement
4. **Design multi-agent coordination** for cooperative task completion

---

## The Five Agent Types

### 1. Simple Reflex Agent
**Architecture**: Sensors → Condition-Action Rules → Actuators
- **Characteristics**: Fast, no memory, predefined rules
- **Decision Logic**: `if condition then action`
- **Limitations**: Can't handle dynamic scenarios, repeats mistakes

### 2. Model-Based Reflex Agent
**Architecture**: Sensors → State + How World Evolves + What My Actions Do → Condition-Action Rules → Actuators
- **Characteristics**: Maintains internal state, tracks history
- **Decision Logic**: Uses memory of past states + current percepts
- **Advantage**: Infers environment parts it can't currently observe

### 3. Goal-Based Agent
**Architecture**: Sensors → State → Goals + Future Prediction → Actions
- **Characteristics**: Goal-directed behavior, simulates outcomes
- **Decision Logic**: "What action will help me achieve my goal?"
- **Advantage**: Adapts to reach objectives, not just react

### 4. Utility-Based Agent
**Architecture**: Sensors → State → Utility Function (Happiness Score) → Actions
- **Characteristics**: Ranks outcomes by desirability
- **Decision Logic**: "Which action maximizes my utility score?"
- **Advantage**: Finds optimal solutions, not just satisficing ones

### 5. Learning Agent
**Architecture**: Critic → Learning Element → Performance Element + Problem Generator
- **Characteristics**: Learns from experience, improves over time
- **Components**:
  - **Critic**: Observes outcomes, provides reward signal
  - **Learning Element**: Updates knowledge based on feedback
  - **Problem Generator**: Suggests unexplored actions
  - **Performance Element**: Selects actions based on learned strategies
- **Advantage**: Most adaptable and powerful, but data-intensive

---

## Current Agent Classification in commit-relay

### Simple Reflex Agents
**Code-Runner** (`agents/code-runner/code-runner.sh`)
- **Current Behavior**: If syntax error found → create task
- **Condition-Action Rules**:
  ```
  if critical_count > 0 → priority = "critical"
  if high_count > 0 → priority = "high"
  if eval detected → severity = "medium"
  ```
- **Classification**: ✅ Correctly implemented as Simple Reflex
- **Recommendation**: Keep as-is - speed is valuable for quality gates

**Worker Daemon** (`scripts/worker-daemon.sh`)
- **Current Behavior**: If pending task → spawn worker
- **Condition-Action Rules**:
  ```
  if task.status == "pending" → spawn worker
  if worker_count > max → skip
  ```
- **Classification**: ✅ Correctly implemented as Simple Reflex
- **Recommendation**: Keep as-is - simple loop is appropriate

### Model-Based Reflex Agents
**Sparse Pool Manager** (`scripts/sparse-pool-manager.sh`)
- **Current State Tracking**:
  - Active worker count
  - Pool capacity
  - Activation rate (14% sparse activation)
- **What World Does**: Tracks pool metrics over time
- **What My Actions Do**: Knows spawning worker increases active count
- **Classification**: ✅ Correctly implemented as Model-Based
- **Recommendation**: Enhance state model with performance history

**MoE Memory Manager** (`coordination/masters/coordinator/lib/memory-manager.sh`)
- **Current State Tracking**:
  - Task patterns (long-term memory)
  - Pool state (working memory)
  - Router performance metrics
- **Classification**: ✅ Correctly implemented as Model-Based
- **Recommendation**: Add predictive modeling of future pool needs

### Goal-Based Agents
**Workers** (`agents/workers/dev-worker-*`, `sec-worker-*`, etc.)
- **Current Goals**: Complete assigned task
- **Goal Representation**: `task.id`, `task.title`, `task.context`
- **Future Simulation**: None currently - just attempts task
- **Classification**: ⚠️ Partially implemented - has goals but no planning
- **Recommendation**: **Upgrade to full Goal-Based with planning**

**Master Agents** (coordinator, development, security, inventory)
- **Current Goals**: Route tasks, manage workers in domain
- **Goal Representation**: Implicit in master type
- **Future Simulation**: None - reactive rather than predictive
- **Classification**: ⚠️ Between Simple Reflex and Goal-Based
- **Recommendation**: **Upgrade to Goal-Based with strategic planning**

### Utility-Based Agents
**MoE Router** (`coordination/masters/coordinator/lib/moe-router.sh`)
- **Current Decision**: Route task to best expert
- **Utility Function**: Confidence score (0.0-1.0)
- **Outcome Ranking**: YES - selects highest confidence expert
- **Classification**: ✅ Correctly implemented as Utility-Based
- **Recommendation**: Enhance utility function with multi-objective optimization

### Learning Agents
**MoE Learning System** (`coordination/masters/coordinator/lib/moe-code-learner.sh`)
- **Critic**: Code-runner findings → feedback signal
- **Learning Element**: Updates routing patterns based on outcomes
- **Problem Generator**: Missing - doesn't suggest new routing strategies
- **Performance Element**: Uses learned patterns for routing
- **Classification**: ⚠️ Partially implemented - lacks problem generator
- **Recommendation**: **Complete Learning Agent architecture**

---

## Implementation Plan

### Phase 1: Upgrade Workers to Full Goal-Based Agents (Week 1-2)

**Current Problem**: Workers execute tasks without planning or outcome prediction

**Solution**: Implement goal-based planning with future state simulation

#### 1.1 Add Planning Component

Create `agents/workers/lib/goal-planner.sh`:

```bash
#!/bin/bash
# Goal-Based Planning for Workers
set -euo pipefail

WORKER_ID="$1"
TASK_ID="$2"
TASK_CONTEXT="$3"

# Parse goal from task
GOAL=$(echo "$TASK_CONTEXT" | jq -r '.goal // .title')

log() {
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] PLANNER-${WORKER_ID}: $1"
}

# Simulate possible actions
simulate_actions() {
    local goal="$1"

    # Define possible strategies for achieving goal
    local strategies=(
        "direct_implementation"
        "research_then_implement"
        "iterative_refinement"
        "test_driven_development"
    )

    log "Simulating ${#strategies[@]} strategies for goal: ${goal}"

    # For each strategy, predict outcome
    for strategy in "${strategies[@]}"; do
        local predicted_time=$(estimate_time "$strategy" "$goal")
        local predicted_quality=$(estimate_quality "$strategy" "$goal")
        local predicted_success=$(estimate_success "$strategy" "$goal")

        echo "${strategy}|${predicted_time}|${predicted_quality}|${predicted_success}"
    done
}

# Estimate time for strategy
estimate_time() {
    local strategy="$1"
    local goal="$2"

    # Simple heuristics (would be ML model in production)
    case "$strategy" in
        direct_implementation)
            echo "fast"
            ;;
        research_then_implement)
            echo "medium"
            ;;
        iterative_refinement)
            echo "slow"
            ;;
        test_driven_development)
            echo "medium"
            ;;
    esac
}

# Estimate quality for strategy
estimate_quality() {
    local strategy="$1"
    local goal="$2"

    case "$strategy" in
        direct_implementation)
            echo "medium"
            ;;
        research_then_implement)
            echo "high"
            ;;
        iterative_refinement)
            echo "high"
            ;;
        test_driven_development)
            echo "very_high"
            ;;
    esac
}

# Estimate success probability
estimate_success() {
    local strategy="$1"
    local goal="$2"

    # Check if goal mentions specific requirements
    if echo "$goal" | grep -qi "test"; then
        # TDD is best for test-focused goals
        [ "$strategy" = "test_driven_development" ] && echo "0.9" || echo "0.6"
    elif echo "$goal" | grep -qi "research\|investigate\|analyze"; then
        # Research-first for investigative goals
        [ "$strategy" = "research_then_implement" ] && echo "0.85" || echo "0.5"
    elif echo "$goal" | grep -qi "quick\|fast\|urgent"; then
        # Direct implementation for urgent goals
        [ "$strategy" = "direct_implementation" ] && echo "0.75" || echo "0.4"
    else
        # Default: balanced approach
        echo "0.7"
    fi
}

# Select best strategy based on goal
select_strategy() {
    local goal="$1"
    local priority="${2:-medium}"

    # Simulate all strategies
    local simulations=$(simulate_actions "$goal")

    # Rank by success probability (simple goal-based approach)
    local best_strategy=$(echo "$simulations" | sort -t'|' -k4 -rn | head -1 | cut -d'|' -f1)

    log "Selected strategy: ${best_strategy}"

    echo "$best_strategy"
}

# Generate execution plan
generate_plan() {
    local strategy="$1"
    local goal="$2"

    local plan_file="/tmp/plan-${WORKER_ID}.json"

    case "$strategy" in
        direct_implementation)
            jq -n \
                --arg strategy "$strategy" \
                --arg goal "$goal" \
                '{
                    strategy: $strategy,
                    goal: $goal,
                    steps: [
                        {step: 1, action: "Analyze requirements", estimated_duration: "5min"},
                        {step: 2, action: "Implement solution", estimated_duration: "30min"},
                        {step: 3, action: "Basic testing", estimated_duration: "10min"}
                    ],
                    estimated_total_time: "45min",
                    confidence: 0.75
                }' > "$plan_file"
            ;;
        research_then_implement)
            jq -n \
                --arg strategy "$strategy" \
                --arg goal "$goal" \
                '{
                    strategy: $strategy,
                    goal: $goal,
                    steps: [
                        {step: 1, action: "Research similar implementations", estimated_duration: "15min"},
                        {step: 2, action: "Design solution architecture", estimated_duration: "10min"},
                        {step: 3, action: "Implement with best practices", estimated_duration: "40min"},
                        {step: 4, action: "Test and validate", estimated_duration: "15min"}
                    ],
                    estimated_total_time: "80min",
                    confidence: 0.85
                }' > "$plan_file"
            ;;
        test_driven_development)
            jq -n \
                --arg strategy "$strategy" \
                --arg goal "$goal" \
                '{
                    strategy: $strategy,
                    goal: $goal,
                    steps: [
                        {step: 1, action: "Write failing tests", estimated_duration: "20min"},
                        {step: 2, action: "Implement to pass tests", estimated_duration: "35min"},
                        {step: 3, action: "Refactor and optimize", estimated_duration: "15min"},
                        {step: 4, action: "Verify all tests pass", estimated_duration: "10min"}
                    ],
                    estimated_total_time: "80min",
                    confidence: 0.9
                }' > "$plan_file"
            ;;
        iterative_refinement)
            jq -n \
                --arg strategy "$strategy" \
                --arg goal "$goal" \
                '{
                    strategy: $strategy,
                    goal: $goal,
                    steps: [
                        {step: 1, action: "Create MVP implementation", estimated_duration: "25min"},
                        {step: 2, action: "Test and gather feedback", estimated_duration: "10min"},
                        {step: 3, action: "Refine implementation", estimated_duration: "30min"},
                        {step: 4, action: "Final validation", estimated_duration: "15min"}
                    ],
                    estimated_total_time: "80min",
                    confidence: 0.8
                }' > "$plan_file"
            ;;
    esac

    log "Plan generated: ${plan_file}"
    echo "$plan_file"
}

# Main execution
STRATEGY=$(select_strategy "$GOAL" "${PRIORITY:-medium}")
PLAN_FILE=$(generate_plan "$STRATEGY" "$GOAL")

# Output plan path for worker to use
cat "$PLAN_FILE"
```

#### 1.2 Integrate Planning into Worker Launcher

Modify `scripts/claude-worker-launcher-v2.sh`:

```bash
# After extracting task context, before launching Claude

log "Generating goal-based execution plan..."

# Run goal planner
PLAN=$(/Users/ryandahlberg/commit-relay/agents/workers/lib/goal-planner.sh \
    "$WORKER_ID" \
    "$TASK_ID" \
    "$TASK_CONTEXT")

# Inject plan into worker prompt
WORKER_PROMPT=$(cat "${WORKER_PROMPT_TEMPLATE}" | \
    sed "s|{{TASK_CONTEXT}}|${TASK_CONTEXT}|g" | \
    sed "s|{{EXECUTION_PLAN}}|${PLAN}|g")

log "Plan generated: $(echo "$PLAN" | jq -r '.strategy')"
```

---

### Phase 2: Add Utility-Based Optimization to Masters (Week 3-4)

**Current Problem**: Masters route tasks but don't optimize for multiple objectives

**Solution**: Implement utility functions that balance speed, quality, cost, and success probability

#### 2.1 Multi-Objective Utility Function

Create `coordination/masters/lib/utility-optimizer.sh`:

```bash
#!/bin/bash
# Utility-Based Decision Making for Masters
set -euo pipefail

# Utility function: U(action) = w1*speed + w2*quality + w3*cost + w4*success
calculate_utility() {
    local action="$1"
    local context="$2"

    # Extract weights from context (defaults if not specified)
    local w_speed=$(echo "$context" | jq -r '.weights.speed // 0.25')
    local w_quality=$(echo "$context" | jq -r '.weights.quality // 0.35')
    local w_cost=$(echo "$context" | jq -r '.weights.cost // 0.15')
    local w_success=$(echo "$context" | jq -r '.weights.success // 0.25')

    # Predict outcome metrics for this action (0.0-1.0 scale)
    local speed=$(predict_speed "$action" "$context")
    local quality=$(predict_quality "$action" "$context")
    local cost=$(predict_cost "$action" "$context")  # Inverted: lower cost = higher utility
    local success=$(predict_success "$action" "$context")

    # Calculate weighted utility
    local utility=$(echo "scale=4; ($w_speed * $speed) + ($w_quality * $quality) + ($w_cost * (1 - $cost)) + ($w_success * $success)" | bc)

    echo "$utility"
}

# Predict speed (completion time)
predict_speed() {
    local action="$1"
    local context="$2"

    # Simple heuristic based on worker type and task complexity
    local worker_type=$(echo "$action" | jq -r '.worker_type')
    local task_priority=$(echo "$context" | jq -r '.priority')

    case "$worker_type-$task_priority" in
        development-critical)
            echo "0.85"  # Fast turnaround for critical dev tasks
            ;;
        development-high)
            echo "0.75"
            ;;
        security-*)
            echo "0.60"  # Security tasks take longer
            ;;
        inventory-*)
            echo "0.70"  # Medium speed
            ;;
        *)
            echo "0.65"
            ;;
    esac
}

# Predict quality (solution robustness)
predict_quality() {
    local action="$1"
    local context="$2"

    local worker_type=$(echo "$action" | jq -r '.worker_type')

    case "$worker_type" in
        development)
            echo "0.80"  # Good quality implementation
            ;;
        security)
            echo "0.90"  # Very high quality for security
            ;;
        inventory)
            echo "0.75"  # Documentation quality
            ;;
        *)
            echo "0.70"
            ;;
    esac
}

# Predict cost (resource usage)
predict_cost() {
    local action="$1"
    local context="$2"

    local worker_type=$(echo "$action" | jq -r '.worker_type')
    local estimated_time=$(echo "$action" | jq -r '.estimated_time // "medium"')

    # Cost = time * complexity
    local base_cost=0.5

    case "$estimated_time" in
        fast)
            base_cost=0.3
            ;;
        medium)
            base_cost=0.5
            ;;
        slow)
            base_cost=0.8
            ;;
    esac

    echo "$base_cost"
}

# Predict success probability
predict_success() {
    local action="$1"
    local context="$2"

    # Use historical success rate + confidence score
    local worker_type=$(echo "$action" | jq -r '.worker_type')
    local confidence=$(echo "$action" | jq -r '.confidence // 0.7')

    # Look up historical success rate from memory
    local history_file="/Users/ryandahlberg/commit-relay/coordination/memory/long-term/task-patterns.json"

    if [ -f "$history_file" ]; then
        local success_rate=$(jq -r --arg type "$worker_type" '
            .successful_patterns[] |
            select(.worker_type == $type) |
            .success_rate // 0.7
        ' "$history_file" 2>/dev/null || echo "0.7")

        # Combine confidence and history (weighted average)
        echo "scale=4; (0.6 * $confidence) + (0.4 * $success_rate)" | bc
    else
        echo "$confidence"
    fi
}

# Select best action from multiple options
select_best_action() {
    local actions_json="$1"
    local context="$2"

    local best_action=""
    local best_utility=-1

    # Evaluate each action
    echo "$actions_json" | jq -c '.[]' | while read -r action; do
        local utility=$(calculate_utility "$action" "$context")

        echo "${utility}|${action}"
    done | sort -t'|' -k1 -rn | head -1 | cut -d'|' -f2-
}

# Main CLI
case "${1:-help}" in
    calculate)
        calculate_utility "$2" "$3"
        ;;
    select)
        select_best_action "$2" "$3"
        ;;
    *)
        echo "Usage: $0 {calculate|select} <action> <context>"
        ;;
esac
```

#### 2.2 Integrate Utility Optimization into MoE Router

Modify `coordination/masters/coordinator/lib/moe-router.sh`:

```bash
# After determining expert candidates, before final selection

# Generate action candidates with predicted outcomes
ACTIONS=$(jq -n \
    --arg dev "development" \
    --arg sec "security" \
    --arg inv "inventory" \
    --argjson dev_conf "$DEV_CONFIDENCE" \
    --argjson sec_conf "$SEC_CONFIDENCE" \
    --argjson inv_conf "$INV_CONFIDENCE" \
    '[
        {worker_type: $dev, confidence: $dev_conf, estimated_time: "medium"},
        {worker_type: $sec, confidence: $sec_conf, estimated_time: "slow"},
        {worker_type: $inv, confidence: $inv_conf, estimated_time: "fast"}
    ]')

# Use utility optimizer to select best action
BEST_ACTION=$(./coordination/masters/lib/utility-optimizer.sh select \
    "$ACTIONS" \
    "$TASK_CONTEXT")

SELECTED_EXPERT=$(echo "$BEST_ACTION" | jq -r '.worker_type')
UTILITY_SCORE=$(./coordination/masters/lib/utility-optimizer.sh calculate \
    "$BEST_ACTION" \
    "$TASK_CONTEXT")

log "Selected ${SELECTED_EXPERT} with utility score: ${UTILITY_SCORE}"
```

---

### Phase 3: Complete Learning Agent Architecture (Week 5-6)

**Current Problem**: MoE learning system lacks problem generator and comprehensive critic

**Solution**: Implement full learning agent with all four components

#### 3.1 Enhanced Critic Component

Create `coordination/masters/coordinator/lib/learning/critic.sh`:

```bash
#!/bin/bash
# Critic Component - Evaluates agent performance
set -euo pipefail

CRITIC_DIR="${COMMIT_RELAY_HOME}/coordination/masters/coordinator/lib/learning"
PERFORMANCE_STANDARDS="${CRITIC_DIR}/performance-standards.json"

# Observe outcome of action
observe_outcome() {
    local task_id="$1"
    local worker_id="$2"

    # Get task completion data
    local task_result=$(jq --arg id "$task_id" '.tasks[] | select(.id == $id)' \
        /Users/ryandahlberg/commit-relay/coordination/task-queue.json)

    local status=$(echo "$task_result" | jq -r '.status')
    local completion_time=$(echo "$task_result" | jq -r '.completed_at // empty')
    local created_time=$(echo "$task_result" | jq -r '.created_at')

    # Calculate performance metrics
    local duration=0
    if [ -n "$completion_time" ]; then
        duration=$(calculate_duration "$created_time" "$completion_time")
    fi

    # Get worker type
    local worker_type=$(jq -r '.worker_type' \
        "/Users/ryandahlberg/commit-relay/coordination/worker-specs/active/${worker_id}.json" 2>/dev/null \
        || echo "unknown")

    # Compare to performance standards
    local expected_duration=$(jq -r --arg type "$worker_type" \
        '.standards[$type].expected_duration_minutes // 60' \
        "$PERFORMANCE_STANDARDS")

    # Generate reward signal
    local reward=$(calculate_reward "$status" "$duration" "$expected_duration")

    # Output critique
    jq -n \
        --arg task_id "$task_id" \
        --arg worker_id "$worker_id" \
        --arg status "$status" \
        --argjson duration "$duration" \
        --argjson expected "$expected_duration" \
        --argjson reward "$reward" \
        '{
            task_id: $task_id,
            worker_id: $worker_id,
            status: $status,
            actual_duration_minutes: $duration,
            expected_duration_minutes: $expected,
            reward: $reward,
            timestamp: (now | todate)
        }'
}

# Calculate reward signal (-1.0 to 1.0)
calculate_reward() {
    local status="$1"
    local actual_duration="$2"
    local expected_duration="$3"

    # Base reward on success/failure
    local base_reward=0.0
    case "$status" in
        completed)
            base_reward=1.0
            ;;
        failed)
            base_reward=-1.0
            ;;
        *)
            base_reward=0.0
            ;;
    esac

    # Adjust for speed (faster = higher reward)
    if [ "$status" = "completed" ] && [ "$actual_duration" -gt 0 ]; then
        local speed_ratio=$(echo "scale=4; $expected_duration / $actual_duration" | bc)

        # Bonus for faster completion, penalty for slower
        if (( $(echo "$speed_ratio > 1.0" | bc -l) )); then
            # Faster than expected: bonus up to +0.5
            local speed_bonus=$(echo "scale=4; ($speed_ratio - 1.0) * 0.5" | bc)
            [ $(echo "$speed_bonus > 0.5" | bc -l) -eq 1 ] && speed_bonus=0.5

            base_reward=$(echo "scale=4; $base_reward + $speed_bonus" | bc)
        else
            # Slower than expected: penalty up to -0.5
            local speed_penalty=$(echo "scale=4; (1.0 - $speed_ratio) * 0.5" | bc)
            [ $(echo "$speed_penalty > 0.5" | bc -l) -eq 1 ] && speed_penalty=0.5

            base_reward=$(echo "scale=4; $base_reward - $speed_penalty" | bc)
        fi
    fi

    echo "$base_reward"
}

# Calculate duration in minutes
calculate_duration() {
    local start="$1"
    local end="$2"

    local start_epoch=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$start" "+%s" 2>/dev/null || echo 0)
    local end_epoch=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$end" "+%s" 2>/dev/null || echo 0)

    local duration_seconds=$((end_epoch - start_epoch))
    local duration_minutes=$((duration_seconds / 60))

    echo "$duration_minutes"
}

# Main CLI
observe_outcome "$1" "$2"
```

#### 3.2 Problem Generator Component

Create `coordination/masters/coordinator/lib/learning/problem-generator.sh`:

```bash
#!/bin/bash
# Problem Generator - Suggests unexplored actions
set -euo pipefail

LEARNING_DIR="${COMMIT_RELAY_HOME}/coordination/memory/long-term"
EXPLORATIONS_LOG="${LEARNING_DIR}/explorations.jsonl"

# Suggest new routing strategy to explore
suggest_exploration() {
    local task_context="$1"

    # Analyze what strategies haven't been tried
    local tried_strategies=$(jq -s '[.[] | .strategy] | unique' "$EXPLORATIONS_LOG" 2>/dev/null || echo '[]')

    # All possible strategies
    local all_strategies='[
        "single_expert_high_confidence",
        "single_expert_low_confidence",
        "dual_expert_collaborative",
        "multi_expert_consensus",
        "specialist_with_reviewer",
        "parallel_competitive"
    ]'

    # Find untried strategies
    local untried=$(jq -n \
        --argjson all "$all_strategies" \
        --argjson tried "$tried_strategies" \
        '$all - $tried')

    # If all tried, suggest least-used strategy
    if [ "$(echo "$untried" | jq 'length')" -eq 0 ]; then
        local least_used=$(jq -s '
            group_by(.strategy) |
            map({strategy: .[0].strategy, count: length}) |
            sort_by(.count) |
            .[0].strategy
        ' "$EXPLORATIONS_LOG" 2>/dev/null || echo '"single_expert_high_confidence"')

        untried="[$least_used]"
    fi

    # Select random untried strategy
    local suggestion=$(echo "$untried" | jq -r '.[0]')

    # Generate exploration action
    jq -n \
        --arg strategy "$suggestion" \
        --arg reason "Exploration: This strategy has been used least" \
        '{
            strategy: $strategy,
            exploration: true,
            reason: $reason,
            timestamp: (now | todate)
        }'
}

# Record exploration result
record_exploration() {
    local strategy="$1"
    local outcome="$2"
    local reward="$3"

    jq -n \
        --arg strategy "$strategy" \
        --arg outcome "$outcome" \
        --argjson reward "$reward" \
        '{
            strategy: $strategy,
            outcome: $outcome,
            reward: $reward,
            timestamp: (now | todate)
        }' >> "$EXPLORATIONS_LOG"
}

# Determine if should explore (epsilon-greedy)
should_explore() {
    local epsilon="${1:-0.1}"  # 10% exploration rate by default

    local random=$(echo "scale=2; $RANDOM / 32767" | bc)

    if (( $(echo "$random < $epsilon" | bc -l) )); then
        echo "true"
    else
        echo "false"
    fi
}

# Main CLI
case "${1:-help}" in
    suggest)
        suggest_exploration "$2"
        ;;
    record)
        record_exploration "$2" "$3" "$4"
        ;;
    should-explore)
        should_explore "${2:-0.1}"
        ;;
    *)
        echo "Usage: $0 {suggest|record|should-explore}"
        ;;
esac
```

#### 3.3 Integrate Learning Loop

Modify `scripts/task-completion-daemon.sh` to trigger learning:

```bash
# After worker completes task

# Critic: Observe outcome and generate reward
CRITIQUE=$(./coordination/masters/coordinator/lib/learning/critic.sh \
    "$TASK_ID" \
    "$WORKER_ID")

REWARD=$(echo "$CRITIQUE" | jq -r '.reward')

log "Critic reward for ${TASK_ID}: ${REWARD}"

# Learning Element: Update knowledge based on reward
if (( $(echo "$REWARD > 0.5" | bc -l) )); then
    # Positive outcome - reinforce this pattern
    ./coordination/masters/coordinator/lib/moe-code-learner.sh record-success \
        "$TASK_ID" "$WORKER_TYPE" "$REWARD"
elif (( $(echo "$REWARD < -0.5" | bc -l) )); then
    # Negative outcome - learn to avoid this pattern
    ./coordination/masters/coordinator/lib/moe-code-learner.sh record-failure \
        "$TASK_ID" "$WORKER_TYPE" "$REWARD"
fi

# Problem Generator: Occasionally suggest explorations
if [ "$(./coordination/masters/coordinator/lib/learning/problem-generator.sh should-explore)" = "true" ]; then
    log "Triggering exploration for next task"

    # Flag next task for exploration
    touch /tmp/explore-next-task
fi
```

---

### Phase 4: Multi-Agent Coordination Framework (Week 7-8)

**Current Problem**: Agents operate independently without cooperative strategies

**Solution**: Implement multi-agent system with communication and coordination

#### 4.1 Agent Communication Protocol

Create `coordination/multi-agent/communication-bus.jsonl`:

```json
{"event":"message","from":"dev-worker-001","to":"sec-worker-002","type":"request","content":"Can you review security implications of authentication change?","timestamp":"2025-11-14T15:30:00Z"}
{"event":"message","from":"sec-worker-002","to":"dev-worker-001","type":"response","content":"Reviewed. Found SQL injection risk in line 47. Sending detailed report.","timestamp":"2025-11-14T15:35:00Z"}
```

#### 4.2 Coordination Patterns

Create `coordination/multi-agent/coordinator.sh`:

```bash
#!/bin/bash
# Multi-Agent Coordination
set -euo pipefail

COMM_BUS="/Users/ryandahlberg/commit-relay/coordination/multi-agent/communication-bus.jsonl"

# Send message between agents
send_message() {
    local from_agent="$1"
    local to_agent="$2"
    local message_type="$3"  # request, response, broadcast
    local content="$4"

    jq -n \
        --arg from "$from_agent" \
        --arg to "$to_agent" \
        --arg type "$message_type" \
        --arg content "$content" \
        '{
            event: "message",
            from: $from,
            to: $to,
            type: $type,
            content: $content,
            timestamp: (now | todate)
        }' >> "$COMM_BUS"

    echo "✓ Message sent from ${from_agent} to ${to_agent}"
}

# Check for messages to agent
check_messages() {
    local agent_id="$1"

    jq -c --arg agent "$agent_id" \
        'select(.to == $agent or .to == "all") | select(.event == "message")' \
        "$COMM_BUS" | tail -10
}

# Coordinate collaborative task
coordinate_task() {
    local task_id="$1"
    local required_agents="$2"  # JSON array of agent types

    # Spawn all required agents
    echo "$required_agents" | jq -r '.[]' | while read -r agent_type; do
        ./scripts/spawn-worker.sh "$task_id" "$agent_type"
    done

    # Send coordination message
    send_message "coordinator-master" "all" "broadcast" \
        "Collaborative task ${task_id} requires: ${required_agents}"
}

# Main CLI
case "${1:-help}" in
    send)
        send_message "$2" "$3" "$4" "$5"
        ;;
    check)
        check_messages "$2"
        ;;
    coordinate)
        coordinate_task "$2" "$3"
        ;;
    *)
        echo "Usage: $0 {send|check|coordinate}"
        ;;
esac
```

---

## Agent Type Selection Guide

### When to Use Each Agent Type

| Agent Type | Use Case | Example in commit-relay |
|------------|----------|-------------------------|
| **Simple Reflex** | Fast, rule-based responses | Code-runner quality checks, daemon loops |
| **Model-Based** | State tracking, history matters | Pool manager, memory systems |
| **Goal-Based** | Clear objectives, planning needed | Workers completing tasks, masters routing |
| **Utility-Based** | Optimize multiple objectives | MoE router balancing confidence/speed/quality |
| **Learning** | Improve over time, adapt | MoE learning from routing outcomes |

### Decision Tree

```
Does the component need to improve over time?
├─ YES → Learning Agent
└─ NO → Does it need to optimize multiple objectives?
    ├─ YES → Utility-Based Agent
    └─ NO → Does it need to plan for goals?
        ├─ YES → Goal-Based Agent
        └─ NO → Does it need to track state/history?
            ├─ YES → Model-Based Reflex Agent
            └─ NO → Simple Reflex Agent
```

---

## Implementation Priorities

### High Priority (Immediate Value)
1. ✅ **Classify existing agents** - Document what each component is
2. 🔧 **Upgrade workers to goal-based** - Add planning and simulation
3. 🔧 **Complete MoE learning agent** - Add problem generator
4. 🔧 **Enhance utility functions** - Multi-objective optimization

### Medium Priority (Strategic Improvement)
5. **Multi-agent coordination** - Enable collaboration
6. **State management** - Better model-based tracking
7. **Performance standards** - Critic benchmarks

### Low Priority (Future Enhancement)
8. **Advanced learning algorithms** - Reinforcement learning
9. **Distributed multi-agent systems** - Cross-machine coordination
10. **Agent marketplace** - Pluggable agent types

---

## Success Metrics

1. **Planning Quality**: 80%+ of workers generate execution plans before starting
2. **Utility Optimization**: Routing decisions consider 4+ objectives
3. **Learning Rate**: MoE improves routing accuracy by 10% per week
4. **Exploration Rate**: 10% of routing decisions are exploratory
5. **Coordination Success**: 90%+ of multi-agent tasks complete successfully

---

## Conclusion

By implementing the five agent types systematically, commit-relay will evolve from a collection of reactive scripts to a sophisticated multi-agent system where:

- **Simple components** remain fast and predictable
- **Model-based systems** track state intelligently
- **Goal-based workers** plan before executing
- **Utility-optimized routers** balance multiple objectives
- **Learning agents** improve continuously from experience
- **Multi-agent teams** collaborate on complex tasks

This architectural foundation positions commit-relay as a true autonomous orchestration platform, not just a task runner.

**Next Steps**: Start with Phase 1 (Worker Goal-Based Planning) for immediate ROI, then progressively enhance other components based on usage patterns and performance data.
