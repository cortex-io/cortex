# Grafana Dashboards

This directory contains Grafana dashboard configurations deployed as Kubernetes ConfigMaps.

## Deployed Dashboards

### K3s Cluster Dashboard
**File**: `k3s-dashboard.yaml`
**ConfigMap**: `grafana-dashboard-k3s-cluster`
**Dashboard UID**: `k3s-cluster-overview`
**Title**: K3s Cluster Overview

Comprehensive k3s cluster monitoring dashboard with the following panels:

**Cluster Health**
- Total Nodes
- Nodes Not Ready
- Running Pods
- Pending Pods
- Failed Pods
- Active Namespaces

**Resource Usage**
- Node CPU Usage (by node)
- Node Memory Usage (by node)
- Disk Usage by Node
- Network Traffic by Node

**Pod & Deployment Metrics**
- Pods by Namespace (table)
- Node Status (table)
- Deployments with Unavailable Replicas (table)
- Pod Phase Timeline (graph)
- Top Pods by Restart Count (table)

**Storage**
- Persistent Volume Claims (table)

**Metrics Used**:
- `kube_node_*` - Node information and status
- `kube_pod_*` - Pod metrics and status
- `kube_deployment_*` - Deployment health
- `kube_namespace_*` - Namespace information
- `kube_persistentvolume*` - Storage metrics
- `node_*` - Node exporter metrics (CPU, memory, disk, network)

### Sandfly Security Dashboard
**File**: `sandfly-dashboard.yaml`
**ConfigMap**: `grafana-dashboard-sandfly-security`
**Dashboard UID**: `sandfly-security-alerts`
**Title**: Sandfly Security Alerts

Security monitoring dashboard for Sandfly alerts with the following panels:

**Alert Summary**
- Total Alerts
- Critical Alerts
- High Alerts
- Hosts Monitored

**Alert Visualization**
- Alert Timeline (graph)
- Alerts by Severity (pie chart)
- Top Alert Types (bar graph)
- Alert Status Over Time (stacked area)

**Affected Hosts & Details**
- Top Affected Hosts (table)
- Recent Security Alerts (table)

**Performance**
- Scan Performance (p50/p95 duration)

**Status**: Dashboard is created but currently shows placeholder data. Sandfly metrics are not yet available in Prometheus.

**Expected Metrics** (to be configured):
- `sandfly_alerts_total` - Total alert count
- `sandfly_alerts_by_severity` - Alerts grouped by severity
- `sandfly_alerts_by_type` - Alerts grouped by type
- `sandfly_alerts_by_host` - Alerts per host
- `sandfly_hosts_monitored` - Number of monitored hosts
- `sandfly_scan_duration_seconds` - Scan performance metrics
- `sandfly_recent_alerts` - Recent alert details
- `sandfly_alerts_by_status` - Alert status (open/resolved)

**Next Steps for Sandfly Integration**:
1. Configure Sandfly to export metrics to Prometheus
2. Verify metrics: `curl http://localhost:9090/api/v1/label/__name__/values | jq -r '.data[]' | grep sandfly`
3. Dashboard will automatically display real data once metrics are available

## Auto-Import Configuration

All dashboards are automatically imported by the Grafana sidecar based on the label:
```yaml
labels:
  grafana_dashboard: "1"
```

The sidecar watches for ConfigMaps with this label and automatically:
1. Writes dashboard JSON to `/tmp/dashboards/`
2. Triggers Grafana to reload dashboard provisioning
3. Makes dashboards available in Grafana UI

## Accessing Dashboards

**Grafana URL**: https://grafana.ry-ops.dev

**Login**: Use your Grafana credentials

**Finding Dashboards**:
- Home > Dashboards
- Search for "K3s" or "Sandfly"
- Or browse by tags: `kubernetes`, `k3s`, `cluster`, `security`, `sandfly`

## Deployment

To deploy or update dashboards:

```bash
# Deploy individual dashboard
kubectl apply -f k3s-dashboard.yaml
kubectl apply -f sandfly-dashboard.yaml

# Deploy all dashboards in directory
kubectl apply -f /Users/ryandahlberg/Projects/cortex/k8s/monitoring/dashboards/

# Verify deployment
kubectl get configmap -n monitoring | grep dashboard

# Check sidecar logs to confirm auto-import
kubectl logs -n monitoring -l app.kubernetes.io/name=grafana -c grafana-sc-dashboard --tail=50
```

## Dashboard Structure

Each dashboard ConfigMap follows this structure:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-dashboard-<name>
  namespace: monitoring
  labels:
    grafana_dashboard: "1"
data:
  <dashboard-name>.json: |
    {
      "title": "Dashboard Title",
      "uid": "unique-dashboard-id",
      "panels": [...],
      "tags": ["tag1", "tag2"]
    }
```

## Verification

After deploying dashboards, verify they were imported:

```bash
# Check ConfigMaps exist
kubectl get configmap -n monitoring grafana-dashboard-k3s-cluster
kubectl get configmap -n monitoring grafana-dashboard-sandfly-security

# Check labels are correct
kubectl get configmap -n monitoring grafana-dashboard-k3s-cluster -o jsonpath='{.metadata.labels}' | jq

# View sidecar logs for successful import
kubectl logs -n monitoring -l app.kubernetes.io/name=grafana -c grafana-sc-dashboard --tail=20
```

Expected sidecar log output:
```
{"level": "INFO", "msg": "Writing /tmp/dashboards/k3s-cluster.json (ascii)"}
{"level": "INFO", "msg": "None sent to http://localhost:3000/api/admin/provisioning/dashboards/reload. Response: 200 OK {\"message\":\"Dashboards config reloaded\"}"}
{"level": "INFO", "msg": "Writing /tmp/dashboards/sandfly-security.json (ascii)"}
{"level": "INFO", "msg": "None sent to http://localhost:3000/api/admin/provisioning/dashboards/reload. Response: 200 OK {\"message\":\"Dashboards config reloaded\"}"}
```

## Current Dashboard Inventory

```bash
kubectl get configmap -n monitoring | grep dashboard
```

Total dashboards: 11
- grafana-dashboard-cloudflare
- grafana-dashboard-k3s-cluster (NEW)
- grafana-dashboard-node-memory-available
- grafana-dashboard-proxmox
- grafana-dashboard-redis
- grafana-dashboard-sandfly-security (NEW)
- grafana-dashboard-unifi-access-points
- grafana-dashboard-unifi-clients
- grafana-dashboard-unifi-gateway
- grafana-dashboard-unifi-sites
- grafana-dashboard-unifi-switches

## Troubleshooting

**Dashboard not appearing in Grafana**:
1. Check ConfigMap exists: `kubectl get cm -n monitoring grafana-dashboard-<name>`
2. Verify label: `kubectl get cm -n monitoring grafana-dashboard-<name> -o yaml | grep grafana_dashboard`
3. Check sidecar logs: `kubectl logs -n monitoring -l app.kubernetes.io/name=grafana -c grafana-sc-dashboard`
4. Restart Grafana pod: `kubectl rollout restart deployment -n monitoring kube-prometheus-stack-grafana`

**Metrics not showing**:
1. Verify Prometheus is scraping metrics: Port forward Prometheus and query metrics
2. Check datasource configuration in Grafana
3. Verify metric names match what's available in Prometheus

**Dashboard shows "N/A" or no data**:
- This is expected for Sandfly dashboard until metrics are configured
- For k3s dashboard, ensure kube-state-metrics and node-exporter are running
