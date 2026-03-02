# Cortex Monitoring Stack - Quick Start Guide

Get the cortex monitoring stack up and running in 5 minutes.

## Local Development (Docker Compose)

### 1. Deploy Stack

```bash
cd /Users/ryandahlberg/Projects/cortex/deploy/monitoring
./deploy-local.sh deploy
```

### 2. Access Dashboards

- **Grafana**: http://localhost:3000 (admin/admin)
- **Prometheus**: http://localhost:9090
- **AlertManager**: http://localhost:9093

### 3. View Dashboards

In Grafana:
1. Navigate to Dashboards → Browse
2. Open "Cortex" folder
3. Select:
   - **Cortex Overview** - System-wide metrics
   - **MCP Servers** - MCP server performance
   - **Contractor Performance** - Contractor analytics

### 4. Test Alerts

```bash
# Simulate high error rate
curl -X POST http://localhost:9091/metrics/job/cortex-core \
  -d 'cortex_requests_total{status="error"} 100'

# Check alerts in Prometheus
open http://localhost:9090/alerts

# Check AlertManager
open http://localhost:9093
```

### 5. Stop Stack

```bash
./deploy-local.sh stop
```

## Kubernetes Deployment

### 1. Prerequisites

```bash
# Install Prometheus Operator (if not already installed)
kubectl apply -f https://raw.githubusercontent.com/prometheus-operator/prometheus-operator/main/bundle.yaml

# Verify CRDs
kubectl get crd servicemonitors.monitoring.coreos.com
kubectl get crd podmonitors.monitoring.coreos.com
```

### 2. Deploy Stack

```bash
cd /Users/ryandahlberg/Projects/cortex/deploy/monitoring
./deploy-k8s.sh
```

### 3. Access Services

```bash
# Prometheus
kubectl port-forward -n cortex svc/prometheus 9090:9090
open http://localhost:9090

# Grafana
kubectl port-forward -n cortex svc/grafana 3000:3000
open http://localhost:3000

# AlertManager
kubectl port-forward -n cortex svc/alertmanager 9093:9093
open http://localhost:9093
```

### 4. Verify Scrape Targets

```bash
# Check Prometheus targets
kubectl port-forward -n cortex svc/prometheus 9090:9090 &
curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | {job: .labels.job, health: .health}'
```

### 5. Configure Alerts

Edit AlertManager configuration:

```bash
# Edit config
kubectl edit configmap alertmanager-config -n cortex

# Update Slack webhook URL
# Update PagerDuty service key

# Reload AlertManager
kubectl rollout restart deployment/alertmanager -n cortex
```

## Common Tasks

### View Logs

```bash
# Local
./deploy-local.sh logs prometheus
./deploy-local.sh logs grafana

# Kubernetes
kubectl logs -n cortex -l app=prometheus -f
kubectl logs -n cortex -l app=grafana -f
```

### Reload Configuration

```bash
# Local
docker-compose restart prometheus

# Kubernetes
kubectl rollout restart statefulset/prometheus -n cortex
```

### Add Custom Metrics

1. Edit `prometheus/prometheus-config.yaml`
2. Add new scrape config under `scrape_configs`
3. Redeploy:

```bash
# Local
./deploy-local.sh restart

# Kubernetes
kubectl create configmap prometheus-config \
  --from-file=prometheus/prometheus-config.yaml \
  --namespace=cortex --dry-run=client -o yaml | kubectl apply -f -
kubectl rollout restart statefulset/prometheus -n cortex
```

### Create Custom Alert

1. Edit `prometheus/alerting-rules.yaml`
2. Add new rule under appropriate group
3. Redeploy:

```bash
# Local
./deploy-local.sh restart prometheus

# Kubernetes
kubectl create configmap prometheus-rules \
  --from-file=prometheus/alerting-rules.yaml \
  --from-file=prometheus/recording-rules.yaml \
  --namespace=cortex --dry-run=client -o yaml | kubectl apply -f -
kubectl rollout restart statefulset/prometheus -n cortex
```

### Import New Dashboard

1. Create dashboard JSON file in `grafana/dashboards/`
2. Redeploy:

```bash
# Local
docker-compose restart grafana

# Kubernetes
kubectl create configmap grafana-dashboards \
  --from-file=grafana/dashboards/ \
  --namespace=cortex --dry-run=client -o yaml | kubectl apply -f -
kubectl rollout restart deployment/grafana -n cortex
```

## Troubleshooting

### Prometheus Not Scraping

```bash
# Check targets
curl http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | select(.health != "up")'

# Check Prometheus logs
docker-compose logs prometheus | grep -i error

# Validate config
docker exec cortex-prometheus promtool check config /etc/prometheus/prometheus.yml
```

### Grafana Dashboard Not Loading

```bash
# Check datasource
curl -u admin:admin http://localhost:3000/api/datasources

# Check dashboard provisioning
docker exec cortex-grafana ls -la /etc/grafana/provisioning/dashboards/

# Check Grafana logs
docker-compose logs grafana | grep -i error
```

### Alerts Not Firing

```bash
# Check alert rules
curl http://localhost:9090/api/v1/rules | jq '.data.groups[] | select(.name == "cortex_core")'

# Check AlertManager config
curl http://localhost:9093/api/v1/status

# Manually test alert
curl -X POST http://localhost:9093/api/v1/alerts -d '[{
  "labels": {"alertname": "TestAlert", "severity": "warning"},
  "annotations": {"summary": "Test alert"}
}]'
```

### Missing Metrics

```bash
# Query available metrics
curl -g 'http://localhost:9090/api/v1/label/__name__/values' | jq -r '.data[]' | grep cortex

# Check metric cardinality
curl -g 'http://localhost:9090/api/v1/query?query=count({__name__=~"cortex.*"})' | jq
```

## Performance Optimization

### Reduce Cardinality

```yaml
# Add to prometheus-config.yaml
metric_relabel_configs:
  - source_labels: [__name__]
    regex: 'unwanted_metric.*'
    action: drop
```

### Increase Retention

```bash
# Local: Edit docker-compose.yaml
# Change: --storage.tsdb.retention.time=15d
# To: --storage.tsdb.retention.time=30d

# Kubernetes: Edit StatefulSet
kubectl edit statefulset prometheus -n cortex
# Add to args: --storage.tsdb.retention.time=30d
```

### Scale Prometheus

```bash
# Kubernetes: Increase replicas
kubectl scale statefulset prometheus --replicas=2 -n cortex

# Add federation for multi-cluster
```

## Monitoring Metrics Reference

### Key Queries

```promql
# Request rate
sum(rate(cortex_requests_total[5m])) by (component)

# Error rate
sum(rate(cortex_requests_total{status="error"}[5m])) / sum(rate(cortex_requests_total[5m]))

# Latency p95
histogram_quantile(0.95, rate(cortex_request_duration_seconds_bucket[5m]))

# Active workers
count(cortex_worker_status{status="active"}) by (parent_master)

# Token consumption rate
sum(rate(cortex_tokens_consumed_total[5m]))

# Task success rate
sum(rate(cortex_task_completions_total[5m])) / (sum(rate(cortex_task_completions_total[5m])) + sum(rate(cortex_task_failures_total[5m])))
```

### Alert Examples

```yaml
# High error rate
- alert: HighErrorRate
  expr: rate(cortex_requests_total{status="error"}[5m]) / rate(cortex_requests_total[5m]) > 0.05
  for: 5m

# Worker token exhaustion
- alert: WorkerTokenExhaustion
  expr: cortex_worker_tokens_remaining / cortex_worker_tokens_allocated < 0.1
  for: 2m

# MCP server down
- alert: MCPServerDown
  expr: up{job="mcp-servers"} == 0
  for: 3m
```

## Next Steps

1. Configure AlertManager notifications (Slack, PagerDuty)
2. Set up log aggregation with Loki
3. Enable distributed tracing with Tempo
4. Create custom dashboards for specific workflows
5. Set up multi-cluster monitoring federation
6. Implement SLO/SLI dashboards

## Resources

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [PromQL Guide](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [Dashboard Best Practices](https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/best-practices/)

## Support

For issues or questions:
- Check logs: `./deploy-local.sh logs [service]`
- Verify config: `promtool check config prometheus-config.yaml`
- Review metrics: http://localhost:9090/graph
- Test queries: http://localhost:9090/graph?g0.expr=up
