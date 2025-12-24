# Wazuh Operations Guide

## Quick Status Check

```bash
# Check all Wazuh pods
kubectl get pods -n wazuh-security -o wide

# Check all services and external IPs
kubectl get svc -n wazuh-security

# View recent logs
kubectl logs -n wazuh-security -l app=wazuh-indexer --tail=50
kubectl logs -n wazuh-security -l app=wazuh-dashboard --tail=50
kubectl logs -n wazuh-security wazuh-manager-0 --tail=50
```

## Component Access

### Dashboard
- **URL**: https://10.88.145.208
- **Credentials**: admin / admin
- **Ports**: 443 (HTTPS), 80 (HTTP redirect)

### Indexer API
- **URL**: https://10.88.145.209:9200
- **Credentials**: admin / admin
- **Port**: 9200 (HTTPS)

### Manager
- **API URL**: http://10.88.145.210:55000
- **Agent Connection**: tcp/1514, tcp/1515
- **Credentials**: See manager configuration

## Common Operations

### Restart Components

```bash
# Restart dashboard
kubectl rollout restart deployment wazuh-dashboard -n wazuh-security

# Restart indexer
kubectl rollout restart deployment wazuh-indexer -n wazuh-security

# Restart manager (StatefulSet)
kubectl rollout restart statefulset wazuh-manager -n wazuh-security
```

### Scale Components

```bash
# Scale dashboard (can have multiple replicas)
kubectl scale deployment wazuh-dashboard -n wazuh-security --replicas=2

# Note: Indexer is currently single-node. For HA, convert to StatefulSet
```

### View Logs

```bash
# Stream logs in real-time
kubectl logs -f -n wazuh-security wazuh-dashboard-<pod-id>
kubectl logs -f -n wazuh-security wazuh-indexer-<pod-id>
kubectl logs -f -n wazuh-security wazuh-manager-0

# Get last 100 lines
kubectl logs -n wazuh-security --tail=100 <pod-name>

# Export logs to file
kubectl logs -n wazuh-security wazuh-indexer-<pod-id> > indexer-logs.txt
```

### Check Security Plugin Status

```bash
# Get indexer pod name
POD=$(kubectl get pod -n wazuh-security -l app=wazuh-indexer -o jsonpath='{.items[0].metadata.name}')

# Check for security initialization messages
kubectl logs -n wazuh-security $POD | grep -i "security\|initialized"

# Check for errors
kubectl logs -n wazuh-security $POD | grep -i "error\|not yet"
```

### Verify Indexer Indices

```bash
# Port-forward to access API locally
kubectl port-forward -n wazuh-security svc/wazuh-indexer 9200:9200

# In another terminal, query indices (requires curl with SSL)
curl -k -u admin:admin https://localhost:9200/_cat/indices?v

# Check security index
curl -k -u admin:admin https://localhost:9200/.opendistro_security/_search?pretty
```

### Agent Management

```bash
# List connected agents
kubectl exec -n wazuh-security wazuh-manager-0 -- /var/ossec/bin/agent_control -l

# Get agent status
kubectl exec -n wazuh-security wazuh-manager-0 -- /var/ossec/bin/agent_control -i <agent-id>

# Restart agents remotely (if enabled)
kubectl exec -n wazuh-security wazuh-manager-0 -- /var/ossec/bin/agent_control -R -a
```

## Troubleshooting

### Dashboard Cannot Connect to Indexer

**Symptoms**: ResponseError in dashboard logs

**Solution**:
1. Check indexer is running and ready
2. Verify security plugin is initialized (no "Not yet initialized" errors)
3. Check dashboard configuration points to correct indexer service
4. Restart dashboard after indexer initialization

```bash
# Check indexer status
kubectl get pods -n wazuh-security -l app=wazuh-indexer

# Verify no security errors
kubectl logs -n wazuh-security -l app=wazuh-indexer | grep -i "not yet initialized"

# Restart dashboard
kubectl rollout restart deployment wazuh-dashboard -n wazuh-security
```

### Indexer Pod Not Ready

**Symptoms**: Pod shows 0/1 READY

**Checks**:
1. View pod events
2. Check logs for errors
3. Verify certificates are mounted
4. Check resource limits

```bash
# Describe pod to see events
kubectl describe pod -n wazuh-security -l app=wazuh-indexer

# Check logs
kubectl logs -n wazuh-security -l app=wazuh-indexer

# Verify certificate mount
kubectl exec -n wazuh-security <indexer-pod> -- ls -la /usr/share/wazuh-indexer/certs/
```

### Security Plugin Not Initialized

**Symptoms**: "no such index [.opendistro_security]" errors

**Solution**:
1. Verify `DISABLE_SECURITY_PLUGIN` is set to "false"
2. Check certificates are properly mounted
3. Ensure opensearch.yml has `allow_default_init_securityindex: true`
4. Delete and recreate indexer pod

```bash
# Check environment variables
kubectl get pod -n wazuh-security -l app=wazuh-indexer -o yaml | grep -A 5 "env:"

# Delete pod to force recreation
kubectl delete pod -n wazuh-security -l app=wazuh-indexer
```

### Manager Not Receiving Agent Data

**Checks**:
1. Verify agent registration
2. Check agent connectivity
3. Review manager logs
4. Verify filebeat is sending to indexer

```bash
# Check manager logs
kubectl logs -n wazuh-security wazuh-manager-0

# List agents
kubectl exec -n wazuh-security wazuh-manager-0 -- /var/ossec/bin/agent_control -l

# Check filebeat logs (if separate pod)
kubectl logs -n wazuh-security -l app=filebeat
```

## Maintenance Tasks

### Update Wazuh Version

```bash
# Update image version in deployment
kubectl set image deployment/wazuh-indexer -n wazuh-security \
  wazuh-indexer=wazuh/wazuh-indexer:4.8.0

kubectl set image deployment/wazuh-dashboard -n wazuh-security \
  wazuh-dashboard=wazuh/wazuh-dashboard:4.8.0

kubectl set image statefulset/wazuh-manager -n wazuh-security \
  wazuh-manager=wazuh/wazuh-manager:4.8.0
```

### Backup Configuration

```bash
# Export all Wazuh resources
kubectl get all,configmap,secret -n wazuh-security -o yaml > wazuh-backup.yaml

# Backup specific configs
kubectl get configmap -n wazuh-security -o yaml > wazuh-configmaps.yaml
kubectl get secret -n wazuh-security -o yaml > wazuh-secrets.yaml
```

### Change Admin Password

The default credentials (admin/admin) should be changed for production.

```bash
# Access indexer pod
kubectl exec -it -n wazuh-security <indexer-pod> -- bash

# Inside pod, use hash_password tool
cd /usr/share/wazuh-indexer/plugins/opensearch-security/tools
./hash_password.sh
# Enter your new password when prompted
# Copy the hash

# Update internal_users.yml with new hash
# Then run securityadmin.sh to apply changes
```

## Performance Monitoring

### Check Resource Usage

```bash
# CPU and memory usage
kubectl top pods -n wazuh-security

# Detailed resource info
kubectl describe pod -n wazuh-security <pod-name> | grep -A 5 "Limits\|Requests"
```

### Check Indexer Health

```bash
# Port-forward to indexer
kubectl port-forward -n wazuh-security svc/wazuh-indexer 9200:9200

# Check cluster health
curl -k -u admin:admin https://localhost:9200/_cluster/health?pretty

# Check node stats
curl -k -u admin:admin https://localhost:9200/_nodes/stats?pretty

# Check index stats
curl -k -u admin:admin https://localhost:9200/_stats?pretty
```

## Configuration Files

### Key Files Location

- **Deployments**: `/Users/ryandahlberg/Projects/cortex/k3s-deployments/wazuh/`
  - `wazuh-full-deployment.yaml` - Original full deployment
  - `wazuh-indexer-fixed.yaml` - Fixed indexer deployment
  - `indexer-config-simple.yaml` - Simplified security config

- **In Cluster**:
  - ConfigMaps: `kubectl get cm -n wazuh-security`
  - Secrets: `kubectl get secrets -n wazuh-security`

### Updating Configuration

```bash
# Edit ConfigMap
kubectl edit configmap indexer-config-simple -n wazuh-security

# After editing, restart component to apply
kubectl rollout restart deployment wazuh-indexer -n wazuh-security
```

## Integration Points

### Filebeat to Indexer
- Filebeat collects logs from manager
- Sends to indexer on port 9200 (HTTPS)
- Uses certificate-based authentication

### Dashboard to Indexer
- Dashboard queries indexer for data
- Uses admin credentials (should use dedicated dashboard user in production)
- Communicates over HTTPS

### Agents to Manager
- Agents connect to port 1514 (events) and 1515 (enrollment)
- Manager aggregates and stores in /var/ossec/logs
- Filebeat picks up logs and forwards to indexer

## Security Best Practices

1. **Change Default Passwords**: Update admin credentials immediately
2. **Use RBAC**: Create dedicated users with minimal permissions
3. **Certificate Management**: Rotate certificates periodically
4. **Network Policies**: Implement Kubernetes NetworkPolicies to restrict pod communication
5. **Audit Logging**: Enable audit logging in security plugin
6. **Resource Limits**: Set appropriate resource limits to prevent resource exhaustion

## Support and Documentation

- **Wazuh Documentation**: https://documentation.wazuh.com/
- **OpenSearch Security**: https://opensearch.org/docs/latest/security/
- **Issue Tracker**: Internal Cortex issue tracker
- **Fix Report**: `/Users/ryandahlberg/Projects/cortex/k3s-deployments/wazuh/WAZUH-SECURITY-FIX-REPORT.md`
