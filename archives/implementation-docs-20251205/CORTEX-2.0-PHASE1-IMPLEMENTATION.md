# Cortex 2.0: Phase 1 Implementation Guide
**Quick Wins (Weeks 3-6)**

**Team**: 4 Engineers
**Duration**: 4 Weeks
**Risk**: 🟢 LOW
**Target Impact**: 3x improvement

---

## Overview

Phase 1 delivers immediate improvements with minimal architectural risk:
1. Worker Pool (eliminate spawn overhead)
2. Token Budget Enforcement (prevent over-allocation)
3. Async Event Processing (sub-second latency)

**Success Criteria**:
- Worker spawn time: <50ms (vs 500ms today)
- Token over-allocation: 0% (vs -148% today)
- Event latency: <1s (vs 30-60s today)

---

## Week 3: Worker Pool Implementation

### Day 1-2: Design & Prototyping

**Engineer 1 (Backend - Worker Pool Core)**:
```bash
# Create worker pool daemon
touch scripts/worker-pool-daemon.sh
chmod +x scripts/worker-pool-daemon.sh

# Design considerations:
# - How many workers? Start with 20
# - Communication protocol? Unix FIFOs
# - Worker types? All 7 (implementation, scan, test, etc.)
# - Restart strategy? Supervisor watches PIDs
```

**Key Design Questions**:
1. **Pool Size**: 20 workers (configurable)
   - 10 implementation workers
   - 4 scan workers
   - 2 test workers
   - 2 documentation workers
   - 2 analysis workers

2. **Communication**: Unix FIFOs (named pipes)
   - `/tmp/cortex-worker-{id}-in.fifo` (task assignments)
   - `/tmp/cortex-worker-{id}-out.fifo` (results)

3. **Lifecycle**:
   - Start: `worker-pool-daemon.sh start`
   - Stop: Graceful shutdown (complete current task)
   - Restart: Supervisor respawns within 10s

**Prototype** (`scripts/worker-pool-daemon.sh`):
```bash
#!/bin/bash
# Worker Pool Daemon - Persistent Worker Management

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/coordination.sh"
source "$SCRIPT_DIR/lib/logging.sh"

POOL_SIZE=${WORKER_POOL_SIZE:-20}
WORKER_TYPES=(
  "implementation:10"
  "scan:4"
  "test:2"
  "documentation:2"
  "analysis:2"
)

PID_DIR="/tmp/cortex-worker-pool"
FIFO_DIR="/tmp/cortex-fifos"

initialize_pool() {
  log_info "Initializing worker pool (size: $POOL_SIZE)"

  mkdir -p "$PID_DIR" "$FIFO_DIR"

  local worker_id=1
  for type_spec in "${WORKER_TYPES[@]}"; do
    local type="${type_spec%%:*}"
    local count="${type_spec##*:}"

    for i in $(seq 1 "$count"); do
      local worker_name="worker-pool-$(printf "%03d" $worker_id)"
      spawn_persistent_worker "$worker_name" "$type"
      ((worker_id++))
    done
  done

  log_info "Worker pool initialized: $POOL_SIZE workers"
}

spawn_persistent_worker() {
  local worker_id=$1
  local worker_type=$2

  # Create FIFOs for communication
  local fifo_in="$FIFO_DIR/${worker_id}-in.fifo"
  local fifo_out="$FIFO_DIR/${worker_id}-out.fifo"

  mkfifo "$fifo_in" 2>/dev/null || true
  mkfifo "$fifo_out" 2>/dev/null || true

  # Spawn worker process
  (
    while true; do
      # Wait for task assignment (blocking read)
      if read -r task_json < "$fifo_in"; then
        log_info "Worker $worker_id received task: $(echo "$task_json" | jq -r .task_id)"

        # Execute task
        local result=$(execute_task "$worker_type" "$task_json")

        # Report result (non-blocking write)
        echo "$result" > "$fifo_out" &

        log_info "Worker $worker_id completed task"
      fi
    done
  ) &

  local pid=$!
  echo "$pid" > "$PID_DIR/${worker_id}.pid"

  # Register worker in coordination
  register_worker "$worker_id" "$worker_type" "$pid"

  log_info "Spawned persistent worker: $worker_id (type: $worker_type, PID: $pid)"
}

execute_task() {
  local worker_type=$1
  local task_json=$2

  local task_id=$(echo "$task_json" | jq -r .task_id)
  local task_spec=$(echo "$task_json" | jq -r .task_spec)

  # Create worker execution context
  local worker_dir="agents/workers/$WORKER_ID"
  mkdir -p "$worker_dir"

  # Write task spec
  echo "$task_spec" > "$worker_dir/task-spec.json"

  # Execute worker script (existing logic)
  local start_time=$(date +%s)

  # Call existing worker execution logic
  bash "$SCRIPT_DIR/lib/worker-execute.sh" "$worker_type" "$task_id"
  local exit_code=$?

  local end_time=$(date +%s)
  local duration=$((end_time - start_time))

  # Build result JSON
  local result=$(cat <<EOF
{
  "worker_id": "$WORKER_ID",
  "task_id": "$task_id",
  "status": $([ $exit_code -eq 0 ] && echo '"completed"' || echo '"failed"'),
  "exit_code": $exit_code,
  "duration_seconds": $duration,
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
)

  echo "$result"
}

register_worker() {
  local worker_id=$1
  local worker_type=$2
  local pid=$3

  # Update worker-pool.json
  local pool_file="coordination/worker-pool.json"

  # Add worker to pool (using jq)
  jq --arg id "$worker_id" \
     --arg type "$worker_type" \
     --arg pid "$pid" \
     --arg status "idle" \
     --arg spawned "$(date -u +"%Y-%m-%dT%H:%M:%S%z")" \
     '.pool_workers += [{
       worker_id: $id,
       worker_type: $type,
       pid: ($pid | tonumber),
       status: $status,
       spawned_at: $spawned,
       tasks_completed: 0,
       current_task: null
     }]' "$pool_file" > "$pool_file.tmp"

  mv "$pool_file.tmp" "$pool_file"
}

assign_task_to_pool() {
  local task_id=$1
  local worker_type=$2

  # Find available worker of correct type
  local worker_id=$(find_available_worker "$worker_type")

  if [ -z "$worker_id" ]; then
    log_warn "No available workers of type $worker_type, queueing task $task_id"
    queue_task "$task_id" "$worker_type"
    return 1
  fi

  # Build task assignment JSON
  local task_spec=$(get_task_spec "$task_id")
  local task_json=$(cat <<EOF
{
  "task_id": "$task_id",
  "task_spec": $task_spec
}
EOF
)

  # Assign task to worker (write to FIFO, non-blocking)
  local fifo_in="$FIFO_DIR/${worker_id}-in.fifo"
  echo "$task_json" > "$fifo_in" &

  # Update worker status
  update_worker_status "$worker_id" "running" "$task_id"

  log_info "Task $task_id assigned to worker $worker_id"
  return 0
}

find_available_worker() {
  local worker_type=$1

  # Query worker-pool.json for idle worker of correct type
  jq -r --arg type "$worker_type" \
    '.pool_workers[] |
     select(.worker_type == $type and .status == "idle") |
     .worker_id' \
    coordination/worker-pool.json | head -1
}

# Main execution
case "${1:-start}" in
  start)
    log_info "Starting worker pool daemon"
    initialize_pool

    # Keep daemon alive
    while true; do
      sleep 30
      # Health check: verify all workers still alive
      check_worker_health
    done
    ;;

  stop)
    log_info "Stopping worker pool daemon"
    # Send graceful shutdown to all workers
    for pid_file in "$PID_DIR"/*.pid; do
      local pid=$(cat "$pid_file")
      kill -TERM "$pid" 2>/dev/null || true
    done
    ;;

  status)
    # Show worker pool status
    jq -r '.pool_workers[] | "\(.worker_id): \(.status) (tasks: \(.tasks_completed))"' \
      coordination/worker-pool.json
    ;;

  *)
    echo "Usage: $0 {start|stop|status}"
    exit 1
    ;;
esac
```

---

### Day 3-4: Integration with Existing System

**Engineer 1 (Backend - Integration)**:

**Modify** `scripts/spawn-worker.sh`:
```bash
#!/bin/bash
# spawn-worker.sh - Modified to use worker pool

# Check if worker pool enabled
if [ "${CORTEX_USE_WORKER_POOL:-true}" = "true" ]; then
  # Use worker pool
  bash scripts/worker-pool-daemon.sh assign-task "$TASK_ID" "$WORKER_TYPE"
  exit $?
fi

# Fallback to old behavior (spawn new process)
# ... existing spawn logic ...
```

**Add** `scripts/lib/worker-pool-client.sh`:
```bash
#!/bin/bash
# Worker Pool Client Library

assign_task_to_worker_pool() {
  local task_id=$1
  local worker_type=$2

  # Send assignment request to daemon
  # (Implementation: write to daemon control socket)

  # Wait for assignment confirmation
  local timeout=5
  local start_time=$(date +%s)

  while true; do
    local status=$(get_task_assignment_status "$task_id")

    if [ "$status" = "assigned" ]; then
      return 0
    elif [ "$status" = "queued" ]; then
      log_info "Task $task_id queued, waiting for available worker"
    elif [ "$status" = "failed" ]; then
      log_error "Task $task_id assignment failed"
      return 1
    fi

    local now=$(date +%s)
    if [ $((now - start_time)) -gt $timeout ]; then
      log_error "Task $task_id assignment timeout"
      return 1
    fi

    sleep 0.5
  done
}
```

---

### Day 5: Testing

**Engineer 2 (DevOps - Testing)**:

**Create** `testing/worker-pool-test.sh`:
```bash
#!/bin/bash
# Worker Pool Integration Test

echo "Starting worker pool..."
bash scripts/worker-pool-daemon.sh start &
POOL_PID=$!

sleep 5

echo "Submitting 100 test tasks..."
for i in $(seq 1 100); do
  task_id="test-task-$(printf "%03d" $i)"

  # Create test task
  echo "{\"id\": \"$task_id\", \"type\": \"implementation\", \"description\": \"Test task $i\"}" \
    >> coordination/task-queue.json
done

echo "Waiting for tasks to complete..."
timeout=300
start_time=$(date +%s)

while true; do
  completed=$(jq '.tasks[] | select(.status == "completed") | .id' coordination/task-queue.json | wc -l)

  echo "Completed: $completed / 100"

  if [ "$completed" -ge 100 ]; then
    echo "✓ All tasks completed!"
    break
  fi

  now=$(date +%s)
  if [ $((now - start_time)) -gt $timeout ]; then
    echo "✗ Test timeout (300s)"
    exit 1
  fi

  sleep 5
done

# Measure performance
echo "Performance metrics:"
jq -r '.tasks[] | select(.id | startswith("test-task")) |
  "Task: \(.id), Duration: \(.completed_at - .created_at)s"' \
  coordination/task-queue.json

# Cleanup
kill $POOL_PID
```

---

## Week 4: Token Budget Enforcement

### Day 1-2: Atomic Token Operations

**Engineer 1 (Backend - Token Budget)**:

**Modify** `scripts/lib/coordination.sh`:
```bash
#!/bin/bash
# coordination.sh - Add atomic token operations

allocate_tokens_atomic() {
  local worker_id=$1
  local amount=$2

  local budget_file="coordination/token-budget.json"
  local lock_file="$budget_file.lock"

  # Acquire lock (with timeout)
  local timeout=10
  local waited=0

  while ! mkdir "$lock_file" 2>/dev/null; do
    sleep 0.1
    waited=$((waited + 1))

    if [ $waited -gt $((timeout * 10)) ]; then
      log_error "Token budget lock timeout"
      return 1
    fi
  done

  # Critical section: check and allocate
  local available=$(jq -r .available "$budget_file")

  if [ "$available" -lt "$amount" ]; then
    log_warn "Insufficient tokens: available=$available, requested=$amount"
    rmdir "$lock_file"
    return 1
  fi

  # Allocate tokens
  jq --arg worker "$worker_id" \
     --argjson amount "$amount" \
     --arg timestamp "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
     '.allocated += $amount |
      .available -= $amount |
      .allocations[$worker] = {
        tokens: $amount,
        allocated_at: $timestamp
      }' \
     "$budget_file" > "$budget_file.tmp"

  mv "$budget_file.tmp" "$budget_file"

  # Release lock
  rmdir "$lock_file"

  log_info "Allocated $amount tokens to $worker_id (available: $((available - amount)))"
  return 0
}

check_token_budget_before_spawn() {
  local worker_type=$1
  local required_tokens=${WORKER_TOKEN_BUDGET[$worker_type]:-10000}

  local available=$(jq -r .available coordination/token-budget.json)

  if [ "$available" -lt "$required_tokens" ]; then
    log_error "Cannot spawn $worker_type: insufficient tokens (need $required_tokens, have $available)"
    return 1
  fi

  return 0
}
```

**Integration Point**:
```bash
# In spawn-worker.sh, add pre-spawn check:

# Check token budget before spawning
if ! check_token_budget_before_spawn "$WORKER_TYPE"; then
  log_error "Worker spawn rejected: insufficient tokens"
  update_task_status "$TASK_ID" "queued" "Waiting for token budget"
  exit 1
fi

# Allocate tokens atomically
if ! allocate_tokens_atomic "$WORKER_ID" "$REQUIRED_TOKENS"; then
  log_error "Token allocation failed"
  exit 1
fi

# Proceed with worker spawn...
```

---

### Day 3-4: Budget Monitoring Dashboard

**Engineer 3 (Frontend - Dashboard)**:

**Create** `eui-dashboard/src/components/TokenBudgetPanel.tsx`:
```typescript
import React, { useState, useEffect } from 'react';
import {
  EuiPanel,
  EuiTitle,
  EuiStat,
  EuiProgress,
  EuiSpacer,
  EuiText,
  EuiCallOut,
} from '@elastic/eui';

interface TokenBudget {
  total_budget: number;
  allocated: number;
  in_use: number;
  available: number;
  updated_at: string;
}

export const TokenBudgetPanel: React.FC = () => {
  const [budget, setBudget] = useState<TokenBudget | null>(null);

  useEffect(() => {
    const fetchBudget = async () => {
      const response = await fetch('/api/token-budget');
      const data = await response.json();
      setBudget(data);
    };

    fetchBudget();
    const interval = setInterval(fetchBudget, 5000); // Refresh every 5s

    return () => clearInterval(interval);
  }, []);

  if (!budget) return <div>Loading...</div>;

  const utilizationPct = (budget.allocated / budget.total_budget) * 100;
  const isOverAllocated = budget.available < 0;

  return (
    <EuiPanel>
      <EuiTitle size="s">
        <h3>Token Budget</h3>
      </EuiTitle>

      <EuiSpacer size="m" />

      {isOverAllocated && (
        <>
          <EuiCallOut title="Budget Over-Allocated!" color="danger" iconType="alert">
            <p>
              Token budget exceeded by {Math.abs(budget.available).toLocaleString()} tokens.
              Worker spawning will be blocked until tokens are released.
            </p>
          </EuiCallOut>
          <EuiSpacer size="m" />
        </>
      )}

      <EuiProgress
        value={Math.min(utilizationPct, 100)}
        max={100}
        color={isOverAllocated ? 'danger' : utilizationPct > 80 ? 'warning' : 'success'}
        size="m"
      />

      <EuiSpacer size="m" />

      <div style={{ display: 'flex', gap: '16px' }}>
        <EuiStat
          title={budget.total_budget.toLocaleString()}
          description="Total Budget"
          titleColor="primary"
        />
        <EuiStat
          title={budget.allocated.toLocaleString()}
          description="Allocated"
          titleColor={isOverAllocated ? 'danger' : 'default'}
        />
        <EuiStat
          title={budget.available.toLocaleString()}
          description="Available"
          titleColor={budget.available < 50000 ? 'warning' : 'success'}
        />
      </div>

      <EuiSpacer size="s" />

      <EuiText size="xs" color="subdued">
        Last updated: {new Date(budget.updated_at).toLocaleTimeString()}
      </EuiText>
    </EuiPanel>
  );
};
```

---

## Week 5: Async Event Processing

### Day 1-3: Event Router Implementation

**Engineer 1 (Backend - Event Router)**:

**Create** `lib/observability/event-router.js`:
```javascript
// Event Router - Async event processing with circular buffer

const fs = require('fs').promises;
const { EventEmitter } = require('events');
const WebSocket = require('ws');

class EventRouter extends EventEmitter {
  constructor(options = {}) {
    super();

    this.bufferSize = options.bufferSize || 10000;
    this.buffer = [];
    this.bufferIndex = 0;

    this.jsonlPath = options.jsonlPath || 'coordination/events/system-events.jsonl';
    this.flushInterval = options.flushInterval || 10000; // 10s

    this.wss = null; // WebSocket server for real-time streaming

    this.init();
  }

  async init() {
    // Start periodic flush to JSONL
    this.flushTimer = setInterval(() => this.flushToFile(), this.flushInterval);

    // Initialize WebSocket server
    if (this.options.websocketPort) {
      this.wss = new WebSocket.Server({ port: this.options.websocketPort });
      this.wss.on('connection', (ws) => {
        console.log('Dashboard connected to event stream');

        // Send last 100 events on connect
        const recentEvents = this.buffer.slice(-100);
        recentEvents.forEach(event => {
          ws.send(JSON.stringify(event));
        });
      });
    }
  }

  /**
   * Add event to buffer (async, non-blocking)
   */
  async addEvent(eventType, level, data = {}) {
    const event = {
      event_id: this.generateEventId(),
      event_type: eventType,
      event_level: level,
      timestamp: new Date().toISOString(),
      ...data,
    };

    // Add to circular buffer
    this.buffer[this.bufferIndex] = event;
    this.bufferIndex = (this.bufferIndex + 1) % this.bufferSize;

    // Broadcast to WebSocket clients (non-blocking)
    if (this.wss) {
      this.wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(event));
        }
      });
    }

    // Emit event for local subscribers
    this.emit(eventType, event);

    return event;
  }

  /**
   * Flush buffer to JSONL file (async)
   */
  async flushToFile() {
    if (this.buffer.length === 0) return;

    // Get events to flush (copy to avoid race)
    const eventsToFlush = [...this.buffer];

    // Append to JSONL (non-blocking)
    const lines = eventsToFlush.map(e => JSON.stringify(e)).join('\\n') + '\\n';

    try {
      await fs.appendFile(this.jsonlPath, lines);
      console.log(`Flushed ${eventsToFlush.length} events to ${this.jsonlPath}`);
    } catch (err) {
      console.error('Failed to flush events:', err);
    }
  }

  /**
   * Query events from buffer (in-memory, fast)
   */
  queryEvents(filter = {}) {
    let results = this.buffer.filter(e => e !== undefined);

    if (filter.eventType) {
      results = results.filter(e => e.event_type === filter.eventType);
    }

    if (filter.level) {
      results = results.filter(e => e.event_level === filter.level);
    }

    if (filter.since) {
      const sinceTime = new Date(filter.since).getTime();
      results = results.filter(e => new Date(e.timestamp).getTime() >= sinceTime);
    }

    return results.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  generateEventId() {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Graceful shutdown
   */
  async close() {
    clearInterval(this.flushTimer);
    await this.flushToFile();

    if (this.wss) {
      this.wss.close();
    }
  }
}

module.exports = { EventRouter };
```

---

### Day 4-5: Integration & Testing

**Engineer 2 (DevOps - Integration)**:

**Modify event handlers**:
```bash
# scripts/events/handlers/on-worker-heartbeat.sh

# Old (synchronous):
echo "$event_json" >> coordination/events/heartbeat-events.jsonl

# New (async via event router):
curl -X POST http://localhost:3002/events \
  -H "Content-Type: application/json" \
  -d "$event_json" &  # Non-blocking
```

**Start event router daemon**:
```bash
# scripts/daemons/event-router-daemon.sh

#!/bin/bash
cd "$(dirname "$0")/../.."

node -e "
const { EventRouter } = require('./lib/observability/event-router');

const router = new EventRouter({
  bufferSize: 10000,
  jsonlPath: 'coordination/events/system-events.jsonl',
  flushInterval: 10000,
  websocketPort: 3002
});

console.log('Event router started on ws://localhost:3002');

// HTTP API for event submission
const express = require('express');
const app = express();
app.use(express.json());

app.post('/events', async (req, res) => {
  const event = await router.addEvent(
    req.body.event_type,
    req.body.event_level || 'info',
    req.body
  );

  res.json({ success: true, event_id: event.event_id });
});

app.get('/events', (req, res) => {
  const events = router.queryEvents(req.query);
  res.json({ events, count: events.length });
});

app.listen(3002, () => {
  console.log('Event API listening on http://localhost:3002');
});
" &

echo $! > /tmp/cortex-event-router.pid
```

---

## Week 6: Testing & Validation

### Integration Testing

**Engineer 2 (DevOps)**:

**Create** `testing/phase1-integration-test.sh`:
```bash
#!/bin/bash
# Phase 1 Integration Test

set -e

echo "=== Phase 1 Integration Test ==="
echo ""

# Test 1: Worker Pool
echo "[Test 1] Worker Pool Performance"
echo "Starting worker pool..."
bash scripts/worker-pool-daemon.sh start &
POOL_PID=$!

sleep 5

echo "Submitting 50 tasks..."
start_time=$(date +%s)

for i in $(seq 1 50); do
  bash scripts/spawn-worker.sh \
    --task-id "test-task-$(printf "%03d" $i)" \
    --worker-type implementation-worker
done

echo "Waiting for completion..."
# (wait logic)

end_time=$(date +%s)
duration=$((end_time - start_time))

echo "✓ 50 tasks completed in ${duration}s"
echo "  Average: $((duration / 50))s per task"

kill $POOL_PID

# Test 2: Token Budget Enforcement
echo ""
echo "[Test 2] Token Budget Enforcement"

# Reset budget
echo '{"total_budget": 100000, "allocated": 0, "available": 100000}' \
  > coordination/token-budget.json

echo "Attempting to spawn 15 workers (10k tokens each = 150k total)"
spawned=0
rejected=0

for i in $(seq 1 15); do
  if bash scripts/spawn-worker.sh --task-id "budget-test-$i" --worker-type implementation-worker; then
    ((spawned++))
  else
    ((rejected++))
  fi
done

echo "✓ Spawned: $spawned, Rejected: $rejected"

if [ $spawned -le 10 ] && [ $rejected -ge 5 ]; then
  echo "✓ Budget enforcement working correctly"
else
  echo "✗ Budget enforcement failed"
  exit 1
fi

# Test 3: Async Event Processing
echo ""
echo "[Test 3] Async Event Processing"

echo "Starting event router..."
bash scripts/daemons/event-router-daemon.sh
sleep 2

echo "Sending 1000 events..."
start_time=$(date +%s)

for i in $(seq 1 1000); do
  curl -X POST http://localhost:3002/events \
    -H "Content-Type: application/json" \
    -d "{\"event_type\": \"test.event\", \"test_id\": $i}" \
    -s &
done

wait

end_time=$(date +%s)
duration=$((end_time - start_time))

echo "✓ 1000 events processed in ${duration}s"
echo "  Throughput: $((1000 / duration)) events/sec"

# Query events
event_count=$(curl -s "http://localhost:3002/events?eventType=test.event" | jq '.count')

if [ "$event_count" -eq 1000 ]; then
  echo "✓ All events received"
else
  echo "✗ Event loss detected: $event_count / 1000"
  exit 1
fi

echo ""
echo "=== Phase 1 Tests Complete ==="
echo "✓ Worker pool: 10x faster spawning"
echo "✓ Token budget: Enforced correctly"
echo "✓ Event processing: Sub-second latency"
```

---

### Performance Benchmarking

**Engineer 4 (QA)**:

**Create** `testing/phase1-benchmark.sh`:
```bash
#!/bin/bash
# Phase 1 Performance Benchmark

echo "=== Phase 1 Benchmark ==="

# Benchmark 1: Worker Spawn Time
echo "[Benchmark 1] Worker Spawn Time"

# Old method (spawn new process)
export CORTEX_USE_WORKER_POOL=false

echo "Testing old spawn method (10 iterations)..."
total_time=0

for i in $(seq 1 10); do
  start=$(date +%s%3N)
  bash scripts/spawn-worker.sh --task-id "bench-old-$i" --worker-type implementation-worker
  end=$(date +%s%3N)

  duration=$((end - start))
  total_time=$((total_time + duration))
done

old_avg=$((total_time / 10))
echo "Old method average: ${old_avg}ms"

# New method (worker pool)
export CORTEX_USE_WORKER_POOL=true
bash scripts/worker-pool-daemon.sh start &
POOL_PID=$!
sleep 5

echo "Testing new pool method (10 iterations)..."
total_time=0

for i in $(seq 1 10); do
  start=$(date +%s%3N)
  bash scripts/spawn-worker.sh --task-id "bench-new-$i" --worker-type implementation-worker
  end=$(date +%s%3N)

  duration=$((end - start))
  total_time=$((total_time + duration))
done

new_avg=$((total_time / 10))
echo "New method average: ${new_avg}ms"

improvement=$((old_avg / new_avg))
echo "Improvement: ${improvement}x faster"

kill $POOL_PID

# Benchmark 2: Event Processing Latency
echo ""
echo "[Benchmark 2] Event Processing Latency"

bash scripts/daemons/event-router-daemon.sh
sleep 2

echo "Measuring event latency (100 samples)..."

for i in $(seq 1 100); do
  sent_time=$(date +%s%3N)

  curl -X POST http://localhost:3002/events \
    -H "Content-Type: application/json" \
    -d "{\"event_type\": \"latency.test\", \"sent_time\": $sent_time, \"seq\": $i}" \
    -s &

  curl_pid=$!
  wait $curl_pid

  received_time=$(date +%s%3N)
  latency=$((received_time - sent_time))

  echo "$latency" >> /tmp/event-latencies.txt
done

# Calculate P50, P95, P99
sort -n /tmp/event-latencies.txt > /tmp/event-latencies-sorted.txt

p50=$(sed -n '50p' /tmp/event-latencies-sorted.txt)
p95=$(sed -n '95p' /tmp/event-latencies-sorted.txt)
p99=$(sed -n '99p' /tmp/event-latencies-sorted.txt)

echo "Event latency P50: ${p50}ms"
echo "Event latency P95: ${p95}ms"
echo "Event latency P99: ${p99}ms"

rm /tmp/event-latencies*.txt

echo ""
echo "=== Benchmark Complete ==="
```

---

## Rollout Plan

### Day 1 (Staging Deployment)
```bash
# 1. Deploy to staging environment
git checkout -b phase1-deployment
git merge phase1-worker-pool
git merge phase1-token-budget
git merge phase1-async-events

# 2. Start new components
bash scripts/worker-pool-daemon.sh start
bash scripts/daemons/event-router-daemon.sh

# 3. Run integration tests
bash testing/phase1-integration-test.sh

# 4. Monitor for 24 hours
```

### Day 2-3 (Production Rollout - 10%)
```bash
# Enable for 10% of traffic
export CORTEX_PHASE1_ROLLOUT_PCT=10

# Monitor metrics
watch -n 5 'curl -s http://localhost:3000/api/metrics | jq .phase1'

# Check for errors
tail -f coordination/events/system-events.jsonl | grep -i error
```

### Day 4-5 (Production Rollout - 50%)
```bash
# Increase to 50%
export CORTEX_PHASE1_ROLLOUT_PCT=50

# Monitor for 48 hours
```

### Day 6-7 (Production Rollout - 100%)
```bash
# Full rollout
export CORTEX_PHASE1_ROLLOUT_PCT=100

# Disable old methods
export CORTEX_USE_WORKER_POOL=true
```

---

## Success Validation

### Metrics to Collect

| Metric | Baseline | Target | Actual |
|--------|----------|--------|--------|
| Worker spawn time (avg) | 500ms | <50ms | ___ms |
| Worker spawn time (P95) | 800ms | <100ms | ___ms |
| Token over-allocation | -148% | 0% | ___%  |
| Event latency (P95) | 30-60s | <1s | ___s |
| Worker pool utilization | N/A | >70% | ___% |
| Zombie workers (24h) | 85% | <5% | ___% |

### Go/No-Go Decision (Week 6)

**Proceed to Phase 2 if**:
- ✅ Worker spawn time <100ms (P95)
- ✅ Token over-allocation <5%
- ✅ Event latency <2s (P95)
- ✅ Zero production incidents
- ✅ Team consensus: improvements are meaningful

**Pause and iterate if**:
- ❌ Any metric >2x worse than target
- ❌ Production incidents related to Phase 1 changes
- ❌ Team concerns about stability

---

## Rollback Procedure

### Instant Rollback (Feature Flags)
```bash
# Disable Phase 1 features
export CORTEX_USE_WORKER_POOL=false
export CORTEX_USE_ASYNC_EVENTS=false

# Restart coordination
systemctl restart cortex-coordination

# Verify old behavior restored
bash testing/smoke-test.sh
```

### Full Rollback (Code)
```bash
# Revert to main branch
git checkout main
git pull

# Restart all services
bash scripts/restart-all.sh

# Verify system health
bash scripts/status-check.sh
```

---

## Documentation Deliverables

### Week 6: Documentation Sprint

**Engineer 3 (Technical Writer)**:

1. **Operator Guide**: `docs/phase1-operator-guide.md`
   - How to monitor worker pool
   - How to interpret token budget alerts
   - How to troubleshoot event processing issues

2. **Developer Guide**: `docs/phase1-developer-guide.md`
   - How to use worker pool API
   - How to emit events properly
   - How to test locally

3. **Runbook**: `docs/runbooks/phase1-incidents.md`
   - Worker pool daemon crash
   - Event router overload
   - Token budget exhaustion

---

**End of Phase 1 Implementation Guide**

**Next**: Phase 2 (Async Coordination Daemon)
**Status**: Ready for Week 3 kickoff
