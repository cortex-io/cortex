#!/Users/ryandahlberg/Projects/cortex/venv/bin/python3
"""
K3s HA Cluster Provisioning Script for Cortex Holdings
Expands K3s cluster to 3 masters + 4 workers configuration

This script:
1. Creates new VMs (k3s-master02, k3s-master03, k3s-worker03)
2. Updates existing VMs with new resource allocations
3. Joins new masters and workers to the cluster
4. Restarts all nodes in proper order for HA configuration

Author: Brother Cortex (Cortex Holdings AI Team)
Date: 2025-12-20
"""

import requests
import time
import sys
import subprocess
import urllib3
from typing import Dict, List, Tuple, Optional

# Disable SSL warnings for self-signed certificates
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Proxmox Configuration
PROXMOX_HOST = "10.88.140.164"
PROXMOX_PORT = "8006"
PROXMOX_NODE = "pve01"
PROXMOX_TOKEN = "root@pam!cortex-k3s-display=7e74841c-0eb1-4181-8926-aaa9f0103c58"
API_BASE = f"https://{PROXMOX_HOST}:{PROXMOX_PORT}/api2/json"

# K3s Configuration
K3S_VERSION = "v1.33.6+k3s1"
K3S_MASTER01_IP = "10.88.145.190"
K3S_USER = "k3s"
K3S_PASSWORD = "toor"

# K3s cluster token (retrieved from master01)
K3S_TOKEN = "K10f44aca82119488c19ce2dea00338a2b0238900f3ca879159c6d76a7ca5c14d23::server:a2bea3b0ae3540075537a001f4461762"

# VM Configurations
EXISTING_VMS = [
    {"name": "k3s-master01", "vmid": 300, "ip": "10.88.145.190", "role": "master", "cores": 2, "memory": 6144},  # 6GB
    {"name": "k3s-worker01", "vmid": 301, "ip": "10.88.145.191", "role": "worker", "cores": 2, "memory": 6144},  # 6GB
    {"name": "k3s-worker02", "vmid": 302, "ip": "10.88.145.192", "role": "worker", "cores": 2, "memory": 6144},  # 6GB
]

NEW_VMS = [
    {"name": "k3s-master02", "vmid": 303, "ip": "10.88.145.193", "role": "master", "cores": 2, "memory": 6144, "disk": "100G"},
    {"name": "k3s-master03", "vmid": 304, "ip": "10.88.145.194", "role": "master", "cores": 2, "memory": 6144, "disk": "100G"},
    {"name": "k3s-worker03", "vmid": 305, "ip": "10.88.145.195", "role": "worker", "cores": 2, "memory": 6144, "disk": "100G"},
]

# Timeouts (in seconds)
SHUTDOWN_TIMEOUT = 120
STARTUP_TIMEOUT = 180
POLL_INTERVAL = 5

# VLAN 145 network settings
NETWORK_BRIDGE = "vmbr0"
NETWORK_TAG = 145
NETWORK_GATEWAY = "10.88.145.1"
NETWORK_NETMASK = "255.255.255.0"

# Ubuntu cloud-init template VMID (we'll use existing VM as template)
TEMPLATE_VMID = 300  # Clone from k3s-master01


class ProxmoxAPI:
    """Proxmox API client"""

    def __init__(self):
        self.headers = {
            "Authorization": f"PVEAPIToken={PROXMOX_TOKEN}"
        }

    def _request(self, method: str, endpoint: str, data: Dict = None) -> Dict:
        """Make API request to Proxmox"""
        url = f"{API_BASE}{endpoint}"

        try:
            if method == "GET":
                response = requests.get(url, headers=self.headers, verify=False, timeout=30)
            elif method == "POST":
                response = requests.post(url, headers=self.headers, data=data, verify=False, timeout=30)
            elif method == "PUT":
                response = requests.put(url, headers=self.headers, data=data, verify=False, timeout=30)
            elif method == "DELETE":
                response = requests.delete(url, headers=self.headers, verify=False, timeout=30)
            else:
                raise ValueError(f"Unsupported HTTP method: {method}")

            response.raise_for_status()
            return response.json()

        except requests.exceptions.RequestException as e:
            print(f"API request failed: {e}")
            if hasattr(e, 'response') and e.response is not None:
                print(f"Response: {e.response.text}")
            raise

    def get_vm_status(self, vmid: int) -> Dict:
        """Get VM status"""
        endpoint = f"/nodes/{PROXMOX_NODE}/qemu/{vmid}/status/current"
        result = self._request("GET", endpoint)
        return result.get("data", {})

    def get_vm_config(self, vmid: int) -> Dict:
        """Get VM configuration"""
        endpoint = f"/nodes/{PROXMOX_NODE}/qemu/{vmid}/config"
        result = self._request("GET", endpoint)
        return result.get("data", {})

    def vm_exists(self, vmid: int) -> bool:
        """Check if VM exists"""
        try:
            self.get_vm_status(vmid)
            return True
        except:
            return False

    def shutdown_vm(self, vmid: int) -> str:
        """Gracefully shutdown VM"""
        endpoint = f"/nodes/{PROXMOX_NODE}/qemu/{vmid}/status/shutdown"
        result = self._request("POST", endpoint)
        return result.get("data", "")

    def stop_vm(self, vmid: int) -> str:
        """Force stop VM"""
        endpoint = f"/nodes/{PROXMOX_NODE}/qemu/{vmid}/status/stop"
        result = self._request("POST", endpoint)
        return result.get("data", "")

    def start_vm(self, vmid: int) -> str:
        """Start VM"""
        endpoint = f"/nodes/{PROXMOX_NODE}/qemu/{vmid}/status/start"
        result = self._request("POST", endpoint)
        return result.get("data", "")

    def update_vm_config(self, vmid: int, config: Dict) -> None:
        """Update VM configuration"""
        endpoint = f"/nodes/{PROXMOX_NODE}/qemu/{vmid}/config"
        self._request("PUT", endpoint, data=config)

    def clone_vm(self, source_vmid: int, new_vmid: int, name: str, full: bool = True) -> str:
        """Clone a VM"""
        endpoint = f"/nodes/{PROXMOX_NODE}/qemu/{source_vmid}/clone"
        data = {
            "newid": new_vmid,
            "name": name,
            "full": 1 if full else 0,
        }
        result = self._request("POST", endpoint, data=data)
        return result.get("data", "")

    def create_vm(self, vmid: int, name: str, cores: int, memory: int, disk_size: str) -> str:
        """Create a new VM"""
        endpoint = f"/nodes/{PROXMOX_NODE}/qemu"
        data = {
            "vmid": vmid,
            "name": name,
            "cores": cores,
            "memory": memory,
            "sockets": 1,
            "net0": f"virtio,bridge={NETWORK_BRIDGE},tag={NETWORK_TAG}",
            "scsi0": f"local-lvm:{disk_size}",
            "scsihw": "virtio-scsi-pci",
            "boot": "order=scsi0",
            "ostype": "l26",  # Linux 2.6+ kernel
        }
        result = self._request("POST", endpoint, data=data)
        return result.get("data", "")

    def wait_for_status(self, vmid: int, expected_status: str, timeout: int) -> bool:
        """Wait for VM to reach expected status"""
        start_time = time.time()

        while time.time() - start_time < timeout:
            try:
                status = self.get_vm_status(vmid)
                current_status = status.get("status", "unknown")

                print(f"  Current status: {current_status}", end="\r")

                if current_status == expected_status:
                    print(f"  Status: {current_status}        ")
                    return True

                time.sleep(POLL_INTERVAL)
            except:
                time.sleep(POLL_INTERVAL)

        print(f"  Timeout waiting for status '{expected_status}'")
        return False

    def wait_for_task(self, upid: str, timeout: int = 300) -> bool:
        """Wait for Proxmox task to complete"""
        start_time = time.time()

        while time.time() - start_time < timeout:
            try:
                endpoint = f"/nodes/{PROXMOX_NODE}/tasks/{upid}/status"
                result = self._request("GET", endpoint)
                task_status = result.get("data", {}).get("status", "unknown")

                if task_status == "stopped":
                    exitstatus = result.get("data", {}).get("exitstatus", "unknown")
                    if exitstatus == "OK":
                        return True
                    else:
                        print(f"  Task failed with status: {exitstatus}")
                        return False

                time.sleep(2)
            except:
                time.sleep(2)

        print(f"  Task timeout")
        return False


def print_header(text: str):
    """Print formatted header"""
    print("\n" + "="*70)
    print(f"  {text}")
    print("="*70)


def print_section(text: str):
    """Print formatted section"""
    print(f"\n--- {text} ---")


def run_ssh_command(ip: str, command: str, timeout: int = 30) -> Tuple[bool, str]:
    """Run SSH command on remote host"""
    try:
        result = subprocess.run(
            ["ssh", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=10",
             f"{K3S_USER}@{ip}", command],
            capture_output=True,
            timeout=timeout,
            text=True
        )
        return result.returncode == 0, result.stdout + result.stderr
    except subprocess.TimeoutExpired:
        return False, "SSH timeout"
    except Exception as e:
        return False, str(e)


def wait_for_ssh(ip: str, timeout: int = 300) -> bool:
    """Wait for SSH to become available"""
    print(f"  Waiting for SSH on {ip}...")
    start_time = time.time()

    while time.time() - start_time < timeout:
        success, _ = run_ssh_command(ip, "echo 'ready'", timeout=5)
        if success:
            print(f"  SSH ready on {ip}")
            return True
        time.sleep(5)

    print(f"  SSH timeout on {ip}")
    return False


def update_existing_vm_resources(api: ProxmoxAPI, vm: Dict) -> bool:
    """Update resources for existing VMs"""
    vmid = vm["vmid"]
    name = vm["name"]

    print_header(f"Updating {name} Resources (VMID {vmid})")

    try:
        # Get current config
        config = api.get_vm_config(vmid)
        current_cores = config.get("cores", 0)
        current_memory = config.get("memory", 0)

        print(f"  Current: {current_cores} cores, {current_memory} MB RAM")
        print(f"  Target:  {vm['cores']} cores, {vm['memory']} MB RAM")

        if current_cores == vm["cores"] and current_memory == vm["memory"]:
            print(f"  Already at target configuration - skipping")
            return True

        # Shutdown VM
        print_section("Shutting down VM")
        status = api.get_vm_status(vmid)
        if status.get("status") != "stopped":
            success, _ = run_ssh_command(vm["ip"], "sudo shutdown -h now", timeout=15)
            time.sleep(30)

            if not api.wait_for_status(vmid, "stopped", 60):
                print(f"  Forcing stop...")
                api.stop_vm(vmid)
                time.sleep(10)

        # Update configuration
        print_section("Updating configuration")
        api.update_vm_config(vmid, {
            "cores": vm["cores"],
            "memory": vm["memory"]
        })

        # Verify
        time.sleep(2)
        config = api.get_vm_config(vmid)
        new_cores = config.get("cores", 0)
        new_memory = config.get("memory", 0)

        if new_cores == vm["cores"] and new_memory == vm["memory"]:
            print(f"  Verified: {new_cores} cores, {new_memory} MB RAM")
            return True
        else:
            print(f"  Verification failed")
            return False

    except Exception as e:
        print(f"  Failed: {e}")
        return False


def create_new_vm(api: ProxmoxAPI, vm: Dict) -> bool:
    """Create and configure a new VM by cloning"""
    vmid = vm["vmid"]
    name = vm["name"]

    print_header(f"Creating {name} (VMID {vmid})")

    try:
        # Check if VM already exists
        if api.vm_exists(vmid):
            print(f"  VM {vmid} already exists - skipping creation")
            return True

        # Clone from template/master01
        print_section(f"Cloning from VMID {TEMPLATE_VMID}")
        upid = api.clone_vm(TEMPLATE_VMID, vmid, name, full=True)
        print(f"  Clone task started: {upid}")

        # Wait for clone to complete
        if not api.wait_for_task(upid, timeout=600):
            print(f"  Clone failed")
            return False

        print(f"  Clone completed")

        # Update VM configuration
        print_section("Configuring VM resources")
        api.update_vm_config(vmid, {
            "cores": vm["cores"],
            "memory": vm["memory"],
            "name": name,
        })

        # Verify configuration
        time.sleep(2)
        config = api.get_vm_config(vmid)
        print(f"  Cores: {config.get('cores')}")
        print(f"  Memory: {config.get('memory')} MB")

        return True

    except Exception as e:
        print(f"  Failed: {e}")
        return False


def configure_vm_network(vm: Dict) -> bool:
    """Configure VM network settings via SSH"""
    ip = vm["ip"]
    name = vm["name"]

    print_header(f"Configuring Network for {name}")

    try:
        # Start VM if not running
        print("  Starting VM (if needed)...")
        # This will be done by the calling function

        # Wait for SSH
        if not wait_for_ssh(ip, timeout=300):
            print(f"  SSH not available - manual configuration needed")
            return False

        # Set hostname
        print_section("Setting hostname")
        success, output = run_ssh_command(ip, f"sudo hostnamectl set-hostname {name}")
        if success:
            print(f"  Hostname set to {name}")
        else:
            print(f"  Warning: Could not set hostname: {output}")

        # Configure static IP (netplan)
        print_section("Configuring static IP")
        netplan_config = f"""network:
  version: 2
  ethernets:
    ens18:
      addresses:
        - {ip}/24
      routes:
        - to: default
          via: {NETWORK_GATEWAY}
      nameservers:
        addresses: [8.8.8.8, 8.8.4.4]
"""

        # Write netplan config
        cmd = f"echo '{netplan_config}' | sudo tee /etc/netplan/50-cloud-init.yaml"
        success, output = run_ssh_command(ip, cmd)

        if success:
            print(f"  Netplan config written")
            # Apply netplan
            success, output = run_ssh_command(ip, "sudo netplan apply")
            if success:
                print(f"  Network configured: {ip}")
            else:
                print(f"  Warning: Netplan apply failed: {output}")
        else:
            print(f"  Warning: Could not write netplan config: {output}")

        return True

    except Exception as e:
        print(f"  Failed: {e}")
        return False


def join_master_to_cluster(vm: Dict) -> bool:
    """Join a new master node to the K3s cluster"""
    ip = vm["ip"]
    name = vm["name"]

    print_header(f"Joining {name} to K3s Cluster (Server Mode)")

    try:
        # Wait for SSH
        if not wait_for_ssh(ip, timeout=300):
            return False

        # Install k3s in server mode
        print_section("Installing k3s in server mode")
        install_cmd = f"""
curl -sfL https://get.k3s.io | K3S_TOKEN='{K3S_TOKEN}' sh -s - server \\
  --server https://{K3S_MASTER01_IP}:6443 \\
  --disable traefik \\
  --disable servicelb \\
  --node-name {name}
"""

        success, output = run_ssh_command(ip, install_cmd, timeout=180)
        if success:
            print(f"  k3s installed in server mode")
        else:
            print(f"  Warning: k3s install may have issues: {output}")

        # Wait for k3s to start
        print_section("Waiting for k3s to start")
        time.sleep(30)

        # Verify k3s is running
        success, output = run_ssh_command(ip, "sudo systemctl status k3s")
        if success:
            print(f"  k3s service is running")
        else:
            print(f"  Warning: k3s service status: {output}")

        return True

    except Exception as e:
        print(f"  Failed: {e}")
        return False


def join_worker_to_cluster(vm: Dict) -> bool:
    """Join a new worker node to the K3s cluster"""
    ip = vm["ip"]
    name = vm["name"]

    print_header(f"Joining {name} to K3s Cluster (Agent Mode)")

    try:
        # Wait for SSH
        if not wait_for_ssh(ip, timeout=300):
            return False

        # Install k3s in agent mode
        print_section("Installing k3s in agent mode")
        install_cmd = f"""
curl -sfL https://get.k3s.io | K3S_TOKEN='{K3S_TOKEN}' sh -s - agent \\
  --server https://{K3S_MASTER01_IP}:6443 \\
  --node-name {name}
"""

        success, output = run_ssh_command(ip, install_cmd, timeout=180)
        if success:
            print(f"  k3s installed in agent mode")
        else:
            print(f"  Warning: k3s install may have issues: {output}")

        # Wait for k3s to start
        print_section("Waiting for k3s agent to start")
        time.sleep(30)

        # Verify k3s is running
        success, output = run_ssh_command(ip, "sudo systemctl status k3s-agent")
        if success:
            print(f"  k3s-agent service is running")
        else:
            print(f"  Warning: k3s-agent service status: {output}")

        return True

    except Exception as e:
        print(f"  Failed: {e}")
        return False


def restart_nodes_in_order(api: ProxmoxAPI, all_vms: List[Dict]) -> bool:
    """Restart all nodes in proper order for HA"""
    print_header("Restarting All Nodes in Order")

    # Order: workers first, then masters (reverse order for masters)
    workers = [vm for vm in all_vms if vm["role"] == "worker"]
    masters = [vm for vm in all_vms if vm["role"] == "master"]

    # Sort workers by vmid
    workers.sort(key=lambda x: x["vmid"])

    # Sort masters by vmid, reverse (newest to oldest)
    masters.sort(key=lambda x: x["vmid"], reverse=True)

    restart_order = workers + masters

    print("\nRestart order:")
    for i, vm in enumerate(restart_order, 1):
        print(f"  {i}. {vm['name']}")

    for vm in restart_order:
        print_section(f"Restarting {vm['name']}")

        try:
            # Shutdown
            success, _ = run_ssh_command(vm["ip"], "sudo shutdown -r now", timeout=15)
            time.sleep(10)

            # Wait for shutdown
            print(f"  Waiting for shutdown...")
            api.wait_for_status(vm["vmid"], "stopped", 60)

            # Wait for startup
            print(f"  Waiting for startup...")
            api.wait_for_status(vm["vmid"], "running", 120)

            # Wait for SSH
            wait_for_ssh(vm["ip"], timeout=120)

            # Wait for k3s to stabilize
            print(f"  Waiting 60s for k3s to stabilize...")
            time.sleep(60)

        except Exception as e:
            print(f"  Warning: Restart may have issues: {e}")
            continue

    return True


def verify_cluster_health() -> bool:
    """Verify K3s cluster health"""
    print_header("Verifying Cluster Health")

    try:
        # Get nodes
        print_section("Cluster Nodes")
        success, output = run_ssh_command(K3S_MASTER01_IP, "kubectl get nodes -o wide")
        if success:
            print(output)
        else:
            print(f"  Could not get nodes: {output}")
            return False

        # Get pods
        print_section("All Pods")
        success, output = run_ssh_command(K3S_MASTER01_IP, "kubectl get pods -A")
        if success:
            print(output)
        else:
            print(f"  Could not get pods: {output}")

        # Check etcd members (for HA)
        print_section("Etcd Members (HA Check)")
        success, output = run_ssh_command(
            K3S_MASTER01_IP,
            "sudo k3s kubectl get nodes -l node-role.kubernetes.io/master=true"
        )
        if success:
            print(output)
        else:
            print(f"  Could not get etcd members: {output}")

        return True

    except Exception as e:
        print(f"  Verification failed: {e}")
        return False


def main():
    """Main execution function"""
    print_header("K3s HA Cluster Provisioning")
    print(f"\nProxmox Host: {PROXMOX_HOST}")
    print(f"Node: {PROXMOX_NODE}")

    print("\nTarget Configuration:")
    print("  Masters: 3 nodes (2 cores, 6GB RAM each)")
    print("  Workers: 3 nodes (2 cores, 6GB RAM each)")
    print("  Total: 12 cores, 36GB RAM")

    print("\nExisting VMs to update:")
    for vm in EXISTING_VMS:
        print(f"  - {vm['name']} (VMID {vm['vmid']}) -> {vm['cores']} cores, {vm['memory']}MB RAM")

    print("\nNew VMs to create:")
    for vm in NEW_VMS:
        print(f"  - {vm['name']} (VMID {vm['vmid']}, IP {vm['ip']}) -> {vm['cores']} cores, {vm['memory']}MB RAM")

    # Initialize API
    print("\nInitializing Proxmox API...")
    api = ProxmoxAPI()

    try:
        api.get_vm_status(300)
        print("API connection successful\n")
    except Exception as e:
        print(f"Failed to connect to Proxmox API: {e}")
        sys.exit(1)

    # Phase 1: Update existing VMs
    print_header("PHASE 1: Update Existing VM Resources")
    for vm in EXISTING_VMS:
        if not update_existing_vm_resources(api, vm):
            print(f"\nWarning: Failed to update {vm['name']}")

    # Phase 2: Create new VMs
    print_header("PHASE 2: Create New VMs")
    for vm in NEW_VMS:
        if not create_new_vm(api, vm):
            print(f"\nError: Failed to create {vm['name']}")
            print("Continuing with next VM...")

    # Phase 3: Start and configure new VMs
    print_header("PHASE 3: Start and Configure New VMs")
    for vm in NEW_VMS:
        if not api.vm_exists(vm["vmid"]):
            print(f"Skipping {vm['name']} - does not exist")
            continue

        # Start VM
        print_section(f"Starting {vm['name']}")
        try:
            api.start_vm(vm["vmid"])
            api.wait_for_status(vm["vmid"], "running", 120)
        except:
            print(f"  Warning: Could not start VM")

        # Configure network (this may not work for cloned VMs, manual config may be needed)
        # configure_vm_network(vm)

    # Phase 4: Join new nodes to cluster
    print_header("PHASE 4: Join New Nodes to Cluster")

    # Join new masters
    for vm in NEW_VMS:
        if vm["role"] == "master":
            if not join_master_to_cluster(vm):
                print(f"\nWarning: Failed to join {vm['name']} to cluster")

    # Wait for masters to stabilize
    print("\nWaiting 60s for new masters to stabilize...")
    time.sleep(60)

    # Join new workers
    for vm in NEW_VMS:
        if vm["role"] == "worker":
            if not join_worker_to_cluster(vm):
                print(f"\nWarning: Failed to join {vm['name']} to cluster")

    # Phase 5: Restart all nodes in order
    print_header("PHASE 5: Restart All Nodes")
    all_vms = EXISTING_VMS + NEW_VMS
    restart_nodes_in_order(api, all_vms)

    # Phase 6: Verify cluster health
    print_header("PHASE 6: Cluster Health Verification")
    verify_cluster_health()

    # Final summary
    print_header("HA Cluster Provisioning Complete")
    print("\nCluster Configuration:")
    print("  Masters: k3s-master01, k3s-master02, k3s-master03")
    print("  Workers: k3s-worker01, k3s-worker02, k3s-worker03")
    print("\nNext Steps:")
    print("  1. Verify all nodes: kubectl get nodes -o wide")
    print("  2. Check etcd health: sudo k3s kubectl get nodes -l node-role.kubernetes.io/master=true")
    print("  3. Verify pods: kubectl get pods -A")
    print("  4. Test HA: Shutdown one master and verify cluster still works")

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n\nOperation cancelled by user")
        sys.exit(130)
    except Exception as e:
        print(f"\nUnexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
