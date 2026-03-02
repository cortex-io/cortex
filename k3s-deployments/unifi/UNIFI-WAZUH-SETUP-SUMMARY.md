# UniFi + Wazuh Integration Setup Summary

## Components Deployed

### 1. UniFi External Service (UDM Pro at 10.88.140.1)
**Status**: ✅ Configured
- **Service**: `unifi-controller` in `default` namespace
- **Endpoint**: 10.88.140.1:8443
- **Traefik Routes**:
  - `http://unifi.cortex.local` → 10.88.140.1:8443
  - `http://unifi.local` → 10.88.140.1:8443

**Issue**: ⚠️ K3s pods cannot reach 10.88.140.1 due to network isolation
- Nodes can reach UDM Pro
- Pod network (CNI) does not have route to 10.88.140.1

### 2. UniFi Syslog Receiver
**Status**: ✅ Running
- **LoadBalancer IP**: `10.88.145.215:514` (UDP/TCP)
- **Deployment**: `unifi-syslog-receiver` in `default` namespace
- **Function**: Receives syslog from UDM Pro and forwards to Wazuh

**Configuration**:
```yaml
Service: unifi-syslog
External IP: 10.88.145.215
Ports: 514/UDP, 514/TCP
```

**Update Required in UDM Pro**:
- Change syslog target from `10.88.145.208:514` to `10.88.145.215:514`
- Location: UniFi Settings → System → Remote Logging

### 3. UniFi MCP Server
**Status**: ⚠️ Running but cannot connect to UDM Pro
- **Deployment**: `unifi-mcp-server` in `cortex-system` namespace
- **Credentials**: Configured (api-monitoring user)
- **Issue**: Cannot reach 10.88.140.1:8443 from pod network

### 4. UniFi Exporter (Prometheus)
**Status**: ⚠️ Running but cannot connect to UDM Pro
- **Deployment**: `unifi-exporter` in `monitoring-exporters` namespace
- **Service**: `10.43.112.113:9130`
- **Issue**: Cannot reach 10.88.140.1:8443 from pod network

## Network Connectivity Issues

### Problem
K3s pod network cannot reach 10.88.140.1 (UDM Pro):
- **Host Network**: ✅ Works (nodes can reach UDM Pro)
- **Pod Network**: ❌ Fails (timeout after 10s)

### Possible Solutions

1. **Option A: hostNetwork for UniFi pods**
   ```yaml
   spec:
     hostNetwork: true
   ```

2. **Option B: Add CNI route to 10.88.140.1**
   - Configure Flannel/Calico to route 10.88.140.0/24 via node gateway

3. **Option C: Deploy UniFi Controller in K3s**
   - Run UniFi controller as a pod in the cluster
   - Full access from all pods
   - Requires migration of current UDM Pro controller

## Files Created

1. `/tmp/unifi-complete-setup.yaml` - UniFi external service and Traefik routing
2. `/tmp/unifi-syslog-receiver.yaml` - Syslog receiver deployment
3. `/tmp/query-unifi.py` - Python script to query UniFi API
4. `/tmp/wazuh-k3s-dashboard.json` - Wazuh dashboard configuration for K3s monitoring

## Next Steps

### Immediate Actions
1. ✅ Update UDM Pro syslog to point to `10.88.145.215:514`
2. ⏳ Create K3s dashboard in Wazuh
3. ⏳ Fix network connectivity for API-based monitoring

### Future Enhancements
1. Enable hostNetwork for UniFi MCP server and exporter
2. Integrate UniFi syslog data into Wazuh dashboards
3. Create custom Wazuh rules for UniFi events
4. Set up alerting for UniFi network anomalies

## Dashboard Access

- **Wazuh**: http://10.88.145.208 or http://wazuh.cortex.local
- **Grafana**: http://grafana.cortex.local
- **Prometheus**: http://prometheus.cortex.local
- **UniFi (Traefik)**: http://unifi.cortex.local (currently not working due to network issue)
- **UniFi (Direct)**: https://10.88.140.1:8443 (works from host/browser)

## Wazuh K3s Dashboard

The K3s security dashboard includes:
- **Cluster Status**: All 8 agents (7 nodes + manager)
- **Security Events**: 24-hour aggregation
- **Node Breakdown**:
  - Master Nodes: k3s-master01 (.190), k3s-master02 (.193), k3s-master03 (.196)
  - Worker Nodes: k3s-worker01 (.191), k3s-worker02 (.192), k3s-worker03 (.194), k3s-worker04 (.195)
- **Kubernetes Audit Events**: API activity monitoring
- **Alert Severity Distribution**: Low/Medium/High/Critical
- **UniFi Network Events**: Syslog integration
- **Pod Execution Monitoring**: Tracks pod exec/attach events

Dashboard JSON: `/tmp/wazuh-k3s-dashboard.json`
