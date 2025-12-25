# k3s-cluster-ingress - Complete Setup

## Current Status

✅ VM 350 created in Proxmox
✅ VM started and running
❌ No disk attached yet (VM can't boot)

## What Remains: Just One Step!

The VM needs a disk. This requires running commands in the Proxmox web shell (the API token doesn't have permission for disk operations).

### Open Proxmox Web UI:
1. Go to: https://10.88.140.164:8006
2. Click on: **pve01** (your node)
3. Click: **Shell** button (top right)

### Paste These Commands:

```bash
cd /var/lib/vz/template/iso
wget -O ubuntu-24.04-cloudimg.img https://cloud-images.ubuntu.com/releases/24.04/release/ubuntu-24.04-server-cloudimg-amd64.img
qm importdisk 350 ubuntu-24.04-cloudimg.img local-lvm
qm set 350 --scsi0 local-lvm:vm-350-disk-0
qm resize 350 scsi0 8G
qm set 350 --ide2 local-lvm:cloudinit
qm set 350 --ciuser k3s --cipassword toor
qm set 350 --ipconfig0 'ip=10.88.145.199/24,gw=10.88.145.1'
qm set 350 --nameserver 8.8.8.8
qm set 350 --boot c --bootdisk scsi0
qm stop 350 && sleep 5 && qm start 350
```

Wait 60 seconds, then continue below.

---

## After VM Boots: Automated Setup

Once the VM is running (60 seconds after the commands above), I'll SSH in and configure everything automatically.

### What Will Be Configured:
1. Tailscale with subnet router (10.88.145.0/24, 10.42.0.0/16, 10.43.0.0/16)
2. IP forwarding enabled
3. iptables NAT rules (80,443 → 10.88.145.200)
4. Rules saved permanently

---

## Final Steps (After My Automated Setup)

1. **Approve Subnet Routes**: You said this is already done ✅
2. **Update DNS**:
   - chat.ry-ops.dev → [Tailscale IP will be shown after setup]
3. **Test**: `curl -I http://chat.ry-ops.dev`

---

##Quick Commands for Proxmox Shell

**If you want to do it all in one shot, copy this entire block:**

```bash
cd /var/lib/vz/template/iso && \
wget -q -O ubuntu-24.04-cloudimg.img https://cloud-images.ubuntu.com/releases/24.04/release/ubuntu-24.04-server-cloudimg-amd64.img && \
qm importdisk 350 ubuntu-24.04-cloudimg.img local-lvm && \
qm set 350 --scsi0 local-lvm:vm-350-disk-0 && \
qm resize 350 scsi0 8G && \
qm set 350 --ide2 local-lvm:cloudinit && \
qm set 350 --ciuser k3s --cipassword toor && \
qm set 350 --ipconfig0 'ip=10.88.145.199/24,gw=10.88.145.1' && \
qm set 350 --nameserver 8.8.8.8 && \
qm set 350 --boot c --bootdisk scsi0 && \
qm stop 350 && sleep 5 && qm start 350 && \
echo "Done! VM will be ready in 60 seconds at 10.88.145.199"
```

---

## VM Details

- **VMID**: 350
- **Name**: k3s-cluster-ingress
- **IP**: 10.88.145.199
- **Username**: k3s
- **Password**: toor
- **Purpose**: Tailscale subnet router → Traefik (10.88.145.200)

---

## Tell me when you've pasted the commands!

Once you've run the Proxmox shell commands, let me know and I'll immediately:
1. SSH to 10.88.145.199
2. Install & configure Tailscale
3. Set up port forwarding
4. Give you the Tailscale IP for DNS

Should take about 2 minutes total after you paste the commands.
