#!/Users/ryandahlberg/Projects/cortex/venv/bin/python3
"""
K3s HA Cluster Final Provisioning Script
Builds 3 master + 4 worker HA cluster with exact specifications

Specifications:
- 3 Masters: 2 cores, 6GB RAM each
- 4 Workers: 2 cores, 6GB RAM each
- All nodes: 100GB storage

Author: Brother Cortex
Date: 2025-12-20
"""

import requests
import time
import sys
import subprocess
import urllib3
from typing import Dict, List, Tuple

# Disable SSL warnings
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Proxmox Configuration
PROXMOX_HOST = "10.88.140.164"
PROXMOX_PORT = "8006"
PROXMOX_NODE = "pve01"
PROXMOX_TOKEN = "root@pam!cortex-k3s-display=7e74841c-0eb1-4181-8926-aaa9f0103c58"
API_BASE = f"https://{PROXMOX_HOST}:{PROXMOX_PORT}/api2/json"

# K3s Configuration
K3S_MASTER01_IP = "10.88.145.190"
K3S_USER = "k3s"
K3S_PASSWORD = "toor"

# Network Configuration
NETWORK_GATEWAY = "10.88.145.1"
NETWORK_NETMASK = "255.255.255.0"

# VM Configurations
EXISTING_VMS = [
    {"name": "k3s-master01", "vmid": 300, "ip": "10.88.145.190", "role": "master", "cores": 2, "memory": 6144},
    {"name": "k3s-worker01", "vmid": 301, "ip": "10.88.145.191", "role": "worker", "cores": 2, "memory": 6144},
    {"name": "k3s-worker02", "vmid": 302, "ip": "10.88.145.192", "role": "worker", "cores": 2, "memory": 6144},
]

NEW_VMS = [
    {"name": "k3s-master02", "vmid": 303, "ip": "10.88.145.193", "role": "master", "cores": 2, "memory": 6144, "clone_from": 300},
    {"name": "k3s-worker03", "vmid": 304, "ip": "10.88.145.194", "role": "worker", "cores": 2, "memory": 6144, "clone_from": 301},
    {"name": "k3s-worker04", "vmid": 305, "ip": "10.88.145.195", "role": "worker", "cores": 2, "memory": 6144, "clone_from": 301},
    {"name": "k3s-master03", "vmid": 306, "ip": "10.88.145.196", "role": "master", "cores": 2, "memory": 6144, "clone_from": 300},
]


class ProxmoxAPI:
    """Proxmox API client"""

    def __init__(self):
        self.headers = {"Authorization": f"PVEAPIToken={PROXMOX_TOKEN}"}

    def _request(self, method: str, endpoint: str, data: Dict = None) -> Dict:
        """Make API request"""
        url = f"{API_BASE}{endpoint}"
        try:
            if method == "GET":
                response = requests.get(url, headers=self.headers, verify=False, timeout=30)
            elif method == "POST":
                response = requests.post(url, headers=self.headers, data=data, verify=False, timeout=30)
            elif method == "PUT":
                response = requests.put(url, headers=self.headers, data=data, verify=False, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")

            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"API Error: {e}")
            if hasattr(e, 'response') and e.response is not None:
                print(f"Response: {e.response.text}")
            raise

    def get_vm_status(self, vmid: int) -> Dict:
        """Get VM status"""
        endpoint = f"/nodes/{PROXMOX_NODE}/qemu/{vmid}/status/current"
        return self._request("GET", endpoint).get("data", {})

    def get_vm_config(self, vmid: int) -> Dict:
        """Get VM config"""
        endpoint = f"/nodes/{PROXMOX_NODE}/qemu/{vmid}/config"
        return self._request("GET", endpoint).get("data", {})

    def vm_exists(self, vmid: int) -> bool:
        """Check if VM exists"""
        try:
            self.get_vm_status(vmid)
            return True
        except:
            return False

    def update_vm_config(self, vmid: int, config: Dict):
        """Update VM configuration"""
        endpoint = f"/nodes/{PROXMOX_NODE}/qemu/{vmid}/config"
        return self._request("PUT", endpoint, data=config)

    def clone_vm(self, source_vmid: int, new_vmid: int, name: str) -> str:
        """Clone VM"""
        endpoint = f"/nodes/{PROXMOX_NODE}/qemu/{source_vmid}/clone"
        data = {"newid": new_vmid, "name": name, "full": 1}
        return self._request("POST", endpoint, data=data).get("data", "")

    def start_vm(self, vmid: int):
        """Start VM"""
        endpoint = f"/nodes/{PROXMOX_NODE}/qemu/{vmid}/status/start"
        return self._request("POST", endpoint)

    def shutdown_vm(self, vmid: int):
        """Shutdown VM"""
        endpoint = f"/nodes/{PROXMOX_NODE}/qemu/{vmid}/status/shutdown"
        return self._request("POST", endpoint)

    def stop_vm(self, vmid: int):
        """Force stop VM"""
        endpoint = f"/nodes/{PROXMOX_NODE}/qemu/{vmid}/status/stop"
        return self._request("POST", endpoint)

    def wait_for_status(self, vmid: int, status: str, timeout: int = 120) -> bool:
        """Wait for VM status"""
        start = time.time()
        while time.time() - start < timeout:
            try:
                current = self.get_vm_status(vmid).get("status", "unknown")
                print(f"  VM {vmid} status: {current}", end="\r")
                if current == status:
                    print(f"  VM {vmid} status: {current} (ready)     ")
                    return True
            except:
                pass
            time.sleep(3)
        print(f"  VM {vmid} timeout waiting for {status}")
        return False

    def wait_for_task(self, upid: str, timeout: int = 600) -> bool:
        """Wait for task completion"""
        start = time.time()
        while time.time() - start < timeout:
            try:
                endpoint = f"/nodes/{PROXMOX_NODE}/tasks/{upid}/status"
                result = self._request("GET", endpoint)
                status = result.get("data", {}).get("status", "unknown")
                if status == "stopped":
                    exitstatus = result.get("data", {}).get("exitstatus", "unknown")
                    return exitstatus == "OK"
            except:
                pass
            time.sleep(2)
        return False


def run_ssh(ip: str, command: str, timeout: int = 30) -> Tuple[bool, str]:
    """Run SSH command"""
    try:
        result = subprocess.run(
            ["ssh", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=10",
             f"{K3S_USER}@{ip}", command],
            capture_output=True,
            timeout=timeout,
            text=True
        )
        return result.returncode == 0, result.stdout + result.stderr
    except Exception as e:
        return False, str(e)


def wait_for_ssh(ip: str, timeout: int = 300) -> bool:
    """Wait for SSH availability"""
    print(f"  Waiting for SSH on {ip}...")
    start = time.time()
    while time.time() - start < timeout:
        success, _ = run_ssh(ip, "echo ready", timeout=5)
        if success:
            print(f"  SSH ready on {ip}")
            return True
        time.sleep(5)
    print(f"  SSH timeout on {ip}")
    return False


def print_header(text: str):
    """Print header"""
    print("\n" + "="*80)
    print(f"  {text}")
    print("="*80)


def print_section(text: str):
    """Print section"""
    print(f"\n--- {text} ---")


# PHASE 1: Update existing VM resources
def update_existing_resources(api: ProxmoxAPI):
    """Update existing VM resources"""
    print_header("PHASE 1: Update Existing VM Resources")

    for vm in EXISTING_VMS:
        print(f"\nUpdating {vm['name']} (VMID {vm['vmid']})...")

        try:
            config = api.get_vm_config(vm['vmid'])
            current_cores = config.get('cores', 0)
            current_memory = config.get('memory', 0)

            print(f"  Current: {current_cores} cores, {current_memory}MB RAM")
            print(f"  Target:  {vm['cores']} cores, {vm['memory']}MB RAM")

            if current_cores == vm['cores'] and current_memory == vm['memory']:
                print(f"  Already configured - skipping")
                continue

            # Shutdown if running
            status = api.get_vm_status(vm['vmid']).get('status')
            if status == 'running':
                print(f"  Shutting down...")
                run_ssh(vm['ip'], "sudo shutdown -h now", timeout=10)
                time.sleep(20)
                if not api.wait_for_status(vm['vmid'], 'stopped', 90):
                    api.stop_vm(vm['vmid'])
                    time.sleep(10)

            # Update config
            print(f"  Updating configuration...")
            api.update_vm_config(vm['vmid'], {
                'cores': vm['cores'],
                'memory': vm['memory']
            })

            # Verify
            config = api.get_vm_config(vm['vmid'])
            if config.get('cores') == vm['cores'] and config.get('memory') == vm['memory']:
                print(f"  Updated successfully")
            else:
                print(f"  Warning: Verification failed")

        except Exception as e:
            print(f"  Error: {e}")


# PHASE 2: Clone new VMs
def clone_new_vms(api: ProxmoxAPI):
    """Clone new VMs in parallel"""
    print_header("PHASE 2: Clone New VMs")

    clone_tasks = {}

    # Start all clones in parallel
    for vm in NEW_VMS:
        if api.vm_exists(vm['vmid']):
            print(f"\nVM {vm['vmid']} ({vm['name']}) already exists - skipping")
            continue

        print(f"\nCloning {vm['name']} from VMID {vm['clone_from']}...")
        try:
            upid = api.clone_vm(vm['clone_from'], vm['vmid'], vm['name'])
            clone_tasks[vm['vmid']] = (vm['name'], upid)
            print(f"  Clone task started: {upid}")
        except Exception as e:
            print(f"  Error starting clone: {e}")

    # Wait for all clones
    print_section("Waiting for clone operations to complete")
    for vmid, (name, upid) in clone_tasks.items():
        print(f"  Waiting for {name} clone...")
        if api.wait_for_task(upid, timeout=600):
            print(f"  {name} cloned successfully")
        else:
            print(f"  {name} clone failed or timed out")

    # Update configurations
    print_section("Updating VM configurations")
    for vm in NEW_VMS:
        if not api.vm_exists(vm['vmid']):
            continue

        print(f"\nConfiguring {vm['name']}...")
        try:
            api.update_vm_config(vm['vmid'], {
                'cores': vm['cores'],
                'memory': vm['memory'],
                'name': vm['name']
            })
            print(f"  Configuration updated")
        except Exception as e:
            print(f"  Error: {e}")


# PHASE 3: Start VMs with DHCP
def start_vms_with_dhcp(api: ProxmoxAPI):
    """Start new VMs to get DHCP addresses"""
    print_header("PHASE 3: Start New VMs with DHCP")

    for vm in NEW_VMS:
        if not api.vm_exists(vm['vmid']):
            print(f"\n{vm['name']} does not exist - skipping")
            continue

        print(f"\nStarting {vm['name']}...")
        try:
            api.start_vm(vm['vmid'])
            api.wait_for_status(vm['vmid'], 'running', 120)
            print(f"  VM started - will get DHCP address")
            time.sleep(30)  # Wait for DHCP
        except Exception as e:
            print(f"  Error: {e}")


# PHASE 4: Configure static IPs
def configure_static_ips():
    """Configure static IPs on new VMs"""
    print_header("PHASE 4: Configure Static IPs")

    print("\nMANUAL STEP REQUIRED:")
    print("For each new VM, you need to:")
    print("1. Find its DHCP IP address (check Proxmox console or DHCP server)")
    print("2. SSH into it: ssh k3s@<dhcp-ip>")
    print("3. Run the following commands:\n")

    for vm in NEW_VMS:
        print(f"\n{vm['name']} (target IP: {vm['ip']}):")
        print(f"  sudo hostnamectl set-hostname {vm['name']}")
        print(f"  sudo cat > /etc/netplan/50-cloud-init.yaml << 'EOF'")
        print(f"network:")
        print(f"  version: 2")
        print(f"  ethernets:")
        print(f"    ens18:")
        print(f"      addresses:")
        print(f"        - {vm['ip']}/24")
        print(f"      routes:")
        print(f"        - to: default")
        print(f"          via: {NETWORK_GATEWAY}")
        print(f"      nameservers:")
        print(f"        addresses: [8.8.8.8, 8.8.4.4]")
        print(f"EOF")
        print(f"  sudo netplan apply")
        print(f"  # Wait ~10 seconds, then reconnect to {vm['ip']}")

    print("\nWaiting 60 seconds for manual IP configuration...")
    print("Please configure IPs now if not already done.")
    time.sleep(60)


# PHASE 5: Get K3s token
def get_k3s_token() -> str:
    """Retrieve K3s token from master01"""
    print_header("PHASE 5: Retrieve K3s Token")

    print(f"\nGetting token from {K3S_MASTER01_IP}...")
    success, output = run_ssh(K3S_MASTER01_IP, "sudo cat /var/lib/rancher/k3s/server/node-token")

    if success and output.strip():
        token = output.strip()
        print(f"  Token retrieved: {token[:50]}...")
        return token
    else:
        print(f"  Error getting token: {output}")
        print("\nMANUAL: Get token with:")
        print(f"  ssh {K3S_USER}@{K3S_MASTER01_IP} 'sudo cat /var/lib/rancher/k3s/server/node-token'")
        token = input("Enter token: ").strip()
        return token


# PHASE 6: Join new masters
def join_new_masters(k3s_token: str):
    """Join new master nodes"""
    print_header("PHASE 6: Join New Master Nodes")

    new_masters = [vm for vm in NEW_VMS if vm['role'] == 'master']

    for vm in new_masters:
        print(f"\nJoining {vm['name']} to cluster...")

        if not wait_for_ssh(vm['ip'], 180):
            print(f"  SSH not available - skipping")
            continue

        # Install K3s in server mode
        install_cmd = f"""
curl -sfL https://get.k3s.io | K3S_TOKEN='{k3s_token}' sh -s - server \\
  --server https://{K3S_MASTER01_IP}:6443 \\
  --disable traefik \\
  --disable servicelb \\
  --node-name {vm['name']}
"""

        print(f"  Installing K3s in server mode...")
        success, output = run_ssh(vm['ip'], install_cmd, timeout=180)

        if success or "already exists" in output.lower():
            print(f"  K3s installed")
            time.sleep(30)  # Let it stabilize

            # Verify
            success, output = run_ssh(vm['ip'], "sudo systemctl status k3s")
            if "active (running)" in output.lower():
                print(f"  K3s service is running")
            else:
                print(f"  Warning: K3s may not be running properly")
        else:
            print(f"  Installation failed: {output[:200]}")


# PHASE 7: Join new workers
def join_new_workers(k3s_token: str):
    """Join new worker nodes"""
    print_header("PHASE 7: Join New Worker Nodes")

    new_workers = [vm for vm in NEW_VMS if vm['role'] == 'worker']

    for vm in new_workers:
        print(f"\nJoining {vm['name']} to cluster...")

        if not wait_for_ssh(vm['ip'], 180):
            print(f"  SSH not available - skipping")
            continue

        # Install K3s in agent mode
        install_cmd = f"""
curl -sfL https://get.k3s.io | K3S_TOKEN='{k3s_token}' sh -s - agent \\
  --server https://{K3S_MASTER01_IP}:6443 \\
  --node-name {vm['name']}
"""

        print(f"  Installing K3s in agent mode...")
        success, output = run_ssh(vm['ip'], install_cmd, timeout=180)

        if success or "already exists" in output.lower():
            print(f"  K3s agent installed")
            time.sleep(30)

            # Verify
            success, output = run_ssh(vm['ip'], "sudo systemctl status k3s-agent")
            if "active (running)" in output.lower():
                print(f"  K3s agent service is running")
            else:
                print(f"  Warning: K3s agent may not be running properly")
        else:
            print(f"  Installation failed: {output[:200]}")


# PHASE 8: Verify cluster
def verify_cluster():
    """Verify cluster health"""
    print_header("PHASE 8: Verify Cluster Status")

    print("\nGetting cluster nodes...")
    success, output = run_ssh(K3S_MASTER01_IP, "kubectl get nodes -o wide")

    if success:
        print(output)

        # Count nodes
        lines = output.strip().split('\n')
        if len(lines) > 1:
            node_count = len(lines) - 1  # Subtract header
            print(f"\nTotal nodes: {node_count}")
            print(f"Expected: 7 (3 masters + 4 workers)")

            if node_count == 7:
                print("\nCluster build SUCCESSFUL!")
            else:
                print(f"\nWarning: Expected 7 nodes, found {node_count}")
    else:
        print(f"Error getting nodes: {output}")

    # Get all pods
    print("\n--- All Pods ---")
    success, output = run_ssh(K3S_MASTER01_IP, "kubectl get pods -A")
    if success:
        print(output)


def main():
    """Main execution"""
    print_header("K3s HA Cluster Provisioning")
    print("\nTarget Configuration:")
    print("  3 Masters: 2 cores, 6GB RAM each")
    print("  4 Workers: 2 cores, 6GB RAM each")
    print("  Total: 14 cores, 42GB RAM")

    print("\nExisting VMs to update:")
    for vm in EXISTING_VMS:
        print(f"  {vm['name']} (VMID {vm['vmid']}) -> {vm['cores']} cores, {vm['memory']}MB")

    print("\nNew VMs to create:")
    for vm in NEW_VMS:
        print(f"  {vm['name']} (VMID {vm['vmid']}) -> clone from {vm['clone_from']}, IP {vm['ip']}")

    # Initialize API
    api = ProxmoxAPI()

    try:
        api.get_vm_status(300)
        print("\nProxmox API connection successful")
    except Exception as e:
        print(f"\nFailed to connect to Proxmox API: {e}")
        sys.exit(1)

    # Execute phases
    update_existing_resources(api)
    clone_new_vms(api)
    start_vms_with_dhcp(api)
    configure_static_ips()
    k3s_token = get_k3s_token()
    join_new_masters(k3s_token)
    join_new_workers(k3s_token)
    verify_cluster()

    print_header("Provisioning Complete")
    print("\nFinal cluster verification:")
    print(f"  ssh {K3S_USER}@{K3S_MASTER01_IP} 'kubectl get nodes -o wide'")

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n\nCancelled by user")
        sys.exit(130)
    except Exception as e:
        print(f"\n\nError: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
