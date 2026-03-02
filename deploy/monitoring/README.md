# Cortex Monitoring Stack

Comprehensive monitoring configuration for the cortex automation system using Prometheus and Grafana.

## Overview

This monitoring stack provides full observability into cortex operations including:

- **Core Metrics**: Request latency, throughput, error rates
- **Agent Metrics**: Master/worker performance, token consumption, task completion
- **MCP Server Metrics**: Tool calls, connection pools, latency
- **Contractor Metrics**: Task completion, specialization effectiveness
- **Resource Metrics**: CPU, memory, network I/O
- **Business Metrics**: Task queue depth, handoff performance

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Grafana Dashboards                  │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │
│  │   Cortex     │ │ MCP Servers  │ │ Contractors  │ │
│  │   Overview   │ │   Dashboard  │ │ Performance  │ │
│  └──────────────┘ └──────────────┘ └──────────────┘ │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│                  Prometheus                          │
│  ┌──────────────────────────────────────────────┐   │
│  │  Scrape Configs + Recording Rules + Alerts  │   │
│  └──────────────────────────────────────────────┘   │
└────┬────────┬────────┬────────┬───────────┬────────┘
     │        │        │        │           │
┌────▼────┐ ┌▼────┐ ┌─▼────┐ ┌─▼──────┐  ┌▼────────┐
│ Cortex  │ │ MCP │ │Worker│ │Contract│  │Division │
│  Core   │ │Srvrs│ │Agents│ │  ors   │  │   GMs   │
└─────────┘ └─────┘ └──────┘ └────────┘  └─────────┘
```

## Directory Structure

```
deploy/monitoring/
├── prometheus/
│   ├── prometheus-config.yaml    # Main Prometheus configuration
│   ├── alerting-rules.yaml       # Alert rules for operations
│   └── recording-rules.yaml      # Performance aggregations
├── grafana/
│   ├── datasources.yaml          # Prometheus/Loki/Tempo datasources
│   └── dashboards/
│       ├── cortex-overview.json           # Main system dashboard
│       ├── mcp-servers.json               # MCP server metrics
│       └── contractor-performance.json    # Contractor analytics
├── servicemonitor.yaml           # ServiceMonitor CRDs
├── podmonitor.yaml              # PodMonitor CRDs
└── README.md                    # This file
```

## Components

### Prometheus Configuration

**File**: `prometheus/prometheus-config.yaml`

Scrape configurations for:
- Cortex core (meta-agent): 10s interval
- Master agents: 15s interval
- Worker agents: 10s interval
- MCP servers: 15s interval
- Contractors: 20s interval
- Dashboard: 15s interval
- Kubernetes components (API, nodes, cAdvisor)

### Alerting Rules

**File**: `prometheus/alerting-rules.yaml`

Alert categories:
1. **Core Alerts**: Meta-agent down, high error rate, high latency
2. **Master Alerts**: Master down, worker spawn failures, task backlog
3. **Worker Alerts**: High failure rate, token exhaustion, stuck workers
4. **MCP Alerts**: Server down, high latency, connection pool exhaustion
5. **Contractor Alerts**: Down, high error rate, slow response
6. **Resource Alerts**: High CPU/memory, pod restart loops
7. **Task Alerts**: Low completion rate, queue growth, long-running tasks
8. **Token Alerts**: High consumption, budget exhaustion

### Recording Rules

**File**: `prometheus/recording-rules.yaml`

Pre-aggregated metrics for dashboard performance:
- Request/error rates (1m, 5m, 15m intervals)
- Latency percentiles (p50, p95, p99)
- Task completion rates by master/worker type
- Token consumption metrics
- Resource utilization by component
- Handoff coordination metrics

### Grafana Dashboards

#### 1. Cortex Overview Dashboard

**File**: `grafana/dashboards/cortex-overview.json`

**Panels**:
- System Health: Status of all cortex components
- Request Rate: Requests/sec by component
- Error Rate: Error percentage with alerts
- Request Latency: p50/p95/p99 latencies
- Active Workers: Workers by master type
- Task Completion Rate: Completed vs failed tasks
- Task Success Rate: Overall success percentage
- Token Consumption: Rate by component
- Token Budget: Gauge showing budget utilization
- Tokens Per Task: Average token efficiency
- CPU/Memory Utilization: By component type
- Task Queue Depth: Queue length by master
- Handoff Metrics: Creation/completion/failure rates
- Network I/O: Bytes received/transmitted

**Variables**:
- `namespace`: Filter by Kubernetes namespace
- `master_type`: Filter by master type

**Annotations**:
- Firing alerts overlaid on graphs

#### 2. MCP Servers Dashboard

**File**: `grafana/dashboards/mcp-servers.json`

**Panels**:
- MCP Server Status: Up/down status by server type
- Request Rate: Requests by MCP server type
- Error Rate: Error percentage by server
- Latency Percentiles: p50/p95/p99 by server type
- Tool Call Rate: Tool invocations per second
- Tool Call Success Rate: Success percentage
- Tool Call Failures: Failures by tool name
- Connection Pool Utilization: Pool usage percentage
- Active Connections: Active vs limit
- Memory/CPU Usage: Resource usage by pod
- Tool Call Duration Heatmap: Duration distribution
- Top 10 Most Used Tools: Bar chart
- MCP Server Capabilities: Table view

**Variables**:
- `mcp_type`: Filter by MCP server type
- `tool_name`: Filter by tool name

#### 3. Contractor Performance Dashboard

**File**: `grafana/dashboards/contractor-performance.json`

**Panels**:
- Contractor Status: Online/offline status
- Request Rate: Requests by contractor type
- Error Rate: Error percentage with alerts
- Task Completion Rate: Completed vs failed
- Success Rate: Overall success percentage
- Response Latency: p50 and p95 latencies
- Specialization Effectiveness: Avg duration by specialization
- Task Volume: Pie chart of task distribution
- Infrastructure Contractor: Kubernetes operations
- n8n Contractor: Workflow execution status
- Talos Contractor: OS management tasks
- Memory/CPU Usage: Resource usage
- Performance Score: Success rate gauge
- Utilization Heatmap: Usage over time
- Top Tasks: Table of most common tasks (24h)

**Variables**:
- `contractor_type`: Filter by contractor
- `specialization`: Filter by specialization

### Kubernetes Monitoring Resources

#### ServiceMonitors

**File**: `servicemonitor.yaml`

Defines service-level monitoring for:
- `cortex-core`: Meta-agent metrics (10s interval)
- `cortex-masters`: Master agent metrics (15s interval)
- `cortex-contractors`: Contractor metrics (20s interval)
- `cortex-dashboard`: Dashboard metrics (15s interval)

Features:
- Automatic pod/namespace/service labeling
- Metric filtering by name prefix
- Prometheus Operator integration

#### PodMonitors

**File**: `podmonitor.yaml`

Defines pod-level monitoring for:
- `cortex-workers`: Worker agent metrics (10s interval)
- `mcp-servers`: MCP server metrics (15s interval)
- `cortex-divisions`: Division/GM metrics (20s interval)
- `cortex-n8n`: n8n workflow metrics (30s interval)

Features:
- Dynamic label extraction from pod metadata
- Annotation-based configuration
- Fine-grained metric filtering

## Deployment

### Prerequisites

1. Kubernetes cluster with Prometheus Operator installed
2. Grafana instance deployed
3. Cortex components exposing `/metrics` endpoint

### Deploy Prometheus Configuration

```bash
# Create ConfigMaps for Prometheus config
kubectl create configmap prometheus-config \
  --from-file=prometheus/prometheus-config.yaml \
  -n cortex

kubectl create configmap prometheus-rules \
  --from-file=prometheus/alerting-rules.yaml \
  --from-file=prometheus/recording-rules.yaml \
  -n cortex
```

### Deploy Monitoring Resources

```bash
# Apply ServiceMonitors and PodMonitors
kubectl apply -f servicemonitor.yaml
kubectl apply -f podmonitor.yaml
```

### Configure Grafana

```bash
# Create datasources ConfigMap
kubectl create configmap grafana-datasources \
  --from-file=grafana/datasources.yaml \
  -n cortex

# Create dashboards ConfigMap
kubectl create configmap grafana-dashboards \
  --from-file=grafana/dashboards/ \
  -n cortex
```

### Verify Deployment

```bash
# Check Prometheus targets
kubectl port-forward -n cortex svc/prometheus 9090:9090
# Visit http://localhost:9090/targets

# Check Grafana dashboards
kubectl port-forward -n cortex svc/grafana 3000:3000
# Visit http://localhost:3000
```

## Metrics Reference

### Cortex Core Metrics

```
cortex_requests_total{component, status}              # Total requests
cortex_request_duration_seconds{component}            # Request latency histogram
cortex_tokens_consumed_total{component}               # Tokens consumed
cortex_tokens_budget                                  # Total token budget
cortex_tokens_remaining                               # Remaining tokens
```

### Master Agent Metrics

```
cortex_master_tasks_processed_total{master_type}      # Tasks received
cortex_master_tasks_completed_total{master_type}      # Tasks completed
cortex_master_tasks_failed_total{master_type}         # Tasks failed
cortex_master_workers_spawned_total{master_type}      # Workers spawned
cortex_master_worker_spawn_failures_total             # Spawn failures
cortex_master_task_queue_length{master_type}          # Queue depth
cortex_master_memory_usage_bytes{master_type}         # Memory usage
cortex_master_memory_limit_bytes{master_type}         # Memory limit
```

### Worker Agent Metrics

```
cortex_worker_task_completions_total{worker_type}     # Completed tasks
cortex_worker_task_failures_total{worker_type}        # Failed tasks
cortex_worker_task_duration_seconds{worker_type}      # Task duration histogram
cortex_worker_tokens_consumed_total{worker_type}      # Tokens used
cortex_worker_tokens_allocated{worker_type}           # Allocated tokens
cortex_worker_tokens_remaining{worker_type}           # Remaining tokens
cortex_worker_status{worker_type, status}             # Worker status (active/idle/failed)
cortex_worker_last_activity_timestamp                 # Last activity timestamp
```

### MCP Server Metrics

```
mcp_requests_total{mcp_type, status}                  # Total requests
mcp_request_duration_seconds{mcp_type}                # Request latency
mcp_tool_calls_total{mcp_type, tool_name}             # Tool invocations
mcp_tool_call_failures_total{mcp_type, tool_name}     # Tool failures
mcp_tool_call_duration_seconds{tool_name}             # Tool call duration
mcp_connection_pool_size{mcp_type}                    # Pool size
mcp_connection_pool_active{mcp_type}                  # Active connections
```

### Contractor Metrics

```
contractor_requests_total{contractor_type, status}    # Total requests
contractor_request_duration_seconds{contractor_type}  # Request latency
contractor_tasks_completed_total{contractor_type}     # Completed tasks
contractor_tasks_failed_total{contractor_type}        # Failed tasks
contractor_task_duration_seconds{specialization}      # Task duration
contractor_k8s_operations_total{operation}            # K8s ops (infrastructure)
contractor_workflow_executions_total{status}          # Workflow execs (n8n)
contractor_os_tasks_total{task_type}                  # OS tasks (talos)
```

### Task Coordination Metrics

```
cortex_task_completions_total{task_type}              # Task completions
cortex_task_failures_total{task_type}                 # Task failures
cortex_task_duration_seconds{task_type}               # Task duration
cortex_task_queue_length{priority}                    # Queue depth by priority
cortex_handoffs_created_total{from, to}               # Handoffs created
cortex_handoffs_completed_total{from, to}             # Handoffs completed
cortex_handoffs_failed_total{from, to}                # Handoffs failed
cortex_handoff_duration_seconds{from, to}             # Handoff duration
```

## Alert Severity Levels

- **Critical**: Immediate action required (service down, complete failure)
- **Warning**: Investigation needed (high error rate, resource pressure)
- **Info**: Informational (long-running task, token efficiency)

## Alert Notifications

Configure AlertManager to send notifications:

```yaml
# alertmanager-config.yaml
route:
  receiver: 'team-ops'
  group_by: ['alertname', 'component']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - match:
        severity: critical
      receiver: 'pagerduty'
    - match:
        severity: warning
      receiver: 'slack'

receivers:
  - name: 'slack'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/...'
        channel: '#cortex-alerts'
  - name: 'pagerduty'
    pagerduty_configs:
      - service_key: '...'
```

## Performance Tuning

### Scrape Intervals

Adjust based on cardinality and load:
- High-frequency (10s): Core, workers, critical paths
- Medium (15s): Masters, MCP servers, dashboard
- Low (20-30s): Contractors, divisions, background services

### Recording Rules

Pre-aggregated metrics reduce query load:
- 1m intervals: Real-time monitoring
- 5m intervals: Standard dashboards
- 15m intervals: Trend analysis

### Metric Retention

Recommended retention policies:
- Raw metrics: 15 days
- 5m aggregations: 60 days
- 1h aggregations: 1 year

## Troubleshooting

### Missing Metrics

```bash
# Check if targets are up
kubectl exec -n cortex prometheus-0 -- \
  promtool check config /etc/prometheus/prometheus.yml

# Verify scrape targets
curl http://localhost:9090/api/v1/targets
```

### High Cardinality

```bash
# Find high cardinality metrics
curl -g 'http://localhost:9090/api/v1/label/__name__/values' | \
  jq -r '.data[]' | wc -l

# Check series count
curl 'http://localhost:9090/api/v1/query?query=count({__name__=~".+"})'
```

### Slow Queries

- Use recording rules for complex queries
- Reduce time range in dashboards
- Increase `query_timeout` in datasource config

## Integration

### With Cortex Dashboard

The monitoring stack integrates with the cortex dashboard to provide:
- Real-time metrics API endpoints
- Embedded Grafana panels
- Alert status display

### With CI/CD Master

Metrics trigger automated responses:
- Auto-scaling based on worker load
- Dashboard deployment on metric changes
- Alert-driven remediation workflows

## Best Practices

1. **Label Consistency**: Use consistent labels across all metrics
2. **Metric Naming**: Follow Prometheus naming conventions (base_unit_total)
3. **Alert Tuning**: Adjust thresholds based on observed baselines
4. **Dashboard Organization**: Group related panels, use template variables
5. **Documentation**: Annotate dashboards with panel descriptions

## Security

### Authentication

```yaml
# prometheus-auth.yaml
apiVersion: v1
kind: Secret
metadata:
  name: prometheus-auth
type: Opaque
stringData:
  username: admin
  password: <secure-password>
```

### Network Policies

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: prometheus-ingress
spec:
  podSelector:
    matchLabels:
      app: prometheus
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: grafana
      ports:
        - protocol: TCP
          port: 9090
```

## Future Enhancements

- [ ] Distributed tracing with Tempo
- [ ] Log aggregation with Loki
- [ ] Custom SLO/SLI dashboards
- [ ] Cost metrics and budget tracking
- [ ] ML-based anomaly detection
- [ ] Multi-cluster monitoring federation

## Support

For issues or questions:
- Check alert descriptions and runbook links
- Review Prometheus logs: `kubectl logs -n cortex prometheus-0`
- Verify Grafana datasource: Settings → Data Sources → Test
- Consult cortex documentation: `/coordination/masters/*/README.md`
