# Grafana Dashboard Deployment Guide

Quick guide to deploy and configure Cortex Grafana dashboards.

## Quick Start

### 1. Deploy Grafana with Dashboards

```bash
# Deploy full monitoring stack (includes Grafana + dashboards)
cd /Users/ryandahlberg/Projects/cortex/deploy/monitoring
./deploy-monitoring.sh
```

### 2. Access Grafana

```bash
# Port forward to Grafana (if using Kubernetes)
kubectl port-forward -n cortex-system svc/grafana 3000:80

# Open browser
open http://localhost:3000

# Default credentials
# Username: admin
# Password: (check deployment script or secret)
```

### 3. Verify Dashboards

Navigate to **Dashboards** → **Cortex** folder to see:
- Cortex Executive Overview
- Cortex Operational
- Cortex Agent Hierarchy
- Cortex MCP Servers

---

## Manual Dashboard Import

If dashboards are not auto-provisioned:

```bash
# 1. Copy dashboard files to Grafana pod
kubectl cp ./grafana/dashboards/cortex-executive-overview.json \
  cortex-system/grafana-xxx:/tmp/

# 2. Import via UI
# - Navigate to Dashboards → Import
# - Upload JSON file
# - Select Prometheus datasource
# - Click Import
```

---

## Dashboard ConfigMap Deployment

Deploy dashboards as Kubernetes ConfigMaps:

```bash
# Create ConfigMap for each dashboard
kubectl create configmap cortex-executive-dashboard \
  --from-file=cortex-executive-overview.json \
  -n cortex-system

kubectl create configmap cortex-operational-dashboard \
  --from-file=cortex-operational.json \
  -n cortex-system

kubectl create configmap cortex-agent-hierarchy-dashboard \
  --from-file=cortex-agent-hierarchy.json \
  -n cortex-system

kubectl create configmap cortex-mcp-servers-dashboard \
  --from-file=cortex-mcp-servers.json \
  -n cortex-system
```

### Mount ConfigMaps in Grafana

Add to Grafana deployment:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: grafana
spec:
  template:
    spec:
      containers:
      - name: grafana
        volumeMounts:
        - name: dashboards
          mountPath: /var/lib/grafana/dashboards
      volumes:
      - name: dashboards
        projected:
          sources:
          - configMap:
              name: cortex-executive-dashboard
          - configMap:
              name: cortex-operational-dashboard
          - configMap:
              name: cortex-agent-hierarchy-dashboard
          - configMap:
              name: cortex-mcp-servers-dashboard
```

---

## Helm Deployment

If using Grafana Helm chart:

```yaml
# values.yaml
datasources:
  datasources.yaml:
    apiVersion: 1
    datasources:
    - name: Prometheus
      type: prometheus
      url: http://prometheus-server:80
      access: proxy
      isDefault: true

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
  cortex-dashboards:
    cortex-executive-overview:
      file: dashboards/cortex-executive-overview.json
    cortex-operational:
      file: dashboards/cortex-operational.json
    cortex-agent-hierarchy:
      file: dashboards/cortex-agent-hierarchy.json
    cortex-mcp-servers:
      file: dashboards/cortex-mcp-servers.json
```

Deploy:

```bash
helm upgrade --install grafana grafana/grafana \
  --namespace cortex-system \
  --create-namespace \
  --values values.yaml \
  --set dashboardsConfigMaps.cortex-dashboards=cortex-dashboards-cm
```

---

## Verify Dashboard Provisioning

```bash
# Check dashboard provider ConfigMap
kubectl get configmap grafana-dashboards -n cortex-system -o yaml

# Check Grafana logs for provisioning
kubectl logs -n cortex-system -l app=grafana | grep -i dashboard

# Expected output:
# logger=provisioning.dashboard type=file msg="looking for dashboards in" path=/var/lib/grafana/dashboards
# logger=provisioning.dashboard msg="provisioned dashboard" file=cortex-executive-overview.json
```

---

## Prometheus Data Source Configuration

Ensure Prometheus is configured as a data source:

```yaml
# datasources.yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus-server:80
    isDefault: true
    jsonData:
      timeInterval: 30s
```

Deploy:

```bash
kubectl create configmap grafana-datasources \
  --from-file=datasources.yaml \
  -n cortex-system

# Or apply via Helm values
grafana:
  datasources:
    datasources.yaml:
      apiVersion: 1
      datasources:
      - name: Prometheus
        type: prometheus
        url: http://prometheus-server:80
        access: proxy
        isDefault: true
```

---

## Testing Dashboards

### 1. Verify Prometheus Connection

```bash
# Test Prometheus query from Grafana
curl -X POST http://localhost:3000/api/datasources/proxy/1/api/v1/query \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d 'query=up'

# Expected: {"status":"success","data":{...}}
```

### 2. Check Template Variables

Navigate to dashboard → Settings → Variables → `$namespace`
- Should show available namespaces from `label_values(up, namespace)`

### 3. Verify Panels

Check each panel for:
- No "No data" errors
- Proper time series rendering
- Correct units and formatting
- Threshold colors working

### 4. Test Alerts (if configured)

```bash
# Trigger test alert
kubectl scale deployment cortex-coordinator --replicas=0 -n cortex-system

# Check dashboard alert panel
# Should show increased alert count
```

---

## Troubleshooting

### Dashboard Not Appearing

```bash
# Check provisioning logs
kubectl logs -n cortex-system -l app=grafana | grep provisioning

# Verify ConfigMap exists
kubectl get configmap -n cortex-system | grep dashboard

# Check file permissions
kubectl exec -n cortex-system grafana-xxx -- ls -la /var/lib/grafana/dashboards/
```

### "No data" in Panels

```bash
# Test Prometheus query directly
kubectl port-forward -n cortex-system svc/prometheus-server 9090:80
open http://localhost:9090

# Run panel query (e.g., up{namespace="cortex-system"})
# Should return results

# If no results, check:
# - ServiceMonitor is configured
# - PodMonitor is scraping
# - Metrics are exposed on /metrics endpoint
```

### Template Variable Not Populating

```bash
# Check Prometheus has namespace label
curl http://localhost:9090/api/v1/label/namespace/values

# Should return array of namespaces
# If empty, check metric labels in Prometheus
```

### Performance Issues

```yaml
# Optimize queries with recording rules
# prometheus-rules.yaml
groups:
  - name: cortex-dashboards
    interval: 30s
    rules:
    - record: cortex:task_success_rate:5m
      expr: |
        sum(rate(cortex_task_completions_total[5m]))
        /
        (sum(rate(cortex_task_completions_total[5m])) + sum(rate(cortex_task_failures_total[5m])))

    - record: cortex:token_utilization:5m
      expr: |
        sum(rate(cortex_tokens_consumed_total[5m]))
        /
        sum(cortex_token_budget_limit)
```

### Dashboard Permissions

```bash
# Set folder permissions
# Navigate to: Dashboards → Cortex folder → Permissions
# Add team/user permissions as needed

# Or via API
curl -X POST http://localhost:3000/api/folders/cortex/permissions \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {"role": "Viewer", "permission": 1},
      {"role": "Editor", "permission": 2}
    ]
  }'
```

---

## Updating Dashboards

### Update Existing Dashboard

```bash
# Method 1: Edit JSON and re-apply ConfigMap
kubectl create configmap cortex-executive-dashboard \
  --from-file=cortex-executive-overview.json \
  --dry-run=client -o yaml | kubectl apply -f -

# Restart Grafana to reload
kubectl rollout restart deployment/grafana -n cortex-system

# Method 2: Use Grafana UI
# Edit dashboard → Save → Update version
```

### Version Control

```bash
# Export dashboard JSON from Grafana
curl -H "Authorization: Bearer $GRAFANA_API_KEY" \
  http://localhost:3000/api/dashboards/uid/cortex-executive-overview \
  | jq .dashboard > cortex-executive-overview.json

# Commit to version control
git add grafana/dashboards/
git commit -m "Update Grafana dashboards"
```

---

## Dashboard URLs

After deployment, dashboards are available at:

- **Executive Overview**: `http://localhost:3000/d/cortex-executive-overview`
- **Operational**: `http://localhost:3000/d/cortex-operational`
- **Agent Hierarchy**: `http://localhost:3000/d/cortex-agent-hierarchy`
- **MCP Servers**: `http://localhost:3000/d/cortex-mcp-servers`

---

## Backup and Restore

### Backup Dashboards

```bash
# Export all dashboards
for uid in cortex-executive-overview cortex-operational cortex-agent-hierarchy cortex-mcp-servers; do
  curl -H "Authorization: Bearer $GRAFANA_API_KEY" \
    http://localhost:3000/api/dashboards/uid/$uid \
    | jq .dashboard > backup-$uid.json
done

# Or export ConfigMaps
kubectl get configmap -n cortex-system \
  -l app=grafana,component=dashboards \
  -o yaml > dashboard-configmaps-backup.yaml
```

### Restore Dashboards

```bash
# Restore from ConfigMap backup
kubectl apply -f dashboard-configmaps-backup.yaml

# Or import via API
for file in backup-*.json; do
  curl -X POST http://localhost:3000/api/dashboards/db \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $GRAFANA_API_KEY" \
    -d @$file
done
```

---

## Production Considerations

### High Availability

```yaml
# Deploy multiple Grafana replicas
grafana:
  replicas: 3
  resources:
    requests:
      memory: 256Mi
      cpu: 100m
    limits:
      memory: 512Mi
      cpu: 500m
```

### Persistent Storage

```yaml
# Use persistent volume for Grafana data
grafana:
  persistence:
    enabled: true
    size: 10Gi
    storageClassName: standard
```

### Authentication

```yaml
# Configure OAuth or LDAP
grafana:
  grafana.ini:
    auth.generic_oauth:
      enabled: true
      client_id: $CLIENT_ID
      client_secret: $CLIENT_SECRET
      scopes: openid profile email
      auth_url: https://auth.example.com/oauth/authorize
      token_url: https://auth.example.com/oauth/token
```

### Alerting Integration

Configure alert notifications in Grafana:

```yaml
# Notification channels
grafana:
  notifiers:
    notifiers.yaml:
      notifiers:
      - name: Slack
        type: slack
        uid: slack-cortex
        settings:
          url: $SLACK_WEBHOOK_URL
          recipient: '#cortex-alerts'
```

---

## Next Steps

1. Deploy dashboards using preferred method
2. Configure data sources and test connectivity
3. Verify metrics are flowing from Prometheus
4. Customize dashboards for your environment
5. Set up alerting and notifications
6. Train team on dashboard usage

For detailed dashboard documentation, see [README.md](./dashboards/README.md)
