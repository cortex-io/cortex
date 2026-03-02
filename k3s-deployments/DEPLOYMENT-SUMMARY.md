# Larry & the Darryl's - UniFi Integration Deployment

## ✅ Completed Successfully

### 1. UniFi Syslog Receiver
- **IP**: 10.88.145.215:514 (UDP/TCP)
- **Status**: ✅ Running and receiving logs
- **Deployment**: `unifi-syslog-receiver` in `default` namespace
- **Logs Received From**:
  - UDM Pro (Dream Machine Pro)
  - U6-Plus access point
  - U7-Pro access point
  - All UniFi network devices

### 2. Wazuh Integration
- **Manager**: Configured to receive syslog on UDP port 514
- **Service Updated**: Added port 514/UDP to wazuh-manager service
- **K3s Agents**: All 8 agents active and reporting
  - Master nodes: .190, .193, .196
  - Worker nodes: .191, .192, .194, .195
  - Manager host: .194 (k3s-worker03)

### 3. Traefik Routes
- **UniFi Controller**: `http://unifi.cortex.local` → 10.88.140.1:8443
- **Wazuh Dashboard**: `http://wazuh.cortex.local` → Dashboard
- **Grafana**: `http://grafana.cortex.local`
- **Prometheus**: `http://prometheus.cortex.local`
- **Redis**: `http://redis.cortex.local`

## Configuration Files

All configuration files saved to `/tmp/`:
- `unifi-complete-setup.yaml` - UniFi external service
- `unifi-syslog-receiver.yaml` - Syslog receiver deployment
- `wazuh-k3s-dashboard.json` - K3s security dashboard
- `query-unifi.py` - UniFi API query script
- `UNIFI-WAZUH-SETUP-SUMMARY.md` - Technical details

## UDM Pro Configuration

**Syslog Server Updated To**: `10.88.145.215:514`

## Current Status

### Working
✅ UniFi syslog collection (all devices reporting)
✅ Wazuh K3s agent monitoring (8 agents)
✅ Kubernetes audit logging (master nodes)
✅ Traefik ingress routing
✅ Syslog forwarding to Wazuh

### Known Limitations
⚠️ UniFi API access from pods (network isolation - pods cannot reach 10.88.140.1)
  - UDM Pro is accessible from nodes but not pod network
  - Workaround: Using syslog push instead of API pull

## Next Steps

1. Import K3s dashboard into Wazuh web interface
2. Create custom Wazuh rules for UniFi network events
3. Set up alerting for security anomalies
4. Consider deploying UniFi controller in K3s for full API access

## Dashboard Access

- Wazuh: http://10.88.145.208 or http://wazuh.cortex.local
- Credentials: admin / (check wazuh-password secret)

## Files for GitHub

Ready to commit:
- All Traefik IngressRoute configurations
- UniFi syslog receiver deployment
- Wazuh K3s dashboard JSON
- Integration documentation
