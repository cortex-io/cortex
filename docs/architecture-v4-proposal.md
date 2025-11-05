# Commit-Relay v4.0 Architecture Proposal
## Enhanced Multi-Level Agent Management for Complex Tasks

**Status:** RFC (Request for Comments)
**Created:** 2025-11-05
**Author:** Architecture Planning Session

---

## Current Issues Identified

### Problems We've Experienced Today:
1. **Workers failing on complex tasks** - No proper implementation scaffolding
2. **Zombie workers** - Workers crash/timeout without updating status
3. **Autonomous-worker.sh bottleneck** - Simple bash script can't handle real work
4. **No task decomposition** - Masters spawn single workers for complex multi-file tasks
5. **No progress monitoring** - Can't see what workers are actually doing
6. **Fake completions** - Workers marking tasks complete without doing work

---

## Proposed Architecture: v4.0 "Task Orchestrator" Layer

### Vision Alignment
> "Once I issue an instruction, commit-relay will process my request, assign as many master agents needed, and then each master agent would decide how many worker agents to spawn."

### New Layer: **Task Orchestrator** (Between Coordinator and Masters)

```
USER REQUEST
     ↓
┌────────────────────────────────────────────────┐
│   Coordinator Master (Strategic Planning)      │
│   • Receives user request                      │
│   • Initial task classification                │
│   • Budget allocation                          │
└────────────────┬───────────────────────────────┘
                 ↓
┌────────────────────────────────────────────────┐
│   🆕 TASK ORCHESTRATOR (New Layer)            │
│   • Decomposes complex tasks into subtasks    │
│   • Determines which masters are needed        │
│   • Creates execution plan & dependencies      │
│   • Monitors progress & handles failures       │
│   • Aggregates results                         │
└─────┬──────────┬─────────────┬────────────────┘
      ↓          ↓             ↓
┌──────────┐ ┌──────────┐ ┌──────────┐
│Security  │ │Development│ │Inventory │
│ Master   │ │  Master   │ │ Master   │
└────┬─────┘ └────┬──────┘ └────┬─────┘
     │            │              │
     └────────────┴──────────────┘
              ↓
    ┌─────────────────────┐
    │  Execution Manager  │ (Per Master)
    │  • Task breakdown   │
    │  • Worker spawning  │
    │  • Health monitoring│
    └──────────┬──────────┘
               ↓
    [Worker Pool with Health Checks]
```

---

## Layer Breakdown

### 1. Coordinator Master (Existing, Enhanced)
**Role:** High-level strategic planning
- Receives user requests
- Initial classification (security, development, etc.)
- Budget allocation
- **NEW:** Hands off to Task Orchestrator for complex tasks

### 2. 🆕 Task Orchestrator (New Permanent Agent)
**Role:** Complex task decomposition & multi-master coordination

**Responsibilities:**
- **Task Analysis:** Determine if task is simple (single master) or complex (multi-master)
- **Decomposition:** Break complex tasks into subtasks with dependencies
- **Master Assignment:** Decide which masters are needed and in what order
- **Execution Planning:** Create DAG (Directed Acyclic Graph) of work
- **Progress Tracking:** Monitor all subtasks and workers
- **Failure Recovery:** Detect zombie workers and reassign failed tasks
- **Result Aggregation:** Combine outputs from multiple masters

**Example Flow:**
```javascript
User: "Add authentication system with security audit"

Task Orchestrator analyzes:
1. Subtask 1: Design auth architecture → Development Master
2. Subtask 2: Implement auth endpoints → Development Master (2-3 workers)
3. Subtask 3: Add frontend login UI → Development Master (1-2 workers)
4. Subtask 4: Security scan auth code → Security Master (after #2, #3)
5. Subtask 5: Document auth flow → Development Master (after #4)

Dependencies: 1 → 2,3 → 4 → 5
```

**Key Features:**
- **Permanent process** (like daemon) - always running
- **State machine** - tracks task progress through stages
- **Smart retry logic** - reassigns failed subtasks with context
- **Zombie detection** - monitors worker health actively

### 3. 🆕 Execution Manager (Per Master, Ephemeral)
**Role:** Master-specific task breakdown & worker orchestration

Each master spawns an Execution Manager when receiving complex tasks:

**Responsibilities:**
- **Micro-decomposition:** Break master-specific task into worker-sized chunks
- **Worker Selection:** Choose appropriate worker types
- **Parallel Execution:** Spawn multiple workers when safe
- **Sequential Execution:** Chain workers with dependencies
- **Health Monitoring:** Track worker PIDs and progress
- **Quality Gates:** Verify worker outputs before proceeding

**Example (Development Master):**
```javascript
Task: "Implement dashboard timestamps"

Execution Manager creates:
1. Worker A: Read current dashboard code (exploration)
2. Worker B: Design timestamp implementation (planning)
3. Workers C,D (parallel):
   - C: Modify dashboard-v2.js
   - D: Modify server/index.js
4. Worker E: Test changes (after C,D complete)
5. Worker F: Commit & push (after E succeeds)

Monitor: Each worker's Claude process PID
```

### 4. Enhanced Worker System
**Changes:**

**Worker Types (Specialized):**
- **Explorer Workers** - Read code, gather context (5-10 min, 5k tokens)
- **Planner Workers** - Design approach, create plan (5-10 min, 5k tokens)
- **Implementation Workers** - Write code (15-30 min, 15k tokens)
- **Test Workers** - Run tests, verify changes (5-15 min, 8k tokens)
- **Commit Workers** - Git operations (2-5 min, 2k tokens)

**Worker Features:**
- **Health Heartbeat:** Workers update status every 2 minutes
- **Progress Reporting:** Workers log current step to coordination file
- **Resource Limits:** Strict token/time budgets with enforcement
- **Automatic Cleanup:** Execution Manager kills stale workers
- **Rich Context:** Workers receive decomposed, focused tasks

---

## Anti-Zombie System (Multi-Layered Defense)

### Layer 1: Preventive (Before Zombies Form)
1. **Worker Contracts** - Workers must acknowledge task and provide ETA
2. **Heartbeat Protocol** - Workers update `last_ping` every 2 minutes
3. **Scope Validation** - Task Orchestrator validates task is achievable
4. **Resource Pre-check** - Verify Claude Code CLI is available

### Layer 2: Detection (Early Warning)
1. **Health Monitor Daemon** (every 1 minute check):
   - Check if worker process (PID) is still running
   - Check if `last_ping` is < 3 minutes old
   - Check if task is taking > expected time
   - Alert if no progress in 5 minutes

2. **Execution Manager Monitoring** (per master):
   - Track worker progress through subtasks
   - Detect stuck workers (no file modifications in 10 min)
   - Watch for infinite loops or blocking operations

### Layer 3: Remediation (When Detected)
1. **Zombie Killer Daemon** (current, enhanced):
   - Runs every 5 minutes
   - Marks workers as "zombie" if:
     - Status="running" AND process not found AND >15 min old
     - Status="running" AND no heartbeat >5 min
     - Status="running" AND no file changes >20 min
   - Moves to failed/ with detailed error
   - **NEW:** Notifies Task Orchestrator for reassignment

2. **Smart Reassignment**:
   - Task Orchestrator detects failed subtask
   - Analyzes failure reason (timeout, crash, etc.)
   - Adjusts task (break down further, add context, change worker type)
   - Reassigns to different worker with enriched context

### Layer 4: Learning (Prevention Improvement)
1. **Failure Analysis** - Log why worker failed
2. **Pattern Recognition** - Identify common failure modes
3. **Task Complexity Scoring** - Learn which tasks need breakdown
4. **Success Rate Tracking** - Monitor worker type effectiveness

---

## Implementation Phases

### Phase 1: Task Orchestrator (Week 1)
- [ ] Create Task Orchestrator agent prompt
- [ ] Build task decomposition logic
- [ ] Implement dependency graph (DAG)
- [ ] Add subtask tracking
- [ ] Basic multi-master coordination

### Phase 2: Execution Managers (Week 2)
- [ ] Create Execution Manager template
- [ ] Implement in Development Master
- [ ] Add worker health monitoring
- [ ] Build parallel/sequential execution
- [ ] Test with multi-file changes

### Phase 3: Enhanced Workers (Week 3)
- [ ] Split worker types (Explorer, Planner, etc.)
- [ ] Add heartbeat protocol
- [ ] Implement progress reporting
- [ ] Create focused worker prompts
- [ ] Add resource limit enforcement

### Phase 4: Anti-Zombie System (Week 4)
- [ ] Enhance Health Monitor Daemon
- [ ] Upgrade Zombie Killer with reasoning
- [ ] Add smart reassignment logic
- [ ] Implement failure analysis
- [ ] Build learning system

---

## Best Practices & Safeguards

### Task Decomposition Rules
1. **Single Responsibility:** Each subtask does ONE thing
2. **File Boundary:** Subtasks shouldn't modify >3 files
3. **Time Limit:** Subtasks should take <20 minutes
4. **Token Budget:** Workers get <20k tokens
5. **Clear Output:** Each subtask has measurable success criteria

### Zombie Prevention Rules
1. **Always PID Track:** Record worker process ID at launch
2. **Mandatory Heartbeat:** Workers must ping every 2 minutes
3. **Progress Logging:** Workers log current step to coordination file
4. **Timeout Enforcement:** Kill workers exceeding time limit
5. **Health Checks:** Monitor workers every 1 minute

### Coordination Patterns
1. **State Machine:** Tasks move through defined stages
2. **Event Sourcing:** All state changes logged to events
3. **Idempotency:** Rerunning subtasks is safe
4. **Isolation:** Workers don't share state
5. **Rollback:** Failed subtasks can be undone

### Bottleneck Mitigation
1. **Parallel Execution:** Independent subtasks run simultaneously
2. **Resource Pooling:** Share token budget efficiently
3. **Lazy Loading:** Don't spawn workers until needed
4. **Caching:** Reuse results from previous workers
5. **Circuit Breakers:** Stop cascading failures

---

## Example: Complex Task Flow

**User Request:** "Build user authentication system with tests and security audit"

### Task Orchestrator Execution Plan:

```yaml
task_id: "auth-system-001"
complexity: "high"
estimated_duration: "2-3 hours"
estimated_tokens: 120000

subtasks:
  - id: "auth-001-design"
    master: "development"
    description: "Design authentication architecture"
    dependencies: []
    workers: 1
    type: "planner"

  - id: "auth-002-backend"
    master: "development"
    description: "Implement auth API endpoints"
    dependencies: ["auth-001-design"]
    workers: 2
    type: "implementation"
    files: ["server/routes/auth.js", "server/middleware/auth.js"]

  - id: "auth-003-frontend"
    master: "development"
    description: "Build login/signup UI"
    dependencies: ["auth-001-design"]
    workers: 2
    type: "implementation"
    files: ["client/pages/Login.jsx", "client/pages/Signup.jsx"]

  - id: "auth-004-tests"
    master: "development"
    description: "Write auth tests"
    dependencies: ["auth-002-backend", "auth-003-frontend"]
    workers: 1
    type: "test"

  - id: "auth-005-security"
    master: "security"
    description: "Security audit auth implementation"
    dependencies: ["auth-004-tests"]
    workers: 1
    type: "scan"

  - id: "auth-006-docs"
    master: "development"
    description: "Document auth flow"
    dependencies: ["auth-005-security"]
    workers: 1
    type: "documentation"

execution_order:
  stage_1: ["auth-001-design"]
  stage_2: ["auth-002-backend", "auth-003-frontend"]  # Parallel
  stage_3: ["auth-004-tests"]
  stage_4: ["auth-005-security"]
  stage_5: ["auth-006-docs"]
```

### Progress Tracking:

```json
{
  "task_id": "auth-system-001",
  "status": "in_progress",
  "current_stage": 2,
  "completed_subtasks": ["auth-001-design", "auth-002-backend"],
  "active_subtasks": ["auth-003-frontend"],
  "failed_subtasks": [],
  "zombie_subtasks": [],
  "workers": {
    "total_spawned": 5,
    "active": 2,
    "completed": 3,
    "failed": 0,
    "zombies": 0
  },
  "health": {
    "last_check": "2025-11-05T17:30:00Z",
    "all_workers_healthy": true,
    "stale_workers": []
  }
}
```

---

## Decision Points

### Should Task Orchestrator be:
**Option A: Permanent Daemon** (Recommended)
- ✅ Always running, instant response
- ✅ Can monitor all tasks continuously
- ✅ Maintains state across requests
- ❌ Another process to manage

**Option B: Ephemeral Agent**
- ✅ Only runs when needed
- ✅ Simpler deployment
- ❌ Startup latency
- ❌ Can't continuously monitor

**Recommendation:** Permanent Daemon for production

### Should Execution Managers be:
**Option A: Ephemeral (Spawned per Task)** (Recommended)
- ✅ Isolated state per task
- ✅ Automatic cleanup when done
- ✅ Scales naturally
- ❌ Slight startup overhead

**Option B: Permanent (One per Master)**
- ✅ No startup time
- ❌ State management complexity
- ❌ Single point of failure

**Recommendation:** Ephemeral for flexibility

---

## Metrics & Observability

### Dashboard Enhancements Needed:
1. **Task Orchestrator View:**
   - Current task breakdown
   - Dependency graph visualization
   - Progress through stages
   - Bottleneck identification

2. **Worker Health Dashboard:**
   - Real-time worker status
   - Heartbeat indicators
   - Resource usage per worker
   - Zombie alerts

3. **Performance Analytics:**
   - Task complexity vs success rate
   - Average time per subtask type
   - Worker type effectiveness
   - Failure pattern analysis

---

## Next Steps

1. **Review & Feedback:** Discuss this architecture proposal
2. **Prototype:** Build minimal Task Orchestrator
3. **Test:** Try complex task (e.g., auth system)
4. **Iterate:** Refine based on real usage
5. **Document:** Create implementation guide

---

## Questions for Discussion

1. Should Task Orchestrator be permanent daemon or ephemeral?
2. How granular should task decomposition be?
3. What's acceptable worker timeout (15min? 30min? 60min?)?
4. Should we implement rollback/undo for failed subtasks?
5. How do we handle tasks requiring human input mid-execution?

---

**Ready to discuss and refine this architecture?** 🚀
