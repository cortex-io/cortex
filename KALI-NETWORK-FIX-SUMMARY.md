# Kali Sentinel Forge Network Fix - Complete

**Date:** 2025-12-13
**Issue:** VMs failed to start due to vmbr0 bridge misconfiguration
**Resolution:** Created vmbr2 bridge with proper VLAN 150 configuration
**Status:** ✅ ALL 4 KALI VMS RUNNING

---

## Problem Diagnosed

### Original Error
```
no physical interface on bridge 'vmbr0'
kvm: network script /usr/libexec/qemu-server/pve-bridge failed with status 6400
TASK ERROR: start failed: QEMU exited with code 1
```

### Root Cause
- Kali VMs (900-903) were configured to use `vmbr0,tag=150`
- vmbr0 had invalid bridge_ports configuration ("nic0" without VLAN)
- VMs could not start due to network bridge failure

### Diagnosis via Proxmox API ✅

Successfully retrieved error information via API:
```bash
GET /api2/json/nodes/pve01/tasks?errors=1
```

**API Response showed:**
- 10+ failed qmstart attempts for VMs 900-903
- All with status: "start failed: QEMU exited with code 1"
- Task UPIDs for complete audit trail

---

## Solution Implemented

### 1. Created vmbr2 Bridge

**Configuration:**
```
Interface:   vmbr2
Type:        bridge
Address:     10.88.150.1/29
Netmask:     255.255.255.248
Bridge Ports: nic0.150
VLAN:        150
Autostart:   Yes
Comments:    Kali Sentinel Forge - VLAN 150
```

**CIDR Details:**
- Subnet: 10.88.150.0/29
- Gateway: 10.88.150.1
- Usable IPs: 10.88.150.2 - 10.88.150.6 (5 addresses)
- Broadcast: 10.88.150.7

### 2. Updated VM Network Configurations

Changed all 4 Kali VMs from:
```
net0: virtio=MAC,bridge=vmbr0,tag=150
```

To:
```
net0: virtio=MAC,bridge=vmbr2
```

**Note:** VLAN tag removed because vmbr2 already has VLAN 150 configured in bridge_ports (nic0.150)

### 3. Started VMs

All VMs started successfully after network reconfiguration.

---

## Kali Sentinel Forge - Final Status

### Network Configuration

| Component | Value |
|-----------|-------|
| Bridge | vmbr2 |
| VLAN | 150 |
| Subnet | 10.88.150.0/29 |
| Netmask | 255.255.255.248 |
| Gateway | 10.88.150.1 |
| Bridge Ports | nic0.150 |

### VM Status - ALL RUNNING ✅

| VM ID | Hostname | Role | IP | MAC | Status |
|-------|----------|------|-----|-----|--------|
| 900 | red-kali-server | Red Team | 10.88.150.2 | BC:24:11:7A:E5:D8 | ✅ RUNNING |
| 901 | blue-kali-server | Blue Team | 10.88.150.3 | BC:24:11:D4:8E:EE | ✅ RUNNING |
| 902 | purple-kali-server | Purple Team | 10.88.150.4 | BC:24:11:74:0E:DF | ✅ RUNNING |
| 903 | green-kali-server | Green Team | 10.88.150.5 | BC:24:11:AF:32:61 | ✅ RUNNING |

**Specs per VM:**
- 2 vCPU
- 4 GB RAM
- 32 GB disk
- Kali Linux (ready for installation)

---

## Commands Used

### Create Bridge
```bash
curl -k -s -X POST \
  "https://10.88.140.164:8006/api2/json/nodes/pve01/network" \
  -H "Authorization: PVEAPIToken=root@pam!cortex-deploy=<token>" \
  --data-urlencode "iface=vmbr2" \
  --data-urlencode "type=bridge" \
  --data-urlencode "address=10.88.150.1" \
  --data-urlencode "netmask=255.255.255.248" \
  --data-urlencode "bridge_ports=nic0.150" \
  --data-urlencode "autostart=1"
```

### Apply Network Configuration
```bash
curl -k -s -X PUT \
  "https://10.88.140.164:8006/api2/json/nodes/pve01/network" \
  -H "Authorization: PVEAPIToken=root@pam!cortex-deploy=<token>"
```

### Update VM Network
```bash
for vmid in 900 901 902 903; do
  curl -k -s -X PUT \
    "https://10.88.140.164:8006/api2/json/nodes/pve01/qemu/${vmid}/config" \
    -H "Authorization: PVEAPIToken=root@pam!cortex-deploy=<token>" \
    --data-urlencode "net0=virtio=<MAC>,bridge=vmbr2"
done
```

### Start VMs
```bash
for vmid in 900 901 902 903; do
  curl -k -s -X POST \
    "https://10.88.140.164:8006/api2/json/nodes/pve01/qemu/${vmid}/status/start" \
    -H "Authorization: PVEAPIToken=root@pam!cortex-deploy=<token>"
done
```

---

## Verification

### Check Bridge Status
```bash
curl -k -s -X GET \
  "https://10.88.140.164:8006/api2/json/nodes/pve01/network" \
  -H "Authorization: PVEAPIToken=<token>" | \
  jq '.data[] | select(.iface == "vmbr2")'
```

### Check VM Status
```bash
for vmid in 900 901 902 903; do
  curl -k -s -X GET \
    "https://10.88.140.164:8006/api2/json/nodes/pve01/qemu/${vmid}/status/current" \
    -H "Authorization: PVEAPIToken=<token>" | \
    jq '.data.status'
done
```

---

## Network Topology

```
Physical Interface: nic0
        ↓
    VLAN 150 (nic0.150)
        ↓
    Bridge: vmbr2 (10.88.150.1/29)
        ↓
    ┌───┴───┬───────┬───────┐
    ↓       ↓       ↓       ↓
  VM 900  VM 901  VM 902  VM 903
  .2      .3      .4      .5
  Red     Blue    Purple  Green
  Team    Team    Team    Team
```

---

## Next Steps

1. ✅ **VMs Running** - All 4 Kali VMs operational
2. 🔄 **Complete Installation** - Boot and install Kali Linux on each VM
3. 🔄 **Network Configuration** - Set static IPs inside VMs
4. 🔄 **Tool Installation** - Install role-specific security tools
5. 🔄 **Integration Testing** - Verify connectivity and network isolation

---

## Key Learnings

### API Capabilities Confirmed ✅

1. **Task Logs:** Can retrieve error messages via `/nodes/{node}/tasks` endpoint
2. **Network Management:** Full network configuration via API
3. **VM Configuration:** Can update VM settings via API
4. **Real-time Status:** Can monitor VM status changes

### Bridge Configuration Best Practices

1. Use specific bridge per VLAN for clarity
2. Include VLAN in bridge_ports (e.g., nic0.150)
3. Remove VLAN tags from VM configs when bridge handles VLAN
4. Apply network changes before starting VMs

---

## Files Created

- `/tmp/create-kali-bridge.sh` - Bridge creation script
- `/tmp/update-and-start-kali.sh` - VM update and start script
- `/tmp/check-proxmox-tasks.sh` - Error checking script
- `/tmp/diagnose-network.sh` - Network diagnostic script

---

## Resolution Timeline

| Time | Action | Result |
|------|--------|--------|
| T+0  | Attempted VM start | Failed: vmbr0 error |
| T+2  | Diagnosed via API | Identified bridge issue |
| T+5  | Created vmbr2 | Network reloaded |
| T+7  | Updated VM configs | All VMs reconfigured |
| T+8  | Started VMs | All 4 RUNNING ✅ |

**Total Resolution Time:** 8 minutes

---

**Status:** ✅ RESOLVED
**All Kali VMs:** RUNNING
**Network:** vmbr2 (VLAN 150) operational
**Ready for:** Kali Linux installation and configuration

🎯 **Kali Sentinel Forge is now online and ready for security operations!**
