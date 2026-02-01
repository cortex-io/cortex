# Prometheus Rules Deployment Guide

Quick reference for deploying the comprehensive Prometheus rules for Cortex.

## Files Overview

```
deploy/monitoring/prometheus/
├── alerting-rules.yaml          # 55 operational alerts
├── recording-rules.yaml         # 95 performance recording rules
├── cortex-slo-rules.yaml        # 46 SLO recording rules + 13 SLO alerts
├── prometheus-config.yaml       # Main Prometheus configuration
├── RULES-SUMMARY.md            # Detailed documentation
└── DEPLOYMENT-GUIDE.md         # This file
```

## Quick Deploy (Kubernetes)

### 1. Create ConfigMaps

```bash
# Navigate to the prometheus directory
cd /Users/ryandahlberg/Projects/cortex/deploy/monitoring/prometheus

# Create the rules ConfigMap
kubectl create configmap prometheus-rules \
  --from-file=alerting-rules.yaml \
  --from-file=recording-rules.yaml \
  --from-file=cortex-slo-rules.yaml \
  -n cortex \
  --dry-run=client -o yaml | kubectl apply -f -

# Update Prometheus config
kubectl create configmap prometheus-config \
  --from-file=prometheus-config.yaml \
  -n cortex \
  --dry-run=client -o yaml | kubectl apply -f -
```

### 2. Restart Prometheus

```bash
# If using Prometheus Operator
kubectl rollout restart statefulset/prometheus-k8s -n cortex

# Or reload configuration (if supported)
kubectl exec -n cortex prometheus-0 -- killall -HUP prometheus
```

### 3. Verify Rules Loaded

```bash
# Port forward to Prometheus
kubectl port-forward -n cortex svc/prometheus 9090:9090

# Open browser to http://localhost:9090/rules
# Or check via API
curl http://localhost:9090/api/v1/rules | jq '.data.groups[].name'
```

Expected rule groups:
- cortex_core
- cortex_masters
- cortex_workers
- mcp_servers
- cortex_contractors
- cortex_resources
- cortex_tasks
- cortex_dashboard
- cortex_tokens
- cortex_cluster_state (NEW)
- cortex_resource_pressure (NEW)
- cortex_control_plane (NEW)
- cortex_predictive (NEW)
- cortex_baselines_5m (NEW)
- cortex_baselines_1h (NEW)
- cortex_baselines_24h (NEW)
- cortex_slo_meta_agent (NEW)
- cortex_slo_master_agents (NEW)
- cortex_slo_worker_agents (NEW)
- cortex_slo_mcp_servers (NEW)
- cortex_slo_contractors (NEW)
- cortex_slo_system_overall (NEW)
- cortex_slo_alerts (NEW)

## Validation Before Deploy

### Syntax Validation

```bash
# Install promtool (if not already installed)
# macOS: brew install prometheus
# Linux: apt-get install prometheus / yum install prometheus

# Validate each rule file
promtool check rules alerting-rules.yaml
promtool check rules recording-rules.yaml
promtool check rules cortex-slo-rules.yaml

# Or use Python YAML validation (already done)
python3 -c "import yaml; yaml.safe_load(open('alerting-rules.yaml'))"
python3 -c "import yaml; yaml.safe_load(open('recording-rules.yaml'))"
python3 -c "import yaml; yaml.safe_load(open('cortex-slo-rules.yaml'))"
```

### Test Queries

```bash
# Test that base metrics exist (adjust based on your setup)
# These should return data if Cortex is running and instrumented

# Check if cortex metrics are available
curl -s 'http://localhost:9090/api/v1/query?query=up{job="cortex-core"}' | jq '.data.result'

# Check if kube-state-metrics are available (for cluster alerts)
curl -s 'http://localhost:9090/api/v1/query?query=kube_node_status_condition' | jq '.data.result'

# Check if node-exporter metrics are available (for resource alerts)
curl -s 'http://localhost:9090/api/v1/query?query=node_memory_MemTotal_bytes' | jq '.data.result'
```

## Post-Deployment Verification

### 1. Check Rules Evaluation

```bash
# Check for rule evaluation errors
kubectl logs -n cortex prometheus-0 | grep -i "error.*rule"

# Via Prometheus UI: http://localhost:9090/rules
# - All rules should show "OK" status
# - Recording rules should have data
# - Alerts should be in "Inactive" or "Pending" state (not "Error")
```

### 2. Test SLO Metrics

```bash
# Query SLO availability metrics
curl -s 'http://localhost:9090/api/v1/query?query=cortex_slo:meta_agent:availability:5m' | jq '.data.result'

# Query error budget
curl -s 'http://localhost:9090/api/v1/query?query=cortex_slo:system:error_budget_remaining' | jq '.data.result'

# Query baseline metrics
curl -s 'http://localhost:9090/api/v1/query?query=cortex:task_completion_rate:5m' | jq '.data.result'
```

### 3. Test Alerts

```bash
# Check active alerts
curl -s 'http://localhost:9090/api/v1/alerts' | jq '.data.alerts[] | {alertname: .labels.alertname, state: .state}'

# View via UI: http://localhost:9090/alerts
```

## Configuration for Prometheus Operator

If using Prometheus Operator, create PrometheusRule CRDs:

```bash
cat > prometheus-cortex-rules.yaml <<'EOYAML'
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: cortex-alerting-rules
  namespace: cortex
  labels:
    prometheus: cortex
    role: alert-rules
spec:
  groups:
    # Paste contents from alerting-rules.yaml here
---
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: cortex-recording-rules
  namespace: cortex
  labels:
    prometheus: cortex
    role: recording-rules
spec:
  groups:
    # Paste contents from recording-rules.yaml here
---
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: cortex-slo-rules
  namespace: cortex
  labels:
    prometheus: cortex
    role: slo-rules
spec:
  groups:
    # Paste contents from cortex-slo-rules.yaml here
EOYAML

kubectl apply -f prometheus-cortex-rules.yaml
```

## Troubleshooting

### Rules Not Loading

**Problem**: Rules not appearing in Prometheus UI

**Solutions**:
1. Check ConfigMap is mounted: `kubectl describe pod prometheus-0 -n cortex | grep -A 5 Mounts`
2. Verify file paths in prometheus.yml match mounted paths
3. Check Prometheus logs: `kubectl logs -n cortex prometheus-0 | grep rule`
4. Ensure rule_files section exists in prometheus.yml

### Recording Rules Not Producing Data

**Problem**: Recording rules show 0 samples

**Solutions**:
1. Verify base metrics exist: Check that source metrics (e.g., `cortex_requests_total`) are being scraped
2. Check for label mismatches in PromQL expressions
3. Verify time ranges are appropriate (e.g., need 5m of data for `[5m]` range queries)
4. Check Prometheus logs for evaluation errors

### Alerts Not Firing

**Problem**: Expected alerts not triggering

**Solutions**:
1. Check alert condition is actually met: Query the alert expression manually
2. Verify `for` duration hasn't been reached yet
3. Check AlertManager is configured and connected
4. Review alert inhibition rules in AlertManager

### High Cardinality Issues

**Problem**: Too many time series, Prometheus using too much memory

**Solutions**:
1. Review label usage in recording rules
2. Add metric_relabel_configs to drop unnecessary labels
3. Increase Prometheus resources
4. Reduce scrape frequencies for high-cardinality jobs
5. Use recording rules to pre-aggregate high-cardinality queries

### Missing Metrics

**Problem**: Some alerts reference metrics that don't exist

**Solutions**:
1. **kube-state-metrics**: Deploy if missing
   ```bash
   kubectl apply -f https://github.com/kubernetes/kube-state-metrics/releases/download/v2.10.1/standard.yaml
   ```
2. **node-exporter**: Deploy as DaemonSet if missing
3. **Cortex metrics**: Ensure Cortex components expose `/metrics` endpoint
4. **Control plane metrics**: May not be accessible in managed K8s (EKS, GKE, AKS)
   - Comment out control plane alerts if not available

## Customization

### Adjusting Thresholds

Edit the rule files to adjust thresholds:

```yaml
# Example: Increase CPU pressure threshold from 80% to 90%
- alert: CortexNodeCPUPressure
  expr: |
    (
      1 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m]))
    ) > 0.90  # Changed from 0.80
```

### Adjusting SLO Targets

```yaml
# Example: Change master agent SLO from 99.5% to 99%
- record: cortex_slo:master:error_budget_remaining
  expr: |
    1 - (
      (1 - avg_over_time(up{job="cortex-masters"}[30d]) by (master_type))
      /
      0.01  # Changed from 0.005 (99.5% -> 99%)
    )
```

### Disabling Rules

To disable specific rules, comment them out or remove them:

```yaml
# Disabled - control plane not accessible in managed K8s
# - alert: CortexEtcdNoLeader
#   expr: etcd_server_has_leader == 0
#   ...
```

## AlertManager Configuration

Configure AlertManager to route Cortex alerts:

```yaml
# alertmanager-config.yaml
route:
  receiver: 'default'
  group_by: ['alertname', 'component']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  
  routes:
    # Critical alerts -> PagerDuty
    - match:
        severity: critical
      receiver: 'pagerduty'
      group_wait: 10s
      repeat_interval: 1h
    
    # SLO violations -> Dedicated channel
    - match_re:
        alertname: .*SLO.*
      receiver: 'slo-alerts'
      group_wait: 10s
    
    # Predictive alerts -> Early warning channel
    - match_re:
        alertname: CortexPredicted.*
      receiver: 'predictive-alerts'
    
    # Warning alerts -> Slack
    - match:
        severity: warning
      receiver: 'slack'

receivers:
  - name: 'default'
    webhook_configs:
      - url: 'http://alertmanager-webhook:5000/'
  
  - name: 'pagerduty'
    pagerduty_configs:
      - service_key: '<your-pagerduty-key>'
        description: '{{ .GroupLabels.alertname }}: {{ .CommonAnnotations.summary }}'
  
  - name: 'slack'
    slack_configs:
      - api_url: '<your-slack-webhook>'
        channel: '#cortex-alerts'
        title: 'Cortex Alert: {{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'
  
  - name: 'slo-alerts'
    slack_configs:
      - api_url: '<your-slack-webhook>'
        channel: '#cortex-slo'
        color: '{{ if eq .Status "firing" }}danger{{ else }}good{{ end }}'
  
  - name: 'predictive-alerts'
    slack_configs:
      - api_url: '<your-slack-webhook>'
        channel: '#cortex-ops'
        color: 'warning'
```

## Performance Considerations

### Recording Rule Intervals

The rules are configured with appropriate intervals:
- **60s (1m)**: Real-time metrics (most recording rules)
- **300s (5m)**: Resource metrics (lower priority)
- **3600s (1h)**: Hourly baselines
- **86400s (24h)**: Daily baselines

### Memory Usage

Estimated memory impact:
- **Recording Rules**: ~141 rules × avg 100 series each = ~14,100 new series
- **Memory**: ~50-100 MB additional (depends on cardinality)

### Query Performance

Recording rules improve dashboard query performance:
- Pre-aggregated metrics are faster to query
- Reduces load on Prometheus during dashboard rendering
- Use recording rules in Grafana dashboards instead of raw queries

## Integration with Grafana

### Using SLO Metrics in Dashboards

```json
{
  "targets": [
    {
      "expr": "cortex_slo:system:availability:24h * 100",
      "legendFormat": "System Availability %"
    },
    {
      "expr": "cortex_slo:system:error_budget_remaining * 100",
      "legendFormat": "Error Budget Remaining %"
    }
  ]
}
```

### Using Baseline Metrics

```json
{
  "targets": [
    {
      "expr": "cortex:task_completion_rate:5m",
      "legendFormat": "Task Completion Rate (5m)"
    },
    {
      "expr": "cortex:error_rate:5m",
      "legendFormat": "Error Rate (5m)"
    }
  ]
}
```

## Maintenance Schedule

### Weekly
- Review fired alerts
- Check for alert fatigue (too many non-actionable alerts)
- Adjust thresholds if needed

### Monthly
- Review SLO compliance reports
- Analyze error budget consumption trends
- Update baseline metrics if workload patterns changed
- Review and tune predictive alert accuracy

### Quarterly
- Comprehensive review of all alerts
- Add/remove alerts based on operational learnings
- Update documentation
- Review and adjust SLO targets

## Next Steps

1. Deploy the rules using the commands above
2. Verify all rules are loading correctly
3. Configure AlertManager routing
4. Create Grafana dashboards using the recording rules and SLO metrics
5. Set up notification channels (Slack, PagerDuty, email)
6. Document runbooks for critical alerts
7. Train team on SLO-based incident response

## Support Resources

- **Prometheus Documentation**: https://prometheus.io/docs/
- **SRE Book - Monitoring**: https://sre.google/sre-book/monitoring-distributed-systems/
- **SLO Implementation**: https://sre.google/workbook/implementing-slos/
- **Cortex Monitoring README**: `/Users/ryandahlberg/Projects/cortex/deploy/monitoring/README.md`
- **Rules Summary**: `/Users/ryandahlberg/Projects/cortex/deploy/monitoring/prometheus/RULES-SUMMARY.md`
