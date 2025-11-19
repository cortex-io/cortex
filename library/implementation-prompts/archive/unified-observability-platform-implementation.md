# Unified Observability Platform Implementation for commit-relay

**Based on**: Splunk's "A Beginner's Guide to Observability"
**Source**: library/read/beginners-guide-to-observability.pdf
**Created**: 2025-11-14

## Executive Summary

Observability is the ability to ask and answer any question about your business or application at any time, no matter how complex your infrastructure. This guide implements a comprehensive observability platform for commit-relay, transforming it from reactive monitoring to proactive system understanding.

**Core Principle**: "Observability is more than monitoring. Instead of passively tracking predefined metrics to alert you when something is wrong, observability actively helps you uncover root causes by analyzing the internal state of your systems."

## Business Value

Based on real-world results from Splunk case studies:

- **Rappi**: Reduced MTTR from 5 minutes to seconds
- **Travelport**: 75% reduction in MTTD, 95% reduction in false positives
- **Velera**: MTTR < 15 minutes, 3 billion transactions/month 300% faster
- **Agero**: 100% digital experience, 18-point higher NPS

**For commit-relay**:
- Detect worker failures before they cascade
- Understand why tasks fail, not just that they failed
- Correlate system performance to task success rates
- Predict capacity needs before bottlenecks occur
- Answer questions you didn't know to ask

## Current State Analysis

### Existing Observability Components

| Component | Type | Coverage | Gap |
|-----------|------|----------|-----|
| dashboard-events.jsonl | Logs | Partial | No structured dimensions |
| pm-activity.jsonl | Logs | Partial | No correlation IDs |
| dashboard/server/index.js | Basic metrics | Limited | No high-cardinality support |
| worker logs (stdout/stderr) | Logs | Good | No unified collection |
| code-runner.sh | Code quality events | Good | Not integrated |
| MoE routing-decisions.jsonl | Learning data | Good | No real-time analysis |

### Missing Critical Capabilities

1. **Distributed Tracing**: No trace context across worker → master → task flow
2. **Structured Metrics with Dimensions**: Cannot answer "Which user's task failed?"
3. **High-Cardinality Data**: Cannot track individual task performance
4. **Anomaly Detection**: No automated detection of unusual patterns
5. **Root Cause Analysis**: Manual investigation required
6. **Incident Response**: No automated alerting or escalation
7. **Service Dependency Mapping**: Unknown impact radius of failures

## The Three Pillars of Observability

### 1. Logs/Events (EXISTING - NEEDS ENHANCEMENT)

**Definition**: Immutable records of discrete events over time

**Current Implementation**:
```bash
# coordination/dashboard-events.jsonl
{"event":"worker_launched","worker_id":"dev-worker-ABC","timestamp":"2025-11-14T12:00:00Z"}
```

**Enhanced Implementation** with Context:
```bash
# coordination/observability/events.jsonl
{
  "timestamp": "2025-11-14T12:00:00Z",
  "event_type": "worker_launched",
  "trace_id": "trace-1762893199-ABC",  # NEW: Correlation ID
  "span_id": "span-worker-launch-001",  # NEW: Distributed trace
  "parent_span_id": "span-task-assign-001",  # NEW: Trace parent
  "service": "worker-daemon",
  "worker_id": "dev-worker-ABC",
  "task_id": "task-1762893199",
  "dimensions": {  # NEW: Rich context
    "worker_type": "development",
    "priority": "high",
    "assigned_master": "development-master",
    "pool_size": 12,
    "queue_depth": 5
  },
  "severity": "info"
}
```

### 2. Metrics & Dimensions (NEW)

**Definition**: Numbers describing processes over time, with context (dimensions) and cardinality

**Key Concept - Cardinality**:
> "Cardinality refers to the number of unique combinations of dimensions and their values. High cardinality allows you to ask highly specific questions like 'What's the average response time for premium users accessing the app from mobile devices in the US East region?'"

**Metrics Schema**:
```json
{
  "timestamp": 1731582000,
  "metric_name": "task.completion_time",
  "value": 42.5,
  "unit": "minutes",
  "dimensions": {
    "task_id": "task-1762893199",
    "task_type": "development",
    "priority": "high",
    "worker_id": "dev-worker-ABC",
    "worker_type": "development",
    "master": "development-master",
    "success": "true",
    "region": "local",
    "git_branch": "main"
  }
}
```

**High-Cardinality Queries Enabled**:
- "What's the avg completion time for high-priority development tasks on main branch?"
- "Which specific worker IDs have the highest failure rate?"
- "Are security tasks slower than development tasks for the same priority?"

### 3. Traces (NEW)

**Definition**: User journey tracking showing which services were invoked, which containers/hosts they ran on, and results

**Distributed Trace Example**:
```
Trace ID: trace-1762893199-ABC
Duration: 45.2 minutes

Span 1: coordinator-master (task-routing)
  ├─ Duration: 0.5s
  ├─ Service: coordinator-master
  └─ Tags: {task_id: "task-1762893199", routing_strategy: "single_expert"}

Span 2: development-master (task-acceptance)
  ├─ Duration: 1.2s
  ├─ Parent: Span 1
  ├─ Service: development-master
  └─ Tags: {master_state: "healthy", queue_depth: 5}

Span 3: worker-daemon (worker-spawn)
  ├─ Duration: 3.5s
  ├─ Parent: Span 2
  ├─ Service: worker-daemon
  └─ Tags: {worker_id: "dev-worker-ABC", launcher: "claude-v2"}

Span 4: dev-worker-ABC (task-execution)
  ├─ Duration: 2700s (45 min)
  ├─ Parent: Span 3
  ├─ Service: worker
  └─ Tags: {files_modified: 12, tools_used: ["Read", "Edit", "Bash"]}

Span 5: task-completion-daemon (status-update)
  ├─ Duration: 0.8s
  ├─ Parent: Span 4
  ├─ Service: task-completion-daemon
  └─ Tags: {status: "completed", quality_score: 0.95}
```

## Implementation Architecture

### Directory Structure

```
coordination/observability/
├── collectors/
│   ├── log-collector.sh           # Centralized log aggregation
│   ├── metrics-collector.sh       # Time-series metrics
│   └── trace-collector.sh         # Distributed trace collection
├── storage/
│   ├── events.jsonl               # Unified event log
│   ├── metrics/                   # Time-series data
│   │   ├── 2025-11-14.jsonl      # Daily metrics
│   │   └── aggregates.json        # Pre-computed stats
│   └── traces/                    # Distributed traces
│       └── trace-{id}.json        # Individual traces
├── analyzers/
│   ├── anomaly-detector.sh        # ML-based anomaly detection
│   ├── correlator.sh              # Event/metric correlation
│   └── root-cause-analyzer.sh     # Automated RCA
├── query/
│   ├── query-engine.sh            # Query interface
│   └── query-templates/           # Predefined queries
├── alerting/
│   ├── alert-manager.sh           # Alert routing
│   ├── policies/                  # Alert policies
│   └── incidents/                 # Active incidents
└── dashboards/
    ├── observability-ui/          # Real-time UI
    └── playbooks/                 # Incident playbooks
```

## Phase 1: Data Collection Infrastructure (Week 1-2)

### 1.1 OpenTelemetry-Inspired Instrumentation

**Goal**: Instrument all services to emit telemetry data

**Script**: `coordination/observability/lib/otel-shim.sh`

```bash
#!/bin/bash
# coordination/observability/lib/otel-shim.sh
# OpenTelemetry-inspired instrumentation for bash

set -euo pipefail

OBSERVABILITY_DIR="${COMMIT_RELAY_HOME}/coordination/observability"
EVENTS_LOG="${OBSERVABILITY_DIR}/storage/events.jsonl"
METRICS_LOG="${OBSERVABILITY_DIR}/storage/metrics/$(date +%Y-%m-%d).jsonl"
TRACES_DIR="${OBSERVABILITY_DIR}/storage/traces"

# Initialize observability
init_observability() {
    mkdir -p "${OBSERVABILITY_DIR}"/{collectors,storage/metrics,storage/traces,analyzers,query,alerting/policies,alerting/incidents,dashboards}
    touch "$EVENTS_LOG" "$METRICS_LOG"
}

# Generate trace ID (unique per request flow)
generate_trace_id() {
    echo "trace-$(date +%s)-$(uuidgen | cut -d'-' -f1)"
}

# Generate span ID (unique per operation)
generate_span_id() {
    echo "span-$(uuidgen | cut -d'-' -f1)"
}

# Start a span (begin timing an operation)
start_span() {
    local span_name="$1"
    local service_name="$2"
    local trace_id="${TRACE_ID:-$(generate_trace_id)}"
    local span_id=$(generate_span_id)
    local parent_span_id="${SPAN_ID:-}"

    # Export for child processes
    export TRACE_ID="$trace_id"
    export SPAN_ID="$span_id"
    export SPAN_START_TIME=$(date +%s%3N)  # milliseconds

    # Store span context in temp file
    local span_file="${TRACES_DIR}/${trace_id}-${span_id}.json"
    jq -n \
        --arg trace_id "$trace_id" \
        --arg span_id "$span_id" \
        --arg parent "$parent_span_id" \
        --arg name "$span_name" \
        --arg service "$service_name" \
        --arg start "$SPAN_START_TIME" \
        '{
            trace_id: $trace_id,
            span_id: $span_id,
            parent_span_id: ($parent | select(length > 0)),
            name: $name,
            service: $service,
            start_time_ms: ($start | tonumber),
            tags: {},
            status: "in_progress"
        }' > "$span_file"

    echo "$span_id"
}

# Add tag to current span
add_span_tag() {
    local key="$1"
    local value="$2"

    if [ -z "${SPAN_ID:-}" ]; then
        return 0  # No active span
    fi

    local span_file="${TRACES_DIR}/${TRACE_ID}-${SPAN_ID}.json"
    if [ -f "$span_file" ]; then
        local temp_file=$(mktemp)
        jq --arg key "$key" --arg value "$value" \
            '.tags[$key] = $value' "$span_file" > "$temp_file"
        mv "$temp_file" "$span_file"
    fi
}

# End a span (stop timing, record result)
end_span() {
    local status="${1:-success}"
    local error_msg="${2:-}"

    if [ -z "${SPAN_ID:-}" ]; then
        return 0  # No active span
    fi

    local span_file="${TRACES_DIR}/${TRACE_ID}-${SPAN_ID}.json"
    if [ ! -f "$span_file" ]; then
        return 0
    fi

    local end_time=$(date +%s%3N)
    local duration=$(( end_time - SPAN_START_TIME ))

    local temp_file=$(mktemp)
    jq --arg end "$end_time" \
       --argjson duration "$duration" \
       --arg status "$status" \
       --arg error "$error_msg" \
       '.end_time_ms = ($end | tonumber) |
        .duration_ms = $duration |
        .status = $status |
        .error = ($error | select(length > 0))' "$span_file" > "$temp_file"
    mv "$temp_file" "$span_file"

    # Emit metric
    emit_metric "span.duration" "$duration" "ms" "{\"span_name\":\"$(jq -r '.name' "$span_file")\",\"service\":\"$(jq -r '.service' "$span_file")\",\"status\":\"$status\"}"
}

# Emit event
emit_event() {
    local event_type="$1"
    local service="$2"
    local details="$3"  # JSON string

    local event=$(jq -n \
        --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --arg trace_id "${TRACE_ID:-}" \
        --arg span_id "${SPAN_ID:-}" \
        --arg type "$event_type" \
        --arg service "$service" \
        --argjson details "$details" \
        '{
            timestamp: $ts,
            trace_id: ($trace_id | select(length > 0)),
            span_id: ($span_id | select(length > 0)),
            event_type: $type,
            service: $service,
            details: $details
        }')

    echo "$event" >> "$EVENTS_LOG"
}

# Emit metric
emit_metric() {
    local metric_name="$1"
    local value="$2"
    local unit="${3:-count}"
    local dimensions="${4:-{}}"  # JSON string

    local metric=$(jq -n \
        --argjson ts "$(date +%s)" \
        --arg name "$metric_name" \
        --argjson value "$value" \
        --arg unit "$unit" \
        --argjson dims "$dimensions" \
        '{
            timestamp: $ts,
            metric_name: $name,
            value: $value,
            unit: $unit,
            dimensions: $dims
        }')

    echo "$metric" >> "$METRICS_LOG"
}

# Increment counter
increment_counter() {
    local counter_name="$1"
    local dimensions="${2:-{}}"

    emit_metric "$counter_name" 1 "count" "$dimensions"
}

# Record gauge (current value)
record_gauge() {
    local gauge_name="$1"
    local value="$2"
    local dimensions="${3:-{}}"

    emit_metric "$gauge_name" "$value" "gauge" "$dimensions"
}

# Record histogram (timing/size distribution)
record_histogram() {
    local histogram_name="$1"
    local value="$2"
    local unit="${3:-ms}"
    local dimensions="${4:-{}}"

    emit_metric "$histogram_name" "$value" "$unit" "$dimensions"
}
```

### 1.2 Instrumented Worker Daemon Example

**File**: `scripts/worker-daemon.sh` (instrumented)

```bash
#!/bin/bash
# scripts/worker-daemon.sh - Instrumented with observability

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMIT_RELAY_HOME="${COMMIT_RELAY_HOME:-$(cd "$SCRIPT_DIR/.." && pwd)}"

# Load observability library
source "${COMMIT_RELAY_HOME}/coordination/observability/lib/otel-shim.sh"
init_observability

log() {
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] WORKER-DAEMON: $1"
    emit_event "daemon_log" "worker-daemon" "{\"message\":\"$1\",\"level\":\"info\"}"
}

# Main daemon loop
main() {
    # Start root span for daemon cycle
    start_span "daemon-cycle" "worker-daemon"
    add_span_tag "cycle_interval" "30"

    log "Starting worker daemon cycle"

    # Monitor task queue
    local span_queue=$(start_span "check-task-queue" "worker-daemon")

    local pending_count=$(jq '[.tasks[] | select(.status == "pending")] | length' \
        "${COMMIT_RELAY_HOME}/coordination/task-queue.json")

    add_span_tag "pending_tasks" "$pending_count"
    record_gauge "task_queue.pending" "$pending_count" "{\"queue\":\"main\"}"

    end_span "success"

    # Check if we need to spawn workers
    if [ "$pending_count" -gt 0 ]; then
        local span_spawn=$(start_span "spawn-workers" "worker-daemon")
        add_span_tag "pending_count" "$pending_count"

        # Get first pending task
        local task=$(jq -r '.tasks[] | select(.status == "pending") | @json' \
            "${COMMIT_RELAY_HOME}/coordination/task-queue.json" | head -1)

        local task_id=$(echo "$task" | jq -r '.id')
        local task_type=$(echo "$task" | jq -r '.type')
        local priority=$(echo "$task" | jq -r '.priority')

        add_span_tag "task_id" "$task_id"
        add_span_tag "task_type" "$task_type"
        add_span_tag "priority" "$priority"

        log "Spawning worker for task: $task_id"

        # Spawn worker (trace context automatically propagated via TRACE_ID/SPAN_ID env vars)
        if ./scripts/spawn-worker.sh "$task_id"; then
            increment_counter "workers.spawned" "{\"task_type\":\"$task_type\",\"priority\":\"$priority\"}"
            end_span "success"
        else
            increment_counter "workers.spawn_failed" "{\"task_type\":\"$task_type\",\"priority\":\"$priority\"}"
            end_span "error" "Worker spawn failed"
        fi
    else
        log "No pending tasks"
    fi

    end_span "success"  # End daemon-cycle span

    sleep 30
}

# Run daemon
while true; do
    main || log "Daemon cycle error (non-fatal)"
done
```

### 1.3 Trace Consolidator

**Script**: `coordination/observability/collectors/trace-consolidator.sh`

```bash
#!/bin/bash
# coordination/observability/collectors/trace-consolidator.sh
# Consolidates individual span files into complete traces

set -euo pipefail

TRACES_DIR="${COMMIT_RELAY_HOME}/coordination/observability/storage/traces"
CONSOLIDATED_DIR="${TRACES_DIR}/consolidated"

mkdir -p "$CONSOLIDATED_DIR"

consolidate_traces() {
    local cutoff_time=$(( $(date +%s) - 3600 ))  # 1 hour ago

    # Find all trace IDs with completed spans
    local trace_ids=$(find "$TRACES_DIR" -name 'trace-*.json' -type f \
        -exec jq -r 'select(.status != "in_progress") | .trace_id' {} \; \
        | sort -u)

    for trace_id in $trace_ids; do
        # Get all spans for this trace
        local spans=$(find "$TRACES_DIR" -name "${trace_id}-*.json" -type f \
            -exec cat {} \; | jq -s '.')

        # Check if all spans are complete
        local in_progress=$(echo "$spans" | jq '[.[] | select(.status == "in_progress")] | length')

        if [ "$in_progress" -eq 0 ]; then
            # Build complete trace
            local trace=$(jq -n \
                --arg trace_id "$trace_id" \
                --argjson spans "$spans" \
                '{
                    trace_id: $trace_id,
                    start_time_ms: ($spans | map(.start_time_ms) | min),
                    end_time_ms: ($spans | map(.end_time_ms) | max),
                    duration_ms: (($spans | map(.end_time_ms) | max) - ($spans | map(.start_time_ms) | min)),
                    spans: $spans,
                    services: ($spans | map(.service) | unique),
                    status: (if ($spans | map(select(.status == "error")) | length) > 0 then "error" else "success" end),
                    span_count: ($spans | length)
                }')

            # Write consolidated trace
            echo "$trace" > "${CONSOLIDATED_DIR}/${trace_id}.json"

            # Delete individual span files
            find "$TRACES_DIR" -name "${trace_id}-*.json" -type f -delete

            # Extract insights
            local duration=$(echo "$trace" | jq -r '.duration_ms')
            local status=$(echo "$trace" | jq -r '.status')
            local services=$(echo "$trace" | jq -r '.services | join(",")')

            echo "Consolidated trace: $trace_id (${duration}ms, $status, services: $services)"
        fi
    done
}

# Run every minute
while true; do
    consolidate_traces
    sleep 60
done
```

## Phase 2: Metrics & Dimensions (Week 2-3)

### 2.1 Metrics Aggregator

**Script**: `coordination/observability/collectors/metrics-aggregator.sh`

```bash
#!/bin/bash
# coordination/observability/collectors/metrics-aggregator.sh
# Aggregates raw metrics into time-series statistics

set -euo pipefail

METRICS_DIR="${COMMIT_RELAY_HOME}/coordination/observability/storage/metrics"
AGGREGATES_FILE="${METRICS_DIR}/aggregates.json"

# Initialize aggregates
if [ ! -f "$AGGREGATES_FILE" ]; then
    echo '{"metrics":{}}' > "$AGGREGATES_FILE"
fi

aggregate_metrics() {
    local today=$(date +%Y-%m-%d)
    local metrics_file="${METRICS_DIR}/${today}.jsonl"

    if [ ! -f "$metrics_file" ]; then
        return
    fi

    # Aggregate by metric name and dimensions
    local aggregates=$(cat "$metrics_file" | jq -s '
        group_by(.metric_name) |
        map({
            metric_name: .[0].metric_name,
            count: length,
            sum: (map(.value) | add),
            avg: (map(.value) | add / length),
            min: (map(.value) | min),
            max: (map(.value) | max),
            p50: (map(.value) | sort | .[length / 2]),
            p95: (map(.value) | sort | .[length * 0.95 | floor]),
            p99: (map(.value) | sort | .[length * 0.99 | floor]),
            dimensions: (map(.dimensions) | .[0]),
            last_updated: (map(.timestamp) | max | todate)
        })
    ')

    # Update aggregates file
    jq --argjson new "$aggregates" \
        '.metrics = ($new | map({(.metric_name): .}) | add)' \
        "$AGGREGATES_FILE" > "${AGGREGATES_FILE}.tmp"

    mv "${AGGREGATES_FILE}.tmp" "$AGGREGATES_FILE"

    echo "Aggregated $(echo "$aggregates" | jq 'length') metrics"
}

# Run every 5 minutes
while true; do
    aggregate_metrics
    sleep 300
done
```

### 2.2 High-Cardinality Query Engine

**Script**: `coordination/observability/query/query-engine.sh`

```bash
#!/bin/bash
# coordination/observability/query/query-engine.sh
# Query engine for high-cardinality metrics

set -euo pipefail

METRICS_DIR="${COMMIT_RELAY_HOME}/coordination/observability/storage/metrics"

# Query metrics with dimensional filters
query_metrics() {
    local metric_name="$1"
    local dimension_filter="${2:-{}}"  # JSON object
    local start_time="${3:-0}"
    local end_time="${4:-9999999999}"

    # Find relevant files
    local files=$(find "$METRICS_DIR" -name "*.jsonl" -type f)

    # Query across all files
    cat $files | jq -s --arg name "$metric_name" \
                       --argjson filter "$dimension_filter" \
                       --argjson start "$start_time" \
                       --argjson end "$end_time" \
        '[.[] |
         select(.metric_name == $name) |
         select(.timestamp >= $start and .timestamp <= $end) |
         select(
           # Check if all filter dimensions match
           ($filter | to_entries | all(.key as $k | .value as $v |
             $k as $key | $v as $val |
             (.dimensions[$key] // "") == $val
           ))
         )]'
}

# Example queries

# Q: What's the average task completion time for high-priority development tasks?
example_query_1() {
    query_metrics "task.completion_time" \
        '{"task_type":"development","priority":"high"}' \
        | jq '[.[] | .value] | add / length'
}

# Q: Which worker IDs have the highest failure rate?
example_query_2() {
    local failures=$(query_metrics "workers.spawn_failed" '{}')
    local successes=$(query_metrics "workers.spawned" '{}')

    jq -n --argjson f "$failures" --argjson s "$successes" \
        '($f + $s) |
         group_by(.dimensions.worker_id) |
         map({
           worker_id: .[0].dimensions.worker_id,
           failures: ([.[] | select(.metric_name == "workers.spawn_failed")] | length),
           successes: ([.[] | select(.metric_name == "workers.spawned")] | length)
         }) |
         map(. + {failure_rate: (.failures / (.failures + .successes))}) |
         sort_by(.failure_rate) | reverse'
}

# Q: Are security tasks slower than development tasks?
example_query_3() {
    local dev_times=$(query_metrics "task.completion_time" '{"task_type":"development"}' | jq '[.[] | .value] | add / length')
    local sec_times=$(query_metrics "task.completion_time" '{"task_type":"security"}' | jq '[.[] | .value] | add / length')

    jq -n --argjson dev "$dev_times" --argjson sec "$sec_times" \
        '{
            development_avg_minutes: $dev,
            security_avg_minutes: $sec,
            difference_minutes: ($sec - $dev),
            security_slower_by_percent: ((($sec - $dev) / $dev) * 100)
        }'
}
```

## Phase 3: Anomaly Detection & Alerting (Week 3-4)

### 3.1 ML-Based Anomaly Detector

**Script**: `coordination/observability/analyzers/anomaly-detector.sh`

```bash
#!/bin/bash
# coordination/observability/analyzers/anomaly-detector.sh
# Multivariate anomaly detection using statistical methods

set -euo pipefail

source "${COMMIT_RELAY_HOME}/coordination/observability/lib/otel-shim.sh"

METRICS_DIR="${COMMIT_RELAY_HOME}/coordination/observability/storage/metrics"
ALERTS_DIR="${COMMIT_RELAY_HOME}/coordination/observability/alerting/incidents"

mkdir -p "$ALERTS_DIR"

# Calculate z-score for anomaly detection
calculate_zscore() {
    local values="$1"  # JSON array of numbers
    local current="$2"

    local stats=$(echo "$values" | jq -s '
        {
            mean: (add / length),
            stddev: (
                . as $arr |
                (add / length) as $mean |
                ($arr | map(. - $mean | . * .) | add / length | sqrt)
            )
        }')

    local mean=$(echo "$stats" | jq -r '.mean')
    local stddev=$(echo "$stats" | jq -r '.stddev')

    if [ "$(echo "$stddev == 0" | bc)" -eq 1 ]; then
        echo "0"
    else
        echo "($current - $mean) / $stddev" | bc -l
    fi
}

# Detect anomalies in metrics
detect_anomalies() {
    local metric_name="$1"
    local lookback_hours="${2:-24}"

    local start_time=$(( $(date +%s) - (lookback_hours * 3600) ))
    local end_time=$(date +%s)

    # Get historical data
    source "${COMMIT_RELAY_HOME}/coordination/observability/query/query-engine.sh"
    local historical=$(query_metrics "$metric_name" '{}' "$start_time" "$end_time")

    # Get current value
    local current=$(echo "$historical" | jq -r '.[-1].value')

    # Calculate baseline (exclude current)
    local baseline=$(echo "$historical" | jq '[.[:-1] | .[] | .value]')

    # Calculate z-score
    local zscore=$(calculate_zscore "$baseline" "$current")

    # Anomaly threshold: |z-score| > 3.0 (99.7% confidence)
    local is_anomaly=$(echo "$zscore > 3.0 || $zscore < -3.0" | bc)

    if [ "$is_anomaly" -eq 1 ]; then
        # Create alert
        create_alert "$metric_name" "$current" "$zscore" "$historical"
    fi
}

create_alert() {
    local metric_name="$1"
    local current_value="$2"
    local zscore="$3"
    local historical="$4"

    local alert_id="alert-$(date +%s)-$(uuidgen | cut -d'-' -f1)"
    local baseline_avg=$(echo "$historical" | jq '[.[:-1] | .[] | .value] | add / length')

    local alert=$(jq -n \
        --arg id "$alert_id" \
        --arg metric "$metric_name" \
        --argjson current "$current_value" \
        --argjson zscore "$zscore" \
        --argjson baseline "$baseline_avg" \
        --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        '{
            alert_id: $id,
            metric_name: $metric,
            current_value: $current,
            baseline_avg: $baseline,
            zscore: $zscore,
            severity: (if ($zscore | fabs) > 5.0 then "critical" elif ($zscore | fabs) > 3.0 then "high" else "medium" end),
            message: "Anomaly detected: \($metric) = \($current) (baseline: \($baseline), z-score: \($zscore))",
            created_at: $ts,
            status: "open"
        }')

    echo "$alert" > "${ALERTS_DIR}/${alert_id}.json"

    # Emit event
    emit_event "anomaly_detected" "anomaly-detector" "$alert"

    echo "🚨 ANOMALY DETECTED: $metric_name = $current_value (z-score: $zscore)"
}

# Monitor key metrics
monitor_metrics() {
    # Worker spawn failures
    detect_anomalies "workers.spawn_failed"

    # Task completion time
    detect_anomalies "task.completion_time"

    # Queue depth
    detect_anomalies "task_queue.pending"

    # Worker pool size
    detect_anomalies "pool.active_workers"

    # Code quality issues
    detect_anomalies "code_quality.issues"
}

# Run every 5 minutes
while true; do
    monitor_metrics
    sleep 300
done
```

### 3.2 Root Cause Analyzer

**Script**: `coordination/observability/analyzers/root-cause-analyzer.sh`

```bash
#!/bin/bash
# coordination/observability/analyzers/root-cause-analyzer.sh
# Automated root cause analysis using trace correlation

set -euo pipefail

TRACES_DIR="${COMMIT_RELAY_HOME}/coordination/observability/storage/traces/consolidated"
EVENTS_LOG="${COMMIT_RELAY_HOME}/coordination/observability/storage/events.jsonl"

analyze_failed_trace() {
    local trace_id="$1"
    local trace_file="${TRACES_DIR}/${trace_id}.json"

    if [ ! -f "$trace_file" ]; then
        echo "Trace not found: $trace_id"
        return 1
    fi

    local trace=$(cat "$trace_file")

    # Find the first error span
    local error_span=$(echo "$trace" | jq -r '.spans[] | select(.status == "error") | @json' | head -1)

    if [ -z "$error_span" ]; then
        echo "No errors found in trace"
        return 0
    fi

    local error_service=$(echo "$error_span" | jq -r '.service')
    local error_name=$(echo "$error_span" | jq -r '.name')
    local error_msg=$(echo "$error_span" | jq -r '.error')
    local error_time=$(echo "$error_span" | jq -r '.end_time_ms')

    echo "=== ROOT CAUSE ANALYSIS ==="
    echo "Trace ID: $trace_id"
    echo "Failed Span: $error_name"
    echo "Service: $error_service"
    echo "Error: $error_msg"
    echo ""

    # Look for correlated events
    echo "Correlated Events:"
    grep "$trace_id" "$EVENTS_LOG" | jq -r '
        select(.timestamp | fromdateiso8601 * 1000 <= '"$error_time"') |
        "  [\(.timestamp)] \(.event_type): \(.details.message // .details)"'

    echo ""

    # Analyze span timings to find bottleneck
    echo "Span Performance:"
    echo "$trace" | jq -r '.spans | sort_by(.duration_ms) | reverse | .[] |
        "  \(.name): \(.duration_ms)ms (\(.status))"'

    echo ""

    # Suggested remediation
    echo "Suggested Actions:"
    case "$error_service" in
        worker-daemon)
            echo "  - Check worker pool capacity"
            echo "  - Review spawn-worker.sh logs"
            echo "  - Verify worker spec validity"
            ;;
        worker)
            echo "  - Review worker stdout/stderr logs"
            echo "  - Check task context validity"
            echo "  - Verify prompt template substitution"
            ;;
        coordinator-master)
            echo "  - Check MoE routing logic"
            echo "  - Review routing-decisions.jsonl"
            echo "  - Verify task queue integrity"
            ;;
        *)
            echo "  - Check service health"
            echo "  - Review service logs"
            ;;
    esac
}

# Example usage
# ./root-cause-analyzer.sh trace-1762893199-ABC
```

## Phase 4: Observability Dashboard (Week 4-5)

### 4.1 Real-Time Observability UI

**File**: `coordination/observability/dashboards/observability-ui/index.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>commit-relay Observability</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: #0f0f23;
            color: #e0e0e0;
        }
        .dashboard {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
            gap: 20px;
        }
        .panel {
            background: #1a1a2e;
            border: 1px solid #333;
            border-radius: 8px;
            padding: 20px;
        }
        .panel h2 {
            margin-top: 0;
            font-size: 18px;
            color: #58a6ff;
        }
        .metric {
            display: flex;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px solid #333;
        }
        .metric:last-child {
            border-bottom: none;
        }
        .metric-name {
            font-weight: 500;
        }
        .metric-value {
            font-size: 24px;
            font-weight: bold;
            color: #58ff8d;
        }
        .alert {
            background: #3d1f1f;
            border-left: 4px solid #ff4444;
            padding: 15px;
            margin-bottom: 10px;
            border-radius: 4px;
        }
        .alert.critical {
            border-left-color: #ff0000;
        }
        .alert.high {
            border-left-color: #ff6600;
        }
        .trace {
            background: #1f2937;
            padding: 10px;
            margin: 5px 0;
            border-radius: 4px;
            cursor: pointer;
        }
        .trace:hover {
            background: #2d3748;
        }
        .span {
            margin-left: 20px;
            padding: 5px;
            font-family: monospace;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <h1>🔍 commit-relay Observability</h1>

    <div class="dashboard">
        <!-- Key Metrics -->
        <div class="panel">
            <h2>📊 Key Metrics</h2>
            <div id="key-metrics"></div>
        </div>

        <!-- Active Alerts -->
        <div class="panel">
            <h2>🚨 Active Alerts</h2>
            <div id="alerts"></div>
        </div>

        <!-- Recent Traces -->
        <div class="panel">
            <h2>🔗 Recent Traces</h2>
            <div id="traces"></div>
        </div>

        <!-- Service Health -->
        <div class="panel">
            <h2>💚 Service Health</h2>
            <div id="service-health"></div>
        </div>
    </div>

    <script>
        const API_BASE = 'http://localhost:3001/api/observability';

        // Fetch key metrics
        async function fetchMetrics() {
            const response = await fetch(`${API_BASE}/metrics`);
            const data = await response.json();

            const html = Object.entries(data).map(([name, value]) => `
                <div class="metric">
                    <span class="metric-name">${name}</span>
                    <span class="metric-value">${value}</span>
                </div>
            `).join('');

            document.getElementById('key-metrics').innerHTML = html;
        }

        // Fetch active alerts
        async function fetchAlerts() {
            const response = await fetch(`${API_BASE}/alerts`);
            const alerts = await response.json();

            const html = alerts.map(alert => `
                <div class="alert ${alert.severity}">
                    <strong>${alert.severity.toUpperCase()}</strong>: ${alert.message}
                    <br><small>${alert.created_at}</small>
                </div>
            `).join('');

            document.getElementById('alerts').innerHTML = html || '<p>No active alerts</p>';
        }

        // Fetch recent traces
        async function fetchTraces() {
            const response = await fetch(`${API_BASE}/traces?limit=10`);
            const traces = await response.json();

            const html = traces.map(trace => `
                <div class="trace" onclick="showTrace('${trace.trace_id}')">
                    <strong>${trace.trace_id}</strong> - ${trace.duration_ms}ms
                    <span style="float:right; color: ${trace.status === 'success' ? '#58ff8d' : '#ff4444'}">
                        ${trace.status}
                    </span>
                </div>
            `).join('');

            document.getElementById('traces').innerHTML = html;
        }

        // Show trace details
        function showTrace(traceId) {
            window.location.href = `/trace.html?id=${traceId}`;
        }

        // Refresh data every 5 seconds
        setInterval(() => {
            fetchMetrics();
            fetchAlerts();
            fetchTraces();
        }, 5000);

        // Initial load
        fetchMetrics();
        fetchAlerts();
        fetchTraces();
    </script>
</body>
</html>
```

### 4.2 Observability API Server

**File**: `coordination/observability/dashboards/observability-ui/server.js`

```javascript
// coordination/observability/dashboards/observability-ui/server.js
const express = require('express');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3001;

const COMMIT_RELAY_HOME = process.env.COMMIT_RELAY_HOME || '/Users/ryandahlberg/commit-relay';
const OBSERVABILITY_DIR = path.join(COMMIT_RELAY_HOME, 'coordination/observability');

// Serve static files
app.use(express.static(__dirname));

// Get key metrics
app.get('/api/observability/metrics', (req, res) => {
    try {
        const aggregatesFile = path.join(OBSERVABILITY_DIR, 'storage/metrics/aggregates.json');
        const aggregates = JSON.parse(fs.readFileSync(aggregatesFile, 'utf8'));

        const metrics = {
            'Active Workers': aggregates.metrics?.['pool.active_workers']?.avg || 0,
            'Pending Tasks': aggregates.metrics?.['task_queue.pending']?.avg || 0,
            'Avg Completion Time': `${(aggregates.metrics?.['task.completion_time']?.avg || 0).toFixed(1)}m`,
            'Worker Success Rate': `${((aggregates.metrics?.['workers.spawned']?.count || 0) /
                ((aggregates.metrics?.['workers.spawned']?.count || 0) +
                 (aggregates.metrics?.['workers.spawn_failed']?.count || 0)) * 100).toFixed(1)}%`
        };

        res.json(metrics);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get active alerts
app.get('/api/observability/alerts', (req, res) => {
    try {
        const alertsDir = path.join(OBSERVABILITY_DIR, 'alerting/incidents');
        const alertFiles = fs.readdirSync(alertsDir).filter(f => f.endsWith('.json'));

        const alerts = alertFiles.map(file => {
            const alert = JSON.parse(fs.readFileSync(path.join(alertsDir, file), 'utf8'));
            return alert.status === 'open' ? alert : null;
        }).filter(Boolean);

        res.json(alerts);
    } catch (error) {
        res.json([]);
    }
});

// Get recent traces
app.get('/api/observability/traces', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const tracesDir = path.join(OBSERVABILITY_DIR, 'storage/traces/consolidated');

        const traceFiles = fs.readdirSync(tracesDir)
            .filter(f => f.endsWith('.json'))
            .sort((a, b) => {
                const statA = fs.statSync(path.join(tracesDir, a));
                const statB = fs.statSync(path.join(tracesDir, b));
                return statB.mtimeMs - statA.mtimeMs;
            })
            .slice(0, limit);

        const traces = traceFiles.map(file => {
            return JSON.parse(fs.readFileSync(path.join(tracesDir, file), 'utf8'));
        });

        res.json(traces);
    } catch (error) {
        res.json([]);
    }
});

// Get trace details
app.get('/api/observability/traces/:traceId', (req, res) => {
    try {
        const traceFile = path.join(OBSERVABILITY_DIR, 'storage/traces/consolidated', `${req.params.traceId}.json`);
        const trace = JSON.parse(fs.readFileSync(traceFile, 'utf8'));
        res.json(trace);
    } catch (error) {
        res.status(404).json({ error: 'Trace not found' });
    }
});

app.listen(PORT, () => {
    console.log(`Observability UI running at http://localhost:${PORT}`);
});
```

## Phase 5: Integration & Rollout (Week 5-6)

### 5.1 Instrument All Critical Services

**Services to Instrument**:

1. ✅ `scripts/worker-daemon.sh` (example provided above)
2. `scripts/spawn-worker.sh`
3. `scripts/task-completion-daemon.sh`
4. `coordination/masters/coordinator/lib/moe-router.sh`
5. `coordination/masters/development/development-master.sh`
6. `coordination/masters/security/security-master.sh`
7. `agents/code-runner/code-runner.sh`

### 5.2 Migration Checklist

```bash
#!/bin/bash
# scripts/observability-migration.sh

echo "=== commit-relay Observability Migration ==="
echo ""

# 1. Initialize infrastructure
echo "Step 1: Initializing observability infrastructure..."
source coordination/observability/lib/otel-shim.sh
init_observability

# 2. Start collectors
echo "Step 2: Starting data collectors..."
nohup coordination/observability/collectors/trace-consolidator.sh > /tmp/trace-consolidator.log 2>&1 &
nohup coordination/observability/collectors/metrics-aggregator.sh > /tmp/metrics-aggregator.log 2>&1 &

# 3. Start analyzers
echo "Step 3: Starting analyzers..."
nohup coordination/observability/analyzers/anomaly-detector.sh > /tmp/anomaly-detector.log 2>&1 &

# 4. Start observability UI
echo "Step 4: Starting observability UI..."
cd coordination/observability/dashboards/observability-ui
npm install
nohup node server.js > /tmp/observability-ui.log 2>&1 &

echo ""
echo "✅ Observability platform initialized"
echo "   Dashboard: http://localhost:3001"
echo "   Logs: /tmp/observability-*.log"
```

## Success Metrics

Track these KPIs to measure observability maturity:

### Operational Metrics (Week 6+)

| Metric | Baseline | Target | Measurement |
|--------|----------|--------|-------------|
| **MTTD** (Mean Time to Detect) | Unknown | < 5 minutes | Time from issue start to alert |
| **MTTR** (Mean Time to Repair) | 60+ minutes | < 15 minutes | Time from alert to resolution |
| **False Positive Rate** | Unknown | < 5% | Alerts / True Issues |
| **Coverage** | 30% | 90% | Services instrumented |
| **Query Latency** | N/A | < 1 second | Time to answer common queries |

### Business Metrics

| Metric | Baseline | Target |
|--------|----------|--------|
| **Worker Success Rate** | ~70% | 95% |
| **Task Completion Time** | 45 minutes | 30 minutes |
| **System Uptime** | Unknown | 99.9% |

## Advanced Observability Patterns

### Pattern 1: Trace-Based Testing

Use traces to verify system behavior:

```bash
#!/bin/bash
# tests/observability/trace-based-test.sh

# Create test task
TASK_ID=$(./scripts/create-task.sh "Test task for observability")

# Wait for completion
sleep 300

# Verify trace exists
TRACE_ID=$(grep "$TASK_ID" coordination/observability/storage/events.jsonl | jq -r '.trace_id' | head -1)

if [ -z "$TRACE_ID" ]; then
    echo "❌ No trace found for task $TASK_ID"
    exit 1
fi

# Verify trace completeness
TRACE_FILE="coordination/observability/storage/traces/consolidated/${TRACE_ID}.json"
SPAN_COUNT=$(jq '.span_count' "$TRACE_FILE")

if [ "$SPAN_COUNT" -lt 5 ]; then
    echo "❌ Incomplete trace: only $SPAN_COUNT spans"
    exit 1
fi

echo "✅ Trace verified: $TRACE_ID ($SPAN_COUNT spans)"
```

### Pattern 2: SLO Monitoring

Define and track Service Level Objectives:

```bash
# coordination/observability/slo/slo-definitions.json
{
  "worker_success_rate": {
    "description": "Worker spawn success rate",
    "target": 0.95,
    "measurement": "workers.spawned / (workers.spawned + workers.spawn_failed)",
    "window": "7d"
  },
  "task_completion_time_p95": {
    "description": "95th percentile task completion time",
    "target": 60,
    "unit": "minutes",
    "measurement": "p95(task.completion_time)",
    "window": "7d"
  },
  "alert_response_time": {
    "description": "Time from alert to remediation",
    "target": 15,
    "unit": "minutes",
    "measurement": "avg(alert.resolution_time)",
    "window": "30d"
  }
}
```

## Integration with Existing Systems

### Dashboard Integration

Add observability metrics to existing dashboard:

```javascript
// dashboard/server/index.js - Add these endpoints

app.get('/api/observability/summary', (req, res) => {
  exec(`${COMMIT_RELAY_HOME}/coordination/observability/query/query-engine.sh summary`,
    (error, stdout, stderr) => {
      res.json(JSON.parse(stdout));
    }
  );
});

app.get('/api/observability/traces/:traceId', (req, res) => {
  const traceFile = path.join(
    COMMIT_RELAY_HOME,
    'coordination/observability/storage/traces/consolidated',
    `${req.params.traceId}.json`
  );
  res.sendFile(traceFile);
});
```

## Conclusion

This implementation transforms commit-relay from a reactive system to a proactive, observable platform. By implementing the three pillars of observability (logs, metrics, traces) with high-cardinality dimensions and automated analysis, you gain:

1. **X-ray vision** into system behavior
2. **Time travel** through traces to understand what happened
3. **Crystal ball** predictions via anomaly detection
4. **Superhero speed** in incident response

As Splunk says: "In a world where complexity is inevitable and downtime is not an option, observability is your organization's superhero."

## Next Steps

1. Week 1-2: Implement Phase 1 (Data Collection)
2. Week 2-3: Implement Phase 2 (Metrics & Dimensions)
3. Week 3-4: Implement Phase 3 (Anomaly Detection)
4. Week 4-5: Implement Phase 4 (Dashboard)
5. Week 5-6: Rollout & Integration
6. Week 6+: Optimize based on success metrics

## References

- Splunk: "A Beginner's Guide to Observability"
- OpenTelemetry: https://opentelemetry.io/
- Three Pillars: Logs, Metrics, Traces
- High-Cardinality Data: Dimensional modeling for specific queries
- Anomaly Detection: Statistical z-score analysis
- Root Cause Analysis: Trace correlation and event analysis
