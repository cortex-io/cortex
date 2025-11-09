# Current State vs. Desired State

## Master Initialization

### CURRENT STATE
```
Single Master (Shell Script):
┌─────────────────────────────┐
│ run-security-master.sh      │
│  (runs once, then exits)    │
│                             │
│ - Source libs              │
│ - Acquire lock             │
│ - Find pending tasks       │
│ - Spawn workers            │
│ - Release lock             │
│ - EXIT                     │
└────────────┬────────────────┘
             │
      ┌──────▼──────┐
      │ worker pool │ (but not launched)
      └─────────────┘

Issues:
- No persistent master
- No orchestration
- No inter-master communication
- Workers created but not spawned
```

### DESIRED STATE
```
Hierarchical Master System:
┌──────────────────────────────────────────────────┐
│         Coordinator Master (persistent)          │
│  - Decomposes tasks                             │
│  - Manages worker pools                         │
│  - Orchestrates other masters                   │
│  - Monitors system health                       │
└────────────┬─────────────────────────────────────┘
             │
        ┌────┴─────┬─────────────┬─────────────┐
        │           │             │             │
   ┌────▼───┐  ┌────▼───┐  ┌─────▼────┐  ┌────▼──────┐
   │Security│  │  Dev   │  │ Inventory│  │   Future  │
   │ Master │  │ Master │  │ Master   │  │  Masters  │
   │        │  │        │  │          │  │           │
   │ - Scan │  │ - Plan │  │ - Catalog│  │  Separate │
   │ - Fix  │  │ - Build│  │ - Track  │  │ instances │
   │ - Audit│  │ - Test │  │ - Report │  │ with own  │
   └─┬──────┘  └────┬───┘  └────┬─────┘  │ context  │
     │              │            │        └─────────┘
  ┌──▼──┐        ┌──▼──┐     ┌──▼──┐
  │Work-│        │Work-│     │Work-│
  │ers  │        │ers  │     │ers  │
  │pool │        │pool │     │pool │
  └─────┘        └─────┘     └─────┘

Benefits:
- Persistent orchestration
- Parallel execution
- Inter-master coordination
- Worker lifecycle management
- System monitoring
```

---

## Context Management

### CURRENT STATE
```
Master → Worker (minimal context):

Task in task-queue.json
    ↓
Extracted parameters:
  - repository
  - task_id
  - priority
    ↓
Worker spec created:
{
  "worker_id": "worker-scan-007",
  "created_by": "security",  ← STRING ONLY
  "task_id": "task-012",
  "scope": {...}
  "context": {
    "parent_task": "task-012",
    "priority": "high"
  }
}
    ↓
Worker reads spec
Worker loads hardcoded prompt
Worker executes task
Worker has NO ACCESS TO:
  ✗ Master's knowledge base
  ✗ Master's strategy decisions
  ✗ Master's previous learnings
  ✗ Master's specialized expertise
```

### DESIRED STATE
```
Master → Worker (rich context):

Master's Context Memory
  ├─ knowledge-base.json
  ├─ strategy-decisions.md
  ├─ previous-patterns.json
  └─ expertise-profile.json
        ↓
Worker spec created:
{
  "worker_id": "worker-scan-007",
  "created_by": "security-master",
  "task_id": "task-012",
  "scope": {...},
  "context": {
    "parent_task": "task-012",
    "priority": "high",
    "master_context": {
      "master_knowledge": "masters/security/knowledge-base.json",
      "master_strategy": "masters/security/strategy.md",
      "relevant_patterns": [...],
      "previous_decisions": [...]
    }
  }
}
    ↓
Worker reads spec
Worker loads master context
Worker loads specialized prompt
Worker loads relevant historical data
Worker has ACCESS TO:
  ✓ Master's knowledge base
  ✓ Master's strategy decisions
  ✓ Master's previous learnings
  ✓ Master's specialized expertise
  ✓ Similar past tasks
  ✓ Patterns and best practices
```

---

## Worker Execution Flow

### CURRENT STATE
```
7 pending workers (created but not running)
    ↓
worker-daemon.sh not running
    ↓
start-worker.sh never called
    ↓
Workers stuck in "pending" state
    ↓
No results generated
    ↓
No callback to master
    ↓
Master has no way to know status
```

### DESIRED STATE
```
Master spawns worker
    ↓
worker-daemon.sh polls worker-specs/active/
    ↓
Finds worker with status: "pending"
    ↓
Updates status to "running"
    ↓
Launches Claude CLI with worker prompt
    ↓
Worker executes task independently
    ↓
Worker updates status: "completed"
    ↓
Worker writes results to agents/logs/workers/
    ↓
Worker updates worker-pool.json
    ↓
Master polls worker-pool.json
    ↓
Master sees completed status
    ↓
Master reads worker results
    ↓
Master aggregates results
    ↓
Master creates next tasks or handoffs
```

---

## Context Isolation

### CURRENT STATE
```
All masters share:
  ├─ task-queue.json (shared)
  ├─ worker-pool.json (shared)
  ├─ token-budget.json (shared)
  ├─ handoffs.json (shared)
  └─ repository-inventory.json (shared)

No per-master files:
  ✗ security-master knowledge base
  ✗ development-master patterns
  ✗ coordinator strategy log
  ✗ inventory master catalog

Result: No isolation, no specialization
```

### DESIRED STATE
```
Shared coordination layer:
  ├─ task-queue.json (shared)
  ├─ worker-pool.json (shared)
  ├─ token-budget.json (shared)
  └─ handoffs.json (shared)

Per-master context:
  ├─ coordination/masters/coordinator/
  │   ├─ orchestration-log.md
  │   ├─ strategy.md
  │   └─ system-state.json
  ├─ coordination/masters/security/
  │   ├─ knowledge-base.json
  │   ├─ vulnerability-patterns.md
  │   ├─ strategy-decisions.md
  │   └─ historical-findings.json
  ├─ coordination/masters/development/
  │   ├─ architecture-decisions.json
  │   ├─ code-patterns.md
  │   ├─ technical-debt-log.md
  │   └─ design-guidelines.md
  └─ coordination/masters/inventory/
      ├─ repo-metadata.json
      ├─ discovery-log.md
      └─ catalog-status.json

Result: Each master has its own knowledge
        Workers inherit specialized context
        Better decision-making possible
```

---

## Token Budget Tracking

### CURRENT STATE
```
token-budget.json:
{
  "worker_pool": {
    "total": 80,000,
    "allocated_to_workers": 107,500,  ← OVERSPENT
    "available": -27,500              ← NEGATIVE
  }
}

What happened:
  7 workers × 8,000 tokens = 56,000 allocated
  Workers never launched
  Tokens never reclaimed
  Budget shows impossible state
  System cannot spawn new workers

Root cause:
  ✗ No timeout enforcement
  ✗ No token reclamation on failure
  ✗ Tokens deducted at creation, not execution
  ✗ No mechanism to handle pending workers
```

### DESIRED STATE
```
token-budget.json:
{
  "worker_pool": {
    "total": 80,000,
    "allocated_to_workers": 24,000,    ← ACTUAL USE
    "reserved_pending": 0,              ← CLEARED
    "available": 56,000                 ← POSITIVE
  }
}

Tracking improvements:
  ✓ Tokens reserved at creation
  ✓ Tokens deducted at execution start
  ✓ Tokens reclaimed on timeout (after 15m)
  ✓ Tokens reclaimed on failure
  ✓ Accurate "pending" vs "in-use" tracking
  ✓ Can spawn new workers
  ✓ Budget never goes negative

Budget enforcement:
  ✓ Cannot spawn if insufficient budget
  ✓ Coordinator monitors budget
  ✓ Alerts at 75% usage
  ✓ Emergency reserve protected
  ✓ Token efficiency tracked
```

---

## ASI/MoE/RAG Implementation

### CURRENT STATE
```
No specialization:
  ✗ All masters use generic prompts
  ✗ All workers use generic prompts
  ✗ No specialized expertise
  ✗ No knowledge differentiation
  ✗ No historical context reuse
  ✗ No expert routing
  ✗ Each task starts from zero

Result: Lost potential for efficiency
        No learning across tasks
        Workers can't benefit from expertise
```

### DESIRED STATE
```
ASI (Agent Specialized Intelligence):
  ✓ Security Master knows vulnerabilities
  ✓ Development Master knows architecture
  ✓ Inventory Master knows repo structure
  ✓ Specialized prompts for each master
  ✓ Specialized prompts for worker types

MoE (Mixture of Experts):
  ✓ Coordinator selects expert for task
  ✓ Routing logic based on task type
  ✓ Load balancing across experts
  ✓ Skill-matching between task and agent

RAG (Retrieval-Augmented Generation):
  ✓ Historical decision retrieval
  ✓ Previous task context lookup
  ✓ Similar pattern detection
  ✓ Best practice caching
  ✓ Worker guidance from past solutions

Token efficiency gain: 80-90% reduction
  vs. current: 0% (no specialization)
```

---

## File Structure Comparison

### CURRENT
```
scripts/
├─ run-security-master.sh           (ONLY master script)
├─ spawn-worker.sh                  (worker creation)
├─ worker-daemon.sh                 (launcher - but not running)
├─ start-worker.sh                  (manual start - never used)
└─ lib/
    ├─ coordination.sh              (basic file ops)
    └─ logging.sh                   (logging)

agents/prompts/
├─ coordinator-master.md            (defined but never used)
├─ development-master.md            (defined but never used)
├─ security-master.md               (defined but never used)
├─ inventory-master.md              (defined but never used)
└─ workers/
    ├─ scan-worker.md
    ├─ fix-worker.md
    ├─ implementation-worker.md
    └─ ... (8 worker prompts)

coordination/
├─ task-queue.json                  (12 tasks)
├─ worker-pool.json                 (7 pending, 6 done)
├─ token-budget.json                (overspent)
├─ handoffs.json                    (3 completed)
├─ repository-inventory.json        (11 repos)
└─ worker-specs/
    └─ active/ (7 pending workers)
```

### DESIRED
```
scripts/
├─ run-coordinator-master.sh        (NEW - central orchestrator)
├─ run-security-master.sh           (ENHANCED - context aware)
├─ run-development-master.sh        (NEW - dev orchestration)
├─ run-inventory-master.sh          (NEW - inventory management)
├─ spawn-worker.sh                  (ENHANCED - context passing)
├─ worker-daemon.sh                 (FIXED - actually running)
└─ lib/
    ├─ coordination.sh              (ENHANCED - context management)
    ├─ logging.sh                   (unchanged)
    └─ context.sh                   (NEW - context lookups)

agents/prompts/
├─ masters/
│   ├─ coordinator-master.md
│   ├─ security-master.md           (specialized)
│   ├─ development-master.md        (specialized)
│   └─ inventory-master.md          (specialized)
└─ workers/
    ├─ scan-worker.md               (context-aware)
    ├─ fix-worker.md                (context-aware)
    └─ ... (8 workers, all enhanced)

coordination/
├─ task-queue.json                  (enhanced schema)
├─ worker-pool.json                 (enhanced tracking)
├─ token-budget.json                (fixed tracking)
├─ handoffs.json                    (enhanced context)
├─ repository-inventory.json        (auto-updated)
├─ worker-specs/
│   └─ active/ (properly launched)
└─ masters/
    ├─ coordinator/
    │   ├─ orchestration-log.md
    │   └─ system-state.json
    ├─ security/
    │   ├─ knowledge-base.json
    │   ├─ vulnerability-patterns.md
    │   ├─ strategy-decisions.md
    │   └─ historical-findings.json
    ├─ development/
    │   ├─ architecture-decisions.json
    │   ├─ code-patterns.md
    │   └─ technical-debt-log.md
    └─ inventory/
        ├─ repo-metadata.json
        └─ discovery-log.md
```

---

## System Autonomy

### CURRENT STATE
```
Autonomy level: 10%

What requires manual intervention:
  ✗ Creating tasks (manual entry to task-queue.json)
  ✗ Running security master (manual script execution)
  ✗ Running dev master (script doesn't exist)
  ✗ Running coordinator (script doesn't exist)
  ✗ Starting workers (daemon not running)
  ✗ Aggregating results (manual review)
  ✗ Creating new tasks from findings (manual)

What runs automatically:
  ✓ Worker specification creation (via spawn-worker.sh)
  ✓ Git commits (via scripts)
  ✓ Status updates (partial)
```

### DESIRED STATE
```
Autonomy level: 90%

Fully automated:
  ✓ Coordinator checks task queue (every hour)
  ✓ Coordinator decomposes complex tasks
  ✓ Coordinator spawns appropriate workers
  ✓ Coordinator monitors worker progress
  ✓ Worker daemon auto-launches workers
  ✓ Workers execute independently
  ✓ Workers report results automatically
  ✓ Masters aggregate results
  ✓ Masters create follow-up tasks
  ✓ Masters hand off between each other
  ✓ System monitors itself continuously
  ✓ Alerts on anomalies

What still needs human:
  - Strategic decisions on architecture
  - Approval of major changes
  - Budget overrides
  - Policy/security decisions
  - System configuration changes
```

---

## Summary: Current Gap

| Aspect | Current | Desired | Gap |
|--------|---------|---------|-----|
| Masters | 1 script | 4 instances | 3 missing |
| Context isolation | None | Per-master | Complete |
| Worker launching | 0/7 | 7/7 | All stuck |
| Context passing | Task params only | Full context + knowledge | Major |
| ASI implementation | 0% | 100% | Complete |
| MoE implementation | 0% | 100% | Complete |
| RAG implementation | 0% | 100% | Complete |
| Token budget tracking | Broken (-27.5k) | Accurate | Fix needed |
| System autonomy | 10% | 90% | Major work |
| Master orchestration | None | Hierarchical | Complete |

