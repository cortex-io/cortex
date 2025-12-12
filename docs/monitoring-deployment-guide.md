# Cortex Monitoring Stack Deployment Guide

Complete guide to deploying and using the Cortex monitoring stack with Prometheus and Grafana.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Quick Start](#quick-start)
4. [Manual Deployment](#manual-deployment)
5. [Accessing Dashboards](#accessing-dashboards)
6. [Troubleshooting](#troubleshooting)
7. [Advanced Configuration](#advanced-configuration)

---

## Overview

The Cortex monitoring stack provides:
- **Prometheus** - Metrics collection and storage
- **Grafana** - Visualization and dashboards
- **3 Pre-built Dashboards** - Autoscaling, Masters, Workers
- **Custom Metrics** - Cortex-specific metrics from coordination layer

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Cortex Dashboard                         │
│                   (port 3004/metrics)                        │
└────────────────────────┬────────────────────────────────────┘
                         │ Scrape every 15s
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                      Prometheus                              │
│              - Scrapes Cortex metrics                        │
│              - Stores 30 days retention                      │
│              - Runs alert rules                              │
│                   (port 9090)                                │
└────────────────────────┬────────────────────────────────────┘
                         │ Query metrics
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                       Grafana                                │
│              - Visualizes metrics                            │
│              - 3 pre-built dashboards                        │
│              - Auto-configured datasource                    │
│                   (port 3000)                                │
└─────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

1. **K3s Cluster** running
2. **kubectl** configured
3. **Cortex Dashboard** server (for metrics endpoint)

Optional:
- Prometheus Operator (for ServiceMonitors)

---

## Quick Start

### 1. Install Dependencies

Ensure Cortex dashboard has prom-client installed:

```bash
cd eui-dashboard
npm install
```

### 2. Deploy Monitoring Stack

Run the automated deployment script:

```bash
./scripts/monitoring/deploy-monitoring-stack.sh
```

This will:
1. Create `monitoring` namespace
2. Deploy Prometheus with RBAC
3. Deploy Grafana with dashboards
4. Configure datasources
5. Wait for pods to be ready

**Expected output:**
```
========================================
Monitoring Stack Deployed Successfully!
========================================

Access Information:
  Prometheus: http://10.88.140.152:30003
  Grafana:    http://10.88.140.152:30002

Grafana Credentials:
  Username: admin
  Password: CortexMonitoring2025!
```

### 3. Validate Deployment

```bash
./scripts/monitoring/validate-monitoring.sh
```

Expected: All 10 tests should pass

### 4. Start Cortex Dashboard

Ensure the metrics endpoint is running:

```bash
cd eui-dashboard
npm run api
```

Verify metrics are exposed:
```bash
curl http://localhost:3004/metrics
```

---

## Manual Deployment

### Step 1: Create Namespace

```bash
kubectl apply -f k8s/monitoring/prometheus-namespace.yaml
```

### Step 2: Deploy Prometheus

```bash
# RBAC
kubectl apply -f k8s/monitoring/prometheus-rbac.yaml

# ConfigMap (with scrape config and alert rules)
kubectl apply -f k8s/monitoring/prometheus-config.yaml

# Storage
kubectl apply -f k8s/monitoring/prometheus-pvc.yaml

# Deployment
kubectl apply -f k8s/monitoring/prometheus-deployment.yaml
kubectl apply -f k8s/monitoring/prometheus-service.yaml
```

Wait for ready:
```bash
kubectl wait --for=condition=ready pod -l app=prometheus -n monitoring --timeout=300s
```

### Step 3: Deploy Grafana

```bash
# Secret (admin credentials)
kubectl apply -f k8s/monitoring/grafana-secret.yaml

# Storage
kubectl apply -f k8s/monitoring/grafana-pvc.yaml

# ConfigMaps
kubectl apply -f k8s/monitoring/grafana-datasource.yaml
kubectl apply -f k8s/monitoring/grafana-dashboard-provider.yaml

# Generate and apply dashboard ConfigMap
./scripts/monitoring/create-dashboard-configmap.sh
kubectl apply -f k8s/monitoring/grafana-dashboards-configmap.yaml

# Deployment
kubectl apply -f k8s/monitoring/grafana-deployment.yaml
kubectl apply -f k8s/monitoring/grafana-service.yaml
```

Wait for ready:
```bash
kubectl wait --for=condition=ready pod -l app=grafana -n monitoring --timeout=300s
```

### Step 4: Optional - Deploy ServiceMonitors

If using Prometheus Operator:
```bash
kubectl apply -f k8s/monitoring/servicemonitor-cortex.yaml
```

---

## Accessing Dashboards

### Prometheus

**URL:** http://10.88.140.152:30003

**Features:**
- Query metrics directly
- View scrape targets: `/targets`
- Check alerts: `/alerts`
- Service discovery: `/service-discovery`

**Example Queries:**
```promql
# Total queue depth
sum(cortex_task_queue_depth)

# Active workers
sum(cortex_active_workers)

# Master health
cortex_master_health
```

### Grafana

**URL:** http://10.88.140.152:30002

**Credentials:**
- Username: `admin`
- Password: `CortexMonitoring2025!`

**Dashboards:**

1. **Cortex Autoscaling** (`/d/cortex-autoscaling`)
   - Task queue depth over time
   - Active workers by type (stacked)
   - Scaling events (annotations)
   - Resource usage
   - Task age metrics

2. **Cortex Masters** (`/d/cortex-masters`)
   - Master health status
   - MoE routing confidence
   - Handoff distribution
   - Master workload
   - Routing decisions table

3. **Cortex Workers** (`/d/cortex-workers`)
   - Task completion rate
   - Task duration distribution (heatmap)
   - Success vs failure rate
   - Failed tasks table
   - Worker lifecycle events

---

## Troubleshooting

### Prometheus Not Scraping Cortex

**Symptom:** No Cortex metrics in Prometheus

**Check:**
```bash
# 1. Is dashboard server running?
curl http://localhost:3004/metrics

# 2. Are targets UP?
curl http://10.88.140.152:30003/api/v1/targets | jq '.data.activeTargets[] | select(.labels.job=="cortex-dashboard")'

# 3. Check Prometheus logs
kubectl logs -n monitoring -l app=prometheus --tail=50
```

**Fix:**
- Ensure dashboard server is running on port 3004
- Check Prometheus config includes cortex-dashboard job
- Verify network connectivity

### Grafana Dashboards Not Loading

**Symptom:** Empty or missing dashboards

**Check:**
```bash
# 1. Are dashboards in ConfigMap?
kubectl get configmap grafana-dashboards -n monitoring -o yaml

# 2. Is ConfigMap mounted?
kubectl describe pod -n monitoring -l app=grafana | grep -A5 "Mounts:"

# 3. Check Grafana logs
kubectl logs -n monitoring -l app=grafana --tail=50
```

**Fix:**
```bash
# Regenerate dashboard ConfigMap
./scripts/monitoring/create-dashboard-configmap.sh
kubectl delete configmap grafana-dashboards -n monitoring
kubectl apply -f k8s/monitoring/grafana-dashboards-configmap.yaml

# Restart Grafana
kubectl rollout restart deployment/grafana -n monitoring
```

### No Data in Dashboards

**Symptom:** Dashboards load but show "No data"

**Check:**
```bash
# 1. Is datasource configured?
curl -u admin:CortexMonitoring2025! http://10.88.140.152:30002/api/datasources

# 2. Can Grafana reach Prometheus?
kubectl exec -n monitoring -it deployment/grafana -- curl http://prometheus-internal:9090/api/v1/query?query=up

# 3. Are metrics being collected?
curl http://10.88.140.152:30003/api/v1/query?query=cortex_task_queue_depth
```

**Fix:**
- Verify datasource URL is correct: `http://prometheus-internal:9090`
- Check Prometheus has data: query `up` metric
- Ensure Cortex is generating metrics

### Pods Not Starting

**Symptom:** Pods stuck in Pending or CrashLoopBackOff

**Check:**
```bash
kubectl get pods -n monitoring
kubectl describe pod <pod-name> -n monitoring
kubectl logs <pod-name> -n monitoring
```

**Common Issues:**
- **PVC not bound:** Check storage class exists
- **Resource limits:** Insufficient cluster resources
- **Image pull errors:** Check image names and registry

---

## Advanced Configuration

### Customize Scrape Interval

Edit `k8s/monitoring/prometheus-config.yaml`:

```yaml
global:
  scrape_interval: 30s  # Change from 15s
```

Apply:
```bash
kubectl apply -f k8s/monitoring/prometheus-config.yaml
kubectl rollout restart deployment/prometheus -n monitoring
```

### Add Custom Alert Rules

Edit `k8s/monitoring/prometheus-config.yaml`, add to `alerts.yml`:

```yaml
- alert: CortexCustomAlert
  expr: your_custom_query > threshold
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Custom alert triggered"
```

### Increase Retention

Edit `k8s/monitoring/prometheus-deployment.yaml`:

```yaml
args:
  - '--storage.tsdb.retention.time=60d'  # Change from 30d
  - '--storage.tsdb.retention.size=50GB'  # Change from 18GB
```

Also increase PVC size in `prometheus-pvc.yaml`:
```yaml
resources:
  requests:
    storage: 60Gi  # Change from 20Gi
```

### Enable AlertManager

1. Deploy AlertManager:
```bash
kubectl apply -f k8s/monitoring/alertmanager-deployment.yaml
kubectl apply -f k8s/monitoring/alertmanager-config.yaml
```

2. Update Prometheus config:
```yaml
alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']
```

### Add External Scrape Targets

Edit `prometheus-config.yaml`, add job:

```yaml
scrape_configs:
  - job_name: 'external-service'
    static_configs:
      - targets: ['external-host:9090']
        labels:
          service: 'external'
```

---

## Metrics Reference

See [metrics-schema.md](./metrics-schema.md) for complete documentation of all Cortex metrics, including:
- Metric types and labels
- PromQL query examples
- Alerting rule recommendations
- Dashboard panel queries

---

## Performance Tuning

### Optimize Query Performance

**Recording Rules** (pre-computed metrics):

Add to `prometheus-config.yaml`:
```yaml
groups:
  - name: cortex_performance
    interval: 30s
    rules:
      - record: cortex:task_completion_rate:5m
        expr: sum(rate(cortex_task_completion_total[5m])) by (type)
```

Use in dashboards:
```promql
cortex:task_completion_rate:5m
```

### Reduce Memory Usage

**Limit retention:**
```yaml
args:
  - '--storage.tsdb.retention.time=7d'
  - '--storage.tsdb.retention.size=5GB'
```

**Reduce scrape frequency:**
```yaml
global:
  scrape_interval: 60s
```

---

## Backup and Restore

### Backup Prometheus Data

```bash
# Create snapshot
kubectl exec -n monitoring deployment/prometheus -- \
  curl -XPOST http://localhost:9090/api/v1/admin/tsdb/snapshot

# Copy snapshot
kubectl cp monitoring/<pod-name>:/prometheus/snapshots/<snapshot-id> ./prometheus-backup
```

### Backup Grafana Dashboards

```bash
# Export all dashboards
for uid in cortex-autoscaling cortex-masters cortex-workers; do
  curl -u admin:CortexMonitoring2025! \
    "http://10.88.140.152:30002/api/dashboards/uid/$uid" \
    > "grafana-backup-$uid.json"
done
```

### Restore

```bash
# Restore Prometheus data
kubectl cp ./prometheus-backup monitoring/<pod-name>:/prometheus/

# Restore Grafana dashboards
kubectl apply -f k8s/monitoring/grafana-dashboards-configmap.yaml
kubectl rollout restart deployment/grafana -n monitoring
```

---

## Integration with CI/CD

### Automated Deployment

Add to `.github/workflows/deploy-monitoring.yml`:

```yaml
name: Deploy Monitoring Stack

on:
  push:
    branches: [main]
    paths:
      - 'k8s/monitoring/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy
        run: ./scripts/monitoring/deploy-monitoring-stack.sh
      - name: Validate
        run: ./scripts/monitoring/validate-monitoring.sh
```

### Health Checks

Add to your CI pipeline:

```bash
# Check Prometheus is up
curl -f http://10.88.140.152:30003/-/healthy

# Check Grafana is up
curl -f http://10.88.140.152:30002/api/health

# Verify metrics exist
curl -s http://10.88.140.152:30003/api/v1/query?query=up | grep -q '"status":"success"'
```

---

## Next Steps

1. **Explore Dashboards** - Familiarize yourself with the 3 pre-built dashboards
2. **Set Up Alerts** - Configure AlertManager for notifications
3. **Custom Metrics** - Add application-specific metrics
4. **Long-term Storage** - Consider Thanos for unlimited retention
5. **High Availability** - Deploy Prometheus in HA mode for production

For questions or issues, see [CONTRIBUTING.md](../CONTRIBUTING.md)
