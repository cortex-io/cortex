# Monitoring Stack for Larry & the Darryl's

Comprehensive monitoring solution for K3s cluster and infrastructure.

## Components

### Core Monitoring
- **Prometheus** - Metrics collection and storage
- **Grafana** - Visualization and dashboards (http://10.88.145.202)
- **kube-prometheus-stack** - Complete monitoring stack for Kubernetes

### Exporters

#### UniFi Network Monitoring
- **UniFi Poller** (`unifi-poller-stack.yaml`)
  - Monitors UDM Pro at 10.88.140.144:443
  - Collects metrics from:
    - 3 Access Points (U7 Pro, U6+)
    - 1 Gateway (Dream Machine Pro)
    - 1 Switch (USW Enterprise 24 PoE)
    - 1 PDU (USP PDU Pro)
    - 28+ wireless/wired clients
  - Dashboards: Access Points, Clients, Switches, Gateway, Sites
  - Authentication: Local user `unifi-poller`

#### Redis Monitoring
- **Redis Exporter** (deployed in `monitoring-exporters` namespace)
  - Monitors Redis cluster in `cortex-system` namespace
  - Connection: `redis-master.cortex-system.svc.cluster.local:6379`
  - Metrics: Connected clients, memory usage, commands/sec, hit rate

#### Proxmox Monitoring
- **Proxmox Exporter** (deployed in `monitoring-exporters` namespace)
  - Monitors Proxmox VE at 10.88.140.164:8006
  - Tracks all K3s VMs:
    - k3s-master01, k3s-master02, k3s-master03
    - k3s-worker01, k3s-worker02, k3s-worker03, k3s-worker04
  - Metrics: CPU, memory, disk I/O, network, storage, backups
  - Authentication: API token `root@pam!grafana-proxmox-cortex`

#### Cloudflare Monitoring
- **Cloudflare Exporter** (deployed in `monitoring-exporters` namespace)
  - Monitors domains: ryandahlberg.com, ry-ops.dev
  - Metrics: Requests, bandwidth, cache hit ratio, threats blocked
  - Dashboard: Comprehensive CDN analytics
  - **Note**: Requires Analytics:Read permissions on API token

## Dashboard Access

**Grafana URL**: http://10.88.145.202

### Available Dashboards
- **UniFi Network - Larry & the Darryl's**
  - Access Points performance
  - Client connections and quality
  - Switch port status and PoE
  - Gateway throughput
  - Site-wide statistics

- **Redis Monitoring**
  - Cluster health
  - Memory usage
  - Command statistics
  - Connection tracking

- **Proxmox VE**
  - All K3s VM metrics
  - Resource utilization
  - Storage and backup status
  - Network traffic

- **Cloudflare Analytics**
  - Request rates by zone
  - Geographic distribution
  - Cache performance
  - Security threats

## Deployment

All monitoring components are deployed using:
```bash
kubectl apply -f k3s-deployments/monitoring/
kubectl apply -f k3s-deployments/monitoring-exporters/
```

## Credentials

### UniFi Controller
- User: `unifi-poller`
- Password: Stored in ConfigMap

### Proxmox
- Token ID: `root@pam!grafana-proxmox-cortex`
- Token Secret: Stored in Secret
- Config: `/etc/prometheus/pve.yml` (mounted in pod)

### Redis
- Password: Stored in `redis` Secret in `cortex-system` namespace

### Cloudflare
- API Token: Stored in Secret
- Required Permissions: Analytics:Read, Zone:Read

## Metrics Collection

- **Scrape Interval**: 30s (UniFi, Proxmox, Redis), 60s (Cloudflare)
- **Retention**: Configured in Prometheus
- **Storage**: Persistent volumes in K3s cluster

## Troubleshooting

### Check Exporter Status
```bash
kubectl get pods -n monitoring-exporters
kubectl logs -n monitoring-exporters deployment/<exporter-name>
```

### Verify Metrics in Prometheus
```bash
kubectl port-forward -n monitoring svc/kube-prometheus-stack-prometheus 9090:9090
# Visit http://localhost:9090 and query metrics
```

### Check ServiceMonitor Configuration
```bash
kubectl get servicemonitor -n monitoring-exporters
```

## Tim Stewart's UniFi Dashboards

The UniFi dashboards are based on Tim Stewart's excellent work:
- Source: https://github.com/timothystewart6/unpoller-unifi
- Dashboards provide comprehensive UniFi network visibility
- Pre-configured for Prometheus data source

## Updates

Last Updated: 2025-12-21
- Configured UniFi Poller with proper port (443 instead of 8443)
- Fixed Redis exporter authentication
- Configured Proxmox exporter with API token
- Created Cloudflare analytics dashboard
- All exporters operational and collecting metrics
