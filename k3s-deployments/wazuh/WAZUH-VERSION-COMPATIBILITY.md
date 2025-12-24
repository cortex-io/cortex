# Wazuh Version Compatibility - CRITICAL RULE

**Date:** December 22, 2025
**Status:** MANDATORY REQUIREMENT

---

## THE GOLDEN RULE

**THE WAZUH MANAGER VERSION ALWAYS DICTATES THE WAZUH AGENT VERSION.**

Agents MUST be the same version as, or older than, the manager. Agents cannot be newer than the manager.

---

## Version Compatibility Matrix

| Manager Version | Compatible Agent Versions | Status |
|----------------|---------------------------|---------|
| 4.7.0 | 4.7.0, 4.6.x, 4.5.x | ✅ Compatible |
| 4.7.0 | 4.8.x, 4.9.x, 4.14.x | ❌ NOT Compatible |
| 4.14.1 | 4.14.1, 4.14.0, 4.13.x, 4.12.x | ✅ Compatible |
| 4.14.1 | 4.15.x, 5.0.x | ❌ NOT Compatible |

**Rule:** `Agent Version <= Manager Version`

---

## Current Production Configuration

**All components must be the same version:**

- **Wazuh Manager:** v4.7.0
- **Wazuh Indexer:** v4.7.0
- **Wazuh Dashboard:** v4.7.0
- **All Agents:** v4.7.0

**Location:** wazuh-security namespace

---

## Why This Matters

### What Happens with Version Mismatch

1. **Newer agent + Older manager:**
   - Agent: v4.14.1
   - Manager: v4.7.0
   - **Result:** ❌ Agent will NOT connect
   - **Error:** "Agent version must be lower or equal to manager version"

2. **Older agent + Newer manager:**
   - Agent: v4.7.0
   - Manager: v4.14.1
   - **Result:** ✅ Agent WILL connect (but may lose new features)

3. **Matching versions:**
   - Agent: v4.7.0
   - Manager: v4.7.0
   - **Result:** ✅ Perfect compatibility

---

## Upgrade Process (ALWAYS FOLLOW THIS ORDER)

### Step 1: Upgrade Manager First
```bash
kubectl set image statefulset/wazuh-manager wazuh-manager=wazuh/wazuh-manager:4.X.X -n wazuh-security
kubectl rollout status statefulset/wazuh-manager -n wazuh-security
```

### Step 2: Upgrade Indexer (Same Version as Manager)
```bash
kubectl set image deployment/wazuh-indexer wazuh-indexer=wazuh/wazuh-indexer:4.X.X -n wazuh-security
kubectl rollout status deployment/wazuh-indexer -n wazuh-security
```

### Step 3: Upgrade Dashboard (Same Version as Manager)
```bash
kubectl set image deployment/wazuh-dashboard wazuh-dashboard=wazuh/wazuh-dashboard:4.X.X -n wazuh-security
kubectl rollout status deployment/wazuh-dashboard -n wazuh-security
```

### Step 4: Upgrade ALL Agents (Match Manager Version)
```bash
# Get manager version first
MANAGER_VERSION=$(kubectl exec -n wazuh-security wazuh-manager-0 -- /var/ossec/bin/wazuh-control info -v | tr -d 'v')

# Upgrade each agent
for node in k3s-master01:10.88.145.190 k3s-master02:10.88.145.193 k3s-worker01:10.88.145.191 k3s-worker02:10.88.145.192 k3s-worker03:10.88.145.194 k3s-worker04:10.88.145.195; do
  node_name="${node%%:*}"
  node_ip="${node##*:}"
  echo "Upgrading ${node_name} to v${MANAGER_VERSION}..."
  sshpass -p root ssh -o StrictHostKeyChecking=no k3s@${node_ip} \
    "sudo DEBIAN_FRONTEND=noninteractive apt-get install -y wazuh-agent=${MANAGER_VERSION}-1 && \
     sudo systemctl restart wazuh-agent"
done
```

### Step 5: Verify All Agents Connected
```bash
kubectl exec -n wazuh-security wazuh-manager-0 -- /var/ossec/bin/agent_control -l
# Should show all 7 agents as "Active"
```

---

## Downgrade Process (IF NEEDED)

**NEVER upgrade agents first. If you accidentally did:**

### Step 1: Check Version Mismatch
```bash
# Manager version
kubectl exec -n wazuh-security wazuh-manager-0 -- /var/ossec/bin/wazuh-control info -v

# Agent version (on any node)
ssh k3s@10.88.145.190 "sudo /var/ossec/bin/wazuh-control info -v"
```

### Step 2: Downgrade ALL Components to Match

**Option A: Downgrade everything to older version (safer):**
```bash
# Use the lower version across all components
TARGET_VERSION="4.7.0"

# Downgrade manager
kubectl set image statefulset/wazuh-manager wazuh-manager=wazuh/wazuh-manager:${TARGET_VERSION} -n wazuh-security

# Downgrade indexer
kubectl set image deployment/wazuh-indexer wazuh-indexer=wazuh/wazuh-indexer:${TARGET_VERSION} -n wazuh-security

# Downgrade dashboard
kubectl set image deployment/wazuh-dashboard wazuh-dashboard=wazuh/wazuh-dashboard:${TARGET_VERSION} -n wazuh-security

# Remove and reinstall agents at correct version
for node in k3s-master01:10.88.145.190 k3s-master02:10.88.145.193 k3s-worker01:10.88.145.191 k3s-worker02:10.88.145.192 k3s-worker03:10.88.145.194 k3s-worker04:10.88.145.195; do
  node_name="${node%%:*}"
  node_ip="${node##*:}"
  sshpass -p root ssh -o StrictHostKeyChecking=no k3s@${node_ip} \
    "sudo rm -f /var/lib/dpkg/info/wazuh-agent.* && \
     sudo DEBIAN_FRONTEND=noninteractive dpkg --purge --force-all wazuh-agent 2>/dev/null || true && \
     sudo WAZUH_MANAGER='10.88.145.196' DEBIAN_FRONTEND=noninteractive apt-get install -y wazuh-agent=${TARGET_VERSION}-1 && \
     sudo systemctl daemon-reload && \
     sudo systemctl enable wazuh-agent && \
     sudo systemctl start wazuh-agent"
done
```

**Option B: Upgrade manager to match agents (riskier):**
- Only if you want the newer version
- Requires upgrading indexer and dashboard too
- May have indexing compatibility issues

---

## Quick Reference Commands

### Check All Versions
```bash
echo "=== Wazuh Versions ===" && \
echo "Manager: $(kubectl exec -n wazuh-security wazuh-manager-0 -- /var/ossec/bin/wazuh-control info -v 2>/dev/null)" && \
echo "Indexer: $(kubectl get deployment wazuh-indexer -n wazuh-security -o jsonpath='{.spec.template.spec.containers[0].image}')" && \
echo "Dashboard: $(kubectl get deployment wazuh-dashboard -n wazuh-security -o jsonpath='{.spec.template.spec.containers[0].image}')" && \
echo "" && \
echo "Agent (k3s-master01): $(sshpass -p root ssh -o StrictHostKeyChecking=no k3s@10.88.145.190 'sudo /var/ossec/bin/wazuh-control info -v 2>/dev/null')"
```

### Verify Agent Connectivity
```bash
kubectl exec -n wazuh-security wazuh-manager-0 -- /var/ossec/bin/agent_control -l | grep -E "(ID:|Active|Never|Disconnected)"
```

### Check for Version Errors in Agent Logs
```bash
# On any agent node
sudo tail -100 /var/ossec/logs/ossec.log | grep -i "version"
```

---

## Lessons Learned (December 22, 2025)

### Incident: Version Mismatch After Upgrade Attempt

**What Happened:**
1. Upgraded Wazuh Manager from v4.7.0 → v4.14.1
2. Upgraded all agents from v4.7.0 → v4.14.1
3. Agents connected successfully
4. Later upgraded Indexer/Dashboard to v4.14.1
5. Indexer failed to initialize (security plugin issue)
6. Downgraded Indexer/Dashboard back to v4.7.0
7. Downgraded Manager back to v4.7.0
8. **Agents (v4.14.1) could not connect to Manager (v4.7.0)**

**Error Message:**
```
wazuh-agentd: ERROR: Agent version must be lower or equal to manager version (from manager)
wazuh-agentd: ERROR: Unable to add agent (from manager)
```

**Resolution:**
- Removed all v4.14.1 agents
- Reinstalled v4.7.0 agents
- All agents reconnected successfully

**Time to Fix:** 20 minutes (agent reinstallation on 6 nodes)

**Key Takeaway:** ALWAYS keep all components at the same version. Upgrading is risky. Only upgrade if there's a critical security patch or required feature.

---

## Pre-Flight Checklist (Before ANY Version Change)

- [ ] Document current versions of all components
- [ ] Backup agent configurations
- [ ] Test on 1 non-production agent first
- [ ] Verify manager version
- [ ] Plan rollback procedure
- [ ] Have 30-60 minutes for full deployment
- [ ] Ensure all nodes are accessible via SSH

---

## Troubleshooting

### Agents Not Connecting After Version Change

**Symptoms:**
- `agent_control -l` shows no agents (or disconnected)
- Agent logs show "version must be lower or equal to manager"

**Solution:**
1. Check manager version: `kubectl exec -n wazuh-security wazuh-manager-0 -- /var/ossec/bin/wazuh-control info -v`
2. Check agent version on any node: `ssh k3s@10.88.145.190 "sudo /var/ossec/bin/wazuh-control info -v"`
3. If agent > manager: Downgrade agents to manager version (see above)
4. If manager > agent: Upgrade agents to manager version (see above)

### Dashboard Not Working After Version Change

**Symptoms:**
- Dashboard shows errors or can't connect to indexer
- Indexer logs show "Not yet initialized (you may need to run securityadmin)"

**Solution:**
- Likely an indexer security plugin issue
- See `/Users/ryandahlberg/Projects/cortex/k3s-deployments/wazuh/WAZUH-STATUS-SUMMARY.md`
- May need to reinitialize security plugin or stick with v4.7.0

---

## Current Production State

**Last Updated:** December 22, 2025
**Current Versions:** All v4.7.0
**Status:** ✅ All components operational
**Agents:** 7/7 Active

**DO NOT UPGRADE** unless there's a specific requirement. The current setup is stable and working.

---

## Contact / References

- **Documentation:** `/Users/ryandahlberg/Projects/cortex/k3s-deployments/wazuh/`
- **Version Compatibility:** https://documentation.wazuh.com/current/installation-guide/wazuh-agent/compatibility.html
- **Upgrade Guide:** https://documentation.wazuh.com/current/upgrade-guide/

---

**Remember: THE MANAGER VERSION ALWAYS DICTATES THE AGENT VERSION!**
