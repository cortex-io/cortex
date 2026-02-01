# Cortex Grafana Dashboards

Comprehensive monitoring dashboards for the Cortex automation system.

## Dashboard Overview

### 1. Executive Overview (`cortex-executive-overview.json`)

**Purpose**: C-level and executive visibility into system health and business metrics

**Key Metrics**:
- System Health Score (0-100) - Composite metric based on availability, performance, and errors
- 24h Availability (Target: 99.95%)
- Token Budget Utilization
- Compliance Status (Security, Audit, Regulatory)
- Alert Summary by Severity
- 24h Trend Sparklines

**Panels**:
1. **System Health Score Gauge** - Overall system health (40% availability + 30% task success + 20% token efficiency + 10% alert severity)
2. **24h Availability Gauge** - Rolling 24-hour availability percentage
3. **Token Budget Utilization Gauge** - Current token consumption vs budget
4. **Compliance Status** - Pass/fail indicators for compliance categories
5. **Alert Summary Timeline** - Stacked area chart by severity
6. **Active Alerts Count** - Current alert counts by severity
7. **24h Trend Sparklines** - Multi-metric time series (task completion, token consumption, availability, active workers)
8. **Token Consumption Pie Chart** - Breakdown by agent type
9. **Task Success Rate** - Percentage over time with 95%/99% thresholds

**Templating Variables**:
- `$namespace` - Kubernetes namespace (default: cortex-system)

**Refresh**: 30s

---

### 2. Operational Dashboard (`cortex-operational.json`)

**Purpose**: Operations team view of infrastructure health and performance

**Key Metrics**:
- Cluster state (nodes, pods, services)
- Resource utilization (CPU, memory, disk) per node
- Task queue lengths and throughput
- Alert timeline
- Pod restart counts
- Network I/O

**Panels**:
1. **Cluster State Summary** - Node, pod, and service counts
2. **Pod Status** - Running/Pending/Failed pod breakdown
3. **Task Queue Lengths** - Pending and processing task counts
4. **Task Throughput** - Operations per second
5. **CPU Utilization per Node** - Time series with 70%/90% thresholds
6. **Memory Utilization per Node** - Time series with 75%/90% thresholds
7. **Disk Utilization per Node** - Time series with 80%/95% thresholds
8. **Network I/O per Node** - Transmit/receive bandwidth (negative-Y for receive)
9. **Alert Timeline** - Stacked bar chart showing firing alerts
10. **Pod Restart Counts** - Cumulative restarts by pod
11. **Task Completion vs Failure Rates** - Success and failure operations per second

**Templating Variables**:
- `$namespace` - Kubernetes namespace

**Refresh**: 30s

---

### 3. Agent Hierarchy Dashboard (`cortex-agent-hierarchy.json`)

**Purpose**: Agent-specific monitoring for the meta-agent, masters, and workers

**Key Metrics**:
- Meta-agent status and latency (p50/p95/p99)
- Master agent availability (coordinator, development, security, inventory, cicd)
- Worker pool metrics (active, pending, failed)
- Token allocation per agent type
- Task completion rates by master
- Error rates by component

**Panels**:
1. **Meta-Agent Status** - Up/down indicator
2. **Meta-Agent Latency (p95)** - Request latency with 500ms/1000ms thresholds
3. **Worker Pool Metrics** - Active/pending/failed worker counts
4. **Token Budget by Agent Type** - Budget allocation per agent
5. **Master Agents Status** - Up/down grid for all 5 masters
6. **Task Completion Rate by Master** - Operations per second by master
7. **Active Workers by Master** - Stacked area chart
8. **Token Consumption by Master** - Rate by master agent
9. **Error Rates by Component** - Error operations per second
10. **Worker State Distribution** - Donut chart of worker lifecycle states
11. **Meta-Agent Request Latency** - p50/p95/p99 percentiles over time

**Templating Variables**:
- `$namespace` - Kubernetes namespace

**Refresh**: 30s

---

### 4. MCP Servers Dashboard (`cortex-mcp-servers.json`)

**Purpose**: Model Context Protocol server monitoring and performance

**Key Metrics**:
- MCP server availability grid
- Request latency histograms (p50, p95, p99)
- Connection pool utilization
- Tool call success/failure rates
- Error breakdown by MCP type

**Panels**:
1. **MCP Server Availability Grid** - Up/down status for all MCP servers
2. **MCP Server Health Summary** - Healthy/unhealthy server counts
3. **Connection Pool Utilization** - Gauge showing pool usage percentage
4. **MCP Request Latency Histograms** - p50/p95/p99 by server
5. **Tool Call Success/Failure Rates** - Success vs failure operations
6. **Tool Call Success Rate %** - Percentage with 95%/99% thresholds
7. **Connection Pool Utilization** - Active/idle connection breakdown (stacked area)
8. **Error Breakdown by MCP Type** - Donut chart of errors by server
9. **Tool Calls by Type** - Rate by tool name
10. **Request Rate per MCP Server** - Requests per second by server
11. **Error Types Breakdown** - Detailed error categorization

**Templating Variables**:
- `$namespace` - Kubernetes namespace
- `$mcp_server` - MCP server filter (multi-select, includes All)

**Refresh**: 30s

---

### 5. Debug Dashboard (`cortex-debug.json`)

**Purpose**: Deep troubleshooting and pod-level diagnostics for debugging production issues

**Key Metrics**:
- Pod-level CPU and memory usage with limits
- Container restart timeline and OOMKilled events
- CPU throttling detection and analysis
- Network I/O with errors and packet drops
- PVC utilization with 24h prediction
- Pod phase distribution and conditions
- Node-level health diagnostics

**Panels**:
1. **Container CPU Usage** - CPU usage per container with threshold lines
2. **Container Memory Usage** - Memory usage with limit indicators (dashed lines)
3. **Container Restarts Timeline** - Bar chart showing restart events over time
4. **OOMKilled Events** - Stat panel highlighting out-of-memory terminations
5. **CPU Throttling Detection** - Percentage of time containers are throttled
6. **CPU Throttling Periods** - Throttled vs total periods breakdown
7. **Network I/O** - Transmit/receive bytes per second (negative-Y for transmit)
8. **Network Errors and Drops** - RX/TX errors and packet drops
9. **PVC Utilization** - Bar gauge showing disk usage percentage per PVC
10. **PVC Available Space** - Time series with 24h prediction using predict_linear
11. **Pod Phase Distribution** - Donut chart of Running/Pending/Failed/Succeeded
12. **Pod Conditions Status** - Ready, Scheduled, and InitContainers status
13. **Node Conditions** - Node-level DiskPressure, MemoryPressure, PIDPressure, Ready
14. **Node Resource Capacity** - Capacity vs allocatable resources per node

**Templating Variables**:
- `$namespace` - Kubernetes namespace (default: cortex)
- `$pod` - Pod selector (multi-select, includes All)
- `$node` - Node selector (multi-select, includes All)

**Refresh**: 30s

**Use Cases**:
- Debugging OOMKilled containers
- Identifying CPU throttling issues
- Analyzing pod restart patterns
- Investigating network connectivity problems
- Predicting disk space exhaustion
- Diagnosing node-level resource pressure

---

## Installation

The dashboards are automatically provisioned when deploying the Grafana stack.

### Manual Import

If you need to import dashboards manually:

1. Log into Grafana (default: http://localhost:3000)
2. Navigate to **Dashboards** → **Import**
3. Click **Upload JSON file**
4. Select the dashboard JSON file
5. Choose **prometheus** as the data source
6. Click **Import**

### Automated Provisioning

Dashboards are auto-provisioned via the dashboard provider configuration:

```yaml
# grafana/dashboard-provider.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-dashboards
data:
  dashboards.yaml: |
    apiVersion: 1
    providers:
      - name: 'Cortex Dashboards'
        folder: 'Cortex'
        type: file
        options:
          path: /var/lib/grafana/dashboards
```

---

## Prometheus Metrics Reference

### Required Metrics

The dashboards expect the following Prometheus metrics to be available:

#### System Metrics
- `up{namespace, job}` - Service availability (1=up, 0=down)
- `kube_node_info` - Kubernetes node information
- `kube_pod_info` - Kubernetes pod information
- `kube_service_info` - Kubernetes service information
- `kube_pod_status_phase{phase}` - Pod status (Running, Pending, Failed)
- `kube_pod_container_status_restarts_total` - Pod restart counts

#### Cortex Application Metrics
- `cortex_task_completions_total{namespace, master}` - Task completions counter
- `cortex_task_failures_total{namespace}` - Task failures counter
- `cortex_task_queue_length{namespace, queue}` - Current queue length
- `cortex_tokens_consumed_total{namespace, agent_type, master}` - Token consumption counter
- `cortex_token_budget_limit{namespace, agent_type}` - Token budget limit gauge
- `cortex_token_limit_exceeded_total` - Token limit violations counter
- `cortex_token_requests_total` - Total token requests counter
- `cortex_active_workers{namespace, master}` - Currently active workers
- `cortex_pending_workers{namespace}` - Workers waiting to start
- `cortex_failed_workers{namespace}` - Failed workers count
- `cortex_worker_state{namespace, state}` - Worker lifecycle state
- `cortex_errors_total{namespace, component}` - Error counter by component
- `cortex_compliance_status{namespace, type}` - Compliance status (1=compliant, 0=non-compliant)
- `cortex_alert_firing{namespace, severity}` - Alert status gauge

#### Meta-Agent Metrics
- `cortex_meta_agent_request_duration_seconds_bucket` - Request latency histogram

#### MCP Server Metrics
- `cortex_mcp_requests_total{namespace, mcp_server}` - MCP request counter
- `cortex_mcp_request_duration_seconds_bucket{mcp_server, le}` - Request latency histogram
- `cortex_mcp_tool_calls_total{namespace, mcp_server, tool, status}` - Tool call counter
- `cortex_mcp_connection_pool_active{namespace, mcp_server}` - Active connections
- `cortex_mcp_connection_pool_idle{namespace, mcp_server}` - Idle connections
- `cortex_mcp_connection_pool_size{namespace, mcp_server}` - Total pool size
- `cortex_mcp_errors_total{namespace, mcp_server, error_type}` - MCP error counter

#### Node Metrics (from node-exporter)
- `node_cpu_seconds_total{mode}` - CPU time by mode
- `node_memory_MemTotal_bytes` - Total memory
- `node_memory_MemFree_bytes` - Free memory
- `node_memory_Cached_bytes` - Cached memory
- `node_memory_Buffers_bytes` - Buffer memory
- `node_filesystem_size_bytes{mountpoint}` - Filesystem size
- `node_filesystem_avail_bytes{mountpoint}` - Filesystem available space
- `node_network_receive_bytes_total{device}` - Network receive bytes
- `node_network_transmit_bytes_total{device}` - Network transmit bytes

#### Alert Metrics
- `ALERTS{namespace, alertstate, severity}` - Prometheus alert status

---

## Dashboard Features

### Templating
All dashboards support namespace filtering via the `$namespace` variable. The MCP dashboard additionally supports multi-select MCP server filtering.

### Time Range
Default time ranges:
- Executive Overview: 24 hours
- Operational: 6 hours
- Agent Hierarchy: 6 hours
- MCP Servers: 6 hours

Customizable via time picker with refresh intervals: 10s, 30s, 1m, 5m, 15m

### Thresholds
Thresholds are configured following SRE best practices:
- **Green**: Normal operation
- **Yellow**: Warning threshold (70-85% typically)
- **Orange**: High threshold (85-95%)
- **Red**: Critical threshold (>95%)

Availability thresholds:
- Green: ≥99.95%
- Yellow: ≥99.9%
- Orange: ≥99.5%
- Red: <99.5%

### Graph Modes
- **Time Series**: Smooth interpolation for time-based metrics
- **Gauge**: Single value with thresholds
- **Stat**: Single value with optional sparkline
- **Pie/Donut**: Proportional breakdowns
- **Stacked Area**: Cumulative metrics over time

---

## Customization

### Adding Custom Panels

1. Edit the dashboard JSON directly or use Grafana UI
2. Add new panel configuration to the `panels` array
3. Ensure proper `gridPos` (x, y, w, h) for layout
4. Increment panel `id` to avoid conflicts
5. Test with your Prometheus datasource

### Modifying Queries

PromQL queries can be customized in the `targets` array of each panel. Common modifications:

**Change time window**:
```promql
rate(metric[5m])  # Change 5m to 1m, 15m, etc.
```

**Add label filters**:
```promql
metric{namespace="$namespace", environment="production"}
```

**Change aggregation**:
```promql
avg by (label) (metric)  # Use sum, max, min, count
```

### Dashboard Variables

Add new template variables in the `templating.list` array:

```json
{
  "name": "environment",
  "type": "query",
  "datasource": {
    "type": "prometheus",
    "uid": "prometheus"
  },
  "query": "label_values(metric, environment)",
  "refresh": 1,
  "multi": true,
  "includeAll": true
}
```

---

## Troubleshooting

### No Data Displayed

1. **Check Prometheus datasource**: Ensure Prometheus is configured and reachable
2. **Verify namespace variable**: Ensure `$namespace` matches your deployment
3. **Check metric availability**: Query Prometheus directly to verify metrics exist
4. **Review time range**: Ensure time range includes data points

### Missing Panels

If panels show "No data":
- Verify the metric exists in Prometheus
- Check label matchers (namespace, job, etc.)
- Verify your application is exposing metrics correctly
- Check PodMonitor/ServiceMonitor configuration

### Performance Issues

If dashboards load slowly:
- Reduce time range (use 1h or 6h instead of 24h)
- Increase refresh interval (use 1m instead of 30s)
- Simplify PromQL queries (reduce cardinality)
- Add recording rules for expensive queries

### Alert Queries Not Working

Ensure AlertManager is integrated with Prometheus:
```yaml
# prometheus.yml
alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']
```

---

## Best Practices

### Dashboard Organization
- **Executive (Tier 1)**: High-level KPIs, minimal technical detail for C-level
- **Operational (Tier 2)**: Infrastructure metrics for SRE and on-call engineers
- **Agent Hierarchy (Tier 3)**: Application-specific metrics for developers and architects
- **MCP Servers**: Component-specific deep dive for integration teams
- **Debug (Tier 4)**: Deep troubleshooting and diagnostics for production incidents

### Metric Naming
Follow Prometheus naming conventions:
- Use `_total` suffix for counters
- Use `_seconds` for durations (not milliseconds)
- Use `_bytes` for sizes
- Include units in metric names

### Query Optimization
- Use recording rules for complex calculations
- Limit label cardinality (avoid user IDs, request IDs)
- Use `rate()` for counters, not `increase()`
- Avoid regex label matchers when possible

### Visualization Selection
- **Gauges**: Single current value with thresholds
- **Time Series**: Trends over time
- **Stat**: Current value with historical context
- **Pie/Donut**: Proportional breakdown (limit to 5-7 segments)
- **Heatmap**: Distribution visualization

---

## Integration with Alerting

Dashboards complement Prometheus alerting rules. When alerts fire:

1. Check **Executive Overview** for system-wide impact and SLO violations
2. Drill into **Operational Dashboard** for infrastructure and cluster issues
3. Use **Agent Hierarchy** for application-level debugging and agent performance
4. Review **MCP Servers** for integration and connection pool issues
5. Deep dive with **Debug Dashboard** for pod-level diagnostics, OOMKills, throttling, and network issues

Link alerts to dashboards using annotations:
```yaml
annotations:
  dashboard: "cortex-debug"
  panel: "cpu-throttling"
  runbook_url: "https://docs.cortex.io/runbooks/cpu-throttling"
```

---

## Version History

**v1.1** (2025-12-12)
- Added Debug Dashboard (Tier 4) for deep troubleshooting
- Pod-level CPU/memory diagnostics with limits
- Container restart timeline and OOMKilled detection
- CPU throttling analysis
- Network errors and packet drops monitoring
- PVC utilization with 24h prediction
- Node-level health diagnostics

**v1.0** (2025-12-11)
- Initial release with 4 comprehensive dashboards
- Executive overview with health score
- Operational infrastructure monitoring
- Agent hierarchy metrics
- MCP server performance tracking

---

## Support

For issues or enhancements:
1. Check Prometheus target health: `/targets`
2. Verify metrics with PromQL: `/graph`
3. Review Grafana logs: `kubectl logs -n cortex-system grafana-xxx`
4. Consult Cortex documentation

---

## License

Part of the Cortex automation system.
