# Wazuh Version Management Knowledge Base

**For:** Cortex AI Agents (Larry, Daryl, and all workers)
**Category:** Security Infrastructure / Wazuh SIEM
**Priority:** CRITICAL
**Last Updated:** 2025-12-22

---

## CRITICAL RULE: Version Compatibility

**THE WAZUH MANAGER VERSION ALWAYS DICTATES THE WAZUH AGENT VERSION.**

### Rule
```
Agent Version <= Manager Version
```

### Examples
- Manager v4.7.0 + Agent v4.14.1 = ❌ WILL NOT WORK
- Manager v4.14.1 + Agent v4.7.0 = ✅ WILL WORK
- Manager v4.7.0 + Agent v4.7.0 = ✅ PERFECT

---

## Current Production Configuration

**Location:** `wazuh-security` namespace in K3s cluster

**All components MUST be same version:**
- Manager: v4.7.0
- Indexer: v4.7.0
- Dashboard: v4.7.0
- All Agents (7 total): v4.7.0

**Agent Locations:**
- k3s-master01 (10.88.145.190)
- k3s-master02 (10.88.145.193)
- k3s-master03 (10.88.145.196) - Also runs manager
- k3s-worker01 (10.88.145.191)
- k3s-worker02 (10.88.145.192)
- k3s-worker03 (10.88.145.194)
- k3s-worker04 (10.88.145.195)

---

## When User Requests Wazuh Upgrade

### BEFORE Upgrading - Verification Steps

1. **Check current versions:**
```bash
kubectl exec -n wazuh-security wazuh-manager-0 -- /var/ossec/bin/wazuh-control info -v
```

2. **Document current state:**
```bash
kubectl exec -n wazuh-security wazuh-manager-0 -- /var/ossec/bin/agent_control -l
```

3. **Create backup of configurations:**
```bash
kubectl get configmap -n wazuh-security -o yaml > /tmp/wazuh-backup-$(date +%Y%m%d).yaml
```

### Upgrade Order (STRICTLY FOLLOW THIS)

**Order matters! Always upgrade in this sequence:**

1. **Manager** (StatefulSet)
2. **Indexer** (Deployment)
3. **Dashboard** (Deployment)
4. **All Agents** (on each node)

### Upgrade Commands

```bash
# Step 1: Upgrade Manager
kubectl set image statefulset/wazuh-manager \
  wazuh-manager=wazuh/wazuh-manager:NEW_VERSION \
  -n wazuh-security

kubectl rollout status statefulset/wazuh-manager -n wazuh-security --timeout=120s

# Step 2: Upgrade Indexer
kubectl set image deployment/wazuh-indexer \
  wazuh-indexer=wazuh/wazuh-indexer:NEW_VERSION \
  -n wazuh-security

kubectl rollout status deployment/wazuh-indexer -n wazuh-security --timeout=120s

# Step 3: Upgrade Dashboard
kubectl set image deployment/wazuh-dashboard \
  wazuh-dashboard=wazuh/wazuh-dashboard:NEW_VERSION \
  -n wazuh-security

kubectl rollout status deployment/wazuh-dashboard -n wazuh-security --timeout=120s

# Step 4: Get manager version for agents
MANAGER_VERSION=$(kubectl exec -n wazuh-security wazuh-manager-0 -- \
  /var/ossec/bin/wazuh-control info -v | tr -d 'v')

# Step 5: Upgrade ALL agents
for node in k3s-master01:10.88.145.190 k3s-master02:10.88.145.193 k3s-worker01:10.88.145.191 k3s-worker02:10.88.145.192 k3s-worker03:10.88.145.194 k3s-worker04:10.88.145.195; do
  node_name="${node%%:*}"
  node_ip="${node##*:}"
  sshpass -p root ssh -o StrictHostKeyChecking=no k3s@${node_ip} \
    "sudo DEBIAN_FRONTEND=noninteractive apt-get install -y wazuh-agent=${MANAGER_VERSION}-1 && \
     sudo systemctl restart wazuh-agent"
done

# Step 6: Verify all agents reconnected
kubectl exec -n wazuh-security wazuh-manager-0 -- /var/ossec/bin/agent_control -l
```

### Post-Upgrade Verification

```bash
# Check all agents are Active
kubectl exec -n wazuh-security wazuh-manager-0 -- /var/ossec/bin/agent_control -l | grep "Active"

# Should see 7 Active agents (excluding ID 000 which is the manager itself)
```

---

## When Agents Won't Connect

### Diagnosis

```bash
# Check manager version
kubectl exec -n wazuh-security wazuh-manager-0 -- /var/ossec/bin/wazuh-control info -v

# Check agent version on one node
sshpass -p root ssh -o StrictHostKeyChecking=no k3s@10.88.145.190 \
  "sudo /var/ossec/bin/wazuh-control info -v"

# Check agent logs for errors
sshpass -p root ssh -o StrictHostKeyChecking=no k3s@10.88.145.190 \
  "sudo tail -50 /var/ossec/logs/ossec.log | grep -i error"
```

### Common Error Pattern

```
wazuh-agentd: ERROR: Agent version must be lower or equal to manager version (from manager)
wazuh-agentd: ERROR: Unable to add agent (from manager)
```

**This means:** Agent version > Manager version

### Fix: Downgrade/Reinstall Agents

```bash
# Get correct version from manager
MANAGER_VERSION=$(kubectl exec -n wazuh-security wazuh-manager-0 -- \
  /var/ossec/bin/wazuh-control info -v | tr -d 'v')

# Reinstall agents at correct version
for node in k3s-master01:10.88.145.190 k3s-master02:10.88.145.193 k3s-worker01:10.88.145.191 k3s-worker02:10.88.145.192 k3s-worker03:10.88.145.194 k3s-worker04:10.88.145.195; do
  node_name="${node%%:*}"
  node_ip="${node##*:}"
  echo "Fixing ${node_name}..."

  # Remove dpkg locks and force remove old agent
  sshpass -p root ssh -o StrictHostKeyChecking=no k3s@${node_ip} \
    "sudo rm -f /var/lib/dpkg/info/wazuh-agent.* && \
     sudo DEBIAN_FRONTEND=noninteractive dpkg --purge --force-all wazuh-agent 2>/dev/null || true"

  # Install correct version
  sshpass -p root ssh -o StrictHostKeyChecking=no k3s@${node_ip} \
    "sudo WAZUH_MANAGER='10.88.145.196' DEBIAN_FRONTEND=noninteractive apt-get install -y wazuh-agent=${MANAGER_VERSION}-1 && \
     sudo systemctl daemon-reload && \
     sudo systemctl enable wazuh-agent && \
     sudo systemctl start wazuh-agent"

  echo "✓ ${node_name} fixed"
done

# Wait for agents to reconnect
sleep 15

# Verify
kubectl exec -n wazuh-security wazuh-manager-0 -- /var/ossec/bin/agent_control -l
```

---

## Rollback Procedure

If upgrade fails or causes issues:

### Rollback All Components to Previous Version

```bash
# Use the version that was working (usually 4.7.0)
ROLLBACK_VERSION="4.7.0"

# Rollback manager
kubectl set image statefulset/wazuh-manager \
  wazuh-manager=wazuh/wazuh-manager:${ROLLBACK_VERSION} \
  -n wazuh-security

# Rollback indexer
kubectl set image deployment/wazuh-indexer \
  wazuh-indexer=wazuh/wazuh-indexer:${ROLLBACK_VERSION} \
  -n wazuh-security

# Rollback dashboard
kubectl set image deployment/wazuh-dashboard \
  wazuh-dashboard=wazuh/wazuh-dashboard:${ROLLBACK_VERSION} \
  -n wazuh-security

# Reinstall agents at rollback version (use fix script above with MANAGER_VERSION=ROLLBACK_VERSION)
```

---

## Known Issues

### Indexer Security Plugin Initialization (v4.14.x)

**Issue:** When upgrading to v4.14.x, indexer may fail with:
```
Not yet initialized (you may need to run securityadmin)
```

**Workaround:** Stick with v4.7.0 unless there's a critical security patch.

**If you must use v4.14.x:** See `/Users/ryandahlberg/Projects/cortex/k3s-deployments/wazuh/WAZUH-STATUS-SUMMARY.md` for security plugin initialization procedure.

---

## Decision Tree for Cortex Agents

```
User requests Wazuh upgrade?
│
├─ Check current version
│  └─ Is it v4.7.0?
│     ├─ Yes → Ask user: "Current version is stable. Upgrade needed for security patch or new feature?"
│     │        ├─ Security patch → Proceed with upgrade
│     │        └─ New feature → Warn about risks, ask for confirmation
│     └─ No → Document current version, proceed if confirmed
│
├─ Upgrade process
│  ├─ Manager first
│  ├─ Indexer second
│  ├─ Dashboard third
│  └─ All agents last (MUST match manager version)
│
└─ Verification
   ├─ All pods running?
   ├─ All 7 agents Active?
   └─ Dashboard accessible?
      ├─ Yes → Success
      └─ No → Execute rollback procedure
```

---

## Quick Reference Commands for Agents

### Check Current State
```bash
kubectl get pods -n wazuh-security && \
kubectl exec -n wazuh-security wazuh-manager-0 -- /var/ossec/bin/agent_control -l
```

### Check Versions
```bash
echo "Manager: $(kubectl exec -n wazuh-security wazuh-manager-0 -- /var/ossec/bin/wazuh-control info -v)" && \
echo "Agent Sample: $(sshpass -p root ssh -o StrictHostKeyChecking=no k3s@10.88.145.190 'sudo /var/ossec/bin/wazuh-control info -v')"
```

### Emergency Fix (Agents Not Connecting)
```bash
# Use the agent reinstallation script from "When Agents Won't Connect" section above
```

---

## Historical Context (For Learning)

### December 22, 2025 Incident

**What happened:**
1. Attempted upgrade from v4.7.0 → v4.14.1
2. Indexer failed to initialize security plugin
3. Rolled back indexer/dashboard to v4.7.0
4. Forgot to rollback manager to v4.7.0
5. Agents were v4.14.1, manager was v4.7.0
6. **Result:** All agents disconnected (version incompatibility)

**Resolution time:** 20 minutes

**Lesson:** Always keep all components at same version. When rolling back, rollback EVERYTHING.

---

## Security Considerations

### Why We Stay on v4.7.0

1. **Stability:** Proven to work with our setup
2. **Indexer compatibility:** v4.14.x has security plugin initialization issues
3. **No urgent security patches:** v4.7.0 is still receiving security updates
4. **Risk vs reward:** Upgrade risks outweigh new feature benefits

### When to Upgrade

Only upgrade if:
- Critical security vulnerability in v4.7.0
- Required feature only in newer version
- User explicitly requests and understands risks

---

## Communication Templates

### When User Asks to Upgrade

```
I see you want to upgrade Wazuh to v[X.X.X].

Current version: v4.7.0 (stable, all 7 agents active)

Before proceeding:
1. This will require upgrading manager, indexer, dashboard, AND all 7 agents
2. Estimated time: 20-30 minutes
3. There's a risk of indexer security plugin issues with v4.14.x
4. Rollback takes an additional 20 minutes if issues occur

Is this upgrade for:
- Security patch? (Recommended to proceed)
- New feature? (Evaluate if worth the risk)
- Just want latest version? (Not recommended)

Proceed with upgrade?
```

### When Version Mismatch Detected

```
⚠️ Version mismatch detected:
Manager: v4.7.0
Agents: v4.14.1

This is why agents aren't connecting. I'll fix this by reinstalling all agents at v4.7.0 to match the manager.

Estimated time: 15-20 minutes.
```

---

## References

- **Wazuh Documentation:** `/Users/ryandahlberg/Projects/cortex/docs/knowledge-base/wazuh-version-management.md` (this file)
- **Current Status:** `/Users/ryandahlberg/Projects/cortex/k3s-deployments/wazuh/WAZUH-STATUS-SUMMARY.md`
- **Operations Guide:** `/Users/ryandahlberg/Projects/cortex/k3s-deployments/wazuh/WAZUH-OPERATIONS-GUIDE.md`

---

**Remember:** Manager version dictates agent version. Never upgrade agents before manager.
