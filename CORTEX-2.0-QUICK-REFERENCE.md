# Cortex 2.0: Quick Reference Guide
**One-Page Overview for Engineers**

---

## The Goal

**Scale from 20 to 100 concurrent agents on M1 Mac** with sub-second coordination, zero zombies, and 5-minute onboarding.

---

## The Problem Today

```
Current Bottlenecks:
├── File I/O Contention ────────── 20s queuing at 100 agents
├── Worker Lifecycle ───────────── 85% become zombies (153/180)
├── Token Budget ───────────────── -148% over-allocated
├── Coordination Latency ───────── 90s polling delays
└── No Resource Management ─────── Workers spawn unconditionally
```

---

## The Solution

```
Three Core Innovations:
├── 1. Async Coordination Daemon
│   ├── Memory-mapped shared state
│   ├── 1,000 ops/sec throughput
│   └── <100ms coordination latency
│
├── 2. Worker Pool (20 persistent)
│   ├── 95% worker reuse
│   ├── <50ms spawn time
│   └── Zero zombie accumulation
│
└── 3. Intelligent Scheduler
    ├── ML-powered predictions
    ├── Preemptive feasibility checks
    └── Graceful queuing (no failures)
```

---

## Performance Comparison

| Metric | Today | Cortex 2.0 | Improvement |
|--------|-------|------------|-------------|
| **Agents Supported** | 20 | 100 | **5x** |
| **Coordination Latency** | 90s | <500ms | **180x** |
| **Worker Spawn** | 500ms | <50ms | **10x** |
| **Zombie Workers** | 85% | 0% | **Eliminated** |
| **Task Completion** | 1.7% | >90% | **53x** |
| **Onboarding Time** | 30min | <5min | **6x** |

---

## Architecture Comparison

### Before (Synchronous Polling)
```
Master ──(poll 30s)──► Files ──(spawn)──► Worker
                        ↑                    ↓
                        └──────(update)──────┘
Problem: File locks, polling delays, zombies
```

### After (Async Event-Driven)
```
Master ──(pub/sub)──► Memory ──(pool)──► Worker Pool
                        ↑                    ↓
                    Files (snapshot 10s) ←──┘
Solution: No locks, <10ms latency, reuse workers
```

---

## Timeline (16 Weeks)

```
Phase 0: Planning         │██│ 2 weeks
Phase 1: Quick Wins       │████│ 4 weeks  → 3x improvement
Phase 2: Foundation       │██████│ 6 weeks  → 10x improvement
Phase 3: Scale Validation │████│ 4 weeks  → 100 agents
```

---

## Investment

| Resource | Amount |
|----------|--------|
| **Engineers** | 4-8 (overlapping phases) |
| **Duration** | 16 weeks (4 months) |
| **Effort** | 84 engineer-weeks |
| **Hardware** | $0 (existing M1 Macs) |
| **Cloud** | $600 (PostgreSQL + S3) |

---

## Risk Level by Phase

```
Phase 1: 🟢 LOW    (feature flags, instant rollback)
Phase 2: 🟡 MEDIUM (gradual rollout 10%→50%→100%)
Phase 3: 🟡 MEDIUM (load testing, tuning required)
```

---

## Key Files to Create

### Phase 1 (Quick Wins)
```
scripts/worker-pool-daemon.sh         # Persistent 20-worker pool
scripts/lib/token-budget-atomic.sh    # Atomic budget operations
lib/observability/event-router.js     # Async event processing
```

### Phase 2 (Foundation)
```
lib/coordination/daemon.js            # Async coordination daemon
lib/coordination/memory-map.js        # Memory-mapped state
lib/scheduler/predictor.py            # ML resource predictions
lib/scheduler/priority-queue.js       # SLA-aware task queue
```

### Phase 3 (Scale)
```
testing/load-test-100-agents.sh       # 100-agent simulation
docs/operator-runbook.md              # Production operations
docs/developer-onboarding.md          # 5-minute quickstart
```

---

## Success Criteria (Must Achieve)

```
✅ 100 concurrent agents running smoothly
✅ <500ms P95 coordination latency
✅ Zero zombie workers over 24 hours
✅ >90% task completion rate
✅ <5 minute developer onboarding
✅ <60% CPU, <4GB RAM usage
```

---

## Go/No-Go Decision Points

### After Phase 1 (Week 6)
**Evaluate**:
- Worker pool 10x faster?
- Token budget controlled?
- Async events <1s latency?
- Zero production issues?

**Decision**: Proceed to Phase 2 or pivot?

### After Phase 2 (Week 12)
**Evaluate**:
- Coordination <100ms latency?
- Scheduler predictions >80% accurate?
- 50 agents running smoothly?
- Rollback successful?

**Decision**: Proceed to Phase 3 or optimize?

---

## Quick CLI Reference (Future)

### Today (Complex)
```bash
# Start system
./scripts/daemon-control.sh start coordinator
./scripts/daemon-control.sh start worker
# ... repeat for each daemon

# Submit task
vim coordination/task-queue.json  # Manual JSON editing

# Check status
cat coordination/worker-pool.json | jq '.active_workers | length'
```

### Cortex 2.0 (Simple)
```bash
# Start system
cortex start  # One command

# Submit task
cortex task create --type dev --description "Add README"

# Check status
cortex status  # Pretty-printed dashboard

# Watch live
cortex tail  # Real-time event stream
```

---

## Key Innovations Explained

### 1. Memory-Mapped State
**Problem**: File locks block concurrent access
**Solution**: Memory-mapped file acts as shared memory
```
┌──────────────────────────────────┐
│   Memory (10,000 workers max)    │ ← All agents read/write here
├──────────────────────────────────┤
│   Periodic Snapshot (10s)        │ → Async write to JSON
└──────────────────────────────────┘
```
**Benefit**: 1,000 ops/sec vs. 10 ops/sec today

### 2. Worker Pool
**Problem**: Spawning process per task = 500ms overhead
**Solution**: 20 persistent workers, reused via task queue
```
Worker Pool (20 persistent processes)
├── worker-001: [Task 5] → [Task 12] → [Task 23] → (idle)
├── worker-002: [Task 7] → [Task 15] → [Task 27] → (idle)
└── ... (18 more)
```
**Benefit**: <50ms assignment vs. 500ms spawn

### 3. Intelligent Scheduler
**Problem**: No resource checks before spawn → thrashing
**Solution**: ML model predicts requirements, queues if insufficient
```
Task Arrives → Predict Resources → Check Available
    ↓                                      ↓
Can Spawn?                          Queue for Later
    ↓                                      ↓
Assign to Worker Pool          Notify Task Queued
```
**Benefit**: Zero failures, graceful degradation

---

## Files Changed vs. Files Added

### Minimal Changes to Existing
- `coordination/*.json` → Add async write layer (wrapper)
- `scripts/spawn-worker.sh` → Route through pool manager
- `scripts/lib/coordination.sh` → Add async ops (backward compatible)

### New Components
- `lib/coordination/daemon.js` (NEW)
- `scripts/worker-pool-daemon.sh` (NEW)
- `lib/scheduler/` (NEW)
- `cortex` CLI tool (NEW)

**Philosophy**: Enhance, don't replace. Keep file-based foundation.

---

## Testing Strategy

### Phase 1 Testing
```bash
# Unit tests
npm test lib/observability/event-router.test.js

# Integration tests
./testing/worker-pool-integration-test.sh

# Load tests (20 workers, 100 tasks)
./testing/load-test-phase1.sh
```

### Phase 2 Testing
```bash
# Coordination daemon tests
npm test lib/coordination/daemon.test.js

# Scheduler accuracy tests
python testing/scheduler-accuracy-test.py

# Load tests (50 workers, 500 tasks)
./testing/load-test-phase2.sh
```

### Phase 3 Testing
```bash
# Full system load test (100 workers, 1,000 tasks)
./testing/load-test-100-agents.sh

# Chaos testing (kill random processes, check recovery)
./testing/chaos-test.sh

# 24-hour stability test
./testing/stability-test-24h.sh
```

---

## Rollback Plan (Every Phase)

```bash
# Phase 1 rollback
export CORTEX_USE_WORKER_POOL=false
systemctl restart cortex-coordination

# Phase 2 rollback
export CORTEX_USE_ASYNC_DAEMON=false
systemctl restart cortex-coordination

# Instant rollback via feature flags (no redeployment needed)
```

---

## Metrics Dashboard (Phase 3)

```
┌─────────────────────────────────────────────────────────────┐
│  Cortex 2.0 Dashboard                       [Live]          │
├─────────────────────────────────────────────────────────────┤
│  Workers: 85/100 active  15 idle            CPU: 48%        │
│  Tasks: 127 pending  85 running  2,341 completed            │
│  Tokens: 387K / 500K available  (77% free)                  │
│                                                              │
│  Recent Events (live stream):                               │
│  [12:34:56] task.created task-451 (development)             │
│  [12:34:57] worker.assigned worker-pool-042 → task-451      │
│  [12:34:58] task.executing Implementing feature...          │
│                                                              │
│  Performance (last hour):                                   │
│  ├─ P50 coordination: 87ms                                  │
│  ├─ P95 coordination: 312ms                                 │
│  ├─ P99 coordination: 489ms                                 │
│  └─ Task completion rate: 94%                               │
└─────────────────────────────────────────────────────────────┘
```

---

## When to Stop Optimizing

### Don't Optimize If:
- ✅ <500ms P95 coordination latency achieved
- ✅ Zero zombie workers over 24h
- ✅ >90% task completion rate
- ✅ <60% CPU, <4GB RAM

### Optimize Further If:
- ❌ P95 latency >1s
- ❌ Zombie workers appearing
- ❌ Task completion <85%
- ❌ CPU >80% or RAM >8GB

**Rule**: Meet success criteria, then stop. Premature optimization wastes time.

---

## Questions?

**Full Details**: See `CORTEX-2.0-VISION.md` (30+ pages)
**Executive Summary**: See `CORTEX-2.0-EXECUTIVE-SUMMARY.md`
**This Guide**: Quick reference for engineers

---

**Last Updated**: 2025-12-05
**Maintained by**: Team Juliet
**Status**: Ready for Implementation
