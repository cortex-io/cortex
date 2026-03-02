# Phase 1 Quick Start Guide
## Parallel Cortex + MoE Implementation

**Ready to begin?** Phase 1 is designed for **parallel execution** using both Cortex workers and MoE routing.

---

## What You'll Build (Phase 1)

- **Enhanced Metrics Collection** - Capture all LLM operations
- **Worker Health Monitoring** - Real-time worker status tracking
- **Observability Dashboard** - Live metrics and visualizations
- **Distributed Trace Correlation** - End-to-end request tracing

**Timeline**: 2-3 weeks (vs. 4 weeks sequential)
**Approach**: Parallel workers + MoE multi-expert routing

---

## Prerequisites

1. **Cortex is running**:
   ```bash
   # Check status
   ./scripts/status-check.sh
   ```

2. **MoE router is functional**:
   ```bash
   # Test MoE routing
   ./coordination/masters/coordinator/lib/moe-router.sh \
     test-001 "Create metrics collection system"
   ```

3. **Token budget is available**:
   ```bash
   # Check budget
   cat coordination/token-budget.json | jq '{total_used, budget_limit, usage_pct: (.total_used / .budget_limit * 100)}'
   ```

---

## Quick Start: 3 Commands

### 1. Start Phase 1 (Parallel Execution)

```bash
./scripts/phase1-kickoff.sh
```

This will:
- ✓ Create 10 task specifications
- ✓ Route tasks through MoE (with multi-expert activation)
- ✓ Spawn workers in 4 parallel batches
- ✓ Track progress and collect outcomes
- ✓ Run MoE learning cycle after completion

**Expected Duration**: 2-3 weeks
**Parallel Workers**: Up to 4 concurrent workers per batch

---

### 2. Monitor Progress (Real-Time)

```bash
# Watch active workers
watch -n 5 'cat coordination/worker-pool.json | jq ".workers[] | select(.phase == \"phase1-observability\") | {worker_id, task_id, status}"'

# Or use the dashboard
node dashboard/server/index.js
# Open http://localhost:3000
```

---

### 3. Check Completion Status

```bash
# View task completion
cat coordination/tasks/task-*.json | jq '{task_id, status, quality_score}'

# View MoE learning outcomes
./llm-mesh/moe-learning/moe-learn.sh status
```

---

## Execution Flow

```
Phase 1 Kickoff
    ↓
Create Task Specs (10 tasks)
    ↓
MoE Routing (multi-expert activation)
    ↓
┌─────────────────────────────────────┐
│  Batch 1: Metrics Infrastructure    │
│  - task-metrics-collector           │
│  - task-metrics-schema              │
│  - task-health-monitor              │
│  - task-health-schema               │
│  (4 workers in parallel)            │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  Batch 2: Dashboard Backend         │
│  - task-dashboard-api               │
│  - task-dashboard-aggregation       │
│  - task-dashboard-component         │
│  (3 workers in parallel)            │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  Batch 3: Trace Correlation         │
│  - task-trace-correlator            │
│  - task-trace-viz                   │
│  (2 workers in parallel)            │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  Batch 4: Integration Testing       │
│  - task-integration-tests           │
│  (1 comprehensive worker)           │
└─────────────────────────────────────┘
    ↓
Collect Results & Track Outcomes
    ↓
Run MoE Learning Cycle
    ↓
Phase 1 Complete! ✓
```

---

## MoE Multi-Expert Activation

MoE will automatically activate multiple experts when:
- Primary confidence < 80%
- Multiple experts score > 30%
- Margin between experts < 20%

**Example Multi-Expert Routing**:
```json
{
  "task_id": "task-trace-viz",
  "primary_expert": "development",
  "primary_confidence": 0.72,
  "strategy": "multi_expert_parallel",
  "parallel_experts": ["inventory"],
  "explanation": "Development implements visualization while Inventory documents usage"
}
```

**Benefits**:
- Implementation + documentation in parallel
- Code + security review simultaneously
- Faster delivery with higher quality

---

## Expected Outputs

After Phase 1 completes, you should have:

### New Files Created

```
scripts/lib/
├── llm-metrics-collector.sh          ✓ Metrics collection
├── worker-health-monitor.sh           ✓ Health monitoring
├── trace-correlator.sh                ✓ Trace correlation
└── visualize-llm-trace.sh             ✓ Trace visualization

coordination/
├── metrics/llm-operations.jsonl       ✓ LLM operation logs
├── worker-health-metrics.jsonl        ✓ Health metrics
└── observability/metrics-snapshot.json ✓ Real-time snapshot

dashboard/
├── server/api/observability.js        ✓ API endpoints
└── components/ObservabilityOverview.jsx ✓ UI components
```

### Success Criteria Met

- [ ] Metric coverage ≥ 95%
- [ ] Trace correlation ≥ 95% success rate
- [ ] Dashboard displays real-time data
- [ ] Worker health tracked every 30 seconds
- [ ] 30-day historical data retention
- [ ] Performance overhead < 5%

---

## Troubleshooting

### Issue: Workers Not Spawning

```bash
# Check worker spawn script
ls -la scripts/spawn-worker.sh

# Check permissions
ls -la scripts/spawn-workflow-executor-workers.sh

# Check governance bypass
export GOVERNANCE_BYPASS=true
```

### Issue: MoE Routing Failures

```bash
# Test MoE router directly
bash coordination/masters/coordinator/lib/moe-router.sh \
  test-task "Test task description"

# Check routing patterns
cat coordination/masters/coordinator/knowledge-base/routing-patterns.json | jq .
```

### Issue: Token Budget Exceeded

```bash
# Check current usage
cat coordination/token-budget.json | jq .

# Increase budget (if needed)
jq '.budget_limit = 2000000' coordination/token-budget.json > tmp.json
mv tmp.json coordination/token-budget.json
```

### Issue: Tasks Stuck in Pending

```bash
# Check worker logs
ls -la logs/task-*.log

# View specific task log
cat logs/task-metrics-collector.log

# Check worker pool
cat coordination/worker-pool.json | jq .
```

---

## Manual Task Execution (If Needed)

If parallel execution fails, you can run tasks manually:

```bash
# Execute single task
GOVERNANCE_BYPASS=true ./scripts/spawn-worker.sh \
  --type implementation-worker \
  --task-id task-metrics-collector \
  --master development-master

# Wait for completion
tail -f logs/task-metrics-collector.log

# Track outcome
./llm-mesh/moe-learning/moe-learn.sh track \
  task-metrics-collector completed 0.9
```

---

## After Phase 1 Completion

### 1. Verify All Components

```bash
# Test metrics collection
cat coordination/metrics/llm-operations.jsonl | jq . | head -10

# Test health monitoring
cat coordination/worker-health-metrics.jsonl | jq . | head -5

# Test trace correlation
bash scripts/lib/trace-correlator.sh test-task-001

# View trace visualization
bash scripts/visualize-llm-trace.sh test-task-001
```

### 2. Access Observability Dashboard

```bash
# Start dashboard server
node dashboard/server/index.js

# Open browser
open http://localhost:3000

# Check metrics display
# ✓ LLM operation metrics
# ✓ Worker health status
# ✓ Trace correlation view
# ✓ Real-time updates
```

### 3. Review MoE Learning Outcomes

```bash
# Show learning statistics
./llm-mesh/moe-learning/moe-learn.sh stats

# View routing improvements
cat coordination/knowledge-base/learned-patterns/patterns-latest.json | jq .

# Check routing accuracy improvement
./llm-mesh/moe-learning/moe-learn.sh status
```

### 4. Proceed to Phase 2

```bash
# Once Phase 1 is complete and verified:
echo "✓ Phase 1 Complete - Ready for Phase 2"
echo "Next: Quality & Validation Framework"

# Review Phase 2 plan
cat docs/improvement-phase-strategy.md | grep -A 50 "Phase 2:"
```

---

## Performance Metrics to Track

During Phase 1, monitor these KPIs:

```json
{
  "phase1_metrics": {
    "execution": {
      "total_tasks": 10,
      "concurrent_workers": 4,
      "total_duration_days": 14,
      "time_saved_vs_sequential": "50%",
      "worker_utilization": 0.85
    },
    "moe_routing": {
      "total_routings": 10,
      "multi_expert_activations": 3,
      "routing_accuracy": 0.94,
      "avg_confidence": 0.82
    },
    "quality": {
      "avg_quality_score": 0.88,
      "test_coverage": 0.75,
      "documentation_coverage": 1.0
    },
    "infrastructure": {
      "metric_coverage": 0.96,
      "trace_correlation_success": 0.97,
      "dashboard_uptime": 0.995
    }
  }
}
```

---

## Key Commands Reference

```bash
# Start Phase 1
./scripts/phase1-kickoff.sh

# Monitor progress
watch -n 5 'cat coordination/worker-pool.json | jq ".workers[]"'

# Check status
./llm-mesh/moe-learning/moe-learn.sh status

# View tasks
cat coordination/tasks/*.json | jq '.task_id, .status'

# View logs
tail -f logs/task-*.log

# Track outcome manually
./llm-mesh/moe-learning/moe-learn.sh track <task_id> <status> <quality>

# Run learning cycle
./llm-mesh/moe-learning/moe-learn.sh learn
```

---

## Getting Help

**Documentation**:
- Full strategy: `docs/improvement-phase-strategy.md`
- Parallel implementation: `docs/phase1-parallel-implementation.md`
- Implementation tracker: `IMPLEMENTATION-TRACKER.md`

**Logs**:
- Worker logs: `logs/task-*.log`
- MoE routing: `coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl`
- Dashboard events: `coordination/dashboard-events.jsonl`

**Issues**:
- File an issue in the Cortex repository
- Check existing workers: `cat coordination/worker-pool.json`
- Review governance logs: `coordination/governance/access-log.jsonl`

---

**Ready to start?**

```bash
./scripts/phase1-kickoff.sh
```

This will kick off parallel Phase 1 implementation with MoE multi-expert routing!
