# Coordinator Master Agent Contracts

## Overview

The Coordinator Master is the central routing and orchestration agent responsible for task distribution, resource allocation, and cross-master coordination.

**Agent ID**: `coordinator`
**Schema**: `master-state.schema.json`
**Status**: Active

## Core Responsibilities

1. **Task Routing**: Route incoming tasks to appropriate specialist masters
2. **MoE Integration**: Use Mixture of Experts for intelligent routing decisions
3. **Resource Allocation**: Manage worker pool allocation across streams
4. **Health Monitoring**: Track master and worker health status
5. **Results Aggregation**: Collect and consolidate task results

## Input Contracts

### Task Queue Entry
**Schema**: `task-queue-entry.schema.json`

```json
{
  "id": "task-1762553459",
  "title": "Task description",
  "type": "feature|bug|security_scan|development|...",
  "priority": "critical|high|medium|low",
  "status": "pending",
  "created_at": "2025-11-11T00:00:00Z",
  "context": {
    "description": "Detailed description",
    "requirements": ["req1", "req2"],
    "repository": "org/repo"
  }
}
```

**Required Fields**:
- `id`: Pattern `^(task-[0-9]+|test-task-[0-9]+)$`
- `title`: 5-200 characters
- `type`: Must be valid enum value
- `priority`: Must be critical/high/medium/low
- `status`: Must be valid status enum
- `created_at`: ISO 8601 timestamp

## Output Contracts

### Handoff to Specialist Master
**Schema**: `handoff.schema.json`

```json
{
  "handoff_id": "coord-to-development-GUID",
  "from_master": "coordinator",
  "to_master": "development|security|inventory|cicd",
  "task_id": "task-1762553459",
  "task_data": { ... },
  "context": {
    "routing_reason": "MoE routing with confidence 0.95",
    "priority": "high",
    "expected_outcome": "Task completion with results handoff",
    "moe_metadata": {
      "confidence": "0.95",
      "strategy": "single_expert",
      "routed_at": "2025-11-11T00:00:00Z"
    }
  },
  "created_at": "2025-11-11T00:00:00Z",
  "status": "pending_pickup"
}
```

**Required Fields**:
- `handoff_id`: Pattern `^[a-z]+-to-[a-z]+-[A-F0-9-]{36}$`
- `from_master`: Must be "coordinator"
- `to_master`: Must be valid specialist master
- `task_id`: Valid task ID pattern
- `status`: Must be valid handoff status

### Routing Decision Log
**Schema**: `routing-decision.schema.json`

```json
{
  "task_id": "task-1762553459",
  "routed_to": "development",
  "rule_used": "code-development",
  "confidence": 0.95,
  "timestamp": "2025-11-11T00:00:00Z",
  "reasoning": "Clear development pattern match",
  "outcome": "assigned"
}
```

**Required Fields**:
- `task_id`: Valid task ID
- `routed_to`: Valid master name
- `rule_used`: Valid routing rule enum
- `confidence`: 0.0-1.0
- `timestamp`: ISO 8601 timestamp

## State Contract

### Master State File
**Location**: `coordination/masters/coordinator/context/master-state.json`
**Schema**: `master-state.schema.json`

```json
{
  "master_id": "coordinator",
  "master_name": "Coordinator Master",
  "initialized_at": "2025-11-11T00:00:00Z",
  "session_id": "UUID",
  "status": "active",
  "capabilities": [
    "task_routing",
    "resource_allocation",
    "cross_master_coordination",
    "priority_management",
    "results_aggregation"
  ],
  "specialist_masters": {
    "development": {
      "status": "available|busy|offline",
      "workload": 5,
      "last_contact": "2025-11-11T00:00:00Z",
      "current_tasks": ["task-001", "task-002"]
    }
  },
  "completed_tasks": 42,
  "tasks_routed": 100,
  "last_run": "2025-11-11T00:00:00Z"
}
```

**Update Frequency**: Every routing decision
**Persistence**: Must survive process restarts

## Behavioral Contracts

### Routing Algorithm

1. **Load Task**: Read from task queue with validation
2. **Extract Features**: Analyze title, description, type, context
3. **Query MoE Router**: Get routing recommendation with confidence
4. **Select Strategy**:
   - `confidence >= 0.85`: single_expert
   - `0.50 <= confidence < 0.85`: single_expert_low_confidence
   - `0.30 <= confidence < 0.50`: ensemble
   - `confidence < 0.30`: sparse_pool or escalate
5. **Create Handoff**: Generate handoff file with all metadata
6. **Log Decision**: Append to routing-decisions.jsonl
7. **Update State**: Update master state and specialist workload

### Handoff Protocol

**Handoff Creation**:
```bash
# Atomic write with validation
safeWriteJSON(handoffPath, handoffData, 'handoff', {
  backup: true,
  repair: true,
  pretty: true
});
```

**Handoff Lifecycle**:
1. `pending_pickup` - Created by coordinator
2. `picked_up` - Acknowledged by specialist master
3. `in_progress` - Work underway
4. `completed` - Work finished, results available
5. `failed` - Work failed, error details in handoff

### Error Handling

**Validation Failures**:
- Auto-repair attempted for common errors
- If repair fails, escalate to commit-relay meta-agent
- Log detailed errors to coordinator logs

**Routing Failures**:
- If no master available: queue task with retry
- If all confidence < 0.20: escalate to meta-agent
- If master offline: redistribute to available masters

**Timeout Handling**:
- Task timeout: 24 hours default
- Handoff timeout: 1 hour pickup, 4 hours completion
- Stuck detection: Check every 30 minutes

## Performance Contracts

### Latency SLAs
- Task routing: < 1 second (p95)
- Handoff creation: < 500ms (p95)
- State updates: < 200ms (p99)

### Throughput
- Tasks routed: > 100/hour sustained
- Handoffs created: > 50/hour sustained

### Resource Limits
- Token budget: 5k tokens per routing session
- Memory: < 100MB resident
- CPU: < 10% average utilization

## Integration Points

### Inputs
- `coordination/task-queue.json` - New tasks to route
- `coordination/memory/working/pool-state.json` - Worker pool status
- `coordination/masters/*/context/master-state.json` - Specialist status

### Outputs
- `coordination/masters/coordinator/handoffs/to-{master}-*.json` - Handoffs
- `coordination/masters/coordinator/logs/routing-decisions.jsonl` - Decisions
- `coordination/masters/coordinator/context/master-state.json` - State
- `coordination/dashboard-events.jsonl` - Routing events

### Events Emitted
- `routing_decision` - When task routed
- `handoff_created` - When handoff created
- `master_started` - When coordinator starts
- `health_alert` - When issue detected

## Control Loops

### Primary Loop (Routing)
```
1. Check task-queue.json for pending tasks
2. For each pending task:
   a. Validate task structure
   b. Query MoE router
   c. Select routing strategy
   d. Create handoff
   e. Log decision
   f. Update state
3. Sleep 10 seconds
4. Repeat
```

### Health Check Loop
```
1. Check all specialist masters:
   a. Verify last_contact < 5 minutes
   b. Check workload capacity
   c. Validate state file
2. Check worker pool:
   a. Active workers count
   b. Stuck workers detection
   c. Failed workers recovery
3. Emit health events
4. Sleep 60 seconds
5. Repeat
```

## Testing Contracts

### Unit Tests
- Schema validation on all inputs/outputs
- Routing decision logic with mock tasks
- Handoff creation and format
- State persistence and recovery

### Integration Tests
- End-to-end task routing flow
- Multi-master coordination
- Handoff pickup and completion
- Failure recovery scenarios

### Validation Tests
```javascript
const { validateHandoff, validateMasterState } = require('../lib/safe-json');

// Test handoff creation
const handoff = createHandoff(task);
const result = validateHandoff(handoff);
assert(result.valid, 'Handoff must be valid');

// Test state updates
const state = loadMasterState();
const stateResult = validateMasterState(state);
assert(stateResult.valid, 'State must be valid');
```

## Version History

- **1.0.0** (2025-11-11): Initial contract definition with schema validation
