#!/Users/ryandahlberg/Projects/cortex/venv/bin/python3
"""
K3s HA Cluster Automated Provisioning
Fully automated build of 3 master + 4 worker HA cluster

Author: Brother Cortex
Date: 2025-12-20
"""

import requests
import time
import sys
import subprocess
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Proxmox Configuration
PROXMOX_HOST = "10.88.140.164"
PROXMOX_TOKEN = "root@pam!cortex-k3s-display=7e74841c-0eb1-4181-8926-aaa9f0103c58"
API_BASE = f"https://{PROXMOX_HOST}:8006/api2/json"
NODE = "pve01"

# K3s Configuration
K3S_MASTER01_IP = "10.88.145.190"
K3S_USER = "k3s"
NETWORK_GATEWAY = "10.88.145.1"

# VM Configurations
EXISTING_VMS = [
    {"vmid": 300, "name": "k3s-master01", "ip": "10.88.145.190", "role": "master", "cores": 2, "memory": 6144},
    {"vmid": 301, "name": "k3s-worker01", "ip": "10.88.145.191", "role": "worker", "cores": 2, "memory": 6144},
    {"vmid": 302, "name": "k3s-worker02", "ip": "10.88.145.192", "role": "worker", "cores": 2, "memory": 6144},
]

NEW_VMS = [
    {"vmid": 303, "name": "k3s-master02", "ip": "10.88.145.193", "role": "master", "clone_from": 300},
    {"vmid": 304, "name": "k3s-worker03", "ip": "10.88.145.194", "role": "worker", "clone_from": 301},
    {"vmid": 305, "name": "k3s-worker04", "ip": "10.88.145.195", "role": "worker", "clone_from": 301},
    {"vmid": 306, "name": "k3s-master03", "ip": "10.88.145.196", "role": "master", "clone_from": 300},
]

headers = {"Authorization": f"PVEAPIToken={PROXMOX_TOKEN}"}


def api_request(method, endpoint, data=None):
    """Make Proxmox API request"""
    url = f"{API_BASE}{endpoint}"
    try:
        if method == "GET":
            r = requests.get(url, headers=headers, verify=False, timeout=30)
        elif method == "POST":
            r = requests.post(url, headers=headers, data=data, verify=False, timeout=30)
        elif method == "PUT":
            r = requests.put(url, headers=headers, data=data, verify=False, timeout=30)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"API Error: {e}")
        raise


def vm_status(vmid):
    """Get VM status"""
    return api_request("GET", f"/nodes/{NODE}/qemu/{vmid}/status/current")["data"]["status"]


def wait_for_status(vmid, status, timeout=120):
    """Wait for VM status"""
    start = time.time()
    while time.time() - start < timeout:
        try:
            current = vm_status(vmid)
            print(f"  VM {vmid}: {current}", end="\r")
            if current == status:
                print(f"  VM {vmid}: {current} (ready)     ")
                return True
        except:
            pass
        time.sleep(3)
    print(f"  VM {vmid}: timeout waiting for {status}")
    return False


def wait_for_task(upid, timeout=600):
    """Wait for Proxmox task"""
    start = time.time()
    while time.time() - start < timeout:
        try:
            result = api_request("GET", f"/nodes/{NODE}/tasks/{upid}/status")
            status = result["data"]["status"]
            if status == "stopped":
                return result["data"]["exitstatus"] == "OK"
        except:
            pass
        time.sleep(2)
    return False


def ssh(ip, cmd, timeout=30):
    """Run SSH command"""
    try:
        result = subprocess.run(
            ["ssh", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=10",
             f"{K3S_USER}@{ip}", cmd],
            capture_output=True,
            timeout=timeout,
            text=True
        )
        return result.returncode == 0, result.stdout + result.stderr
    except Exception as e:
        return False, str(e)


def wait_ssh(ip, timeout=300):
    """Wait for SSH"""
    print(f"  Waiting for SSH on {ip}...")
    start = time.time()
    while time.time() - start < timeout:
        success, _ = ssh(ip, "echo ready", timeout=5)
        if success:
            print(f"  SSH ready on {ip}")
            return True
        time.sleep(5)
    return False


def configure_static_ip(ip, hostname, new_ip):
    """Configure static IP via SSH"""
    print(f"  Configuring {hostname} with IP {new_ip}...")

    # Set hostname
    ssh(ip, f"sudo hostnamectl set-hostname {hostname}")

    # Configure netplan
    netplan = f"""network:
  version: 2
  ethernets:
    ens18:
      addresses:
        - {new_ip}/24
      routes:
        - to: default
          via: {NETWORK_GATEWAY}
      nameservers:
        addresses: [8.8.8.8, 8.8.4.4]
"""

    cmd = f"echo '{netplan}' | sudo tee /etc/netplan/50-cloud-init.yaml && sudo netplan apply"
    success, output = ssh(ip, cmd)

    if success:
        print(f"  Static IP configured: {new_ip}")
        time.sleep(10)  # Wait for network to settle
        return True
    else:
        print(f"  Error configuring IP: {output}")
        return False


def get_k3s_token():
    """Get K3s token from master01"""
    print("\nRetrieving K3s token...")
    success, output = ssh(K3S_MASTER01_IP, "sudo cat /var/lib/rancher/k3s/server/node-token")
    if success and output.strip():
        token = output.strip()
        print(f"  Token retrieved: {token[:50]}...")
        return token
    else:
        print(f"  Error: {output}")
        sys.exit(1)


def join_master(ip, name, token):
    """Join master to cluster"""
    print(f"\n  Installing K3s server on {name}...")
    cmd = f"""curl -sfL https://get.k3s.io | K3S_TOKEN='{token}' sh -s - server \\
  --server https://{K3S_MASTER01_IP}:6443 \\
  --disable traefik \\
  --disable servicelb \\
  --node-name {name}"""

    success, output = ssh(ip, cmd, timeout=180)
    if success or "already exists" in output.lower():
        print(f"  K3s server installed on {name}")
        time.sleep(30)
        return True
    print(f"  Installation failed: {output[:200]}")
    return False


def join_worker(ip, name, token):
    """Join worker to cluster"""
    print(f"\n  Installing K3s agent on {name}...")
    cmd = f"""curl -sfL https://get.k3s.io | K3S_TOKEN='{token}' sh -s - agent \\
  --server https://{K3S_MASTER01_IP}:6443 \\
  --node-name {name}"""

    success, output = ssh(ip, cmd, timeout=180)
    if success or "already exists" in output.lower():
        print(f"  K3s agent installed on {name}")
        time.sleep(30)
        return True
    print(f"  Installation failed: {output[:200]}")
    return False


print("="*80)
print("  K3s HA Cluster Automated Provisioning")
print("="*80)
print("\nConfiguration:")
print("  3 Masters: 2 cores, 6GB RAM each")
print("  4 Workers: 2 cores, 6GB RAM each")
print("  Total: 7 nodes, 14 cores, 42GB RAM\n")

# PHASE 1: Update existing VMs
print("\n" + "="*80)
print("  PHASE 1: Update Existing VM Resources")
print("="*80)

for vm in EXISTING_VMS:
    print(f"\nUpdating {vm['name']} (VMID {vm['vmid']})...")
    try:
        config = api_request("GET", f"/nodes/{NODE}/qemu/{vm['vmid']}/config")["data"]
        current_cores = config.get("cores", 0)
        current_memory = config.get("memory", 0)

        print(f"  Current: {current_cores} cores, {current_memory}MB")
        print(f"  Target:  {vm['cores']} cores, {vm['memory']}MB")

        if current_cores == vm['cores'] and current_memory == vm['memory']:
            print("  Already configured")
            continue

        # Shutdown if needed
        if vm_status(vm['vmid']) == 'running':
            print("  Shutting down...")
            ssh(vm['ip'], "sudo shutdown -h now", timeout=10)
            time.sleep(20)
            wait_for_status(vm['vmid'], 'stopped', 90)

        # Update
        print("  Updating configuration...")
        api_request("PUT", f"/nodes/{NODE}/qemu/{vm['vmid']}/config", {
            'cores': vm['cores'],
            'memory': vm['memory']
        })
        print("  Updated")

    except Exception as e:
        print(f"  Error: {e}")

# PHASE 2: Clone new VMs
print("\n" + "="*80)
print("  PHASE 2: Clone New VMs")
print("="*80)

clone_tasks = {}
for vm in NEW_VMS:
    print(f"\nCloning {vm['name']} from VMID {vm['clone_from']}...")
    try:
        # Check if exists
        try:
            vm_status(vm['vmid'])
            print(f"  VM {vm['vmid']} already exists - skipping")
            continue
        except:
            pass

        # Clone
        result = api_request("POST", f"/nodes/{NODE}/qemu/{vm['clone_from']}/clone", {
            'newid': vm['vmid'],
            'name': vm['name'],
            'full': 1
        })
        upid = result["data"]
        clone_tasks[vm['vmid']] = (vm['name'], upid)
        print(f"  Clone started: {upid}")

    except Exception as e:
        print(f"  Error: {e}")

# Wait for clones
print("\nWaiting for clone operations...")
for vmid, (name, upid) in clone_tasks.items():
    print(f"  Waiting for {name}...")
    if wait_for_task(upid):
        print(f"  {name} cloned successfully")

        # Update resources
        api_request("PUT", f"/nodes/{NODE}/qemu/{vmid}/config", {
            'cores': 2,
            'memory': 6144
        })
    else:
        print(f"  {name} clone failed")

# PHASE 3: Configure new VMs
print("\n" + "="*80)
print("  PHASE 3: Configure New VMs")
print("="*80)

# We need to handle this manually since we can't easily get DHCP IPs
print("\nManual configuration required:")
print("The new VMs have been cloned but need network reconfiguration.")
print("For each new VM, you need to:")
print("1. Start the VM")
print("2. Get its console from Proxmox")
print("3. Login as k3s/toor")
print("4. Configure static IP using netplan")
print("")

for vm in NEW_VMS:
    print(f"\n{vm['name']} (VMID {vm['vmid']}, target IP {vm['ip']}):")
    print(f"  sudo hostnamectl set-hostname {vm['name']}")
    print(f"  sudo nano /etc/netplan/50-cloud-init.yaml")
    print(f"  # Set addresses: - {vm['ip']}/24")
    print(f"  # Set gateway: via: {NETWORK_GATEWAY}")
    print(f"  sudo netplan apply")

# Start all new VMs
print("\n\nStarting all new VMs...")
for vm in NEW_VMS:
    try:
        api_request("POST", f"/nodes/{NODE}/qemu/{vm['vmid']}/status/start")
        print(f"  Started {vm['name']}")
    except Exception as e:
        print(f"  Error starting {vm['name']}: {e}")

print("\n\nWaiting for VMs to boot and for you to configure IPs...")
print("Please configure the static IPs now via Proxmox console.")
print("This script will wait 120 seconds, then attempt to continue.")
time.sleep(120)

# PHASE 4: Get K3s token
print("\n" + "="*80)
print("  PHASE 4: Retrieve K3s Token")
print("="*80)

k3s_token = get_k3s_token()

# PHASE 5: Join new masters
print("\n" + "="*80)
print("  PHASE 5: Join New Master Nodes")
print("="*80)

for vm in NEW_VMS:
    if vm['role'] != 'master':
        continue

    print(f"\nJoining {vm['name']} to cluster...")
    if wait_ssh(vm['ip'], 180):
        join_master(vm['ip'], vm['name'], k3s_token)
    else:
        print(f"  SSH not available on {vm['ip']} - skipping")

# PHASE 6: Join new workers
print("\n" + "="*80)
print("  PHASE 6: Join New Worker Nodes")
print("="*80)

for vm in NEW_VMS:
    if vm['role'] != 'worker':
        continue

    print(f"\nJoining {vm['name']} to cluster...")
    if wait_ssh(vm['ip'], 180):
        join_worker(vm['ip'], vm['name'], k3s_token)
    else:
        print(f"  SSH not available on {vm['ip']} - skipping")

# PHASE 7: Verify cluster
print("\n" + "="*80)
print("  PHASE 7: Verify Cluster")
print("="*80)

print("\nWaiting 30 seconds for cluster to stabilize...")
time.sleep(30)

print("\nCluster nodes:")
success, output = ssh(K3S_MASTER01_IP, "kubectl get nodes -o wide")
if success:
    print(output)
    lines = output.strip().split('\n')
    node_count = len(lines) - 1 if len(lines) > 1 else 0
    print(f"\nTotal nodes: {node_count}/7")
else:
    print(f"Error: {output}")

print("\nAll pods:")
success, output = ssh(K3S_MASTER01_IP, "kubectl get pods -A")
if success:
    print(output)

print("\n" + "="*80)
print("  Provisioning Complete")
print("="*80)
print("\nFinal verification:")
print(f"  ssh {K3S_USER}@{K3S_MASTER01_IP} 'kubectl get nodes -o wide'")
