# Cortex K3s Dashboard Monitoring Guide

## Overview

This guide documents the comprehensive monitoring solution for the Cortex K3s cluster running in Proxmox VM 310. The monitoring dashboard provides real-time visibility into cluster health, pod status, resource usage, and service endpoints.

## Dashboard Access

### Primary Dashboard URL
- **URL**: http://10.88.145.201/
- **LoadBalancer IP**: 10.88.145.201
- **Service Port**: 80
- **Availability**: 24/7
- **Authentication**: Kubernetes RBAC

### Dashboard Features

The monitoring dashboard displays:
- **Cluster Overview**: Overall health status and resource allocation
- **Pod Status**: All 5 Cortex master pods with CPU, memory, and restart metrics
- **Service Endpoints**: All services and their external IPs
- **Deployment Status**: Desired vs. current vs. ready replicas
- **Recent Events**: Last 50 cluster events sorted by timestamp
- **Resource Graphs**: CPU and memory usage trends
- **Alerts**: Active critical and warning alerts

## API Endpoints

### Health & Metrics

```bash
# Health status
curl http://10.88.145.201:3004/api/health

# Overall metrics
curl http://10.88.145.201:3004/api/metrics

# Dashboard analytics summary
curl http://10.88.145.201:3004/api/dashboard/analytics/summary

# Prometheus metrics (if enabled)
curl http://10.88.145.201:9090/metrics
```

### Worker & Task Management

```bash
# Active workers
curl http://10.88.145.201:3004/api/workers

# Task queue
curl http://10.88.145.201:3004/api/tasks
```

### External Services

```bash
# Microsoft Graph health
curl http://10.88.145.201:3004/api/microsoft-graph/health

# Cloudflare status
curl http://10.88.145.201:3004/api/cloudflare/status

# OpenTofu health
curl http://10.88.145.201:3004/api/opentofu/health

# UniFi infrastructure
curl http://10.88.145.201:3004/api/unifi/health
```

## Kubernetes Commands

### Service Verification

```bash
# Get dashboard service details
kubectl get svc dashboard -n cortex-system -o json

# Get all endpoints
kubectl get endpoints -n cortex-system

# Describe dashboard service
kubectl describe svc dashboard -n cortex-system
```

### Pod Management

```bash
# List all cortex pods
kubectl get pods -n cortex-system

# Get detailed pod info
kubectl get pods -n cortex-system -o wide

# Check specific pod
kubectl describe pod <pod-name> -n cortex-system

# View pod logs
kubectl logs <pod-name> -n cortex-system

# Stream pod logs
kubectl logs -f <pod-name> -n cortex-system
```

### Cluster Information

```bash
# Cluster info
kubectl cluster-info

# Node status
kubectl get nodes

# Node details
kubectl describe node <node-name>

# Top pod resource usage
kubectl top pods -n cortex-system

# Top node resource usage
kubectl top nodes
```

### Events & Troubleshooting

```bash
# Recent cluster events
kubectl get events -n cortex-system --sort-by='.lastTimestamp'

# Deployment rollout status
kubectl rollout status deployment -n cortex-system

# Deployment history
kubectl rollout history deployment -n cortex-system

# Get deployment details
kubectl get deployments -n cortex-system -o wide
```

## Cortex Pods

### Expected Pods (5 Total)

| Pod Name | Component | Status | Port | Replicas |
|----------|-----------|--------|------|----------|
| cortex-coordinator-0 | Master | Running | 3000 | 1 |
| cortex-development-0 | Master | Running | 3001 | 1 |
| cortex-security-0 | Master | Running | 3002 | 1 |
| cortex-cicd-0 | Master | Running | 3003 | 1 |
| cortex-inventory-0 | Master | Running | 3004 | 1 |

### Pod Health Checks

Each pod is monitored for:
- **Pod Running Status**: Pod must be in Running phase
- **Container Ready**: All containers must be ready
- **Resource Limits**: CPU and memory within limits
- **Restart Count**: Should be 0 (alert if > 3)
- **Age**: Track uptime and deployments

## Services & Endpoints

### Core Services

| Service Name | Type | Cluster IP | External IP | Ports | Status |
|-------------|------|-----------|-------------|-------|--------|
| dashboard | LoadBalancer | 10.43.x.x | 10.88.145.201 | 80 | Active |
| api | ClusterIP | 10.43.x.x | None | 3000 | Active |
| metrics | ClusterIP | 10.43.x.x | None | 9090 | Optional |

### Service Endpoints

```bash
# Get all endpoints
kubectl get endpoints -n cortex-system

# Example output:
# NAME        ENDPOINTS                                   AGE
# dashboard   10.244.0.5:3000                            5d
# api         10.244.0.6:3000                            5d
# metrics     10.244.0.7:9090                            5d
```

## Monitoring Dashboards

### Available Dashboards

1. **Cluster Overview** - Health status, pod count, node count, service count
2. **Cortex Pods** - Pod status table, status distribution pie chart
3. **Resource Usage** - CPU and memory graphs, utilization gauges
4. **Services & Endpoints** - Service table, LoadBalancer status card
5. **Deployments** - Deployment replica counts, rollout status
6. **Recent Events** - Sorted event log with filtering

### Refresh Intervals

- Pod metrics: 30 seconds
- Service metrics: 30 seconds
- Deployment metrics: 30 seconds
- Node metrics: 60 seconds
- Event metrics: 30 seconds
- Resource graphs: 60 seconds

## Alerts

### Critical Alerts

| Alert ID | Condition | Severity | Action |
|----------|-----------|----------|--------|
| pod_down | Any pod status != Running for > 2 min | Critical | Notify ops |
| service_no_endpoints | Service endpoints count = 0 | Critical | Notify ops |
| node_down | Node status = NotReady | Critical | Notify ops |

### Warning Alerts

| Alert ID | Condition | Severity | Action |
|----------|-----------|----------|--------|
| pod_restart_loop | Pod restarts > 3 in 1 hour | Warning | Investigate |
| high_cpu_usage | Pod CPU usage > 80% | Warning | Scale up |
| high_memory_usage | Pod memory usage > 80% | Warning | Scale up |

## Monitoring Script

### Health Check Script

Run the comprehensive health check script:

```bash
# Standard text output
./scripts/monitoring/k3s-dashboard-health-check.sh

# Verbose output
./scripts/monitoring/k3s-dashboard-health-check.sh --verbose

# JSON output
./scripts/monitoring/k3s-dashboard-health-check.sh --output json

# Both verbose and JSON
./scripts/monitoring/k3s-dashboard-health-check.sh --verbose --output json
```

### Health Check Verification

The script verifies:
1. kubectl access and cluster connectivity
2. cortex-system namespace exists
3. Dashboard service details and configuration
4. Service endpoints and active connections
5. Pod status and distribution
6. All services in namespace
7. Deployment status and replicas
8. Node status and readiness
9. Recent cluster events
10. HTTP connectivity to endpoints
11. Resource usage metrics

### Health Check Output

The script generates:
- Console output with colored status indicators
- JSON report (optional): `/tmp/k3s-health-check-report.json`
- Pass/Fail/Warning counters
- Summary of all checks

## Proxmox VM Integration

### VM Configuration

- **VM ID**: 310
- **Cluster**: cortex-k3s
- **Namespace**: cortex-system
- **Container Runtime**: containerd
- **K3s Version**: v1.29.x

### Proxmox API Access

```bash
# Get dashboard service (via Proxmox API)
curl -k -s -X GET \
  -H "Authorization: PVEAPIToken=${PROXMOX_TOKEN}" \
  "https://10.88.140.164:8006/api2/json/nodes/pve/qemu/310/exec" \
  -d 'command=["kubectl", "get", "svc", "dashboard", "-n", "cortex-system", "-o", "json"]'

# Get endpoints
curl -k -s -X GET \
  -H "Authorization: PVEAPIToken=${PROXMOX_TOKEN}" \
  "https://10.88.140.164:8006/api2/json/nodes/pve/qemu/310/exec" \
  -d 'command=["kubectl", "get", "endpoints", "dashboard", "-n", "cortex-system"]'
```

## Troubleshooting

### Dashboard Not Accessible

```bash
# Check service status
kubectl get svc dashboard -n cortex-system

# Check endpoints
kubectl get endpoints dashboard -n cortex-system

# Check pod status
kubectl get pods -n cortex-system

# Check events
kubectl get events -n cortex-system --sort-by='.lastTimestamp'
```

### No Endpoints Assigned

```bash
# Verify pod is running
kubectl get pods -n cortex-system

# Check pod logs
kubectl logs <pod-name> -n cortex-system

# Describe pod for events
kubectl describe pod <pod-name> -n cortex-system
```

### High Resource Usage

```bash
# Check resource usage
kubectl top pods -n cortex-system

# Scale up if needed
kubectl scale deployment cortex-masters --replicas=2 -n cortex-system

# Check HPA (Horizontal Pod Autoscaler) status
kubectl get hpa -n cortex-system
```

### Pod Crashes or Restarts

```bash
# Check restart count
kubectl get pods -n cortex-system -o custom-columns=NAME:.metadata.name,RESTARTS:.status.containerStatuses[0].restartCount

# View pod logs
kubectl logs <pod-name> -n cortex-system --previous

# Check pod events
kubectl describe pod <pod-name> -n cortex-system
```

## Configuration Files

### Dashboard Configuration
- **File**: `/coordination/monitoring/k3s-dashboard-config.json`
- **Purpose**: Central configuration for all monitoring metrics and alerts
- **Updates**: Modify to add new metrics or change refresh intervals

### Health Check Script
- **File**: `/scripts/monitoring/k3s-dashboard-health-check.sh`
- **Purpose**: Comprehensive cluster health verification
- **Updates**: Add new checks by extending the script

### React Component
- **File**: `/eui-dashboard/src/pages/ClusterMonitoring.jsx`
- **Purpose**: Dashboard UI for monitoring
- **Updates**: Modify tabs, add new widgets

## Performance Metrics

### Baseline Resource Usage

Expected resource usage for Cortex masters:
- **Coordinator**: 150m CPU, 512Mi memory
- **Development**: 200m CPU, 768Mi memory
- **Security**: 100m CPU, 256Mi memory
- **CICD**: 180m CPU, 512Mi memory
- **Inventory**: 120m CPU, 384Mi memory

Total: ~750m CPU, ~2.5Gi memory

### Cluster Capacity

Assuming standard K3s node:
- **CPU**: 2 cores = 2000m
- **Memory**: 4Gi
- **Available for Cortex**: ~1250m CPU, ~1.5Gi memory (after system pods)

## Security & Access Control

### Authentication Methods
- Kubernetes RBAC for dashboard access
- Service account tokens for API access
- Optional: Enable OIDC/OAuth2

### Role-Based Access
- **Admin**: Full view, edit, delete permissions
- **Operator**: View and acknowledge alerts
- **Viewer**: Read-only access

## Notifications

### Supported Channels
- Email
- Slack
- Webhook

### Alert Recipients
- **Critical Alerts**: ops@cortex.ai, admin@cortex.ai
- **Warning Alerts**: devops@cortex.ai

## Data Retention

- **Events**: 24 hours
- **Metrics**: 7 days
- **Logs**: 30 days
- **Snapshots**: 7 days

## Advanced Features

### Feature Flags

```json
{
  "enable_live_metrics": true,
  "enable_alerts": true,
  "enable_auto_remediation": false,
  "enable_prediction": false,
  "enable_custom_dashboards": true
}
```

### Future Enhancements

- [ ] Auto-remediation for common issues
- [ ] Predictive scaling
- [ ] Custom dashboard builder
- [ ] Advanced alerting rules
- [ ] Integration with external monitoring (Prometheus, Grafana)
- [ ] Multi-cluster dashboard
- [ ] Cost analysis dashboard

## Support & Documentation

### Related Documentation
- Kubernetes Monitoring: `/docs/monitoring-deployment-guide.md`
- K3s Documentation: https://docs.k3s.io/
- Prometheus/Grafana Setup: `/k8s/monitoring/`

### Monitoring Scripts
- Health check: `/scripts/monitoring/k3s-dashboard-health-check.sh`
- Metric collection: `/coordination/monitoring/`

### Configuration
- Dashboard config: `/coordination/monitoring/k3s-dashboard-config.json`
- Service manifest: `/k8s/services/cortex-dashboard-service.yaml`
- Ingress config: `/k8s/cortex-k3s/09-dashboard-ingress.yaml`

## Appendix: Quick Reference

### Essential Commands

```bash
# Status check
kubectl get pods,svc -n cortex-system

# Detailed health
./scripts/monitoring/k3s-dashboard-health-check.sh --verbose

# Watch pods
kubectl get pods -n cortex-system -w

# Stream logs
kubectl logs -f <pod-name> -n cortex-system

# Port forward (if needed)
kubectl port-forward svc/dashboard 8080:80 -n cortex-system

# Get metrics
curl http://10.88.145.201:3004/api/metrics | jq

# Check health
curl http://10.88.145.201:3004/api/health | jq
```

## Last Updated

- **Date**: 2025-12-13
- **Version**: 1.0.0
- **Author**: Development Master (Cortex)
