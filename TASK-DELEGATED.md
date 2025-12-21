# Task Delegated to Cortex Cluster

## Summary

I've created a task specification for fixing k3s-master03's IP address and placed it in the pending task queue for your Cortex cluster instances to pick up.

## Task Details

- **Task ID:** `fix-k3s-master03-ip-1734739200`
- **Priority:** High
- **Type:** Infrastructure / K3s Cluster Management
- **Task File:** `coordination/tasks/pending/fix-k3s-master03-ip.json`

## What Needs to be Done

Fix k3s-master03 (VMID 306) IP address to 10.88.145.196 using Proxmox console access.

## Cortex Cluster Status

Your K3s cluster has:
- **3 Cortex instances running** (namespace: cortex)
- **Proxmox MCP service available** at 10.43.120.189:8080
- Task queue directory: `coordination/tasks/pending/`

## How the Cortex Instance Should Handle This

The assigned Cortex instance should:

1. **Use Proxmox MCP** to access VM 306 console
2. **Login:** k3s/toor
3. **Configure netplan** to set IP to 10.88.145.196/24
4. **Set hostname:** k3s-master03
5. **Apply and reboot**
6. **Verify SSH access** at 10.88.145.196

## Documentation Provided

All documentation has been created for the Cortex instance:

- `K3S-IP-FIX-SUMMARY.md` - Complete overview
- `FIX-MASTER03-CONSOLE-STEPS.md` - Detailed console steps
- `coordination/tasks/pending/fix-k3s-master03-ip.json` - Full task spec with all details

## Success Criteria

Task is complete when:
- ✓ k3s-master03 accessible via SSH at 10.88.145.196
- ✓ hostname returns 'k3s-master03'
- ✓ IP address is 10.88.145.196/24

## After Task Completion

Once k3s-master03 is accessible:
1. Join k3s-master02 (10.88.145.193) to cluster
2. Join k3s-master03 (10.88.145.196) to cluster
3. Verify 7-node HA cluster

Run: `./check-cluster-status.sh`

## Monitoring Task Status

```bash
# Check task status
cat coordination/tasks/pending/fix-k3s-master03-ip.json | jq '.status'

# When picked up, it should move to in-progress or be updated with assigned_to
watch -n 5 'cat coordination/tasks/pending/fix-k3s-master03-ip.json | jq "{status, assigned_to}"'
```

## Current Cluster State

```
Control Plane:
  ✓ k3s-master01 @ 10.88.145.190 - In cluster
  ✓ k3s-master02 @ 10.88.145.193 - Ready to join
  ✗ k3s-master03 @ ????.???.???.??? → 10.88.145.196 - NEEDS FIX (this task)

Workers:
  ✓ k3s-worker01 @ 10.88.145.191 - In cluster
  ✓ k3s-worker02 @ 10.88.145.192 - In cluster
  ✓ k3s-worker03 @ 10.88.145.194 - In cluster
  ✓ k3s-worker04 @ 10.88.145.195 - In cluster (NotReady - initializing)

Target: 7 nodes (3 control-plane + 4 workers)
Current: 5 nodes in cluster
```

## Notes

The Cortex instance handling this task will need:
- Access to Proxmox MCP service (available in cluster)
- Ability to execute console commands via MCP
- Network access to verify SSH afterwards

The task specification includes all credentials, network config, and step-by-step instructions needed.
