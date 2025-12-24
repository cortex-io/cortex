# Wazuh Upgrade Procedures

**Last Updated:** December 22, 2025
**Status:** Production-tested upgrade path documented
**Applies To:** Wazuh SIEM deployments on K3s

---

## Critical Context for AI Agents

This document contains production-tested upgrade procedures for Wazuh SIEM. When asked about upgrading Wazuh or encountering "OpenSearch Security not initialized" errors:

1. **ALWAYS reference this document** - Do not attempt to reinvent upgrade procedures
2. **Follow the exact sequence** - Order matters (Manager → Indexer → Security Init → Dashboard)
3. **Never skip security plugin initialization** - This was the root cause of December 22 failure

---

## Version Compatibility Rules

**CRITICAL RULE:** Agent Version ≤ Manager Version

- ✅ Agents v4.7.0 + Manager v4.14.1 = Compatible
- ❌ Agents v4.14.1 + Manager v4.7.0 = INCOMPATIBLE
- ⚠️ Always upgrade Manager BEFORE upgrading agents

**Documented:** `/Users/ryandahlberg/Projects/cortex/docs/knowledge-base/wazuh-version-management.md`

---

## Wazuh v4.7.0 → v4.14.1 Upgrade

### Success Status
- ✅ **Tested:** December 22, 2025 in wazuh-test namespace
- ✅ **Root Cause:** OpenSearch security plugin initialization requirement identified
- ✅ **Solution:** Documented and automated in production script

### Why This Upgrade Failed on December 22

The initial upgrade attempt followed standard Kubernetes patterns (image update + rollout), but **did not include the required OpenSearch security plugin initialization step**. This resulted in:

1. Indexer pod running but API returning "OpenSearch Security not initialized"
2. `.opendistro_security` index missing
3. Dashboard unable to connect to indexer
4. Manager unable to send data to indexer

### The Fix: Security Plugin Initialization

After upgrading the indexer image, you MUST run:

```bash
POD=$(kubectl get pod -n wazuh-security -l app=wazuh-indexer -o jsonpath='{.items[0].metadata.name}')

kubectl exec -n wazuh-security ${POD} -- bash -c '
  export JAVA_HOME=/usr/share/wazuh-indexer/jdk && \
  cd /usr/share/wazuh-indexer/plugins/opensearch-security/tools && \
  ./securityadmin.sh \
    -cd /usr/share/wazuh-indexer/config/opensearch-security \
    -icl -nhnv \
    -cacert /usr/share/wazuh-indexer/config/certs/root-ca.pem \
    -cert /usr/share/wazuh-indexer/config/certs/admin.pem \
    -key /usr/share/wazuh-indexer/config/certs/admin-key.pem \
    -h localhost -p 9200
'
```

**Why This Works:**
- Certificates exist in v4.14.1 image at `/usr/share/wazuh-indexer/config/certs/`
- Security config files exist at `/usr/share/wazuh-indexer/config/opensearch-security/`
- `securityadmin.sh` creates `.opendistro_security` index with all required config types

**Success Output:**
```
Security Admin v7
Will connect to localhost:9200 ... done
Connected as "CN=admin,OU=Wazuh,O=Wazuh,L=California,C=US"
.opendistro_security index does not exists, attempt to create it ... done
[10 SUCC messages for config types]
Done with success
```

### Production Upgrade Procedure

**Automated Script:** `/tmp/upgrade-wazuh-production-to-4.14.1.sh`

**Manual Steps:**

1. **Backup Everything**
   ```bash
   kubectl get all,configmaps,secrets,pvc -n wazuh-security -o yaml > \
     /var/tmp/wazuh-backup-$(date +%Y%m%d-%H%M%S).yaml
   ```

2. **Upgrade Manager (FIRST)**
   ```bash
   kubectl set image statefulset/wazuh-manager \
     wazuh-manager=wazuh/wazuh-manager:4.14.1 -n wazuh-security
   kubectl rollout status statefulset/wazuh-manager -n wazuh-security
   ```

3. **Upgrade Indexer**
   ```bash
   kubectl set image deployment/wazuh-indexer \
     wazuh-indexer=wazuh/wazuh-indexer:4.14.1 -n wazuh-security
   kubectl rollout status deployment/wazuh-indexer -n wazuh-security
   sleep 30
   ```

4. **Initialize Security Plugin (CRITICAL)**
   ```bash
   # See "The Fix" section above for complete command
   ```

5. **Verify Security Plugin**
   ```bash
   kubectl exec -n wazuh-security ${POD} -- \
     curl -sk -u admin:admin https://localhost:9200/_cat/indices | \
     grep opendistro_security
   ```

6. **Upgrade Dashboard**
   ```bash
   kubectl set image deployment/wazuh-dashboard \
     wazuh-dashboard=wazuh/wazuh-dashboard:4.14.1 -n wazuh-security
   kubectl rollout status deployment/wazuh-dashboard -n wazuh-security
   ```

7. **Post-Upgrade Verification**
   ```bash
   kubectl get pods -n wazuh-security
   kubectl exec -n wazuh-security ${POD} -- \
     curl -sk -u admin:admin https://localhost:9200 | jq '.version'
   ```

### Time Estimates
- **Total:** 15-20 minutes
- Manager: 3-5 min
- Indexer: 5-7 min
- Security Init: 1-2 min
- Dashboard: 3-5 min
- Verification: 2-3 min

### Rollback Procedure

If upgrade fails, rollback in reverse order:

```bash
# Dashboard
kubectl set image deployment/wazuh-dashboard \
  wazuh-dashboard=wazuh/wazuh-dashboard:4.7.0 -n wazuh-security

# Indexer
kubectl set image deployment/wazuh-indexer \
  wazuh-indexer=wazuh/wazuh-indexer:4.7.0 -n wazuh-security

# Manager
kubectl set image statefulset/wazuh-manager \
  wazuh-manager=wazuh/wazuh-manager:4.7.0 -n wazuh-security

# Wait for all
kubectl rollout status deployment/wazuh-dashboard -n wazuh-security
kubectl rollout status deployment/wazuh-indexer -n wazuh-security
kubectl rollout status statefulset/wazuh-manager -n wazuh-security
```

**Rollback Time:** ~5 minutes

---

## Post-Upgrade: Enabling GitHub Dashboard

Once upgraded to v4.14.1+, configure the GitHub wodle:

### 1. Edit Manager Configuration

```bash
kubectl exec -n wazuh-security wazuh-manager-0 -- vi /var/ossec/etc/ossec.conf
```

### 2. Add GitHub Wodle

```xml
<wodle name="github">
  <enabled>yes</enabled>
  <interval>1h</interval>
  <time_delay>60s</time_delay>
  <curl_max_size>1M</curl_max_size>

  <api_auth>
    <org_name>ry-ops</org_name>
    <api_token>ghp_u7RQKcSk7uMFyK6a3xEM3CQ2wp2wpA15JwRU</api_token>
  </api_auth>
</wodle>
```

### 3. Restart Manager

```bash
kubectl exec -n wazuh-security wazuh-manager-0 -- \
  /var/ossec/bin/wazuh-control restart
```

### 4. Verify GitHub Dashboard

1. Access Wazuh dashboard: `https://<node-ip>:30443`
2. Click "GitHub" button in left sidebar
3. Should show GitHub security events

**If GitHub button still missing:** Check manager logs for wodle initialization errors.

---

## Common Errors and Solutions

### "OpenSearch Security not initialized"

**Cause:** Security plugin not initialized after indexer upgrade
**Solution:** Run security plugin initialization (see "The Fix" section)
**Prevention:** Always include this step in upgrade procedure

### "Not yet initialized (you may need to run securityadmin)"

**Cause:** Same as above
**Solution:** Same as above
**Log Location:** Indexer pod logs

### ".opendistro_security index does not exist"

**Cause:** Security plugin initialization never completed
**Solution:** Run securityadmin.sh command
**Verification:** Check indices with `_cat/indices` API

### Dashboard CrashLoopBackOff After Upgrade

**Cause:** Usually certificate or config issues
**Solution:** Check dashboard logs, may need config volume mount
**Note:** Separate issue from security plugin initialization

---

## Decision Tree for AI Agents

```
User asks about Wazuh upgrade?
├─ Yes → Check current version
│         ├─ v4.7.0 → v4.14.1? → Use THIS document
│         └─ Other versions? → Research specific path
└─ No → Check if related to OpenSearch security
          ├─ "OpenSearch Security not initialized"? → Run securityadmin.sh
          ├─ ".opendistro_security missing"? → Run securityadmin.sh
          └─ Other error? → Check logs

User wants GitHub dashboard?
├─ Current version ≥ v4.9.0? → Configure GitHub wodle
└─ Current version < v4.9.0? → Recommend upgrade OR use custom integration
```

---

## Reference Files

- **Test Results:** `/tmp/WAZUH-UPGRADE-SUCCESS.md`
- **Production Script:** `/tmp/upgrade-wazuh-production-to-4.14.1.sh`
- **Test Script:** `/tmp/wazuh-auto-test.sh`
- **Test Output:** `/tmp/wazuh-test-output.log`
- **Side-by-Side Test:** `/tmp/k3s-wazuh-side-by-side-test.sh`

---

## Testing History

| Date | Version Path | Result | Notes |
|------|-------------|--------|-------|
| 2025-12-22 | 4.7.0 → 4.14.1 | ❌ Failed | Security plugin not initialized |
| 2025-12-22 | 4.7.0 → 4.14.1 | ✅ Success | Added security init step, tested in wazuh-test namespace |

---

**Document Owner:** Cortex System (Larry, Daryl)
**Production Environment:** K3s cluster, wazuh-security namespace
**Test Environment:** K3s cluster, wazuh-test namespace
