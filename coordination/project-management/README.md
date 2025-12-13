# Project Management State Machine - Phase 4.4

Project lifecycle management with checkpoints and rollback capabilities.

## Overview

The PM State Machine provides robust project management:
- **State Machine**: 7 states with validated transitions
- **Checkpoints**: Automatic snapshots at 25%, 50%, 75%, 100%
- **Rollback**: State restoration with validation
- **Progress Tracking**: Milestones, phases, and progress percentage

## Components

### 1. State Machine (`state-machine.js`)

Manages project lifecycle through defined states.

**States:**
```
PLANNING → EXECUTING → VALIDATING → COMPLETE
    ↓           ↓           ↓
CANCELLED   BLOCKED     FAILED
                ↓           ↓
            EXECUTING   EXECUTING (retry)
```

**State Details:**

| State | Next States | Checkpoints | Auto-Checkpoints |
|-------|-------------|-------------|------------------|
| PLANNING | EXECUTING, CANCELLED | requirements_defined, resources_allocated | None |
| EXECUTING | VALIDATING, BLOCKED, FAILED | 25%, 50%, 75%, code_complete | 25%, 50%, 75%, 100% |
| VALIDATING | COMPLETE, EXECUTING, FAILED | tests_pass, security_scan_pass | None |
| BLOCKED | EXECUTING, FAILED, CANCELLED | blocker_identified | None |
| FAILED | EXECUTING, CANCELLED | failure_analyzed, rollback_complete | None |
| COMPLETE | (terminal) | deployed, documented, archived | None |
| CANCELLED | (terminal) | cleanup_complete | None |

**Usage:**
```javascript
const ProjectStateMachine = require('./state-machine');
const sm = new ProjectStateMachine();

// Create project
const project = await sm.createProject({
  task_id: 'task-123',
  description: 'Implement authentication',
  contractor: 'development',
  complexity: { score: 7, level: 'high' },
  estimated_tokens: 20000,
  estimated_time_minutes: 90
});

// Transition states
await sm.transition(project.project_id, 'EXECUTING');

// Update progress (triggers automatic checkpoints)
await sm.updateProgress(project.project_id, 25); // Checkpoint created
await sm.updateProgress(project.project_id, 50); // Checkpoint created
await sm.updateProgress(project.project_id, 75); // Checkpoint created

// Complete milestone
await sm.completeMilestone(project.project_id, 'code_complete');

// Validate and complete
await sm.transition(project.project_id, 'VALIDATING');
await sm.transition(project.project_id, 'COMPLETE');
```

**CLI:**
```bash
# Create project
node state-machine.js create '{"task_id": "task-123", "description": "..."}'

# Transition
node state-machine.js transition proj-123 EXECUTING

# Get project
node state-machine.js get proj-123

# List projects
node state-machine.js list '{"state": "EXECUTING"}'

# Statistics
node state-machine.js stats
```

### 2. Checkpoint Manager (`checkpoint-manager.js`)

Manages state snapshots for rollback capability.

**Features:**
- **Automatic Checkpoints**: At progress milestones (25%, 50%, 75%, 100%)
- **Manual Checkpoints**: For critical operations
- **Integrity Verification**: SHA256 hash validation
- **Retention**: Max 20 checkpoints per project, 30-day retention

**Usage:**
```javascript
const CheckpointManager = require('./checkpoint-manager');
const manager = new CheckpointManager();

// Create checkpoint
const checkpoint = await manager.createCheckpoint(
  'proj-123',
  'before_deployment',
  'EXECUTING',
  projectSnapshot,
  { reason: 'Critical deployment checkpoint' }
);

// List checkpoints
const checkpoints = await manager.listCheckpoints('proj-123');

// Get latest
const latest = await manager.getLatestCheckpoint('proj-123');

// Verify integrity
const verification = await manager.verifyCheckpoint(checkpoint.checkpoint_id);
console.log(verification.valid); // true/false
```

**Checkpoint Structure:**
```json
{
  "checkpoint_id": "proj-123-cp-before_deployment-1702489200000",
  "project_id": "proj-123",
  "name": "before_deployment",
  "created_at": "2025-12-13T...",
  "state": "EXECUTING",
  "progress_percentage": 75,
  "snapshot": {
    "project_id": "proj-123",
    "state": "EXECUTING",
    "progress": {...},
    "resources": {...},
    "milestones": [...]
  },
  "rollback_plan": {
    "actions": [
      {"action": "stop_workers", "workers": [...]},
      {"action": "restore_checkpoint"}
    ],
    "estimated_duration_minutes": 10,
    "risk_level": "low",
    "validation_steps": [...]
  },
  "metadata": {
    "automatic": true,
    "size_bytes": 4523,
    "hash": "a3d2f5..."
  }
}
```

**CLI:**
```bash
# Create checkpoint
node checkpoint-manager.js create proj-123 milestone_name EXECUTING '{...}'

# List checkpoints
node checkpoint-manager.js list proj-123

# Verify checkpoint
node checkpoint-manager.js verify proj-123-cp-milestone-123456

# Statistics
node checkpoint-manager.js stats proj-123
```

### 3. Rollback Coordinator (`rollback-coordinator.js`)

Coordinates rollback operations with validation.

**Rollback Triggers:**
- **test_failure**: Tests failed during validation
- **security_issue**: Security scan failed
- **budget_exceeded**: Token/time budget exceeded
- **manual**: Manual rollback requested
- **timeout**: Operation timeout

**Usage:**
```javascript
const RollbackCoordinator = require('./rollback-coordinator');
const coordinator = new RollbackCoordinator();

// Preview rollback
const preview = await coordinator.previewRollback('proj-123');
console.log(`Will restore to: ${preview.will_restore_to_state}`);
console.log(`Estimated duration: ${preview.estimated_duration_minutes}min`);

// Execute rollback
const result = await coordinator.rollback(
  'proj-123',
  'proj-123-cp-milestone-123456', // checkpoint ID (null = latest)
  'Test failures detected'
);

if (result.success) {
  console.log('Rollback successful');
  console.log(`Restored to checkpoint: ${result.checkpoint_restored}`);
  console.log(`Duration: ${result.duration_ms}ms`);
}

// Get available rollback points
const points = await coordinator.getAvailableRollbackPoints('proj-123');
// Returns: [{checkpoint_id, name, state, progress, risk_level}, ...]

// View history
const history = await coordinator.getRollbackHistory('proj-123');
```

**Rollback Validation:**

After rollback, the coordinator validates:
1. **State verification**: Restored to expected state
2. **Progress verification**: Progress matches checkpoint
3. **Worker verification**: Active workers match checkpoint
4. **Resource verification**: Resources properly restored

**CLI:**
```bash
# Preview rollback
node rollback-coordinator.js preview proj-123

# Execute rollback (to latest checkpoint)
node rollback-coordinator.js rollback proj-123 null "Test failures"

# Rollback to specific checkpoint
node rollback-coordinator.js rollback proj-123 proj-123-cp-milestone-123 "Manual rollback"

# View rollback points
node rollback-coordinator.js points proj-123

# View history
node rollback-coordinator.js history proj-123

# Statistics
node rollback-coordinator.js stats
```

## Project State Schema

Full JSON schema: `coordination/schemas/project-state.schema.json`

**Key Properties:**
```json
{
  "project_id": "proj-123",
  "state": "EXECUTING",
  "contractor": "development",
  "complexity": {
    "score": 7,
    "level": "high"
  },
  "resources": {
    "estimated_tokens": 20000,
    "actual_tokens": 15432,
    "estimated_time_minutes": 90,
    "actual_time_minutes": 75,
    "active_workers": ["worker-1", "worker-2"]
  },
  "progress": {
    "percentage": 65,
    "current_phase": "execution",
    "phases_completed": 1,
    "total_phases": 4
  },
  "checkpoints": [...],
  "milestones": [...],
  "validation": {
    "tests_passed": false,
    "security_scan_passed": true,
    "validation_errors": []
  },
  "rollback_triggers": [...]
}
```

## Workflow Example

### Complete Project Lifecycle

```javascript
const ProjectStateMachine = require('./state-machine');
const sm = new ProjectStateMachine();

// 1. Create project (PLANNING state)
const project = await sm.createProject({
  task_id: 'task-123',
  description: 'Implement JWT authentication',
  contractor: 'development',
  complexity: { score: 7, level: 'high' },
  estimated_tokens: 20000,
  estimated_time_minutes: 90
});
// Checkpoint: project_created

// 2. Complete planning
await sm.completeMilestone(project.project_id, 'requirements_defined');
await sm.completeMilestone(project.project_id, 'resources_allocated');

// 3. Transition to execution
await sm.transition(project.project_id, 'EXECUTING');
// Checkpoint: pre_transition_executing

// 4. Execute with progress updates
await sm.updateProgress(project.project_id, 25);
// Checkpoint: progress_25 (automatic)

await sm.updateProgress(project.project_id, 50);
// Checkpoint: progress_50 (automatic)

// 5. Something goes wrong - rollback
const coordinator = new RollbackCoordinator();
await coordinator.rollback(
  project.project_id,
  null, // Latest checkpoint (progress_50)
  'Critical bug discovered'
);

// 6. Fix and resume
await sm.updateProgress(project.project_id, 75);
// Checkpoint: progress_75 (automatic)

await sm.updateProgress(project.project_id, 100);
// Checkpoint: progress_100 (automatic)

await sm.completeMilestone(project.project_id, 'code_complete');

// 7. Validation
await sm.transition(project.project_id, 'VALIDATING');

// Run tests...
project.validation.tests_passed = true;
project.validation.security_scan_passed = true;

// 8. Complete
await sm.transition(project.project_id, 'COMPLETE');
// Checkpoint: pre_transition_complete
```

## Statistics and Monitoring

### Project Statistics
```javascript
const stats = await sm.getStatistics();
// {
//   total: 42,
//   by_state: {
//     PLANNING: 5,
//     EXECUTING: 12,
//     VALIDATING: 3,
//     COMPLETE: 20,
//     FAILED: 2
//   },
//   avg_completion_time: 75,  // minutes
//   success_rate: 0.91
// }
```

### Checkpoint Statistics
```javascript
const cpStats = await checkpointManager.getStatistics('proj-123');
// {
//   total_checkpoints: 8,
//   automatic_checkpoints: 6,
//   manual_checkpoints: 2,
//   total_size_bytes: 45231,
//   by_state: {...}
// }
```

### Rollback Statistics
```javascript
const rbStats = await coordinator.getStatistics();
// {
//   total_rollbacks: 15,
//   successful_rollbacks: 14,
//   failed_rollbacks: 1,
//   success_rate: 0.93,
//   avg_duration_ms: 3250,
//   by_reason: {
//     "test_failure": 8,
//     "security_issue": 4,
//     "manual": 3
//   }
// }
```

## File Locations

```
coordination/
├── project-management/
│   ├── state-machine.js              # Main state machine
│   ├── checkpoint-manager.js         # Checkpoint management
│   ├── rollback-coordinator.js       # Rollback coordination
│   ├── states/                       # Project state files
│   │   └── proj-*.json
│   ├── checkpoints/                  # Checkpoint snapshots
│   │   └── proj-*-cp-*.json
│   ├── transitions.jsonl             # State transition log
│   ├── checkpoint-log.jsonl          # Checkpoint creation log
│   └── rollback-log.jsonl            # Rollback execution log
├── schemas/
│   └── project-state.schema.json     # JSON schema
```

## Integration with GM Decision Engine

The State Machine integrates with the GM Decision Engine:

```javascript
const GMDecisionEngine = require('../routing/gm-decision-engine');
const ProjectStateMachine = require('./state-machine');

const engine = new GMDecisionEngine();
const sm = new ProjectStateMachine();

// Get decision
const decision = await engine.selectContractors(taskDescription);

// Create project from decision
const project = await sm.createProject({
  task_id: taskId,
  description: taskDescription,
  contractor: decision.primary_contractor.contractor,
  supporting_contractors: decision.supporting_contractors,
  complexity: decision.complexity,
  estimated_tokens: decision.estimated_tokens,
  estimated_time_minutes: decision.estimated_time_minutes,
  estimated_workers: decision.estimated_workers
});

// Execute with automatic checkpoints
await sm.transition(project.project_id, 'EXECUTING');
// Checkpoints automatically created at 25%, 50%, 75%, 100%
```

## Best Practices

1. **Checkpoint Frequently**: Use manual checkpoints before risky operations
2. **Validate Rollbacks**: Always run validation after rollback
3. **Monitor Progress**: Update progress regularly for automatic checkpoints
4. **Handle Failures**: Transition to FAILED state and analyze before retry
5. **Clean State**: Complete all milestones before transitioning
6. **Document Reasons**: Always provide clear reasons for transitions/rollbacks

## Performance

- **State transition**: <10ms
- **Checkpoint creation**: 50-200ms (depends on snapshot size)
- **Rollback execution**: 1-5 seconds
- **Checkpoint verification**: <50ms
- **Storage**: ~5KB per checkpoint (compressed)

## Future Enhancements

- [ ] Parallel state machines for multi-project coordination
- [ ] Automatic failure recovery
- [ ] Machine learning for rollback trigger prediction
- [ ] Real-time state monitoring dashboard
- [ ] Distributed state machine across workers
- [ ] Incremental checkpoints (delta compression)
