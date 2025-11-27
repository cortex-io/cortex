# Distributed Tracing Integration Points

This document identifies where to add correlation IDs and traced logging in the cortex codebase.

## Overview

The distributed tracing system uses:
- **Correlation IDs**: Track requests across masters and workers
- **Span IDs**: Track individual operations within a trace
- **Traced Logging**: Structured logs with trace context
- **Trace Events**: Lifecycle events for tasks, workers, handoffs

## Integration Strategy

1. Add trace initialization at entry points (task creation, master starts, worker spawns)
2. Propagate correlation IDs through coordination files
3. Replace regular logging with traced logging
4. Emit trace events for lifecycle operations

## Priority 1: Critical Integration Points

These are the minimum required for basic distributed tracing.

### 1. Task Creation

**File**: `scripts/lib/coordination.sh` or task creation scripts
**Location**: Where tasks are added to task queue
**Action**: Initialize trace for new tasks

```bash
# Add to task creation
source scripts/lib/correlation.sh
source scripts/lib/traced-logging.sh

# Generate correlation ID for task
correlation_id=$(init_task_trace "$task_id" "coordinator")

# Propagate to task object in task-queue.json
# Add trace_context field to task JSON
```

**Affected Files**:
- `scripts/lib/coordination.sh` - Task creation functions
- Any script that creates tasks in `coordination/task-queue.json`

### 2. Master Agent Initialization

**Files**:
- `scripts/run-coordinator-master.sh`
- `scripts/run-development-master.sh`
- `scripts/run-security-master.sh`
- `scripts/run-inventory-master.sh`
- `scripts/run-cicd-master.sh`

**Location**: At start of main execution, after sourcing libraries
**Action**: Source tracing libraries and initialize trace context

```bash
# Add after existing library sources (around line 34)
source "$SCRIPT_DIR/lib/correlation.sh"
source "$SCRIPT_DIR/lib/traced-logging.sh"

# When picking up a task from handoff, extract correlation ID
correlation_id=$(extract_from_file "$handoff_file")
if [ -n "$correlation_id" ]; then
    set_trace_context "$correlation_id"
else
    # Create new correlation ID if none exists
    correlation_id=$(generate_correlation_id "$MASTER_ID")
    set_trace_context "$correlation_id"
fi

# Replace log_* calls with traced_log_* calls
# Before: log_info "Processing task $task_id"
# After:  traced_log_info "Processing task $task_id" '{"task_id": "'"$task_id"'"}'
```

**Estimate**: 5 files x 3 integration points = 15 changes

### 3. Worker Spawning

**File**: `scripts/spawn-worker.sh`
**Location**: Before worker creation, around line 200-300
**Action**: Initialize worker trace as child of parent trace

```bash
# Add after argument parsing, before worker creation
source "$SCRIPT_DIR/lib/correlation.sh"
source "$SCRIPT_DIR/lib/traced-logging.sh"

# Extract parent correlation ID from task or master
parent_correlation_id="${CORRELATION_ID:-}"
if [ -z "$parent_correlation_id" ]; then
    # Try to extract from task
    parent_correlation_id=$(jq -r '.trace_context.correlation_id // empty' \
        "$CORTEX_HOME/coordination/task-queue.json" | \
        jq -r "select(.id == \"$TASK_ID\") | .trace_context.correlation_id // empty")
fi

# Create worker trace
worker_correlation_id=$(init_worker_trace "$WORKER_ID" "$parent_correlation_id")
set_trace_context "$worker_correlation_id" "$parent_correlation_id"

# Propagate to worker spec file
propagate_to_file "$worker_spec_file" "$worker_correlation_id" "$SPAN_ID" "$parent_correlation_id"

# Replace log calls
traced_log_worker_event "$WORKER_ID" "spawning" \
    '{"worker_type": "'"$WORKER_TYPE"'", "task_id": "'"$TASK_ID"'"}'
```

**Affected Files**:
- `scripts/spawn-worker.sh`
- `scripts/start-worker.sh`
- `scripts/lib/worker-spec-builder.sh`

**Estimate**: 3 files x 5 integration points = 15 changes

### 4. Handoff Creation

**File**: `scripts/lib/coordination.sh`
**Function**: `create_handoff()`
**Location**: Around line 183-228
**Action**: Add trace propagation to handoffs

```bash
# In create_handoff function, add trace context
create_handoff() {
    local from_agent=$1
    local to_agent=$2
    local task_id=$3
    local context=$4

    # Initialize handoff trace (continues parent trace)
    if [ -n "${CORRELATION_ID:-}" ]; then
        init_handoff_trace "$from_agent" "$to_agent" "$CORRELATION_ID"
    fi

    # ... existing handoff creation code ...

    # After creating handoff file, propagate trace
    local handoff_file="$COORD_DIR/masters/$to_agent/handoffs/from-${from_agent}-${handoff_id}.json"
    if [ -n "${CORRELATION_ID:-}" ]; then
        propagate_to_file "$handoff_file" "$CORRELATION_ID" "$SPAN_ID"

        traced_log_handoff_event "$from_agent" "$to_agent" "$task_id" "created"
    fi

    echo "$handoff_id"
}
```

**Affected Files**:
- `scripts/lib/coordination.sh` - `create_handoff()`
- Master scripts that create handoffs

**Estimate**: 1 core function + 5 masters x 2 handoff points = 11 changes

### 5. Worker Completion

**File**: `scripts/lib/coordination.sh`
**Function**: `update_worker_status()`
**Location**: Around line 129-180
**Action**: Emit trace events on worker completion

```bash
# In update_worker_status function
update_worker_status() {
    local worker_id=$1
    local new_status=$2
    local tokens_used="${3:-0}"

    # ... existing code ...

    # Emit trace event for completion
    if [ "$new_status" == "completed" ] || [ "$new_status" == "failed" ]; then
        # Extract correlation ID from worker pool entry
        local worker_correlation_id=$(jq -r \
            ".active_workers[] | select(.id == \"$worker_id\") | .correlation_id // empty" \
            "$pool_file")

        if [ -n "$worker_correlation_id" ]; then
            set_trace_context "$worker_correlation_id"
            complete_trace_span "$new_status" \
                '{"worker_id": "'"$worker_id"'", "tokens_used": '"$tokens_used"'}'

            traced_log_worker_event "$worker_id" "$new_status" \
                '{"tokens_used": '"$tokens_used"'}'
        fi
    fi

    # ... rest of function ...
}
```

**Affected Files**:
- `scripts/lib/coordination.sh` - `update_worker_status()`, `update_task_status()`

**Estimate**: 2 functions x 3 status types = 6 changes

## Priority 2: Enhanced Integration Points

These add more detail to traces but are not critical for basic functionality.

### 6. Operation Timing

**Files**: Master scripts, worker scripts
**Location**: Around expensive operations (API calls, file processing, etc.)
**Action**: Add operation timing

```bash
# Before expensive operation
start_traced_operation "process_repository"

# ... operation code ...

# After operation
end_traced_operation "process_repository" "success"
```

**Affected Files**:
- All master scripts
- Worker execution scripts
- Processing scripts (scan, fix, etc.)

**Estimate**: 10 files x 3 operations = 30 changes

### 7. Metric Logging

**Files**: Scripts that compute metrics
**Location**: Where metrics are calculated
**Action**: Add traced metric logging

```bash
# Log metrics with trace context
traced_log_metric "scan_vulnerabilities_found" "$vuln_count" "count"
traced_log_metric "fix_success_rate" "$success_rate" "percentage"
traced_log_metric "api_latency" "$latency_ms" "milliseconds"
```

**Affected Files**:
- Security scan scripts
- Fix application scripts
- Performance monitoring scripts

**Estimate**: 8 files x 4 metrics = 32 changes

### 8. Error Handling

**Files**: All scripts with error handling
**Location**: Error/exception handlers
**Action**: Use traced error logging

```bash
# In error handlers
if [ $? -ne 0 ]; then
    traced_log_error "Operation failed: $operation" \
        '{"error_code": '"$?"', "operation": "'"$operation"'"}'
    complete_trace_span "failed" '{"error": "'"$error_message"'"}'
fi
```

**Affected Files**:
- All master scripts
- All worker scripts
- Library functions with error handling

**Estimate**: 20 files x 5 error points = 100 changes

## Priority 3: Advanced Integration Points

### 9. RAG Context Retrieval

**Files**: Scripts that retrieve from knowledge bases
**Location**: Knowledge base query operations
**Action**: Trace RAG operations

```bash
# Trace knowledge base queries
start_traced_operation "rag_retrieval"
results=$(query_knowledge_base "$query")
end_traced_operation "rag_retrieval" "success"

traced_log_info "Retrieved KB results" \
    '{"result_count": '"$result_count"', "query": "'"$query"'"}'
```

**Affected Files**:
- Master scripts with RAG
- Knowledge base libraries

**Estimate**: 5 files x 2 queries = 10 changes

### 10. MoE Routing Decisions

**Files**: Coordinator master
**Location**: Where routing decisions are made
**Action**: Trace routing decisions

```bash
# Trace routing decisions
emit_trace_event "moe_routing" \
    '{"task_type": "'"$task_type"'", "routed_to": "'"$target_master"'", "confidence": '"$confidence"'}'

traced_log_info "Routed task to $target_master" \
    '{"task_id": "'"$task_id"'", "confidence": '"$confidence"'}'
```

**Affected Files**:
- `scripts/run-coordinator-master.sh`
- Routing logic scripts

**Estimate**: 2 files x 3 routing points = 6 changes

## Summary by File Type

| File Type | Priority 1 | Priority 2 | Priority 3 | Total |
|-----------|-----------|-----------|-----------|-------|
| Master scripts | 15 | 30 | 8 | 53 |
| Worker scripts | 15 | 20 | 0 | 35 |
| Library functions | 17 | 40 | 10 | 67 |
| Coordination scripts | 6 | 12 | 0 | 18 |
| **Total** | **53** | **102** | **18** | **173** |

## Integration Phases

### Phase 1: Core Tracing (Week 1)
- Priority 1 changes only
- Focus on task → master → worker flow
- Expected: 5-10 log entries per trace
- Estimated effort: 2-3 days

### Phase 2: Enhanced Tracing (Week 2)
- Add Priority 2 changes
- Focus on operations and metrics
- Expected: 10-20 log entries per trace
- Estimated effort: 3-4 days

### Phase 3: Advanced Tracing (Week 3)
- Add Priority 3 changes
- Focus on RAG and MoE
- Expected: 20-30 log entries per trace
- Estimated effort: 2-3 days

## Testing Strategy

After each integration:

1. **Generate Test Trace**:
```bash
# Create a task that triggers the integration point
# Verify trace is created and has correlation ID
./scripts/show-trace.sh --list
```

2. **Verify Trace Completeness**:
```bash
# Check that all expected events are present
./scripts/show-trace.sh --verbose <correlation_id>
```

3. **Visualize Trace**:
```bash
# Verify timeline makes sense
./scripts/visualize-trace.sh --gantt <correlation_id>
```

4. **Check Propagation**:
```bash
# Verify correlation ID appears in all coordination files
grep -r "<correlation_id>" coordination/
```

## Performance Impact

Estimated overhead per operation:

- **Correlation ID generation**: ~1ms (cached UUID)
- **Trace event emission**: ~5ms (JSONL append)
- **Log file write**: ~10ms (buffered I/O)
- **Trace context propagation**: ~15ms (jq file update)

**Total per trace**: ~30ms overhead per traced operation
**Expected impact**: < 1% on typical workflows (most time is LLM calls)

## File Modifications Required

### Immediately Required (Priority 1)
1. `scripts/lib/coordination.sh` - Add trace propagation to handoffs, tasks, workers
2. `scripts/run-coordinator-master.sh` - Initialize trace context
3. `scripts/run-development-master.sh` - Initialize trace context
4. `scripts/run-security-master.sh` - Initialize trace context
5. `scripts/run-inventory-master.sh` - Initialize trace context
6. `scripts/run-cicd-master.sh` - Initialize trace context
7. `scripts/spawn-worker.sh` - Initialize worker traces
8. `scripts/start-worker.sh` - Load trace context from spec

### Later (Priority 2-3)
- All master scripts: Add operation timing
- All worker scripts: Add operation timing
- Error handlers: Use traced logging
- Metric collection: Use traced metrics
- RAG operations: Trace knowledge base queries
- MoE routing: Trace routing decisions

## Backwards Compatibility

The tracing system is designed to be backwards compatible:

- All trace functions check for `CORRELATION_ID` existence
- If no correlation ID, functions degrade gracefully
- Regular logging still works alongside traced logging
- Existing coordination files work without trace_context field

## Migration Path

1. **Add libraries** to all scripts (no behavior change)
2. **Initialize traces** at entry points (creates correlation IDs)
3. **Replace logging calls** incrementally (traced_log_* instead of log_*)
4. **Add trace events** for lifecycle operations
5. **Verify traces** using show-trace.sh and visualize-trace.sh
6. **Monitor performance** and adjust as needed

## Next Steps

1. ✅ Create correlation library
2. ✅ Create traced logging library
3. ✅ Create trace viewing tools
4. ✅ Document integration points (this file)
5. ⏭️ Integrate Priority 1 changes (53 changes)
6. ⏭️ Test with real workflows
7. ⏭️ Integrate Priority 2 changes (102 changes)
8. ⏭️ Performance tuning and optimization
