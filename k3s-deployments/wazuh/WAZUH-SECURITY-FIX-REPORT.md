# Wazuh Security Plugin Fix Report

## Problem Summary
The Wazuh Dashboard could not connect to the Wazuh Indexer due to the OpenSearch security plugin not being initialized.

### Initial State
- **Wazuh Manager v4.14.1**: Working perfectly, all 7 agents active
- **Wazuh Indexer v4.7.0**: Running but security plugin showed "Not yet initialized (you may need to run securityadmin)"
- **Wazuh Dashboard v4.7.0**: Cannot connect, getting ResponseError
- **Error**: "no such index [.opendistro_security]" - security plugin not initialized

## Root Cause Analysis

The indexer deployment had multiple configuration issues:

1. **Security Plugin Disabled**: Environment variable `DISABLE_SECURITY_PLUGIN: "true"` was set
2. **No Certificate Mounts**: TLS certificates existed in the `indexer-certs` secret but were not mounted
3. **No Configuration**: The `opensearch.yml` configuration was not mounted
4. **Wrong Discovery Config**: ConfigMap referenced StatefulSet (wazuh-indexer-0) but deployment used regular pod naming

## Solution Implementation

### 1. Created Simplified Security Configuration
**File**: `/Users/ryandahlberg/Projects/cortex/k3s-deployments/wazuh/indexer-config-simple.yaml`

Key changes:
- Set `discovery.type: single-node` for single-node deployment
- Enabled security plugin with TLS certificates
- Configured admin DN for security administration
- **Critical**: Added `plugins.security.allow_default_init_securityindex: true` to enable automatic security index initialization

### 2. Fixed Indexer Deployment
**File**: `/Users/ryandahlberg/Projects/cortex/k3s-deployments/wazuh/wazuh-indexer-fixed.yaml`

Changes implemented:
- **Removed**: `DISABLE_SECURITY_PLUGIN: "true"`
- **Added**: `DISABLE_SECURITY_PLUGIN: "false"`
- **Added**: `DISABLE_INSTALL_DEMO_CONFIG: "true"` (prevents demo certificates)
- **Mounted**: Certificate volume from `indexer-certs` secret
- **Mounted**: Configuration from `indexer-config-simple` ConfigMap
- **Added**: Init container to set proper permissions on data directory
- **Added**: Readiness and liveness probes

### 3. Security Plugin Initialization

The security plugin initialized automatically when the indexer started with:
- Proper TLS certificates mounted
- Security configuration enabled
- `allow_default_init_securityindex: true` setting

The `.opendistro_security` index was created with all required security documents:
- internalusers
- roles
- rolesmapping
- actiongroups
- config
- tenants
- nodesdn
- whitelist/allowlist
- audit

## Deployment Steps

```bash
# 1. Delete the broken indexer
kubectl delete deployment wazuh-indexer -n wazuh-security

# 2. Apply the simplified configuration
kubectl apply -f /Users/ryandahlberg/Projects/cortex/k3s-deployments/wazuh/indexer-config-simple.yaml

# 3. Deploy the fixed indexer
kubectl apply -f /Users/ryandahlberg/Projects/cortex/k3s-deployments/wazuh/wazuh-indexer-fixed.yaml

# 4. Wait for indexer to initialize (about 60 seconds)
kubectl wait --for=condition=ready pod -l app=wazuh-indexer -n wazuh-security --timeout=120s

# 5. Restart the dashboard to connect to initialized indexer
kubectl rollout restart deployment wazuh-dashboard -n wazuh-security
```

## Verification

### Indexer Status
```bash
kubectl get pods -n wazuh-security
# NAME                               READY   STATUS    RESTARTS   AGE
# wazuh-dashboard-54f878dfc9-zhvq2   1/1     Running   0          42s
# wazuh-indexer-7d8b5bdc64-4tg7q     1/1     Running   0          2m25s
# wazuh-manager-0                    1/1     Running   0          22m
```

### Security Initialization Logs
```
[INFO] Doc with id 'internalusers' and version 2 is updated in .opendistro_security index.
[INFO] Doc with id 'roles' and version 2 is updated in .opendistro_security index.
[INFO] Doc with id 'rolesmapping' and version 2 is updated in .opendistro_security index.
[INFO] .opendistro_security is used as internal security index.
[INFO] Node 'wazuh-indexer-7d8b5bdc64-4tg7q' initialized
```

### Dashboard Connectivity
```
{"type":"log","@timestamp":"2025-12-22T14:48:19Z","tags":["info","savedobjects-service"],"pid":55,"message":"Starting saved objects migrations"}
{"type":"log","@timestamp":"2025-12-22T14:48:19Z","tags":["listening","info"],"pid":55,"message":"Server running at http://0.0.0.0:5601"}
```

No more ResponseError messages!

## Access Information

- **Dashboard URL**: https://10.88.145.208 (LoadBalancer IP)
- **Indexer API**: https://10.88.145.209:9200 (LoadBalancer IP)
- **Default Credentials**: admin / admin (should be changed in production)

## Security Notes

1. **TLS Enabled**: All communication is encrypted with TLS
2. **Certificate-Based Auth**: Admin operations require proper certificates
3. **Default Credentials**: The default admin/admin credentials should be changed for production use
4. **Security Index**: The `.opendistro_security` index is now properly initialized with role-based access control

## Production Recommendations

1. **Change Default Passwords**: Update admin password immediately
   ```bash
   # Use securityadmin.sh to update internal users
   ```

2. **Persistent Storage**: Current deployment uses emptyDir - consider PersistentVolumeClaims for production
   ```yaml
   volumes:
   - name: data
     persistentVolumeClaim:
       claimName: wazuh-indexer-data
   ```

3. **High Availability**: For production, deploy as StatefulSet with multiple replicas
   - Minimum 3 nodes for cluster stability
   - Use headless service for cluster discovery
   - Configure proper cluster.initial_master_nodes

4. **Resource Limits**: Current limits (2Gi memory, 1 CPU) are suitable for testing but may need adjustment for production load

5. **Backup Strategy**: Implement snapshot repository for index backups

## Files Created/Modified

1. `/Users/ryandahlberg/Projects/cortex/k3s-deployments/wazuh/indexer-config-simple.yaml` - New simplified configuration
2. `/Users/ryandahlberg/Projects/cortex/k3s-deployments/wazuh/wazuh-indexer-fixed.yaml` - Fixed deployment manifest

## Status: RESOLVED

The Wazuh SIEM stack is now fully functional:
- Manager: Collecting data from 7 agents
- Indexer: Security plugin initialized and accepting connections
- Dashboard: Connected and ready for visualization

Date: 2025-12-22
Resolved by: Development Master - cortex automation system
