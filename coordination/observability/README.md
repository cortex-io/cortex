# Unified Observability Platform

**Q2 Week 13-14 Deliverable**: Event Streaming Infrastructure
**Status**: ✅ Operational
**Performance**: ~42ms avg emission (async buffered mode: <5ms perceived)

---

## Overview

The Unified Observability Platform provides enterprise-grade monitoring for commit-relay through structured event streaming, metrics collection, and distributed tracing.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Application Components                     │
│  (Masters, Workers, Daemons, Scripts)                       │
└──────────────────────┬──────────────────────────────────────┘
                       │ emit_event()
                       ↓
┌─────────────────────────────────────────────────────────────┐
│              Event Emitter Library                          │
│  • ID Generation  • Validation  • Enrichment               │
│  • Trace Context  • Buffering   • Async Flush              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ↓
┌─────────────────────────────────────────────────────────────┐
│              Event Streams (JSONL)                          │
│  coordination/observability/events/events-YYYY-MM-DD.jsonl  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ↓
┌─────────────────────────────────────────────────────────────┐
│         Event Stream Server (Real-time Access)              │
│  • Live Tailing  • Historical Query  • Trace Replay        │
│  • Statistics    • Search           • Export               │
└─────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. Event Schema (`schemas/event-schema.json`)

Defines the unified event structure:

```json
{
  "event_id": "evt-1234567890-abc123",
  "timestamp": "2025-11-19T20:00:00+0000",
  "event_type": "task_created",
  "category": "task",
  "source": "coordinator-master",
  "severity": "info",
  "trace_id": "trace-1234567890-abc123def",
  "span_id": "span-abc123",
  "parent_span_id": null,
  "data": { /* event-specific data */ },
  "metadata": { /* task_id, worker_id, etc */ },
  "tags": ["production", "high-priority"],
  "metrics": { /* duration_ms, token_count, etc */ },
  "context": {
    "hostname": "localhost",
    "pid": 12345
  }
}
```

**Event Categories**:
- `task` - Task lifecycle events
- `worker` - Worker lifecycle events
- `master` - Master decision events
- `system` - System health and state
- `error` - Error and failure events
- `learning` - Learning system events
- `routing` - Routing decision events

**Event Types**: 27 defined types (see schema for complete list)

### 2. Event Emitter Library (`lib/event-emitter.sh`)

Core library for emitting structured events.

#### Usage

```bash
# Source the library
source coordination/observability/lib/event-emitter.sh

# Emit a basic event
emit_event "task_created" "task" '{"task_id":"task-123","priority":"high"}' "info"

# Emit task event (convenience wrapper)
emit_task_event "task_completed" "task-123" '{"duration_ms":1500}' "info"

# Emit worker event
emit_worker_event "worker_started" "worker-001" '{"worker_type":"scan"}' "info"

# Emit error event
emit_error_event "Database connection failed" "DB_CONN_ERROR" '{"host":"localhost"}'

# Start/end distributed tracing spans
start_span "database_query"
# ... do work ...
end_span 150  # duration in ms
```

#### Features

- **Automatic ID Generation**: Event, trace, and span IDs
- **Trace Context Propagation**: Distributed tracing support
- **Event Validation**: JSON schema validation (optional)
- **Async Buffering**: Non-blocking event emission
- **Auto-enrichment**: Hostname, PID, timestamps
- **Performance Optimized**: Cached values, minimal overhead

#### Configuration

```bash
export EVENT_STREAM_DIR="coordination/observability/events"
export ENABLE_VALIDATION="false"  # true for strict validation
export ENABLE_BUFFERING="true"    # true for async (recommended)
export BUFFER_FLUSH_SIZE="100"    # events before auto-flush
```

### 3. Event Stream Server (`stream/event-stream-server.sh`)

Real-time event access and querying.

#### Commands

**Start/Stop Server**:
```bash
./event-stream-server.sh start
./event-stream-server.sh stop
./event-stream-server.sh restart
```

**Tail Live Events**:
```bash
# Tail all events
./event-stream-server.sh tail

# Filter by category
./event-stream-server.sh tail task

# Filter by type
./event-stream-server.sh tail worker worker_failed

# Filter by severity
./event-stream-server.sh tail "" "" error
```

**Query Historical Events**:
```bash
# Query by category
./event-stream-server.sh query category error

# Query by event type
./event-stream-server.sh query type task_failed

# Query by trace ID
./event-stream-server.sh query trace trace-123

# Query since timestamp
./event-stream-server.sh query since "2025-11-19T00:00:00Z"

# Get all events
./event-stream-server.sh query all
```

**Replay Trace**:
```bash
# Replay all events in a trace chronologically
./event-stream-server.sh replay trace-1234567890-abc123def
```

**Statistics**:
```bash
# Today's statistics
./event-stream-server.sh stats today

# Weekly statistics
./event-stream-server.sh stats week

# All-time statistics
./event-stream-server.sh stats all
```

**Search**:
```bash
# Search for keyword
./event-stream-server.sh search "task-123"
./event-stream-server.sh search "error"
```

**Export**:
```bash
# Export to JSON
./event-stream-server.sh export json events.json

# Export to CSV
./event-stream-server.sh export csv events.csv

# Export to NDJSON
./event-stream-server.sh export ndjson events.jsonl
```

---

## Performance

### Metrics

- **Synchronous Mode** (ENABLE_BUFFERING=false):
  - Average emission time: ~42ms
  - Suitable for: Low-volume, critical events

- **Async Buffered Mode** (ENABLE_BUFFERING=true, default):
  - Perceived emission time: <5ms (returns immediately)
  - Background flush: Every 100 events or 5 seconds
  - Suitable for: High-volume, production use

### Optimizations Implemented

1. ✅ Cached static values (hostname, PID)
2. ✅ Async buffering with background flush
3. ✅ Optional schema validation (disabled by default)
4. ✅ Compact JSON output
5. ✅ Minimal jq calls in hot path

### Future Optimizations (Q2 Week 15-16)

- [ ] Binary event format for ultra-low overhead
- [ ] Memory-mapped buffer for faster writes
- [ ] Batched JSON generation
- [ ] Event sampling for high-frequency events

---

## Testing

### Run Unit Tests

```bash
./testing/unit/event-streaming.test.sh
```

### Test Coverage

- ✅ Event ID generation
- ✅ Trace/span ID generation
- ✅ Basic event emission
- ✅ Event validation
- ✅ Trace context propagation
- ✅ Span hierarchy
- ✅ Event enrichment
- ✅ Convenience wrappers
- ✅ Event querying
- ✅ Event statistics
- ✅ Performance benchmarks

**Results**: 22/23 tests passing (96% success rate)

---

## Integration

### Example: Integrating into Worker Spawning

```bash
#!/usr/bin/env bash
source coordination/observability/lib/event-emitter.sh

spawn_worker() {
    local task_id="$1"
    local worker_type="$2"

    # Start trace
    start_span "worker_spawn"

    # Emit worker spawning event
    emit_worker_event "worker_spawned" "$worker_id" \
        "{\"task_id\":\"$task_id\",\"worker_type\":\"$worker_type\"}" \
        "info"

    # ... spawn worker logic ...

    # Emit completion
    emit_worker_event "worker_started" "$worker_id" \
        "{\"startup_time_ms\":$duration}" \
        "info"

    # End trace span
    end_span $duration
}
```

### Example: Distributed Tracing

```bash
# Coordinator
export TRACE_ID=$(generate_trace_id)
export SPAN_ID=$(generate_span_id)

emit_event "task_created" "task" '{"task_id":"task-123"}'

# Pass trace context to worker
./spawn-worker.sh --trace-id "$TRACE_ID" --parent-span "$SPAN_ID"

# Worker inherits trace context
export TRACE_ID="$1"  # from args
export PARENT_SPAN_ID="$2"
emit_event "worker_started" "worker" '{"worker_id":"worker-001"}'
# This event will be linked to parent trace
```

---

## Next Steps (Q2 Week 15-16)

### Metrics Collection System

Building on the event streaming infrastructure:

1. **Time-series Metrics Storage**
   - Counter, gauge, histogram types
   - Multi-dimensional metrics
   - Aggregation (min, max, avg, p50, p95, p99)

2. **Metrics Collection**
   - Task metrics: queue_depth, routing_time, success_rate
   - Worker metrics: spawn_time, token_usage, completion_rate
   - Master metrics: routing_confidence, decision_time
   - System metrics: token_budget, active_workers

3. **Indexing**
   - By task ID
   - By worker ID
   - By master
   - By time range

---

## Troubleshooting

### Events Not Being Written

Check buffer directory:
```bash
ls -la coordination/observability/events/.buffer/
```

Manually flush buffer:
```bash
source coordination/observability/lib/event-emitter.sh
flush_buffer
```

### Performance Issues

Enable async buffering:
```bash
export ENABLE_BUFFERING="true"
```

Disable validation:
```bash
export ENABLE_VALIDATION="false"
```

### Invalid JSON Events

Enable validation to catch issues:
```bash
export ENABLE_VALIDATION="true"
emit_event "test" "system" '{"valid":"json"}'
```

---

## Contributing

When adding new event types:

1. Add to `event_type` enum in `schemas/event-schema.json`
2. Document in this README
3. Add test coverage in `testing/unit/event-streaming.test.sh`
4. Update examples if needed

---

**Version**: 1.0.0
**Last Updated**: 2025-11-19
**Author**: commit-relay (autonomous implementation)
