# Cortex Grafana Dashboard Summary

## Overview

Five comprehensive Grafana dashboards for complete Cortex system monitoring.

```
Cortex Monitoring Dashboards
│
├── Executive Overview (cortex-executive-overview.json) [Tier 1]
│   └── Business metrics, SLOs, compliance
│
├── Operational (cortex-operational.json) [Tier 2]
│   └── Infrastructure health, resource usage
│
├── Agent Hierarchy (cortex-agent-hierarchy.json) [Tier 3]
│   └── Meta-agent, masters, workers
│
├── MCP Servers (cortex-mcp-servers.json)
│   └── MCP availability, latency, tool calls
│
└── Debug (cortex-debug.json) [Tier 4]
    └── Pod diagnostics, OOMKills, throttling, network
```

---

## Dashboard Comparison Matrix

| Feature | Executive | Operational | Agent Hierarchy | MCP Servers | Debug |
|---------|-----------|-------------|-----------------|-------------|-------|
| **Target Audience** | C-level, Leadership | SRE, Operations | Developers, Architects | Integration Team | DevOps, SRE |
| **Update Frequency** | 30s | 30s | 30s | 30s | 30s |
| **Default Time Range** | 6h | 6h | 6h | 6h | 1h |
| **Panel Count** | 9 | 11 | 11 | 11 | 14 |
| **Complexity** | Low | Medium | Medium | High | High |
| **Templating** | Namespace | Namespace | Namespace | Namespace + MCP Server | Namespace + Pod + Node |

---

## Key Metrics by Dashboard

### 1. Executive Overview
```
Health Score (Composite)
├── Availability: 40% weight
├── Task Success: 30% weight
├── Token Efficiency: 20% weight
└── Alert Severity: 10% weight

SLO Metrics
├── Availability: 99.95% target
├── Task Success Rate: >99%
└── Token Utilization: <95%

Business Metrics
├── Task Throughput
├── Token Consumption
└── Active Workers
```

### 2. Operational Dashboard
```
Infrastructure
├── Cluster State (nodes, pods, services)
├── CPU Utilization (per node, 90% threshold)
├── Memory Utilization (per node, 90% threshold)
├── Disk Utilization (per node, 95% threshold)
└── Network I/O (transmit/receive)

Application
├── Task Queue Lengths
├── Task Throughput
├── Pod Restarts
└── Alert Timeline
```

### 3. Agent Hierarchy
```
Meta-Agent
├── Status (up/down)
└── Latency (p50/p95/p99)

Master Agents (5 types)
├── Coordinator
├── Development
├── Security
├── Inventory
└── CI/CD

Workers
├── Active Workers (by master)
├── Pending Workers
├── Failed Workers
└── State Distribution

Performance
├── Task Completion Rate (by master)
├── Token Consumption (by master)
└── Error Rates (by component)
```

### 4. MCP Servers
```
Availability
├── Server Health Grid
├── Healthy/Unhealthy Count
└── Uptime %

Performance
├── Request Latency (p50/p95/p99)
├── Request Rate (per server)
└── Tool Call Success Rate

Resources
├── Connection Pool Utilization
├── Active/Idle Connections
└── Pool Exhaustion

Errors
├── Error Breakdown (by server)
├── Error Types
└── Tool Call Failures
```

### 5. Debug Dashboard
```
Container Diagnostics
├── CPU Usage (per container)
├── Memory Usage (with limits)
├── Container Restarts Timeline
└── OOMKilled Events

CPU Analysis
├── Throttling Detection (%)
├── Throttled Periods
└── Total Periods Comparison

Network Diagnostics
├── Network I/O (TX/RX)
├── Network Errors
└── Packet Drops

Storage
├── PVC Utilization (%)
├── Available Space
└── 24h Prediction (predict_linear)

Pod/Node Health
├── Pod Phase Distribution
├── Pod Conditions (Ready, Scheduled)
├── Node Conditions (DiskPressure, MemoryPressure)
└── Node Resource Capacity
```

---

## Visualization Types Used

| Visualization | Executive | Operational | Agent Hierarchy | MCP Servers | Debug | Use Case |
|---------------|-----------|-------------|-----------------|-------------|-------|----------|
| **Gauge** | 3 | 0 | 2 | 1 | 0 | Single value with thresholds |
| **Stat** | 2 | 4 | 2 | 2 | 2 | Current value + trend |
| **Time Series** | 3 | 6 | 6 | 6 | 7 | Trends over time |
| **Pie/Donut** | 1 | 0 | 1 | 2 | 2 | Proportional breakdown |
| **Stacked Area** | 1 | 1 | 1 | 1 | 0 | Cumulative metrics |
| **Bar Gauge** | 0 | 0 | 0 | 0 | 1 | Horizontal comparison bars |

---

## PromQL Query Patterns

### Rate Calculations
```promql
# Task completion rate
sum(rate(cortex_task_completions_total[5m]))

# Error rate
sum(rate(cortex_errors_total[5m]))
```

### Percentile Calculations
```promql
# p95 latency
histogram_quantile(0.95, 
  sum(rate(cortex_mcp_request_duration_seconds_bucket[5m])) by (le)
) * 1000
```

### Success Rate
```promql
# Task success percentage
(sum(rate(cortex_task_completions_total[5m])) 
/
(sum(rate(cortex_task_completions_total[5m])) + 
 sum(rate(cortex_task_failures_total[5m])))) * 100
```

### Utilization Calculations
```promql
# CPU utilization
100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)

# Memory utilization
100 * (1 - ((node_memory_MemFree_bytes + 
              node_memory_Cached_bytes + 
              node_memory_Buffers_bytes) / 
             node_memory_MemTotal_bytes))

# Token budget utilization
(sum(rate(cortex_tokens_consumed_total[5m])) / 
 sum(cortex_token_budget_limit)) * 100
```

---

## Alert Correlation

### Alert Severity → Dashboard Drill-Down

```
Critical Alert Fired
    ↓
1. Check Executive Overview
   └── System Health Score dropped?
   └── Availability below SLO?
       ↓
2. Check Operational Dashboard
   └── Resource exhaustion? (CPU/Memory/Disk)
   └── Pod restarts?
   └── Network issues?
       ↓
3. Check Agent Hierarchy
   └── Master agent down?
   └── Worker failures?
   └── Token limit exceeded?
       ↓
4. Check MCP Servers
   └── MCP server unavailable?
   └── Connection pool exhausted?
   └── Tool call failures?
       ↓
5. Deep Dive with Debug Dashboard
   └── Container OOMKilled?
   └── CPU throttling detected?
   └── Network packet drops?
   └── PVC near capacity?
   └── Node pressure conditions?
```

---

## Dashboard Navigation Flow

```
User Journey by Role
│
├── Executive/Leadership
│   └── Executive Overview
│       ├── View health score
│       ├── Check SLO compliance
│       └── Review business metrics
│
├── SRE/Operations
│   └── Operational Dashboard
│       ├── Monitor infrastructure
│       ├── Check resource utilization
│       └── Respond to alerts
│
├── Developers/Architects
│   └── Agent Hierarchy
│       ├── Debug application issues
│       ├── Monitor agent performance
│       └── Optimize token usage
│
├── Integration Team
│   └── MCP Servers
│       ├── Monitor MCP health
│       ├── Troubleshoot connectivity
│       └── Optimize tool calls
│
└── DevOps/SRE (Incident Response)
    └── Debug Dashboard
        ├── Diagnose OOMKilled containers
        ├── Investigate CPU throttling
        ├── Analyze pod restart patterns
        ├── Debug network connectivity
        └── Predict disk exhaustion
```

---

## Threshold Reference

### Availability Thresholds
```yaml
Green:  ≥99.95%  # SLO met
Yellow: ≥99.9%   # Warning
Orange: ≥99.5%   # Degraded
Red:    <99.5%   # Critical
```

### Resource Utilization Thresholds
```yaml
CPU/Memory:
  Green:  <70%   # Normal
  Yellow: 70-85% # Warning
  Orange: 85-95% # High
  Red:    >95%   # Critical

Disk:
  Green:  <80%   # Normal
  Yellow: 80-90% # Warning
  Orange: 90-95% # High
  Red:    >95%   # Critical
```

### Latency Thresholds
```yaml
Green:  <500ms   # Fast
Yellow: 500-1000ms # Acceptable
Red:    >1000ms  # Slow
```

### Success Rate Thresholds
```yaml
Green:  ≥99%    # Excellent
Yellow: 95-99%  # Good
Orange: 90-95%  # Degraded
Red:    <90%    # Poor
```

---

## File Structure

```
/deploy/monitoring/grafana/
├── dashboards/
│   ├── cortex-executive-overview.json      (24KB) [Tier 1]
│   ├── cortex-operational.json             (30KB) [Tier 2]
│   ├── cortex-agent-hierarchy.json         (27KB) [Tier 3]
│   ├── cortex-mcp-servers.json             (29KB)
│   ├── cortex-debug.json                   (35KB) [Tier 4]
│   ├── README.md                           (Comprehensive docs)
│   └── DASHBOARD-SUMMARY.md                (This file)
├── DASHBOARD-DEPLOYMENT.md                 (Deployment guide)
├── dashboard-provider.yaml                 (Provisioning config)
└── datasources.yaml                        (Prometheus datasource)
```

---

## Quick Access URLs

Once deployed at `http://localhost:3000`:

- Executive (Tier 1): `/d/cortex-executive`
- Operational (Tier 2): `/d/cortex-operational`
- Agent Hierarchy (Tier 3): `/d/cortex-agent-hierarchy`
- MCP Servers: `/d/cortex-mcp-servers`
- Debug (Tier 4): `/d/cortex-debug`

---

## Dashboard Update Checklist

When updating dashboards:

- [ ] Increment version number in JSON
- [ ] Test all panels display data
- [ ] Verify template variables work
- [ ] Check threshold colors
- [ ] Validate PromQL queries
- [ ] Update documentation (README.md)
- [ ] Commit to version control
- [ ] Deploy via ConfigMap or Helm
- [ ] Verify in Grafana UI
- [ ] Notify team of changes

---

## Performance Optimization

### Query Optimization
```promql
# Use recording rules for expensive queries
- record: cortex:health_score:5m
  expr: |
    (avg(up{namespace="cortex-system"}) * 40 +
     ... complex calculation ...)
    
# Then reference in dashboard
cortex:health_score:5m
```

### Reduce Cardinality
```promql
# Bad: High cardinality
sum by (pod, container, node) (metric)

# Good: Lower cardinality
sum by (namespace, app) (metric)
```

### Use Efficient Aggregations
```promql
# Prefer sum() over avg() for counters
sum(rate(metric[5m]))

# Use topk() to limit results
topk(10, sum by (label) (metric))
```

---

## Integration Points

### Prometheus
- Data source for all metrics
- Alert evaluation
- Recording rules

### AlertManager
- Alert status via ALERTS metric
- Notification routing
- Alert grouping

### Kubernetes
- ServiceMonitor for scraping
- PodMonitor for pod metrics
- Node metrics via node-exporter

### Application Instrumentation
- Custom metrics via /metrics endpoint
- Histogram buckets for latency
- Counter metrics for events

---

## Maintenance Schedule

### Daily
- Review alert panels for anomalies
- Check dashboard load times
- Verify metric freshness

### Weekly
- Review and update thresholds
- Optimize slow queries
- Update documentation

### Monthly
- Export dashboard backups
- Review metric retention
- Clean up unused panels
- Update recording rules

### Quarterly
- Major version updates
- Dashboard reorganization
- User feedback integration
- Performance benchmarking

---

## Support Resources

- **Documentation**: `README.md` (detailed metric reference)
- **Deployment**: `DASHBOARD-DEPLOYMENT.md` (setup guide)
- **Prometheus**: `/targets` endpoint for scrape status
- **Grafana**: Admin → Data Sources for connectivity
- **Logs**: `kubectl logs -n cortex-system -l app=grafana`

---

## Dashboard Statistics

| Dashboard | Panels | Queries | Templates | Size |
|-----------|--------|---------|-----------|------|
| Executive Overview | 9 | 14 | 1 | 24KB |
| Operational | 11 | 17 | 1 | 30KB |
| Agent Hierarchy | 11 | 19 | 1 | 27KB |
| MCP Servers | 11 | 16 | 2 | 29KB |
| Debug | 14 | 22 | 3 | 35KB |
| **Total** | **56** | **88** | **8** | **145KB** |

---

Generated: 2025-12-12
Version: 1.1
Cortex Monitoring System
