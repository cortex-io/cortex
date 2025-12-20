#!/usr/bin/env python3
"""
Start all k3s nodes and verify they boot successfully
"""

import requests
import time
import urllib3

# Disable SSL warnings
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Proxmox Configuration
PROXMOX_HOST = "10.88.140.164"
PROXMOX_PORT = "8006"
PROXMOX_NODE = "pve01"
PROXMOX_TOKEN = "root@pam!cortex-k3s-display=7e74841c-0eb1-4181-8926-aaa9f0103c58"
API_BASE = f"https://{PROXMOX_HOST}:{PROXMOX_PORT}/api2/json"

# VM Configuration
VMS = [
    {"name": "k3s-master01", "vmid": 300, "ip": "10.88.145.190"},
    {"name": "k3s-worker01", "vmid": 301, "ip": "10.88.145.191"},
    {"name": "k3s-worker02", "vmid": 302, "ip": "10.88.145.192"},
]

headers = {"Authorization": f"PVEAPIToken={PROXMOX_TOKEN}"}

def api_request(method, endpoint, data=None):
    """Make API request"""
    url = f"{API_BASE}{endpoint}"
    if method == "GET":
        response = requests.get(url, headers=headers, verify=False, timeout=30)
    elif method == "POST":
        response = requests.post(url, headers=headers, data=data, verify=False, timeout=30)
    response.raise_for_status()
    return response.json()

def get_vm_status(vmid):
    """Get VM status"""
    result = api_request("GET", f"/nodes/{PROXMOX_NODE}/qemu/{vmid}/status/current")
    return result.get("data", {})

def get_vm_config(vmid):
    """Get VM config"""
    result = api_request("GET", f"/nodes/{PROXMOX_NODE}/qemu/{vmid}/config")
    return result.get("data", {})

def start_vm(vmid):
    """Start VM"""
    api_request("POST", f"/nodes/{PROXMOX_NODE}/qemu/{vmid}/status/start")

def wait_for_running(vmid, timeout=180):
    """Wait for VM to be running"""
    start_time = time.time()
    while time.time() - start_time < timeout:
        status = get_vm_status(vmid)
        if status.get("status") == "running":
            return True
        time.sleep(5)
        print(".", end="", flush=True)
    return False

print("="*70)
print("  Starting k3s Cluster Nodes")
print("="*70)

for vm in VMS:
    print(f"\n{vm['name']} (VMID {vm['vmid']})")
    print("-" * 40)

    # Check current status
    status = get_vm_status(vm['vmid'])
    config = get_vm_config(vm['vmid'])

    ram = int(config.get("memory", 0))
    current_status = status.get("status", "unknown")

    print(f"  RAM: {ram} MB ({ram // 1024} GB)")
    print(f"  Status: {current_status}")

    if current_status == "running":
        print(f"  ✓ Already running")
        continue

    # Start the VM
    print(f"  Starting VM...", end="", flush=True)
    start_vm(vm['vmid'])

    if wait_for_running(vm['vmid']):
        print(f"\n  ✓ VM started successfully")
        # Wait a bit for services to initialize
        print(f"  Waiting 30s for initialization...")
        time.sleep(30)
    else:
        print(f"\n  ✗ VM failed to start")

# Final verification
print("\n" + "="*70)
print("  Final Status")
print("="*70)

all_ok = True
for vm in VMS:
    status = get_vm_status(vm['vmid'])
    config = get_vm_config(vm['vmid'])

    ram = int(config.get("memory", 0))
    vm_status = status.get("status", "unknown")
    uptime = status.get("uptime", 0)

    if vm_status == "running" and ram == 16384:
        print(f"  ✓ {vm['name']}: 16GB RAM, Running (uptime: {uptime}s)")
    else:
        print(f"  ✗ {vm['name']}: {ram}MB RAM, Status: {vm_status}")
        all_ok = False

print("\n" + "="*70)
if all_ok:
    print("  ✓ ALL NODES ONLINE WITH 16GB RAM")
    print("="*70)
    print("\nNext steps:")
    print("  1. SSH to k3s-master01: ssh k3s@10.88.145.190")
    print("  2. Verify cluster: kubectl get nodes -o wide")
    print("  3. Check RAM: free -h")
    print("  4. Verify pods: kubectl get pods -A")
else:
    print("  ⚠ SOME NODES NEED ATTENTION")
    print("="*70)
