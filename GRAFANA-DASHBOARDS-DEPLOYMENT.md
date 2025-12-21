# 📊 Grafana Dashboards Deployment - Status Report

**Date**: 2025-12-20
**Status**: ✅ Exporters Deployed, ⚙️ Configuration Required

---

## 🎯 Deployment Summary

Successfully deployed Prometheus exporters and Grafana dashboards for:
- ✅ Proxmox VE
- ✅ Redis
- ✅ UniFi Controller (needs credentials)
- ✅ GitHub (running)
- ⚠️ Cloudflare (needs credentials)

---

## 📊 Deployed Components

### Prometheus Exporters

| Service | Status | Port | Metrics Endpoint |
|---------|--------|------|------------------|
| **Proxmox VE** | ✅ Running | 9221 | `/pve` |
| **Redis** | ✅ Running | 9121 | `/metrics` |
| **UniFi** | ⚠️ Needs Config | 9130 | `/metrics` |
| **GitHub** | ✅ Running | 9171 | `/metrics` |
| **Cloudflare** | ⚠️ Needs Credentials | 8080 | `/metrics` |

### Grafana Dashboards

| Dashboard | Status | UID |
|-----------|--------|-----|
| **Proxmox VE** | ✅ Created | `proxmox-ve` |
| **Redis** | ✅ Created | `redis-dashboard` |
| **UniFi Controller** | ✅ Created | `unifi-controller` |

---

## ✅ Working Services

### 1. Proxmox VE Exporter
**Status**: ✅ Fully Operational

**Configuration**:
- Target: `https://10.88.145.100:8006`
- User: `monitoring@pve`
- Password: Set via Secret
- SSL Verification: Disabled

**Metrics Available**:
- Cluster status
- Node resources
- VM/CT statistics
- Storage usage

**Dashboard**: Available in Grafana as "Proxmox VE"

---

### 2. Redis Exporter
**Status**: ✅ Fully Operational

**Configuration**:
- Target: `redis://cortex-redis.cortex-system.svc.cluster.local:6379`
- No authentication required

**Metrics Available**:
- Commands/sec
- Memory usage
- Connected clients
- Keyspace statistics

**Dashboard**: Available in Grafana as "Redis"

---

### 3. GitHub Exporter
**Status**: ✅ Running (needs PAT for full functionality)

**Configuration**:
- Repos: `anthropics/claude-code`
- Token: Not configured (public access only)

**Metrics Available** (limited without token):
- Repository metadata
- Public statistics

**To Enable Full Metrics**:
```bash
kubectl edit secret github-exporter-token -n monitoring-exporters
# Add your GitHub Personal Access Token
```

---

## ⚠️ Services Needing Configuration

### 1. UniFi Controller Exporter
**Status**: ⚠️ Configuration Error

**Issue**: Missing configuration file

**Fix Required**:
```bash
# Update the UniFi exporter deployment with proper config
kubectl edit deployment unifi-exporter -n monitoring-exporters

# Or use a different UniFi exporter image that supports env vars
kubectl set image deployment/unifi-exporter \
  exporter=mellowagain/unpoller:latest \
  -n monitoring-exporters
```

**Required Settings**:
- UniFi Controller URL: `https://10.88.145.1:8443`
- Username: `admin`
- Password: (configured in secret)

---

### 2. Cloudflare Exporter
**Status**: ⚠️ Missing Credentials

**Issue**: No API credentials provided

**Fix Required**:
```bash
# Edit the secret and add your Cloudflare credentials
kubectl edit secret cloudflare-exporter-credentials -n monitoring-exporters

# Add these values (base64 encoded):
# CF_API_KEY: your_api_key_here
# CF_API_EMAIL: your_email_here

# Or restart with API token:
kubectl set env deployment/cloudflare-exporter \
  CF_API_TOKEN=your_token_here \
  -n monitoring-exporters
```

**How to Get Cloudflare API Key**:
1. Log in to Cloudflare Dashboard
2. Go to My Profile → API Tokens
3. Create Token with "Zone:Read" permissions
4. Copy the token

---

## 🔍 Verification Commands

### Check Exporter Status
```bash
# All exporters
kubectl get pods -n monitoring-exporters

# Specific exporter logs
kubectl logs -n monitoring-exporters -l app=proxmox-exporter
kubectl logs -n monitoring-exporters -l app=redis-exporter
kubectl logs -n monitoring-exporters -l app=unifi-exporter
kubectl logs -n monitoring-exporters -l app=github-exporter
kubectl logs -n monitoring-exporters -l app=cloudflare-exporter
```

### Check ServiceMonitors
```bash
# List all ServiceMonitors
kubectl get servicemonitors -n monitoring-exporters

# Check if Prometheus is scraping
kubectl get servicemonitors -n monitoring-exporters -o yaml
```

### Test Metrics Endpoints
```bash
# From within cluster
kubectl run curl --rm -it --image=curlimages/curl -- /bin/sh
curl http://proxmox-exporter.monitoring-exporters:9221/pve
curl http://redis-exporter.monitoring-exporters:9121/metrics
curl http://github-exporter.monitoring-exporters:9171/metrics
```

---

## 📈 Prometheus Integration

### ServiceMonitor Configuration
All exporters have ServiceMonitors created with label:
```yaml
labels:
  release: kube-prometheus-stack
```

This ensures Prometheus auto-discovers and scrapes them.

### Scrape Intervals
- Proxmox: 30s
- Redis: 30s
- UniFi: 30s
- GitHub: 60s (to avoid rate limits)
- Cloudflare: 60s (to avoid rate limits)

---

## 🎨 Grafana Dashboard Access

### Access Grafana
**URL**: http://10.88.145.202
**Username**: `admin`
**Password**: `UkJUjICksbAdWoZ9p37mwkNrwdWoPYyx9E4ucJ9n`

### Finding Dashboards
1. Open Grafana
2. Click "Dashboards" in left menu
3. Search for:
   - "Proxmox VE"
   - "Redis"
   - "UniFi Controller"

### Dashboard Auto-Discovery
The Grafana sidecar automatically discovers ConfigMaps with label:
```yaml
labels:
  grafana_dashboard: "1"
```

Dashboards appear within 1-2 minutes of ConfigMap creation.

---

## 🔧 Next Steps

### Immediate Actions

1. **Configure UniFi Exporter**
   ```bash
   # Use UnPoller instead (better UniFi integration)
   kubectl set image deployment/unifi-exporter \
     exporter=golift/unifi-poller:latest \
     -n monitoring-exporters

   # Update config
   kubectl create configmap unifi-config \
     -n monitoring-exporters \
     --from-literal=UP_UNIFI_DEFAULT_URL=https://10.88.145.1:8443 \
     --from-literal=UP_UNIFI_DEFAULT_USER=admin \
     --from-literal=UP_UNIFI_DEFAULT_PASS=toor \
     --from-literal=UP_UNIFI_DEFAULT_VERIFY_SSL=false
   ```

2. **Add Cloudflare Credentials**
   ```bash
   # Get your Cloudflare API token from dashboard.cloudflare.com

   kubectl patch secret cloudflare-exporter-credentials \
     -n monitoring-exporters \
     --type merge \
     -p '{"stringData":{"CF_API_KEY":"your_key","CF_API_EMAIL":"your_email"}}'

   # Restart deployment
   kubectl rollout restart deployment/cloudflare-exporter -n monitoring-exporters
   ```

3. **Add GitHub Personal Access Token** (optional, for private repos)
   ```bash
   kubectl patch secret github-exporter-token \
     -n monitoring-exporters \
     --type merge \
     -p '{"stringData":{"GITHUB_TOKEN":"ghp_your_token_here"}}'

   kubectl rollout restart deployment/github-exporter -n monitoring-exporters
   ```

### Enhanced Dashboards

Consider importing these popular dashboards from Grafana.com:

- **Proxmox**: ID 10347, 15356
- **Redis**: ID 11835, 12776
- **UniFi**: ID 11315, 11314 (UnPoller)
- **GitHub**: ID 13502
- **Cloudflare**: ID 12295

Import via Grafana UI:
1. Dashboards → Import
2. Enter dashboard ID
3. Select "Prometheus" as data source
4. Click Import

---

## 📊 Current Metrics Status

### Available in Prometheus
```promql
# Proxmox metrics
pve_up
pve_cpu_usage_ratio
pve_memory_usage_bytes
pve_disk_usage_bytes

# Redis metrics
redis_up
redis_commands_processed_total
redis_memory_used_bytes
redis_connected_clients

# GitHub metrics (limited without token)
github_repo_*

# UniFi metrics (once configured)
unifi_devices
unifi_clients
unifi_device_bytes_*

# Cloudflare metrics (once configured)
cloudflare_zone_*
```

### Query in Prometheus
Access Prometheus at: http://10.88.145.201:9090

---

## 🎯 Success Criteria

- ✅ Prometheus exporters deployed
- ✅ ServiceMonitors created
- ✅ Grafana dashboards created
- ✅ Redis metrics flowing
- ✅ Proxmox metrics flowing
- ⏳ UniFi exporter needs config update
- ⏳ Cloudflare needs credentials
- ⏳ GitHub needs PAT (optional)

---

## 🔒 Security Notes

### Secrets Created

1. **proxmox-exporter-credentials** (monitoring-exporters)
   - Contains Proxmox username/password
   - Used by Proxmox exporter pod

2. **unifi-exporter-credentials** (monitoring-exporters)
   - Contains UniFi username/password
   - Used by UniFi exporter pod

3. **github-exporter-token** (monitoring-exporters)
   - Empty by default
   - Add GitHub PAT for private repos

4. **cloudflare-exporter-credentials** (monitoring-exporters)
   - Empty by default
   - Add Cloudflare API key/email or token

### Best Practices

- Use read-only credentials where possible
- Rotate credentials regularly
- Use API tokens instead of passwords when available
- Limit token permissions to minimum required

---

## 📞 Troubleshooting

### Exporter Pod Not Starting
```bash
kubectl describe pod -n monitoring-exporters <pod-name>
kubectl logs -n monitoring-exporters <pod-name>
```

### Metrics Not Appearing in Prometheus
```bash
# Check ServiceMonitor
kubectl get servicemonitor -n monitoring-exporters <name> -o yaml

# Check Prometheus config
kubectl get prometheus -n monitoring kube-prometheus-stack-prometheus -o yaml

# Check Prometheus targets
# Access http://10.88.145.201:9090/targets
```

### Dashboard Not Showing in Grafana
```bash
# Check ConfigMap labels
kubectl get configmap -n monitoring -l grafana_dashboard=1

# Check Grafana sidecar logs
kubectl logs -n monitoring -l app.kubernetes.io/name=grafana -c grafana-sc-dashboard
```

### No Data in Dashboard
1. Verify exporter is running and healthy
2. Check Prometheus is scraping (http://10.88.145.201:9090/targets)
3. Verify metrics exist in Prometheus (run query)
4. Check dashboard queries match metric names

---

## 📚 Resources

### Exporter Documentation
- [Proxmox Exporter](https://github.com/prometheus-pve/prometheus-pve-exporter)
- [Redis Exporter](https://github.com/oliver006/redis_exporter)
- [UniFi Poller](https://github.com/unpoller/unpoller)
- [GitHub Exporter](https://github.com/githubexporter/github-exporter)
- [Cloudflare Exporter](https://github.com/lablabs/cloudflare-exporter)

### Grafana Dashboards
- [Grafana Dashboard Library](https://grafana.com/grafana/dashboards/)
- [Proxmox Dashboards](https://grafana.com/grafana/dashboards/?search=proxmox)
- [Redis Dashboards](https://grafana.com/grafana/dashboards/?search=redis)
- [UniFi Dashboards](https://grafana.com/grafana/dashboards/?search=unifi)

---

╔════════════════════════════════════════════════════════════════╗
║              GRAFANA DASHBOARDS DEPLOYMENT REPORT              ║
║                                                                ║
║  Status: ✅ Core Infrastructure Deployed                      ║
║  Working: Proxmox ✅ | Redis ✅ | GitHub ✅                   ║
║  Pending: UniFi (config) | Cloudflare (credentials)           ║
║                                                                ║
║  Access Grafana: http://10.88.145.202                         ║
║  Username: admin                                               ║
║  Password: UkJUjICksbAdWoZ9p37mwkNrwdWoPYyx9E4ucJ9n          ║
╚════════════════════════════════════════════════════════════════╝
