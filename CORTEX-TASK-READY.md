# Cortex Task Submitted: Fix k3s-master03 IP

## Status: READY FOR PICKUP

I've created a complete task specification for the Cortex cluster instance to handle the k3s-master03 IP configuration.

## Task Location

**File:** `coordination/tasks/pending/fix-k3s-master03-ip.json`

**Task ID:** `fix-k3s-master03-ip-1734739200`

## Task Details

- **Priority:** HIGH
- **Type:** Infrastructure / K3s Cluster Management
- **Objective:** Configure k3s-master03 (VMID 306) to use IP 10.88.145.196
- **Method:** Proxmox console access (VM not SSH-accessible)

## What the Task Contains

The JSON task file includes:
- ✓ Complete VM information (VMID, name, Proxmox host)
- ✓ Network configuration (target IP, gateway, DNS)
- ✓ Credentials (VM login, Proxmox API token)
- ✓ Step-by-step instructions (8 detailed steps)
- ✓ Success criteria for verification
- ✓ Next steps after completion

## Supporting Documentation

Created for the Cortex instance:
1. `K3S-IP-FIX-SUMMARY.md` - Complete technical overview
2. `FIX-MASTER03-CONSOLE-STEPS.md` - Detailed console instructions
3. `TASK-DELEGATED.md` - Delegation context and notes
4. Task JSON with full specifications

## Resources Available in Cluster

The Cortex instance has access to:
- **Proxmox MCP service** (proxmox-mcp.cortex.svc.cluster.local:8080)
- **K3s cluster access** for verification
- **All task documentation** in shared volumes

## How Cortex Should Pick This Up

The Cortex instance running in the K3s cluster should:

1. **Poll** the `coordination/tasks/pending/` directory
2. **Read** the task file `fix-k3s-master03-ip.json`
3. **Claim** the task by updating `assigned_to` field
4. **Execute** using Proxmox MCP to access console
5. **Update** task status to `completed` when done

## Task Execution Flow

```
Cortex Instance
    ↓
Read Task File (coordination/tasks/pending/fix-k3s-master03-ip.json)
    ↓
Claim Task (update assigned_to field)
    ↓
Use Proxmox MCP (http://proxmox-mcp.cortex.svc.cluster.local:8080)
    ↓
Access VM 306 Console
    ↓
Execute Configuration Steps
    ↓
Verify SSH Access (10.88.145.196)
    ↓
Update Task Status to Completed
```

## Monitoring

To check if task has been picked up:
```bash
cat coordination/tasks/pending/fix-k3s-master03-ip.json | jq '{status, assigned_to, updated_at}'
```

To monitor completion:
```bash
watch -n 5 'cat coordination/tasks/pending/fix-k3s-master03-ip.json | jq .status'
```

## Expected Timeline

- **Task pickup:** When Cortex polls (frequency depends on polling interval)
- **Execution time:** ~5-10 minutes
- **Verification:** ~2-3 minutes

Total expected: 10-15 minutes from pickup

## Post-Completion Actions

Once the Cortex instance completes this task:
1. k3s-master03 will be accessible at 10.88.145.196
2. Can proceed to join master02 and master03 to cluster
3. Will achieve full 7-node HA cluster

## Current Cluster State

```
Control Plane:
  ✓ k3s-master01 @ 10.88.145.190 - Running, in cluster
  ✓ k3s-master02 @ 10.88.145.193 - Ready to join after master03
  ⏳ k3s-master03 @ ??? → 10.88.145.196 - TASK ASSIGNED TO CORTEX

Workers:
  ✓ k3s-worker01 @ 10.88.145.191 - In cluster
  ✓ k3s-worker02 @ 10.88.145.192 - In cluster
  ✓ k3s-worker03 @ 10.88.145.194 - In cluster
  ✓ k3s-worker04 @ 10.88.145.195 - In cluster
```

## Task Signal Created

A marker file has been created to signal new task availability:
- `coordination/tasks/.new-task-signal`
- Contains task ID for quick lookup

---

**The task is now ready for your Cortex cluster instance to process!** 🤖
