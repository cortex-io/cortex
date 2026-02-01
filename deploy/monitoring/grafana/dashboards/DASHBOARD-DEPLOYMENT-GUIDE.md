# Cortex Grafana Dashboard Deployment Guide

## Overview

This guide covers the deployment and configuration of all 5 Cortex Grafana dashboards for comprehensive system monitoring.

## Dashboard Inventory

### Tier 1: Executive Overview
- **File**: `cortex-executive-overview.json`
- **UID**: `cortex-executive`
- **Size**: 24KB
- **Panels**: 9
- **Target**: C-level, Leadership
- **URL**: `/d/cortex-executive`

### Tier 2: Operational Dashboard
- **File**: `cortex-operational.json`
- **UID**: `cortex-operational`
- **Size**: 30KB
- **Panels**: 11
- **Target**: SRE, Operations
- **URL**: `/d/cortex-operational`

### Tier 3: Agent Hierarchy
- **File**: `cortex-agent-hierarchy.json`
- **UID**: `cortex-agent-hierarchy`
- **Size**: 27KB
- **Panels**: 11
- **Target**: Developers, Architects
- **URL**: `/d/cortex-agent-hierarchy`

### MCP Servers Dashboard
- **File**: `cortex-mcp-servers.json`
- **UID**: `cortex-mcp-servers`
- **Size**: 29KB
- **Panels**: 11
- **Target**: Integration Team
- **URL**: `/d/cortex-mcp-servers`

### Tier 4: Debug Dashboard (NEW)
- **File**: `cortex-debug.json`
- **UID**: `cortex-debug`
- **Size**: 44KB
- **Panels**: 21 (includes 6 row headers + 14 data panels + 1 selector)
- **Target**: DevOps, SRE (Incident Response)
- **URL**: `/d/cortex-debug`

## Deployment Methods

### Method 1: Kubernetes ConfigMap (Recommended)

Create a ConfigMap for each dashboard:

```bash
# Create namespace if not exists
kubectl create namespace cortex --dry-run=client -o yaml | kubectl apply -f -

# Create ConfigMaps for dashboards
kubectl create configmap grafana-dashboard-executive \
  --from-file=cortex-executive-overview.json \
  -n cortex \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl create configmap grafana-dashboard-operational \
  --from-file=cortex-operational.json \
  -n cortex \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl create configmap grafana-dashboard-agent-hierarchy \
  --from-file=cortex-agent-hierarchy.json \
  -n cortex \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl create configmap grafana-dashboard-mcp-servers \
  --from-file=cortex-mcp-servers.json \
  -n cortex \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl create configmap grafana-dashboard-debug \
  --from-file=cortex-debug.json \
  -n cortex \
  --dry-run=client -o yaml | kubectl apply -f -
```

Label the ConfigMaps for automatic discovery:

```bash
kubectl label configmap grafana-dashboard-executive \
  grafana_dashboard=1 -n cortex

kubectl label configmap grafana-dashboard-operational \
  grafana_dashboard=1 -n cortex

kubectl label configmap grafana-dashboard-agent-hierarchy \
  grafana_dashboard=1 -n cortex

kubectl label configmap grafana-dashboard-mcp-servers \
  grafana_dashboard=1 -n cortex

kubectl label configmap grafana-dashboard-debug \
  grafana_dashboard=1 -n cortex
```

### Method 2: Helm Values

If deploying Grafana via Helm:

```yaml
# values.yaml
grafana:
  dashboardProviders:
    dashboardproviders.yaml:
      apiVersion: 1
      providers:
        - name: 'cortex-dashboards'
          orgId: 1
          folder: 'Cortex'
          type: file
          disableDeletion: false
          editable: true
          options:
            path: /var/lib/grafana/dashboards/cortex

  dashboards:
    cortex:
      executive-overview:
        file: dashboards/cortex-executive-overview.json
      operational:
        file: dashboards/cortex-operational.json
      agent-hierarchy:
        file: dashboards/cortex-agent-hierarchy.json
      mcp-servers:
        file: dashboards/cortex-mcp-servers.json
      debug:
        file: dashboards/cortex-debug.json
```

Deploy:

```bash
helm upgrade --install grafana grafana/grafana \
  -n cortex \
  -f values.yaml
```

### Method 3: Manual Import

1. Access Grafana UI: `http://localhost:3000`
2. Login (default: admin/admin)
3. Navigate to **Dashboards** → **Import**
4. For each dashboard:
   - Click **Upload JSON file**
   - Select the dashboard file
   - Choose datasource: **prometheus**
   - Click **Import**

## Verification

### Check Dashboard Availability

```bash
# Port-forward Grafana
kubectl port-forward -n cortex svc/grafana 3000:80

# Access dashboards
open http://localhost:3000/d/cortex-executive
open http://localhost:3000/d/cortex-operational
open http://localhost:3000/d/cortex-agent-hierarchy
open http://localhost:3000/d/cortex-mcp-servers
open http://localhost:3000/d/cortex-debug
```

### Verify Metrics

Check that Prometheus is scraping metrics:

```bash
# Port-forward Prometheus
kubectl port-forward -n cortex svc/prometheus 9090:9090

# Test queries
curl -s 'http://localhost:9090/api/v1/query?query=up{namespace="cortex"}' | jq

# Check specific metrics used in debug dashboard
curl -s 'http://localhost:9090/api/v1/query?query=container_cpu_usage_seconds_total{namespace="cortex"}' | jq
curl -s 'http://localhost:9090/api/v1/query?query=kube_pod_container_status_restarts_total{namespace="cortex"}' | jq
```

### Test Dashboard Panels

For the Debug Dashboard specifically:

1. **Select a pod**: Use the `$pod` variable selector at the top
2. **Verify CPU metrics**: Check that "Container CPU Usage" shows data
3. **Check memory**: Ensure "Container Memory Usage" displays usage with limits
4. **OOMKilled detection**: Should show 0 or actual OOM events
5. **CPU throttling**: May show 0% if no throttling
6. **Network I/O**: Should show network traffic
7. **PVC prediction**: Verify 24h prediction line appears

## Troubleshooting

### No Data in Panels

**Problem**: Panels show "No data"

**Solutions**:
1. Check namespace variable matches your deployment:
   ```bash
   kubectl get pods -n cortex
   ```
2. Verify Prometheus is scraping:
   ```bash
   kubectl get servicemonitor -n cortex
   kubectl get podmonitor -n cortex
   ```
3. Check time range (default: last 1h for debug dashboard)
4. Verify metrics exist in Prometheus:
   ```
   http://localhost:9090/graph
   ```

### Missing Container Metrics

**Problem**: Container CPU/Memory panels empty

**Solutions**:
1. Ensure cAdvisor is enabled (usually enabled by default in Kubernetes)
2. Check kubelet metrics endpoint:
   ```bash
   kubectl get --raw /api/v1/nodes/<node-name>/proxy/metrics/cadvisor | grep container_cpu
   ```
3. Verify ServiceMonitor for kubelet exists

### OOMKilled Not Detected

**Problem**: OOMKilled panel always shows "No OOM Events"

**Solutions**:
1. This is actually good - means no containers are being OOM killed
2. To verify the metric exists:
   ```bash
   kubectl get pods -n cortex -o json | jq '.items[].status.containerStatuses[] | select(.lastState.terminated.reason=="OOMKilled")'
   ```
3. Check kube-state-metrics is deployed:
   ```bash
   kubectl get pods -n cortex -l app.kubernetes.io/name=kube-state-metrics
   ```

### CPU Throttling Shows 0%

**Problem**: CPU throttling detection shows no throttling

**Solutions**:
1. This is expected if containers have sufficient CPU resources
2. To test, set very low CPU limits on a test pod:
   ```yaml
   resources:
     limits:
       cpu: 100m
   ```
3. Verify the metric:
   ```
   container_cpu_cfs_throttled_seconds_total{namespace="cortex"}
   ```

### PVC Prediction Missing

**Problem**: 24h prediction line not showing

**Solutions**:
1. Ensure at least 6 hours of data exists (required for predict_linear)
2. Check PVCs exist:
   ```bash
   kubectl get pvc -n cortex
   ```
3. Verify kubelet volume stats:
   ```
   kubelet_volume_stats_available_bytes{namespace="cortex"}
   ```

### Network Panels Empty

**Problem**: Network I/O and errors show no data

**Solutions**:
1. Network metrics come from cAdvisor
2. Check if pods have network activity
3. Verify metric:
   ```
   container_network_receive_bytes_total{namespace="cortex"}
   ```

## Dashboard Configuration

### Adjusting Thresholds

Edit dashboard JSON or use Grafana UI:

**CPU Throttling Warning**:
```json
"thresholds": {
  "mode": "absolute",
  "steps": [
    { "color": "green", "value": null },
    { "color": "yellow", "value": 25 },
    { "color": "red", "value": 50 }
  ]
}
```

**Memory Limit Warning**:
```json
"thresholds": {
  "mode": "absolute",
  "steps": [
    { "color": "green", "value": null },
    { "color": "yellow", "value": 0.8 },
    { "color": "red", "value": 0.95 }
  ]
}
```

### Adding Custom Variables

Edit the `templating.list` section:

```json
{
  "name": "container",
  "type": "query",
  "datasource": {
    "type": "prometheus",
    "uid": "prometheus"
  },
  "query": "label_values(container_cpu_usage_seconds_total{namespace=\"$namespace\",pod=~\"$pod\"}, container)",
  "refresh": 2,
  "multi": true,
  "includeAll": true
}
```

### Customizing Time Ranges

Default time ranges can be changed:

- **Executive**: 6h (good for business hours review)
- **Operational**: 6h (shift handover)
- **Agent Hierarchy**: 6h (development cycles)
- **MCP Servers**: 6h (integration debugging)
- **Debug**: 1h (incident response - focused view)

To change default:
```json
"time": {
  "from": "now-1h",
  "to": "now"
}
```

## Integration with Alerting

### Link Dashboards to Alerts

Add dashboard links to alert annotations in Prometheus rules:

```yaml
groups:
  - name: cortex_debug_alerts
    rules:
      - alert: ContainerOOMKilled
        expr: kube_pod_container_status_terminated_reason{namespace="cortex",reason="OOMKilled"} > 0
        annotations:
          summary: "Container killed by OOM"
          description: "Container {{ $labels.container }} in pod {{ $labels.pod }} was OOMKilled"
          dashboard: "http://grafana:3000/d/cortex-debug?var-pod={{ $labels.pod }}"
          panel: "oomkilled-events"

      - alert: HighCPUThrottling
        expr: |
          100 * rate(container_cpu_cfs_throttled_seconds_total{namespace="cortex"}[5m])
          / rate(container_cpu_cfs_periods_total{namespace="cortex"}[5m]) > 50
        annotations:
          summary: "High CPU throttling detected"
          description: "Container {{ $labels.container }} is throttled {{ $value }}%"
          dashboard: "http://grafana:3000/d/cortex-debug?var-pod={{ $labels.pod }}"
          panel: "cpu-throttling"
```

### Alert Drill-Down Workflow

When alert fires:

1. **Alert notification** contains dashboard link
2. **Click link** → Opens Debug Dashboard with pre-filtered pod
3. **Review panels**:
   - Container CPU Usage → Check if hitting limits
   - Memory Usage → Check if approaching limits
   - CPU Throttling → Identify throttling percentage
   - OOMKilled Events → Confirm OOM situation
   - Network diagnostics → Rule out network issues
4. **Take action**:
   - Increase resource limits/requests
   - Optimize application
   - Scale horizontally

## Performance Optimization

### Dashboard Load Time

If dashboards load slowly:

1. **Reduce time range**: Use 1h instead of 6h for Debug dashboard
2. **Increase refresh interval**: Change from 30s to 1m
3. **Limit pod selection**: Select specific pods instead of "All"
4. **Use recording rules**: Pre-calculate expensive queries

### Recording Rules Example

Create recording rules for expensive queries:

```yaml
groups:
  - name: cortex_debug_recording_rules
    interval: 30s
    rules:
      - record: cortex:container_cpu_usage:rate5m
        expr: rate(container_cpu_usage_seconds_total{namespace="cortex"}[5m])

      - record: cortex:container_cpu_throttling_pct:rate5m
        expr: |
          100 * rate(container_cpu_cfs_throttled_seconds_total{namespace="cortex"}[5m])
          / rate(container_cpu_cfs_periods_total{namespace="cortex"}[5m])

      - record: cortex:pvc_utilization_pct
        expr: |
          100 * kubelet_volume_stats_used_bytes{namespace="cortex"}
          / kubelet_volume_stats_capacity_bytes{namespace="cortex"}
```

Then update dashboard queries to use recording rules:
```promql
# Instead of:
100 * rate(container_cpu_cfs_throttled_seconds_total{namespace="cortex"}[5m]) / rate(container_cpu_cfs_periods_total{namespace="cortex"}[5m])

# Use:
cortex:container_cpu_throttling_pct:rate5m
```

## Best Practices

### Dashboard Usage

1. **Start with Executive** → Get system-wide health
2. **Drill to Operational** → Identify infrastructure issues
3. **Check Agent Hierarchy** → Verify application health
4. **Review MCP Servers** → Ensure integration health
5. **Debug with Debug Dashboard** → Deep dive into specific issues

### Variable Selection

- **Namespace**: Always set to your deployment namespace (default: `cortex`)
- **Pod**: Select "All" for overview, specific pod for debugging
- **Node**: Useful for node-specific troubleshooting

### Time Range Selection

- **Live monitoring**: Last 15m or 30m with 10s refresh
- **Incident response**: Last 1h with 30s refresh
- **Post-mortem**: Custom range covering incident period
- **Trend analysis**: Last 24h or 7d

### Panel Interpretation

**CPU Throttling > 25%**:
- Yellow zone: Consider increasing CPU limits
- Red zone (>50%): Immediate action required

**OOMKilled Events > 0**:
- Immediate investigation required
- Check memory limits and application memory usage

**Network Errors > 0**:
- Investigate pod networking
- Check CNI plugin health
- Review network policies

**PVC > 80%**:
- Plan for storage expansion
- Review data retention policies
- Clean up unnecessary data

## Maintenance

### Dashboard Updates

When updating dashboards:

1. **Export from Grafana UI**:
   - Dashboards → Select dashboard → Settings → JSON Model
   - Copy JSON

2. **Update local file**:
   ```bash
   cat > cortex-debug.json <<'EOF'
   {
     "annotations": { ... }
   }
   EOF
   ```

3. **Apply updates**:
   ```bash
   kubectl create configmap grafana-dashboard-debug \
     --from-file=cortex-debug.json \
     -n cortex \
     --dry-run=client -o yaml | kubectl apply -f -
   ```

4. **Reload Grafana**:
   ```bash
   kubectl rollout restart deployment/grafana -n cortex
   ```

### Version Control

Keep dashboards in git:

```bash
cd /Users/ryandahlberg/Projects/cortex
git add deploy/monitoring/grafana/dashboards/
git commit -m "feat: Add Debug Dashboard (Tier 4) with pod-level diagnostics"
git push
```

## Support

For issues:

1. **Check Grafana logs**:
   ```bash
   kubectl logs -n cortex -l app.kubernetes.io/name=grafana --tail=100
   ```

2. **Verify Prometheus connectivity**:
   ```bash
   kubectl exec -n cortex -it <grafana-pod> -- wget -O- http://prometheus:9090/api/v1/targets
   ```

3. **Test metric queries**:
   ```bash
   kubectl port-forward -n cortex svc/prometheus 9090:9090
   # Then visit http://localhost:9090/graph
   ```

4. **Review documentation**:
   - README.md: Comprehensive metric reference
   - DASHBOARD-SUMMARY.md: Quick comparison matrix
   - This guide: Deployment and troubleshooting

---

**Version**: 1.1
**Last Updated**: 2025-12-12
**Dashboards**: 5 (Executive, Operational, Agent Hierarchy, MCP Servers, Debug)
