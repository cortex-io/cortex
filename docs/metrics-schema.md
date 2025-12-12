# Cortex Metrics Schema

Complete documentation for Cortex Prometheus metrics, including examples, PromQL queries, and alerting rules.

## Table of Contents

1. [Task Queue Metrics](#task-queue-metrics)
2. [Worker Metrics](#worker-metrics)
3. [Master Metrics](#master-metrics)
4. [Task Execution Metrics](#task-execution-metrics)
5. [Token Budget Metrics](#token-budget-metrics)
6. [PromQL Query Examples](#promql-query-examples)
7. [Alerting Rules](#alerting-rules)

---

## Task Queue Metrics

### `cortex_task_queue_depth`

**Type:** Gauge
**Help:** Current task queue depth by type
**Labels:**
- `type`: Task type (implementation, security, analysis, scan, feature, bug_fix)

**Example:**
```promql
cortex_task_queue_depth{type="implementation"} 15
cortex_task_queue_depth{type="security"} 3
```

**Source:** `coordination/task-queue.json`
**Calculation:** Count of tasks where `status != 'completed'` grouped by type

**Usage:**
```promql
# Total queue depth
sum(cortex_task_queue_depth)

# Queue depth by type
cortex_task_queue_depth

# Queue depth over time
rate(cortex_task_queue_depth[5m])
```

---

### `cortex_task_queue_age_seconds`

**Type:** Gauge
**Help:** Age of oldest task in queue by type
**Labels:**
- `type`: Task type

**Example:**
```promql
cortex_task_queue_age_seconds{type="implementation"} 245
```

**Source:** `coordination/task-queue.json`
**Calculation:** `now() - task.created_at` for oldest task by type

**Usage:**
```promql
# Oldest task age
max(cortex_task_queue_age_seconds)

# Tasks older than 1 hour
cortex_task_queue_age_seconds > 3600
```

---

## Worker Metrics

### `cortex_active_workers`

**Type:** Gauge
**Help:** Currently active workers by type and status
**Labels:**
- `type`: Worker type (implementation-worker, security-worker, etc.)
- `status`: Worker status (running, idle, spawning, terminating)

**Example:**
```promql
cortex_active_workers{type="implementation-worker",status="running"} 5
cortex_active_workers{type="security-worker",status="idle"} 2
```

**Source:** `coordination/worker-pool.json`
**Calculation:** Count of workers in `active_workers` array

**Usage:**
```promql
# Total active workers
sum(cortex_active_workers)

# Workers by type
sum(cortex_active_workers) by (type)

# Running workers only
sum(cortex_active_workers{status="running"})
```

---

### `cortex_worker_spawn_total`

**Type:** Counter
**Help:** Total worker spawns
**Labels:**
- `type`: Worker type

**Example:**
```promql
cortex_worker_spawn_total{type="implementation-worker"} 245
```

**Source:** Incremented when new workers detected in pool
**Usage:**
```promql
# Spawn rate (per second)
rate(cortex_worker_spawn_total[5m])

# Total spawns in last hour
increase(cortex_worker_spawn_total[1h])

# Spawn rate by type
sum(rate(cortex_worker_spawn_total[5m])) by (type)
```

---

### `cortex_worker_termination_total`

**Type:** Counter
**Help:** Total worker terminations
**Labels:**
- `type`: Worker type
- `reason`: Termination reason (completed, failed, timeout, spawn_failure)

**Example:**
```promql
cortex_worker_termination_total{type="implementation-worker",reason="completed"} 198
cortex_worker_termination_total{type="security-worker",reason="failed"} 5
```

**Usage:**
```promql
# Termination rate
rate(cortex_worker_termination_total[5m])

# Failed terminations
sum(cortex_worker_termination_total{reason="failed"})

# Success rate
sum(rate(cortex_worker_termination_total{reason="completed"}[5m]))
/
sum(rate(cortex_worker_termination_total[5m]))
```

---

## Master Metrics

### `cortex_master_health`

**Type:** Gauge
**Help:** Master health status (1=healthy, 0=unhealthy)
**Labels:**
- `master`: Master name (coordinator, development, security, cicd, inventory)

**Example:**
```promql
cortex_master_health{master="coordinator"} 1
cortex_master_health{master="security"} 0
```

**Source:** `coordination/masters/*/context/master-state.json`
**Calculation:**
- `1` if `last_run` < 5 minutes ago AND `status != 'error'|'failed'`
- `0` otherwise

**Usage:**
```promql
# Healthy masters count
sum(cortex_master_health)

# Unhealthy masters
cortex_master_health == 0

# Master availability rate
sum(cortex_master_health) / count(cortex_master_health)
```

---

### `cortex_moe_routing_confidence`

**Type:** Gauge
**Help:** MoE routing confidence score (0-1)
**Labels:**
- `from_master`: Source master
- `to_master`: Destination master

**Example:**
```promql
cortex_moe_routing_confidence{from_master="coordinator",to_master="development"} 0.92
```

**Source:** `coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl`
**Calculation:** Average of recent routing decision confidence scores

**Usage:**
```promql
# Average routing confidence
avg(cortex_moe_routing_confidence)

# Low confidence routes
cortex_moe_routing_confidence < 0.5

# Confidence by destination
avg(cortex_moe_routing_confidence) by (to_master)
```

---

### `cortex_moe_handoff_total`

**Type:** Counter
**Help:** Total MoE handoffs between masters
**Labels:**
- `from_master`: Source master
- `to_master`: Destination master

**Example:**
```promql
cortex_moe_handoff_total{from_master="coordinator",to_master="development"} 156
```

**Source:** `coordination/masters/coordinator/handoffs/*.json`
**Usage:**
```promql
# Handoff rate
rate(cortex_moe_handoff_total[5m])

# Most common routes
topk(5, sum(cortex_moe_handoff_total) by (from_master, to_master))

# Handoffs to development master
sum(cortex_moe_handoff_total{to_master="development"})
```

---

## Task Execution Metrics

### `cortex_task_duration_seconds`

**Type:** Histogram
**Help:** Task completion time in seconds
**Labels:**
- `type`: Task type
- `status`: Task status (completed, failed)

**Buckets:** [1, 5, 10, 30, 60, 120, 300, 600, 1800, 3600]

**Example:**
```promql
cortex_task_duration_seconds_bucket{type="implementation",status="completed",le="60"} 45
cortex_task_duration_seconds_count{type="implementation",status="completed"} 198
cortex_task_duration_seconds_sum{type="implementation",status="completed"} 8945
```

**Source:** `coordination/task-queue.json`
**Calculation:** `task.completed_at - task.created_at`

**Usage:**
```promql
# Average task duration
rate(cortex_task_duration_seconds_sum[5m])
/
rate(cortex_task_duration_seconds_count[5m])

# 95th percentile duration
histogram_quantile(0.95,
  sum(rate(cortex_task_duration_seconds_bucket[5m])) by (le, type)
)

# 50th percentile (median)
histogram_quantile(0.50,
  sum(rate(cortex_task_duration_seconds_bucket[5m])) by (le)
)
```

---

### `cortex_task_success_rate`

**Type:** Gauge
**Help:** Task success rate (0-1) over last hour
**Labels:**
- `type`: Task type

**Example:**
```promql
cortex_task_success_rate{type="implementation"} 0.95
```

**Source:** `coordination/task-queue.json`
**Calculation:** `completed_tasks / total_tasks` (last 1 hour)

**Usage:**
```promql
# Overall success rate
avg(cortex_task_success_rate)

# Low success rate tasks
cortex_task_success_rate < 0.5

# Success rate trend
rate(cortex_task_success_rate[5m])
```

---

### `cortex_task_completion_total`

**Type:** Counter
**Help:** Total task completions
**Labels:**
- `type`: Task type
- `status`: Task status (completed, failed)

**Example:**
```promql
cortex_task_completion_total{type="implementation",status="completed"} 198
cortex_task_completion_total{type="security",status="failed"} 5
```

**Usage:**
```promql
# Completion rate
rate(cortex_task_completion_total[5m])

# Success vs failure ratio
sum(rate(cortex_task_completion_total{status="completed"}[5m]))
/
sum(rate(cortex_task_completion_total[5m]))

# Failed tasks in last hour
increase(cortex_task_completion_total{status="failed"}[1h])
```

---

## Token Budget Metrics

### `cortex_token_budget_total`

**Type:** Gauge
**Help:** Total token budget

**Example:**
```promql
cortex_token_budget_total 500000
```

**Source:** `coordination/token-budget.json`

---

### `cortex_token_budget_allocated`

**Type:** Gauge
**Help:** Currently allocated tokens

**Example:**
```promql
cortex_token_budget_allocated 125000
```

---

### `cortex_token_budget_available`

**Type:** Gauge
**Help:** Available tokens

**Example:**
```promql
cortex_token_budget_available 375000
```

**Usage:**
```promql
# Token usage percentage
(cortex_token_budget_allocated / cortex_token_budget_total) * 100

# Remaining budget
cortex_token_budget_available

# Token burn rate (tokens/second)
rate(cortex_token_budget_allocated[5m])
```

---

## PromQL Query Examples

### Dashboard Queries

#### Task Queue Overview
```promql
# Total queue depth
sum(cortex_task_queue_depth)

# Queue depth by type (for stacked graph)
cortex_task_queue_depth

# Average queue age
avg(cortex_task_queue_age_seconds)
```

#### Worker Performance
```promql
# Active workers by type
sum(cortex_active_workers) by (type)

# Worker spawn rate (per minute)
sum(rate(cortex_worker_spawn_total[5m])) by (type) * 60

# Worker success rate
sum(rate(cortex_worker_termination_total{reason="completed"}[5m]))
/
sum(rate(cortex_worker_termination_total[5m]))
```

#### Master Health
```promql
# Total healthy masters
sum(cortex_master_health)

# Master availability percentage
(sum(cortex_master_health) / count(cortex_master_health)) * 100

# Average routing confidence
avg(cortex_moe_routing_confidence)
```

#### Task Execution
```promql
# Tasks completed per minute
sum(rate(cortex_task_completion_total{status="completed"}[5m])) * 60

# Average task duration
rate(cortex_task_duration_seconds_sum[5m])
/
rate(cortex_task_duration_seconds_count[5m])

# Task success rate percentage
(sum(rate(cortex_task_completion_total{status="completed"}[5m]))
/
sum(rate(cortex_task_completion_total[5m]))) * 100
```

---

## Alerting Rules

### Critical Alerts

#### Master Health
```yaml
- alert: CortexMasterUnhealthy
  expr: cortex_master_health == 0
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "Master {{ $labels.master }} is unhealthy"
    description: "Master has been unhealthy for 5+ minutes"
```

#### Task Queue Backlog
```yaml
- alert: CortexTaskQueueBacklog
  expr: cortex_task_queue_depth > 100
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "Task queue backlog detected"
    description: "Queue depth is {{ $value }} for {{ $labels.type }}"
```

#### No Active Workers
```yaml
- alert: CortexNoActiveWorkers
  expr: sum(cortex_active_workers) == 0 and sum(cortex_task_queue_depth) > 0
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "No workers active with pending tasks"
    description: "{{ $value }} tasks pending but no workers"
```

### Performance Alerts

#### Slow Task Execution
```yaml
- alert: CortexSlowTaskExecution
  expr: histogram_quantile(0.95, rate(cortex_task_duration_seconds_bucket[10m])) > 600
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "Slow task execution (p95 > 10 minutes)"
    description: "95th percentile duration: {{ $value }}s"
```

#### Low Success Rate
```yaml
- alert: CortexLowSuccessRate
  expr: cortex_task_success_rate < 0.5
  for: 15m
  labels:
    severity: warning
  annotations:
    summary: "Low task success rate"
    description: "Success rate for {{ $labels.type }}: {{ $value }}"
```

---

## Metrics Endpoint

Access Cortex metrics at:
```
http://cortex-dashboard:3004/metrics
```

Example output:
```
# HELP cortex_task_queue_depth Current task queue depth by type
# TYPE cortex_task_queue_depth gauge
cortex_task_queue_depth{type="implementation"} 15
cortex_task_queue_depth{type="security"} 3

# HELP cortex_active_workers Currently active workers by type and status
# TYPE cortex_active_workers gauge
cortex_active_workers{type="implementation-worker",status="running"} 5

# HELP cortex_master_health Master health status (1=healthy, 0=unhealthy)
# TYPE cortex_master_health gauge
cortex_master_health{master="coordinator"} 1
cortex_master_health{master="development"} 1
```

---

## Integration with Grafana

Import the pre-built dashboards:
1. **Cortex Autoscaling** - Task queue and worker scaling
2. **Cortex Masters** - Master health and MoE routing
3. **Cortex Workers** - Task execution and performance

All dashboards use `Cortex-Prometheus` as the default datasource.

---

## Retention and Storage

- **Scrape Interval:** 15 seconds
- **Retention Period:** 30 days
- **Storage Size:** 20GB (Prometheus PVC)
- **High Availability:** Single replica (sufficient for development)

For production, consider:
- Prometheus Operator for HA
- Thanos for long-term storage
- AlertManager for advanced alerting
