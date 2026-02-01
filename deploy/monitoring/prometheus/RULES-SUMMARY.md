# Prometheus Rules Summary for Cortex

## Overview

Comprehensive Prometheus alerting, recording, and SLO rules for the Cortex automation system.

**Created**: 2025-12-11
**Total Files**: 4
**Total Alerts**: 68
**Total Recording Rules**: 141

## Files

### 1. alerting-rules.yaml
**Path**: `/Users/ryandahlberg/Projects/cortex/deploy/monitoring/prometheus/alerting-rules.yaml`
**Alerts**: 55
**Rule Groups**: 14

#### Alert Categories

1. **Cortex Core Alerts** (4 alerts)
   - CortexMetaAgentDown
   - CortexHighErrorRate
   - CortexHighLatency
   - System health monitoring

2. **Master Agent Alerts** (4 alerts)
   - MasterAgentDown
   - MasterWorkerSpawnFailure
   - MasterTaskBacklog
   - MasterMemoryPressure

3. **Worker Agent Alerts** (4 alerts)
   - HighWorkerFailureRate
   - WorkerTokenExhaustion
   - WorkerStuck
   - TooManyActiveWorkers

4. **MCP Server Alerts** (4 alerts)
   - MCPServerDown
   - MCPHighRequestLatency
   - MCPConnectionPoolExhausted
   - MCPToolCallFailures

5. **Contractor Alerts** (3 alerts)
   - ContractorDown
   - ContractorHighErrorRate
   - ContractorSlowResponse

6. **Resource Utilization Alerts** (3 alerts)
   - HighCPUUsage
   - HighMemoryUsage
   - PodRestartLoop

7. **Task Performance Alerts** (3 alerts)
   - TaskCompletionRateDropping
   - TaskQueueGrowth
   - LongRunningTask

8. **Dashboard Alerts** (2 alerts)
   - DashboardDown
   - DashboardHighLatency

9. **Token Budget Alerts** (3 alerts)
   - HighTokenConsumptionRate
   - TokenBudgetExhaustion
   - WorkerTokenInefficiency

10. **Cluster State Alerts** (6 alerts) **NEW**
    - CortexNodeNotReady (critical, 2m)
    - CortexDeploymentReplicaMismatch (warning, 5m)
    - CortexStatefulSetReplicaMismatch (warning, 5m)
    - CortexDaemonSetNotScheduled (warning, 5m)
    - CortexPodPending (warning, 10m)
    - CortexPodCrashLooping (critical, 5m)

11. **Enhanced Resource Alerts** (8 alerts) **NEW**
    - CortexNodeMemoryPressure (warning, >85% for 10m)
    - CortexNodeCPUPressure (warning, >80% for 10m)
    - CortexPVCNearCapacity (warning, >80%)
    - CortexPVCCritical (critical, >95%)
    - CortexContainerOOMKilled (critical)
    - CortexCPUThrottling (warning, >50% for 10m)
    - CortexNodeDiskPressure (critical, 5m)
    - CortexPodMemoryLimit (critical, >95% for 5m)

12. **Control Plane Alerts** (7 alerts) **NEW**
    - CortexEtcdNoLeader (critical, 1m)
    - CortexEtcdHighLeaderChanges (warning, >3 in 10m)
    - CortexEtcdInsufficientMembers (critical, <3 members)
    - CortexAPIServerHighLatency (warning, p99 >5s)
    - CortexAPIServerHighErrorRate (critical, >5%)
    - CortexSchedulerHighLatency (warning, p99 >10s)
    - CortexControllerManagerDown (critical, 5m)

13. **Predictive Alerts** (5 alerts) **NEW**
    - CortexPredictedTokenExhaustion (critical, <1h prediction)
    - CortexPredictedDiskFull (warning, <24h prediction)
    - CortexPredictedMemoryExhaustion (warning, <1h prediction)
    - CortexPredictedWorkerOverload (warning, >50 workers predicted)
    - CortexPredictedTaskBacklog (warning, >100 tasks predicted)

### 2. recording-rules.yaml
**Path**: `/Users/ryandahlberg/Projects/cortex/deploy/monitoring/prometheus/recording-rules.yaml`
**Recording Rules**: 95
**Rule Groups**: 11

#### Recording Rule Categories

1. **Performance Aggregations (1m)** - 7 rules
   - Request rates (1m, 5m, 15m)
   - Error rates (1m, 5m)
   - Error ratios (5m)
   - Latency percentiles (p50, p95, p99)

2. **Master Agent Aggregations (1m)** - 8 rules
   - Task processing/completion/failure rates
   - Success ratios
   - Worker spawn metrics
   - Active worker counts
   - Task queue depth

3. **Worker Agent Aggregations (1m)** - 8 rules
   - Task completion/failure rates
   - Success ratios
   - Token consumption/remaining
   - Token efficiency (tokens per task)
   - Duration percentiles (p50, p95)

4. **MCP Server Aggregations (1m)** - 10 rules
   - Request/error rates
   - Error ratios
   - Latency percentiles (p50, p95, p99)
   - Tool call metrics
   - Tool call success ratios
   - Connection pool utilization

5. **Contractor Aggregations (1m)** - 10 rules
   - Request/error rates
   - Error ratios
   - Latency percentiles
   - Task completion/failure rates
   - Success ratios
   - Specialization effectiveness

6. **Token Budget Aggregations (1m)** - 7 rules
   - Token consumption rates (1m, 5m, 15m)
   - Token consumption by component
   - Token budget utilization
   - Tokens per request
   - Token efficiency by master

7. **Resource Utilization (5m)** - 6 rules
   - CPU utilization (by pod, by type)
   - Memory utilization (by pod, by type)
   - Network I/O (receive/transmit)

8. **Task Performance (5m)** - 8 rules
   - Task completion/failure rates
   - Task success ratios
   - Task duration percentiles (p50, p95, p99)
   - Task queue depth (total, by priority)
   - Task throughput by type

9. **Handoff Coordination (1m)** - 6 rules
   - Handoff creation/completion/failure rates
   - Handoff duration percentiles (p50, p95)
   - Handoff success ratios

10. **Baseline Metrics (5m)** (12 rules) **NEW**
    - cortex:task_completion_rate:5m
    - cortex:error_rate:5m
    - cortex:avg_task_duration:5m
    - cortex:token_consumption_rate:5m
    - cortex:agent_availability:5m
    - cortex:mcp_latency_p99:5m
    - cortex:master_task_rate:5m
    - cortex:worker_success_rate:5m
    - cortex:avg_tokens_per_task:5m
    - cortex:request_throughput:5m
    - cortex:mcp_tool_success_rate:5m

11. **Hourly Baselines (1h)** (6 rules) **NEW**
    - Task completion rate
    - Error rate
    - Average task duration
    - Token consumption rate
    - Agent availability
    - System uptime percentage

12. **Daily Baselines (24h)** (6 rules) **NEW**
    - Task completion rate
    - Error rate
    - Average task duration
    - Daily token consumption
    - Daily task volume
    - Availability by component

### 3. cortex-slo-rules.yaml **NEW**
**Path**: `/Users/ryandahlberg/Projects/cortex/deploy/monitoring/prometheus/cortex-slo-rules.yaml`
**Recording Rules**: 46
**Alert Rules**: 13
**Total SLO Rules**: 59
**Rule Groups**: 7

#### SLO Definitions

| Component | Availability SLO | Error Budget | Monitoring Window |
|-----------|------------------|--------------|-------------------|
| Meta-agent | 99.9% | 0.1% | 5m, 30m, 1h, 24h, 30d |
| Master agents | 99.5% | 0.5% | 5m, 1h, 24h, 30d |
| Worker agents | 99% | 1% | 5m, 1h, 24h, 30d |
| MCP servers | 99.5% | 0.5% | 5m, 1h, 24h, 30d |
| Contractors | 99% | 1% | 5m, 1h, 24h, 30d |
| Overall System | 99.5% | 0.5% | 5m, 1h, 24h, 30d |

#### SLO Recording Rule Categories

1. **Meta-agent SLO** (7 rules)
   - Availability tracking (5m, 30m, 1h, 24h)
   - Error budget remaining
   - Error budget burn rate (5m, 1h)
   - Request success rate

2. **Master Agents SLO** (9 rules)
   - Availability by type (5m, 1h, 24h)
   - Overall availability
   - Error budget remaining
   - Error budget burn rate
   - Task success rate (by type, overall)

3. **Worker Agents SLO** (9 rules)
   - Availability by type (5m, 1h, 24h)
   - Overall availability
   - Error budget remaining
   - Error budget burn rate
   - Task success rate (by type, overall)

4. **MCP Servers SLO** (10 rules)
   - Availability by type (5m, 1h, 24h)
   - Overall availability
   - Error budget remaining
   - Error budget burn rate
   - Request success rate
   - Tool call success rate
   - Latency SLO compliance

5. **Contractors SLO** (7 rules)
   - Availability by type (5m, 1h, 24h)
   - Error budget remaining
   - Error budget burn rate
   - Task success rate

6. **Overall System SLO** (8 rules)
   - System availability (5m, 1h, 24h)
   - Error budget remaining
   - Error budget burn rate
   - Request success rate
   - Task success rate

#### SLO Violation Alerts

1. **CortexMetaAgentSLOViolation** - Meta-agent <99.9% for 5m (critical)
2. **CortexMetaAgentErrorBudgetFastBurn** - Error budget burn >10x (critical)
3. **CortexMasterAgentSLOViolation** - Master <99.5% for 5m (critical)
4. **CortexMasterErrorBudgetFastBurn** - Error budget burn >10x (critical)
5. **CortexMasterTaskSuccessSLOViolation** - Task success <99.5% (warning)
6. **CortexWorkerAgentSLOViolation** - Worker <99% for 5m (warning)
7. **CortexWorkerTaskSuccessSLOViolation** - Task success <99% (warning)
8. **CortexMCPServerSLOViolation** - MCP <99.5% for 5m (critical)
9. **CortexMCPToolCallSuccessSLOViolation** - Tool success <99% (warning)
10. **CortexMCPLatencySLOViolation** - p99 >2s for 10m (warning)
11. **CortexSystemSLOViolation** - System <99.5% for 5m (critical)
12. **CortexSystemErrorBudgetLow** - <10% budget remaining (warning)
13. **CortexSystemErrorBudgetCritical** - <5% budget remaining (critical)

### 4. prometheus-config.yaml
**Path**: `/Users/ryandahlberg/Projects/cortex/deploy/monitoring/prometheus/prometheus-config.yaml`
**Updated**: Added cortex-slo-rules.yaml to rule_files

## Alert Severity Distribution

| Severity | Count | Percentage |
|----------|-------|------------|
| Critical | 28 | 41% |
| Warning | 35 | 51% |
| Info | 5 | 8% |

## Key Features

### Cluster State Monitoring
- Node readiness and conditions
- Deployment/StatefulSet/DaemonSet replica tracking
- Pod state monitoring (Pending, CrashLooping)

### Resource Pressure Detection
- Node memory pressure (>85%)
- Node CPU pressure (>80%)
- PVC capacity monitoring (warning >80%, critical >95%)
- OOM kill detection
- CPU throttling detection (>50%)
- Disk pressure monitoring

### Control Plane Health
- Etcd cluster monitoring (leader, member count, stability)
- API server latency and error rate
- Scheduler performance
- Controller manager health

### Predictive Alerting
- Token budget exhaustion prediction (1h lookahead)
- Disk space exhaustion (24h lookahead)
- Memory exhaustion (1h lookahead)
- Worker overload prediction
- Task backlog prediction

### SLO Tracking
- Component-level availability SLOs
- Error budget tracking and burn rate
- Task/request success rate SLOs
- Multi-window monitoring (5m, 1h, 24h, 30d)
- Fast burn detection (>10x burn rate)

### Baseline Metrics
- 5-minute baselines for anomaly detection
- Hourly baselines for trending
- Daily baselines for historical analysis
- Cross-component correlation metrics

## Usage

### Deployment

```bash
# Apply ConfigMaps for rule files
kubectl create configmap prometheus-rules \
  --from-file=alerting-rules.yaml \
  --from-file=recording-rules.yaml \
  --from-file=cortex-slo-rules.yaml \
  -n cortex

# Update Prometheus configuration
kubectl apply -f prometheus-config.yaml
```

### Validation

All YAML files have been validated for syntax correctness:
```bash
python3 -c "import yaml; yaml.safe_load(open('alerting-rules.yaml'))"  # ✓ VALID
python3 -c "import yaml; yaml.safe_load(open('recording-rules.yaml'))"  # ✓ VALID
python3 -c "import yaml; yaml.safe_load(open('cortex-slo-rules.yaml'))"  # ✓ VALID
python3 -c "import yaml; yaml.safe_load(open('prometheus-config.yaml'))"  # ✓ VALID
```

### Querying SLO Metrics

```promql
# Check meta-agent availability
cortex_slo:meta_agent:availability:1h

# Check error budget remaining
cortex_slo:system:error_budget_remaining

# Check error budget burn rate
cortex_slo:meta_agent:error_budget_burn_rate:5m

# Check task success rate
cortex_slo:master:task_success_rate_overall:5m
```

### Querying Baseline Metrics

```promql
# Task completion rate baseline
cortex:task_completion_rate:5m

# Error rate baseline
cortex:error_rate:5m

# Agent availability
cortex:agent_availability:5m

# MCP latency
cortex:mcp_latency_p99:5m
```

## Alert Routing Recommendations

### Critical Alerts (28)
Route to: PagerDuty, immediate notification
- Meta-agent down
- Node not ready
- Etcd issues
- API server failures
- SLO violations
- Error budget fast burn

### Warning Alerts (35)
Route to: Slack, email
- Resource pressure
- High error rates
- Task backlogs
- Predictive warnings

### Info Alerts (5)
Route to: Logging system
- Token efficiency
- Long-running tasks

## Integration with Cortex Components

### Grafana Dashboards
- Use recording rules for efficient dashboard queries
- SLO metrics for SLO/SLI dashboards
- Baseline metrics for anomaly detection panels

### AlertManager
- Configure routes based on severity
- Group alerts by component
- Set appropriate repeat intervals

### n8n Workflows
- Hook SLO violations to remediation workflows
- Automate responses to predictive alerts
- Escalation workflows for error budget exhaustion

## Maintenance

### Monthly Review
- Review SLO targets based on actual performance
- Adjust error budget burn rate thresholds
- Update baseline metrics if workload patterns change

### Alert Tuning
- Review alert firing frequency
- Adjust thresholds based on false positive rate
- Add/remove alerts based on operational needs

## Best Practices

1. **SLO First**: Focus on SLO violations before individual metric alerts
2. **Error Budgets**: Use error budget burn rate for prioritization
3. **Baselines**: Use baseline metrics to detect anomalies
4. **Predictive**: Act on predictive alerts before issues occur
5. **Multi-Window**: Cross-reference short and long windows for context

## References

- [Prometheus Recording Rules](https://prometheus.io/docs/prometheus/latest/configuration/recording_rules/)
- [Prometheus Alerting Rules](https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/)
- [Google SRE Book - SLOs](https://sre.google/sre-book/service-level-objectives/)
- [Implementing SLOs](https://sre.google/workbook/implementing-slos/)

## Support

For issues or questions regarding these rules:
1. Verify rule syntax: `promtool check rules <file>.yaml`
2. Check Prometheus logs for evaluation errors
3. Review metric availability and cardinality
4. Consult Cortex monitoring documentation
