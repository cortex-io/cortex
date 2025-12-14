# Proxmox Guest Agent Permissions Setup

## Problem

The `cortex-k3s-display` API token cannot execute commands on K3s VMs (310-312) because it lacks guest agent permissions.

**Current Error:**
```
Permission check failed (/vms/310, VM.GuestAgent.Unrestricted)
```

## Required Permissions

To execute commands inside VMs via Proxmox Guest Agent API, the token needs:

1. **VM.GuestAgent.Audit** - Read guest agent information
2. **VM.GuestAgent.Unrestricted** - Execute commands inside VMs

## Option 1: Add Permissions via Proxmox Web UI

### Step 1: Navigate to API Token

1. Open Proxmox web UI: https://10.88.140.164:8006
2. Click **Datacenter** in left sidebar
3. Click **Permissions** → **API Tokens**
4. Find token: `root@pam!cortex-k3s-display`

### Step 2: Add Permissions

You need to grant permissions at the VM level or datacenter level:

#### Option A: Datacenter Level (Recommended - applies to all VMs)

1. Click **Datacenter** → **Permissions**
2. Click **Add** → **API Token Permission**
3. Configure:
   - **Path**: `/` (entire datacenter)
   - **API Token**: `root@pam!cortex-k3s-display`
   - **Role**: Create a custom role OR use existing role with these privileges:
     - `VM.Monitor`
     - `VM.Audit`
     - `VM.GuestAgent.Audit`
     - `VM.GuestAgent.Unrestricted`
   - Check **Propagate**

#### Option B: Per-VM Level (More restrictive)

For each VM (310, 311, 312):

1. Click **Datacenter** → **Permissions**
2. Click **Add** → **API Token Permission**
3. Configure:
   - **Path**: `/vms/310` (repeat for 311, 312)
   - **API Token**: `root@pam!cortex-k3s-display`
   - **Role**: Custom role with guest agent permissions
   - Check **Propagate**

### Step 3: Create Custom Role (if needed)

If you need to create a custom role:

1. Click **Datacenter** → **Permissions** → **Roles**
2. Click **Create**
3. Name: `CortexK3sDeployment`
4. Select privileges:
   - ✅ `VM.Monitor`
   - ✅ `VM.Audit`
   - ✅ `VM.GuestAgent.Audit`
   - ✅ `VM.GuestAgent.Unrestricted`
5. Click **Create**

Then assign this role to the token (see Step 2 above)

## Option 2: Add Permissions via Proxmox CLI

SSH to Proxmox host and run:

```bash
# Create custom role
pveum role add CortexK3sDeployment -privs "VM.Monitor,VM.Audit,VM.GuestAgent.Audit,VM.GuestAgent.Unrestricted"

# Assign role to token for entire datacenter
pveum acl modify / -token 'root@pam!cortex-k3s-display' -role CortexK3sDeployment

# OR assign to specific VMs only
pveum acl modify /vms/310 -token 'root@pam!cortex-k3s-display' -role CortexK3sDeployment
pveum acl modify /vms/311 -token 'root@pam!cortex-k3s-display' -role CortexK3sDeployment
pveum acl modify /vms/312 -token 'root@pam!cortex-k3s-display' -role CortexK3sDeployment
```

## Option 3: Use PVEAdministrator Role (Quick but Less Secure)

If you want to grant all permissions quickly:

```bash
# Grant Administrator role to token
pveum acl modify / -token 'root@pam!cortex-k3s-display' -role PVEAdmin
```

⚠️ **Warning**: This gives the token full administrative access. Only use for testing.

## Verification

After adding permissions, test with:

```bash
cd /Users/ryandahlberg/Projects/cortex
bash scripts/test-cortex-k3s-display-token.sh
```

Expected output:
```json
Test 3: Guest Agent Exec
{
  "data": {
    "pid": 12345
  }
}
```

If you see `"pid": <number>`, the permissions are working!

## Current Token Details

- **Token ID**: `cortex-k3s-display`
- **Full Token**: `root@pam!cortex-k3s-display=7e74841c-0eb1-4181-8926-aaa9f0103c58`
- **Purpose**: Deploy Cortex to K3s VMs via guest agent
- **Target VMs**: 310 (master), 311 (worker 1), 312 (worker 2)

## Next Steps After Permissions Added

Once permissions are verified, run the deployment:

```bash
cd /Users/ryandahlberg/Projects/cortex
bash scripts/deploy-cortex-k3s-vms.sh
```

This will:
1. Clone cortex-docker repo to VM 310
2. Create Kubernetes secrets
3. Deploy Cortex core
4. Deploy monitoring stack
5. Verify deployment

---

**Note**: Guest agent must be running inside the VMs for these commands to work. Verify with:
```bash
qm guest cmd 310 ping
```
