# Auto-Fix Framework - Design Document
**Phase 4.5 - Self-Healing Implementation**

## Overview

The Auto-Fix Framework is the final component of the self-healing system, enabling commit-relay to automatically remediate known failure patterns without human intervention. By leveraging pattern detection (Phase 4.4) and applying proven fixes, the system becomes truly autonomous.

## Goals

1. **Automated Remediation**: Apply fixes for known failure patterns
2. **Safety First**: Never apply fixes that could cause harm
3. **Learning System**: Track fix success rates and adapt
4. **Transparency**: Complete audit trail of all fixes
5. **Validation**: Verify fixes work before considering them successful
6. **Graceful Degradation**: Fall back to manual intervention when uncertain

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Pattern Detection (Phase 4.4)                              │
│  Identifies recurring failure patterns                      │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  Fix Matcher                                                │
│  • Matches patterns to known fixes                         │
│  • Checks fix applicability                                │
│  • Validates prerequisites                                 │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  Safety Validator                                           │
│  • Checks fix safety score                                 │
│  • Validates current system state                          │
│  • Checks for conflicts                                    │
│  • Requires human approval if risky                        │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  Fix Executor                                               │
│  • Creates backup/checkpoint                               │
│  • Applies fix actions                                     │
│  • Monitors execution                                      │
│  • Rolls back on failure                                   │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  Fix Validator                                              │
│  • Verifies fix was applied correctly                      │
│  • Checks that pattern no longer occurs                    │
│  • Monitors for side effects                               │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  Learning System                                            │
│  • Tracks fix success/failure rates                        │
│  • Updates fix confidence scores                           │
│  • Disables ineffective fixes                              │
│  • Promotes successful fixes                               │
└─────────────────────────────────────────────────────────────┘
```

## Fix Categories

### 1. **Configuration Fixes**
Simple configuration changes that resolve issues.

**Examples**:
- Increase memory allocation for OOM patterns
- Adjust timeout values for timeout patterns
- Increase token budget for token exhaustion
- Change retry settings for transient failures

**Safety**: High (easy to rollback, low risk)

### 2. **Resource Adjustment Fixes**
Dynamic resource allocation changes.

**Examples**:
- Scale up worker memory
- Add CPU cores
- Increase disk quota
- Adjust rate limits

**Safety**: Medium (may affect other workers)

### 3. **Dependency Fixes**
Fix missing or incompatible dependencies.

**Examples**:
- Install missing packages
- Update dependency versions
- Fix PATH issues
- Repair broken symlinks

**Safety**: Medium (may affect system state)

### 4. **Code Fixes**
Automated code changes (limited scope).

**Examples**:
- Fix common typos in config files
- Update deprecated API calls
- Add missing error handling
- Fix permission issues

**Safety**: Low (requires extensive validation)

### 5. **Workflow Fixes**
Adjust execution workflow or order.

**Examples**:
- Change task retry strategy
- Adjust worker type for task
- Modify execution timeout
- Change parallel/sequential execution

**Safety**: Medium (may affect task outcomes)

## Fix Registry

### Fix Template Structure

Each fix has a template defining how to apply it:

```json
{
  "fix_id": "fix_increase_memory_for_oom",
  "name": "Increase Memory Allocation for OOM",
  "category": "configuration",
  "description": "Increases memory allocation when workers consistently hit OOM",

  "applicable_patterns": [
    "pattern_resource_out_of_memory_*"
  ],

  "prerequisites": {
    "min_pattern_confidence": 0.80,
    "min_pattern_occurrences": 3,
    "required_context": ["worker_type", "current_memory_allocation"],
    "exclusions": ["worker_type == 'test-worker'"]
  },

  "safety": {
    "safety_score": 0.95,
    "requires_approval": false,
    "max_auto_applies_per_day": 10,
    "rollback_supported": true,
    "affects_other_workers": false
  },

  "actions": [
    {
      "type": "modify_config",
      "target": "worker_spec_template",
      "field": "resources.memory_limit",
      "operation": "multiply",
      "value": 1.5,
      "max_value": "8GB"
    },
    {
      "type": "emit_event",
      "event_type": "auto_fix_applied",
      "data": {
        "fix_id": "$fix_id",
        "pattern_id": "$pattern_id",
        "worker_type": "$worker_type"
      }
    }
  ],

  "validation": {
    "success_criteria": [
      {
        "type": "pattern_occurrence_decrease",
        "window_hours": 24,
        "min_decrease_percent": 50
      },
      {
        "type": "worker_success_rate",
        "min_success_rate": 0.75
      }
    ],
    "timeout_hours": 48
  },

  "rollback": {
    "actions": [
      {
        "type": "restore_config",
        "target": "worker_spec_template",
        "field": "resources.memory_limit"
      }
    ]
  },

  "metadata": {
    "created_at": "2025-11-18",
    "updated_at": "2025-11-18",
    "success_rate": 0.0,
    "total_applies": 0,
    "successful_applies": 0,
    "failed_applies": 0,
    "avg_resolution_time_hours": 0
  }
}
```

### Built-in Fixes

**Fix Registry Location**: `coordination/fixes/fix-registry.jsonl`

**Initial Fix Set**:

1. **fix_increase_memory_for_oom**
   - Pattern: OOM errors
   - Action: Increase memory by 50%
   - Safety: 0.95

2. **fix_increase_timeout_for_slow_tasks**
   - Pattern: Timeout on long-running tasks
   - Action: Increase timeout by 25%
   - Safety: 0.90

3. **fix_reduce_token_budget_for_overusage**
   - Pattern: Workers consistently using <50% of tokens
   - Action: Reduce token allocation by 25%
   - Safety: 0.85

4. **fix_change_worker_type_for_task**
   - Pattern: Worker type consistently failing for certain tasks
   - Action: Switch to different worker type
   - Safety: 0.75

5. **fix_increase_retry_count_for_transient**
   - Pattern: Transient failures that succeed on retry
   - Action: Increase max retries
   - Safety: 0.90

6. **fix_add_backoff_for_rate_limits**
   - Pattern: Rate limit errors
   - Action: Add/increase backoff delay
   - Safety: 0.95

7. **fix_install_missing_dependency**
   - Pattern: Command not found errors
   - Action: Install missing package
   - Safety: 0.70

8. **fix_repair_permissions**
   - Pattern: Permission denied errors
   - Action: Fix file/directory permissions
   - Safety: 0.65

## Fix Application Workflow

### 1. Pattern Detection & Matching

```bash
# Pattern Detection Daemon identifies pattern
pattern_detected "pattern_resource_oom_scan_worker"

# Auto-Fix Engine receives pattern
match_fixes_for_pattern "$pattern_id"
  → Returns: ["fix_increase_memory_for_oom"]
```

### 2. Prerequisites Check

```bash
check_fix_prerequisites "$fix_id" "$pattern_id"
  → Check pattern confidence >= threshold
  → Check pattern occurrences >= minimum
  → Check required context available
  → Check no exclusions apply
  → Returns: true/false
```

### 3. Safety Validation

```bash
validate_fix_safety "$fix_id" "$pattern_id"
  → Check safety score
  → Check daily application limit not exceeded
  → Check no conflicting fixes active
  → Check system state healthy
  → Determine if approval needed
  → Returns: {safe: true, needs_approval: false}
```

### 4. Approval (if needed)

```bash
if needs_approval; then
    request_human_approval "$fix_id" "$pattern_id"
      → Emit approval request event
      → Wait for approval (timeout: 1 hour)
      → If approved: proceed
      → If rejected/timeout: abort
fi
```

### 5. Backup/Checkpoint

```bash
create_fix_checkpoint "$fix_id"
  → Backup current configuration
  → Save rollback state
  → Create restore point
  → Returns: checkpoint_id
```

### 6. Fix Execution

```bash
execute_fix "$fix_id" "$pattern_id" "$checkpoint_id"
  → Execute each action in sequence
  → Monitor for errors
  → Log all changes
  → Emit execution events
  → Returns: {success: true, changes: [...]}
```

### 7. Validation

```bash
validate_fix_success "$fix_id" "$pattern_id"
  → Wait for validation window (default: 24h)
  → Monitor pattern occurrence
  → Check success criteria
  → Returns: {validated: true, metrics: {...}}
```

### 8. Learning

```bash
update_fix_metadata "$fix_id" "$success"
  → Increment apply counter
  → Update success rate
  → Adjust confidence
  → Update avg resolution time
```

### 9. Rollback (if failed)

```bash
if validation_failed; then
    rollback_fix "$checkpoint_id"
      → Restore previous configuration
      → Emit rollback event
      → Mark fix as failed
      → Disable fix if success rate too low
fi
```

## Fix Actions

### Action Types

1. **modify_config**
   ```json
   {
     "type": "modify_config",
     "target": "worker_spec_template|task_spec_template|system_config",
     "field": "path.to.field",
     "operation": "set|add|multiply|append",
     "value": "value_or_multiplier",
     "max_value": "optional_max",
     "min_value": "optional_min"
   }
   ```

2. **execute_command**
   ```json
   {
     "type": "execute_command",
     "command": "command_to_execute",
     "args": ["arg1", "arg2"],
     "timeout_seconds": 60,
     "expected_exit_code": 0
   }
   ```

3. **install_dependency**
   ```json
   {
     "type": "install_dependency",
     "package_manager": "npm|pip|apt|brew",
     "package": "package_name",
     "version": "optional_version"
   }
   ```

4. **update_worker_spec**
   ```json
   {
     "type": "update_worker_spec",
     "worker_type": "scan-worker",
     "updates": {
       "resources.memory_limit": "4GB",
       "execution.timeout_seconds": 1800
     }
   }
   ```

5. **emit_event**
   ```json
   {
     "type": "emit_event",
     "event_type": "event_name",
     "data": {...}
   }
   ```

6. **modify_file**
   ```json
   {
     "type": "modify_file",
     "file_path": "/path/to/file",
     "operation": "replace_line|append|prepend",
     "content": "new_content",
     "backup": true
   }
   ```

## Safety Mechanisms

### 1. Safety Scores

**Score Ranges**:
- **0.90-1.00**: Very Safe - Auto-apply without approval
- **0.70-0.89**: Safe - Auto-apply but with monitoring
- **0.50-0.69**: Moderate - Require approval
- **0.00-0.49**: Risky - Never auto-apply

### 2. Rate Limiting

- **Global**: Max 20 fixes per hour
- **Per-Pattern**: Max 5 fixes per pattern per day
- **Per-Fix**: Configurable per fix (default: 10/day)

### 3. Approval Workflow

**Require Approval When**:
- Safety score < 0.70
- Fix affects multiple workers
- Fix modifies code
- Fix is first-time application
- Pattern confidence < 0.80

**Approval Methods**:
- Dashboard UI approval button
- CLI approval command
- API endpoint
- Auto-approve for trusted fixes after 10 successful applications

### 4. Rollback Protection

- Every fix creates checkpoint before execution
- Automatic rollback if validation fails
- Manual rollback command available
- Rollback window: 7 days

### 5. Conflict Detection

**Check for conflicts**:
- Multiple fixes for same pattern
- Fixes affecting same configuration
- Concurrent fix execution
- Recent failures of same fix

## Configuration

**File**: `coordination/config/auto-fix-policy.json`

```json
{
  "enabled": true,
  "auto_apply": {
    "enabled": true,
    "min_safety_score": 0.70,
    "min_pattern_confidence": 0.75,
    "min_pattern_occurrences": 3
  },
  "rate_limits": {
    "global_max_per_hour": 20,
    "per_pattern_max_per_day": 5,
    "per_fix_max_per_day": 10
  },
  "approval": {
    "require_for_low_safety": true,
    "require_for_first_apply": true,
    "require_for_code_changes": true,
    "approval_timeout_hours": 1,
    "auto_approve_after_successes": 10
  },
  "validation": {
    "validation_window_hours": 24,
    "min_success_rate_to_keep_enabled": 0.60,
    "disable_after_consecutive_failures": 3
  },
  "rollback": {
    "auto_rollback_on_validation_failure": true,
    "rollback_retention_days": 7
  },
  "observability": {
    "emit_events": true,
    "events_log": "coordination/events/auto-fix-events.jsonl",
    "detailed_logging": true
  }
}
```

## Implementation

### Core Library

**File**: `scripts/lib/auto-fix.sh`

**Functions**:
1. `load_fix_registry()` - Load all fix templates
2. `match_fixes_for_pattern(pattern_id)` - Find applicable fixes
3. `check_fix_prerequisites(fix_id, pattern_id)` - Validate prerequisites
4. `validate_fix_safety(fix_id, pattern_id)` - Safety checks
5. `create_fix_checkpoint(fix_id)` - Backup before fix
6. `execute_fix(fix_id, pattern_id, checkpoint_id)` - Apply fix
7. `validate_fix_success(fix_id, pattern_id)` - Check if fixed
8. `rollback_fix(checkpoint_id)` - Undo fix
9. `update_fix_metadata(fix_id, success)` - Track outcomes
10. `emit_fix_event(event_type, fix_id, data)` - Observability

### Auto-Fix Daemon

**File**: `scripts/daemons/auto-fix-daemon.sh`

**Process**:
```bash
while true; do
    # 1. Get patterns detected in last cycle
    new_patterns=$(get_recent_patterns)

    for pattern in $new_patterns; do
        # 2. Find applicable fixes
        fixes=$(match_fixes_for_pattern "$pattern")

        for fix in $fixes; do
            # 3. Check if should apply
            if should_apply_fix "$fix" "$pattern"; then
                # 4. Apply fix (with safety checks)
                apply_fix "$fix" "$pattern"
            fi
        done
    done

    # 5. Validate pending fixes
    validate_pending_fixes

    # 6. Clean up old checkpoints
    cleanup_old_checkpoints

    sleep 300  # 5 minutes
done
```

## Observability

### Events Emitted

**Location**: `coordination/events/auto-fix-events.jsonl`

**Event Types**:
1. `fix_matched` - Fix found for pattern
2. `fix_prerequisites_failed` - Prerequisites not met
3. `fix_approval_requested` - Human approval needed
4. `fix_approved` - Approval granted
5. `fix_rejected` - Approval denied
6. `fix_applied` - Fix executed
7. `fix_validation_started` - Starting validation
8. `fix_validated_success` - Fix succeeded
9. `fix_validated_failure` - Fix failed
10. `fix_rolled_back` - Fix undone
11. `fix_disabled` - Fix auto-disabled (low success rate)

### Metrics

**Location**: `coordination/metrics/auto-fix-metrics.json`

```json
{
  "timestamp": "2025-11-18T16:00:00-0600",
  "total_fixes_applied": 47,
  "successful_fixes": 38,
  "failed_fixes": 9,
  "success_rate": 0.81,
  "pending_validation": 3,
  "fixes_by_category": {
    "configuration": 25,
    "resource_adjustment": 15,
    "dependency": 5,
    "workflow": 2
  },
  "avg_resolution_time_hours": 8.5,
  "auto_approvals": 30,
  "manual_approvals": 12,
  "rejected": 5
}
```

## Success Criteria

**Phase 4.5 Complete When**:
1. ✅ Fix registry operational
2. ✅ Auto-fix engine implemented
3. ✅ Safety validation working
4. ✅ Rollback mechanism functional
5. ✅ Daemon deployed
6. ✅ All unit tests passing (target: 15 tests)
7. ✅ E2E test passing
8. ✅ Fix success rate >60%

## Security Considerations

1. **Command Injection Prevention**: Sanitize all inputs
2. **Permission Boundaries**: Never escalate privileges
3. **Audit Trail**: Log all fix applications
4. **Approval for Risky Fixes**: Human-in-the-loop for low safety scores
5. **Rollback Always Available**: Never apply irreversible fixes
6. **Rate Limiting**: Prevent fix storms
7. **Validation**: Never trust, always verify

## Future Enhancements

1. **ML-Based Fix Selection**: Learn which fixes work best
2. **Custom Fix Templates**: Users can add their own fixes
3. **Fix Composition**: Combine multiple fixes
4. **Predictive Fixes**: Apply fixes before failure occurs
5. **Cross-System Learning**: Share successful fixes across instances
