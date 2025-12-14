# Cortex API Keys and Credentials Reference

**CRITICAL: All masters and workers must use these credentials for service access**

This document provides the canonical reference for all API keys, tokens, and credentials used by Cortex. All agents must reference this document rather than hardcoding credentials.

---

## Current Active Credentials

### Anthropic Claude API

**Purpose:** LLM access for all masters and workers

**API Key:**
```
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
```

**Usage:**
```bash
# In bash scripts
export ANTHROPIC_API_KEY="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"

# In Node.js
process.env.ANTHROPIC_API_KEY
```

**Stored In:**
- K3s Secret: `anthropic-api-key` in namespace `cortex-system`
- Environment variable: `ANTHROPIC_API_KEY`
- Coordination config: `/coordination/config/anthropic-credentials.sh`

**Access From K3s Pods:**
```yaml
env:
  - name: ANTHROPIC_API_KEY
    valueFrom:
      secretKeyRef:
        name: anthropic-api-key
        key: api-key
```

**Last Updated:** 2025-12-13 (after LXC → VM migration)

**Rotation Schedule:** Every 90 days or on security event

---

### Proxmox VE API

**Purpose:** K3s cluster access via guest agent (THE ONLY WAY to interact with K3s VMs)

**Token:**
```
root@pam!cortex-k3s-display=7e74841c-0eb1-4181-8926-aaa9f0103c58
```

**API Endpoint:**
```
https://10.88.140.164:8006/api2/json/
```

**Usage:**
```bash
PROXMOX_TOKEN="root@pam!cortex-k3s-display=7e74841c-0eb1-4181-8926-aaa9f0103c58"
PROXMOX_HOST="10.88.140.164"
PROXMOX_PORT="8006"

curl -k -s -X GET \
    "https://$PROXMOX_HOST:$PROXMOX_PORT/api2/json/nodes/pve01/qemu/310/status/current" \
    -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN"
```

**Permissions:**
- Role: `PVEAdmin` (full access)
- VM.GuestAgent.Audit
- VM.GuestAgent.Unrestricted
- Full cluster management

**Target VMs:**
- VM 310: K3s Master (10.88.145.180)
- VM 311: K3s Worker 1 (10.88.145.181)
- VM 312: K3s Worker 2 (10.88.145.182)

**Stored In:**
- `/coordination/config/proxmox-credentials.sh`
- Master scripts: Source from config file
- Worker scripts: Access via coordination config

**Documentation:** See `/docs/infrastructure/K3S-CLUSTER-ACCESS-VIA-PROXMOX-API.md`

**Last Updated:** 2025-12-13

**Rotation Schedule:** Every 90 days

---

## Credential Storage Patterns

### For Cortex-Docker Workforce (Recommended)

All credentials are available in `/.env` at the root of the cortex repository:

```bash
# In your scripts, load credentials from .env
set -a
source /.env
set +a

# Now all environment variables are available
echo "Proxmox Token: ${PROXMOX_TOKEN:0:30}..."
echo "Anthropic API Key: ${ANTHROPIC_API_KEY:0:20}..."
```

**Template:** See `/.env.example` for all available variables

### For Shell Scripts (Alternative)

Create `/coordination/config/proxmox-credentials.sh`:

```bash
#!/bin/bash
# Proxmox API Credentials - Source this file in scripts

export PROXMOX_TOKEN="root@pam!cortex-k3s-display=7e74841c-0eb1-4181-8926-aaa9f0103c58"
export PROXMOX_HOST="10.88.140.164"
export PROXMOX_PORT="8006"
export PROXMOX_NODE="pve01"

# K3s VM IDs
export K3S_MASTER_VMID="310"
export K3S_WORKER1_VMID="311"
export K3S_WORKER2_VMID="312"
```

Create `/coordination/config/anthropic-credentials.sh`:

```bash
#!/bin/bash
# Anthropic API Credentials - Source this file in scripts

export ANTHROPIC_API_KEY="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"
export ANTHROPIC_API_URL="https://api.anthropic.com/v1"
export ANTHROPIC_MODEL="claude-sonnet-4-5-20250929"
```

**Usage in Master Scripts:**

```bash
#!/bin/bash
# /coordination/masters/development/lib/deploy.sh

# Load credentials
source /coordination/config/proxmox-credentials.sh
source /coordination/config/anthropic-credentials.sh

# Now use the environment variables
curl -k -s -X GET \
    "https://$PROXMOX_HOST:$PROXMOX_PORT/api2/json/version" \
    -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN"
```

### For Node.js / MCP Servers

**Pattern:**

```javascript
// Load from environment or config file
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const PROXMOX_TOKEN = process.env.PROXMOX_TOKEN;

if (!ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY not set');
}

// Use in API calls
import Anthropic from '@anthropic-ai/sdk';
const client = new Anthropic({
  apiKey: ANTHROPIC_API_KEY
});
```

### For Kubernetes Secrets

**Create Secret:**

```bash
# Via Proxmox API to K3s master
kubectl create secret generic anthropic-api-key \
  --from-literal=api-key='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' \
  -n cortex-system \
  --dry-run=client -o yaml | kubectl apply -f -
```

**Use in Deployment:**

```yaml
apiVersion: v1
kind: Deployment
metadata:
  name: coordinator-master
  namespace: cortex-system
spec:
  template:
    spec:
      containers:
      - name: coordinator
        env:
        - name: ANTHROPIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: anthropic-api-key
              key: api-key
```

---

## Service-Specific Credentials

### GitHub Container Registry (GHCR)

**Purpose:** Pull Cortex Docker images

**Status:** ⚠️ NOT CURRENTLY ACCESSIBLE from K3s VMs due to network isolation

**Token:** (stored in GitHub secrets)

**Usage:**
```bash
echo "$GITHUB_TOKEN" | docker login ghcr.io -u USERNAME --password-stdin
```

**Images:**
- `ghcr.io/ry-ops/cortex:latest`
- `ghcr.io/ry-ops/cortex/coordinator-master:latest`
- `ghcr.io/ry-ops/cortex/security-master:latest`
- etc.

**Workaround for K3s:** Pre-pull images during VM provisioning or use local registry

---

## Security Best Practices

### 1. Never Commit Credentials to Git

**Gitignore Patterns:**

```gitignore
# Credentials
*credentials.sh
*.env
.env.*
**/secrets/
coordination/config/*credentials*.sh

# Except documentation
!coordination/config/API-KEYS-AND-CREDENTIALS.md
```

### 2. Use Environment Variables

```bash
# Good
export ANTHROPIC_API_KEY="$(cat /secure/path/api-key)"

# Bad - hardcoded
ANTHROPIC_API_KEY="sk-ant-api03-..."
```

### 3. Rotate Credentials Regularly

**Schedule:**
- Anthropic API Key: Every 90 days
- Proxmox Token: Every 90 days
- GitHub Tokens: Every 90 days
- Emergency rotation: Immediately on suspected compromise

**Rotation Checklist:**
1. Generate new credential
2. Update all config files
3. Update K8s secrets
4. Test with one master
5. Deploy to all masters/workers
6. Verify operations
7. Revoke old credential
8. Update this documentation

### 4. Limit Scope

- **Proxmox Token:** Only access needed VMs (310-312)
- **Anthropic API Key:** Rate limits and usage monitoring
- **Service Accounts:** Minimal permissions (future)

### 5. Audit Access

```bash
# Check Proxmox API access logs
grep "cortex-k3s-display" /var/log/pve/tasks/active

# Check Anthropic API usage
# (via Anthropic console)
```

---

## Credential Access Patterns by Role

### Coordinator Master

**Needs:**
- ✅ Proxmox API Token (full access)
- ✅ Anthropic API Key
- ✅ K3s cluster access

**Access Method:**
```bash
source /coordination/config/proxmox-credentials.sh
source /coordination/config/anthropic-credentials.sh
```

### Security Master

**Needs:**
- ✅ Proxmox API Token (read-only preferred, full for emergencies)
- ✅ Anthropic API Key
- ✅ K3s cluster access (audit logs, security scans)

**Access Method:** Same as coordinator

### Development Master

**Needs:**
- ✅ Proxmox API Token (full access for deployments)
- ✅ Anthropic API Key
- ✅ K3s cluster access
- ✅ GitHub tokens (for releases)

**Access Method:** Same as coordinator

### CICD Master

**Needs:**
- ✅ Proxmox API Token
- ✅ Anthropic API Key
- ✅ K3s cluster access
- ✅ GitHub tokens
- ✅ Container registry tokens

**Access Method:** Same as coordinator

### Workers

**Needs:**
- ⚠️ Limited Anthropic API Key (via master delegation)
- ⚠️ Limited K3s access (via master proxy)
- ❌ NO direct Proxmox access

**Access Method:**
- Workers request credentials from spawning master
- Masters provide scoped/temporary tokens
- Workers never have permanent credential storage

---

## Emergency Procedures

### Credential Compromise

**Immediate Actions:**

1. **Revoke Compromised Credential:**
   ```bash
   # Proxmox: Delete token via web UI
   # Anthropic: Revoke via console
   ```

2. **Generate New Credential:**
   ```bash
   # Proxmox: Create new token
   # Anthropic: Generate new API key
   ```

3. **Update All Systems:**
   ```bash
   # Update config files
   vim /coordination/config/proxmox-credentials.sh

   # Update K8s secret (via Proxmox API)
   kubectl delete secret anthropic-api-key -n cortex-system
   kubectl create secret generic anthropic-api-key \
     --from-literal=api-key='NEW_KEY' \
     -n cortex-system

   # Restart all masters
   kubectl rollout restart deployment -n cortex-system
   ```

4. **Verify Operations:**
   ```bash
   # Check all masters can authenticate
   ./scripts/verify-credentials.sh
   ```

5. **Audit Access:**
   ```bash
   # Review recent API calls
   # Check for unauthorized access
   ```

### Lost Credentials

**Recovery:**

1. Check backup locations:
   - `/coordination/config/backups/`
   - Git history (if committed previously)
   - Kubernetes secrets (if cluster accessible)

2. Regenerate from services:
   - Proxmox: Create new token via web UI
   - Anthropic: Generate new key via console

3. Update documentation

---

## Verification Commands

### Test Anthropic API Key

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-sonnet-4-5-20250929",
    "max_tokens": 10,
    "messages": [{"role": "user", "content": "test"}]
  }'
```

**Expected:** JSON response with completion

### Test Proxmox Token

```bash
curl -k -s -X GET \
  "https://10.88.140.164:8006/api2/json/version" \
  -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN" | jq .
```

**Expected:** `{"data":{"version":"9.1.2",...}}`

### Test K3s Access via Proxmox

```bash
response=$(curl -k -s -X POST \
  "https://10.88.140.164:8006/api2/json/nodes/pve01/qemu/310/agent/exec" \
  -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"command":["kubectl","version","--short"]}')

pid=$(echo "$response" | jq -r '.data.pid')
echo "PID: $pid"
```

**Expected:** Valid PID returned

---

## Quick Reference

**Load All Credentials (Recommended for cortex-docker workforce):**
```bash
# Load from .env file
set -a
source /.env
set +a
```

**Load All Credentials (Alternative using shell scripts):**
```bash
source /coordination/config/proxmox-credentials.sh
source /coordination/config/anthropic-credentials.sh
```

**Environment Variables Set:**
- `ANTHROPIC_API_KEY`
- `PROXMOX_TOKEN`
- `PROXMOX_HOST`
- `PROXMOX_PORT`
- `K3S_MASTER_VMID`
- `K3S_WORKER1_VMID`
- `K3S_WORKER2_VMID`

**Verification:**
```bash
echo "Anthropic: ${ANTHROPIC_API_KEY:0:20}..."
echo "Proxmox: ${PROXMOX_TOKEN:0:30}..."
echo "K3s Master: VM $K3S_MASTER_VMID"
```

---

## Document Maintenance

**Location:** `/coordination/config/API-KEYS-AND-CREDENTIALS.md`

**Update Triggers:**
- Credential rotation
- New service integration
- Security policy changes
- Credential compromise

**Last Updated:** 2025-12-14

**Version:** 1.0.0

**Maintainer:** Cortex Coordinator Master

**Review Schedule:** Every 30 days or on credential change

---

**Remember: These credentials are the keys to the kingdom. Protect them, rotate them, and never commit them to public repositories. All masters and workers MUST use these documented credentials - no exceptions.**
