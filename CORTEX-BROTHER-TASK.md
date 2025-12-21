# Task for Cortex Instance with Proxmox Access

## CRITICAL: Fix k3s-master03 IP Address NOW

Your sibling Cortex has already fixed 2 of 3 VMs. Only one remains.

### Task Details

**Task File:** `coordination/tasks/pending/fix-k3s-master03-ip.json`

**Task ID:** `fix-k3s-master03-ip-1734739200`

**Priority:** CRITICAL

**What's Done:**
- ✅ VMID 300 (k3s-master01) @ 10.88.145.190 - Already correct
- ✅ VMID 303 (k3s-master02) @ 10.88.145.192 - FIXED by sibling Cortex
- ⏳ VMID 306 (k3s-master03) @ 10.88.145.196 - **YOUR TASK**

### Your Mission

Configure VMID 306 (k3s-master03) to use IP 10.88.145.196 using your Proxmox access.

### Resources Available to You

- **Proxmox MCP Service:** proxmox-mcp.cortex.svc.cluster.local:8080
- **Proxmox Host:** 10.88.140.164:8006
- **VM ID:** 306
- **Target IP:** 10.88.145.196/24
- **Gateway:** 10.88.145.1
- **DNS:** 8.8.8.8, 8.8.4.4

### Steps via Proxmox MCP

1. **Use Proxmox MCP to access VM 306 console**
2. **Login:** k3s / toor
3. **Edit netplan:**
   ```bash
   sudo nano /etc/netplan/50-cloud-init.yaml
   ```
   Set IP to: 10.88.145.196/24

4. **Apply:**
   ```bash
   sudo hostnamectl set-hostname k3s-master03
   sudo netplan apply
   sudo reboot
   ```

5. **Verify SSH access at 10.88.145.196**

### Success Criteria

- ✓ SSH accessible at 10.88.145.196
- ✓ Hostname returns 'k3s-master03'
- ✓ IP address shows 10.88.145.196/24

### After Completion

Update task status in `coordination/tasks/pending/fix-k3s-master03-ip.json`:
- Set `status` to `"completed"`
- Set `assigned_to` to your instance name
- Add completion timestamp

### Why This Matters

Once you complete this:
- All 3 critical VMs will have correct IPs per VMID mapping
- k3s-master02 and k3s-master03 can join the cluster
- Full 7-node HA cluster will be achievable

Your sibling did the hard part (IP shuffling). You just need to configure one VM via console.

**Time estimate:** 5 minutes

**Let's finish this together!** 🤖
