# Next Implementation Priorities

**Generated**: 2025-11-20
**Status**: Actionable - Ready for Implementation
**Context**: Post-daemon stabilization session

---

## Current State Summary

### What's Now Working (Fixed Today)

The critical "Week 1" blockers from AGENT_ARCHITECTURE_FIX have been largely resolved:

- **15/15 Daemons Running** - All core infrastructure operational
  - Core: worker-daemon, health-monitor, metrics-snapshot, coordinator, integration-validator, pm-daemon, daemon-supervisor
  - Self-healing: heartbeat-monitor, worker-restart, failure-pattern, auto-fix, zombie-cleanup
  - Learning: moe-learning (NEW - hourly cycles), learning-monitor
  - Dashboard on port 3000

- **MoE Learning Daemon Created** - Continuous hourly learning cycles
  - Pattern extraction from training examples
  - Routing model weight updates
  - Utility function optimization
  - Improvement metrics tracking

- **Dashboard Monitoring Complete** - All daemons visible and controllable

### What Still Needs Work

1. **Token Budget Deep Fix** - Still shows some inconsistencies
2. **Goal-based Worker Planning** - Workers execute without planning
3. **Observability Gaps** - Basic events only, no tracing/structured metrics
4. **Agent Management** - No registry, templates, or UI management

---

## Immediate Priorities (Next 2 Weeks)

### Priority 1: Token Budget Stabilization
**Effort**: 2-3 days
**Impact**: System reliability

**Current Issues:**
- `coordination/token-budget.json` shows `total_used: -7000` (negative)
- Reclamation logic may be over-counting
- No separation of "reserved" vs "in-use"

**Implementation:**
```bash
# Files to modify:
scripts/lib/token-budget.sh        # Fix allocation/deallocation logic
coordination/token-budget.json     # Reset to clean state
scripts/worker-cleanup-cron.sh     # Ensure proper reclamation
```

**Success Criteria:**
- Token budget always shows positive, accurate values
- Reserved tokens released after worker timeout (15 min)
- Audit trail of token transactions

---

### Priority 2: Goal-based Worker Planning
**Effort**: 1 week
**Impact**: Worker effectiveness

**Current State:**
- Workers execute tasks directly without planning
- No strategy selection (TDD, research-first, iterative)
- Limited context from master

**Implementation:**

Create `scripts/lib/goal-planner.sh`:
```bash
# Goal-based planning for workers
# 1. Analyze task requirements
# 2. Select optimal strategy
# 3. Generate execution plan
# 4. Estimate resource needs

plan_task_execution() {
    local task_spec="$1"

    # Strategy options: tdd, research_first, direct, iterative
    local strategy=$(select_strategy "$task_spec")

    # Generate step-by-step plan
    generate_plan "$task_spec" "$strategy"
}
```

Integrate into `scripts/claude-worker-launcher-v2.sh`:
- Workers generate plan before executing
- Plan stored in worker spec
- Results compared against plan

**Success Criteria:**
- 80%+ workers generate execution plans
- Measurable improvement in task completion rates
- Plan vs actual comparison for learning

---

### Priority 3: Observability Data Collection
**Effort**: 1 week
**Impact**: Debugging capability

**Current State:**
- Basic event logging (`coordination/dashboard-events.jsonl`)
- No distributed tracing
- Limited metrics (no dimensions)

**Implementation:**

Create `coordination/observability/` structure:
```
coordination/observability/
├── traces/           # Distributed trace spans
├── metrics/          # Time-series metrics with dimensions
├── events/           # Structured events (exists partially)
└── indices/          # Query indices
```

Create `scripts/lib/observability/trace.sh`:
```bash
# OpenTelemetry-inspired tracing
start_span() {
    local name="$1"
    local trace_id="${TRACE_ID:-$(generate_trace_id)}"
    local span_id=$(generate_span_id)

    export TRACE_ID="$trace_id"
    export SPAN_ID="$span_id"

    emit_span_start "$trace_id" "$span_id" "$name"
}

end_span() {
    emit_span_end "$TRACE_ID" "$SPAN_ID" "$?"
}
```

Instrument key paths:
- Task routing in coordinator
- Worker spawning
- Task execution
- Result aggregation

**Success Criteria:**
- Complete traces for all task journeys
- Query: "Show all spans for task-XYZ"
- Latency breakdown by component

---

## Near-Term Priorities (Weeks 3-6)

### Priority 4: Structured Metrics with Dimensions
**Effort**: 1 week
**Impact**: Operational insights

Create high-cardinality metrics:
```json
{
  "metric_name": "task_duration_seconds",
  "value": 45.2,
  "dimensions": {
    "task_type": "security-scan",
    "worker_type": "scan-worker",
    "priority": "high",
    "master": "security-master",
    "branch": "main"
  },
  "timestamp": "2025-11-20T14:30:00Z"
}
```

Enable queries like:
- "Average duration for high-priority security tasks"
- "Token usage by master agent over time"
- "Success rate by worker type"

---

### Priority 5: Agent Registry Foundation
**Effort**: 1 week
**Impact**: Agent management

Create `coordination/agentstudio/registry/`:
```json
{
  "agent_id": "security-master",
  "name": "Security Master",
  "type": "master",
  "version": "1.0.0",
  "capabilities": ["security-scan", "cve-remediation", "threat-hunting"],
  "resource_limits": {
    "max_tokens_per_task": 50000,
    "max_concurrent_workers": 5
  },
  "dependencies": ["coordinator-master"],
  "status": "active",
  "instances": 1,
  "created_at": "2025-11-01T00:00:00Z"
}
```

Benefits:
- Catalog all agents
- Track capabilities and limits
- Enable agent discovery
- Foundation for Agentstudio UI

---

### Priority 6: Anomaly Detection
**Effort**: 1 week
**Impact**: Proactive issue detection

Create `scripts/daemons/anomaly-detector-daemon.sh`:
- Monitor key metrics for deviations
- Detect unusual patterns (task failures, token spikes, slow completions)
- Generate alerts for human review
- Auto-tag incidents

Detection types:
- Statistical anomalies (>2 std deviations)
- Threshold breaches (error rate >10%)
- Pattern changes (sudden drop in throughput)

---

## Medium-Term Priorities (Weeks 7-12)

### Priority 7: Complete Learning Loop
**Impact**: Continuous improvement

The MoE learning daemon runs hourly but needs:
- More training examples (critic evaluation of completed tasks)
- Problem generator for exploration (epsilon-greedy 10%)
- Feedback integration into routing decisions

Enhancement to `scripts/lib/learning-agent/`:
- `critic.sh` - Evaluate completed tasks, generate training examples
- `problem-generator.sh` - Create exploratory tasks for learning
- `learner.sh` - Already exists, needs more data to work with

---

### Priority 8: RAG Pipeline for Library
**Impact**: Knowledge utilization

Process documents in `library/`:
- Document ingestion and chunking
- Embedding generation
- Vector storage (SQLite with extensions or ChromaDB)
- Retrieval for agent context

Use cases:
- Security best practices for security-master
- Implementation patterns for development-master
- Architecture decisions for coordinator-master

---

### Priority 9: Agentstudio UI Components
**Impact**: Self-service agent management

Add to dashboard:
- Agent list view (registry visualization)
- Agent detail view (capabilities, instances, metrics)
- Agent designer (create from template)
- Agent tester (smoke tests)

---

## Implementation Approach

### Principles

1. **Incremental Value** - Each priority delivers standalone value
2. **Build on Existing** - Enhance current architecture, don't rewrite
3. **Test as You Go** - Validate each addition before moving on
4. **Document Changes** - Update relevant docs with each change

### Parallel Work Streams

**Stream A: Core Reliability (Priorities 1-2)**
- Token budget fix
- Goal-based planning
- Assigned to: Development Master

**Stream B: Observability (Priorities 3-4, 6)**
- Tracing infrastructure
- Metrics collection
- Anomaly detection
- Assigned to: Development Master + Inventory Master

**Stream C: Agent Management (Priority 5, 9)**
- Registry foundation
- UI components
- Assigned to: Coordinator Master

### Timeline

| Week | Stream A | Stream B | Stream C |
|------|----------|----------|----------|
| 1 | Token budget | Trace infrastructure | - |
| 2 | Goal planning | Trace integration | - |
| 3 | Testing/validation | Metrics collection | Registry design |
| 4 | - | Metrics dashboards | Registry implementation |
| 5 | - | Anomaly detection | UI components |
| 6 | Integration testing | Integration | Integration |

---

## Quick Wins (Can Do Immediately)

### 1. Fix token budget reset
```bash
# Reset to clean state
cat > coordination/token-budget.json << 'EOF'
{
  "total_budget": 500000,
  "total_used": 0,
  "available": 500000,
  "updated_at": "2025-11-20T00:00:00Z",
  "reclamation_log": []
}
EOF
```

### 2. Add trace context to worker launcher
Add to `scripts/claude-worker-launcher-v2.sh`:
```bash
export TRACE_ID=$(uuidgen | tr -d '-')
export SPAN_ID=$(uuidgen | tr -d '-' | head -c 16)
```

### 3. Emit more training examples
After each task completion, run critic:
```bash
source scripts/lib/learning-agent/critic.sh
evaluate_worker_performance "$worker_spec_file"
```

---

## Success Metrics

### After Week 2
- Token budget accurate and positive
- Workers generating execution plans
- Basic trace collection operational

### After Week 4
- Structured metrics with dimensions
- Agent registry populated
- Can query "average task duration by type"

### After Week 6
- Anomaly detection running
- Full task traces viewable
- MTTR < 15 minutes

---

## Dependencies & Risks

### Dependencies
- Priority 2 (goal planning) needs fixed token budget (Priority 1)
- Priority 4 (metrics) benefits from trace infrastructure (Priority 3)
- Priority 9 (UI) needs registry (Priority 5)

### Risks
1. **Data Volume** - Observability may generate lots of data
   - Mitigation: Sampling, retention policies, aggregation

2. **Complexity** - More components = more failure modes
   - Mitigation: Daemon supervisor monitors everything, auto-restart

3. **Performance** - Instrumentation adds overhead
   - Mitigation: Async writes, batching, profiling

---

## Next Actions

### Immediate (Today/Tomorrow)
1. Reset token budget to clean state
2. Start trace infrastructure design
3. Review goal-planner requirements

### This Week
1. Implement basic trace emission
2. Begin goal-planner.sh development
3. Design metrics schema

### Next Week
1. Integrate tracing into worker launcher
2. Complete goal-planner integration
3. Start metrics collection daemon

---

## Related Documentation

- `/library/implementation-analysis/IMPLEMENTATION_ROADMAP.md` - Full original roadmap
- `/library/implementation-analysis/EXECUTIVE_SUMMARY.md` - Strategic overview
- `/docs/OBSERVABILITY-STRATEGY.md` - Monitoring approach
- `/CORE-PRINCIPLES.md` - System philosophy

---

**Document Version**: 1.0
**Last Updated**: 2025-11-20
**Next Review**: After Week 2 priorities complete
