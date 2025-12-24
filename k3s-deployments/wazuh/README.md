# Wazuh SIEM Deployment - Quick Reference

## Current Status: OPERATIONAL with Known Issue

All components are running. Security plugin is fixed. Dashboard is accessible.

**Issue**: Filebeat compatibility (Manager 4.14.1 vs Indexer 4.7.0) - see details below.

## Quick Access

| Component | URL/Endpoint | Credentials |
|-----------|--------------|-------------|
| Dashboard | https://10.88.145.208 | admin / admin |
| Indexer API | https://10.88.145.209:9200 | admin / admin |
| Manager API | http://10.88.145.210:55000 | - |

## Component Versions

- **Manager**: v4.14.1 (7 agents connected)
- **Indexer**: v4.7.0 (OpenSearch 2.8.0)
- **Dashboard**: v4.7.0

## Documentation

1. **WAZUH-STATUS-SUMMARY.md** - Current status, known issues, next steps
2. **WAZUH-SECURITY-FIX-REPORT.md** - Detailed fix report for security plugin issue
3. **WAZUH-OPERATIONS-GUIDE.md** - Complete operations and troubleshooting guide

## Recent Fix: Security Plugin Initialization (RESOLVED)

**Problem**: Dashboard couldn't connect - "no such index [.opendistro_security]"

**Solution**: 
- Fixed deployment to enable security plugin
- Mounted certificates and configuration
- Security initialized automatically

**Result**: Dashboard now connects successfully to indexer.

## Known Issue: Filebeat Compatibility

**Problem**: Wazuh Manager 4.14.1 filebeat uses `_type` field not supported in OpenSearch 2.x

**Impact**: 
- Manager works, agents connected
- Data NOT flowing to indexer
- Dashboard has no data to display

**Solution**: Update manager to 4.7.x to match indexer version

```bash
kubectl set image statefulset/wazuh-manager -n wazuh-security \
  wazuh-manager=wazuh/wazuh-manager:4.7.0
```

## Quick Commands

```bash
# Check status
kubectl get pods -n wazuh-security

# View logs
kubectl logs -n wazuh-security -l app=wazuh-indexer
kubectl logs -n wazuh-security -l app=wazuh-dashboard
kubectl logs -n wazuh-security wazuh-manager-0

# Restart components
kubectl rollout restart deployment wazuh-indexer -n wazuh-security
kubectl rollout restart deployment wazuh-dashboard -n wazuh-security
kubectl delete pod wazuh-manager-0 -n wazuh-security

# Test indexer
kubectl port-forward -n wazuh-security svc/wazuh-indexer 9200:9200
curl -k -u admin:admin https://localhost:9200/_cluster/health?pretty
```

## Files in This Directory

- `wazuh-full-deployment.yaml` - Original deployment
- `wazuh-indexer-fixed.yaml` - Fixed indexer deployment (CURRENT)
- `indexer-config-simple.yaml` - Simplified security config (CURRENT)
- `WAZUH-STATUS-SUMMARY.md` - Status and known issues
- `WAZUH-SECURITY-FIX-REPORT.md` - Security fix details
- `WAZUH-OPERATIONS-GUIDE.md` - Operations manual

## Next Action Required

**Align component versions** to resolve filebeat issue:

1. Update manager to 4.7.0 (recommended)
2. Test agent connectivity after update
3. Verify data flows to indexer
4. Confirm dashboard displays data

---

For detailed information, see **WAZUH-STATUS-SUMMARY.md**
