#!/Users/ryandahlberg/Projects/cortex/venv/bin/python3
"""
Configure IP addresses for 4 new K3s VMs using direct console commands via Proxmox API
This script logs into each VM console and executes the IP configuration commands
"""
import requests
import urllib3
import time
import sys
import subprocess
import json

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Proxmox Configuration
PROXMOX_HOST = "10.88.140.164"
PROXMOX_TOKEN = "root@pam!cortex-k3s-display=7e74841c-0eb1-4181-8926-aaa9f0103c58"
API_BASE = f"https://{PROXMOX_HOST}:8006/api2/json"
NODE = "pve01"

# VM Credentials
K3S_USER = "k3s"
K3S_PASSWORD = "toor"

headers = {"Authorization": f"PVEAPIToken={PROXMOX_TOKEN}"}

# VM configurations with IP mapping
VMS = [
    {"vmid": 303, "name": "k3s-master02", "old_ip": "10.88.145.190", "new_ip": "10.88.145.193"},
    {"vmid": 304, "name": "k3s-worker03", "old_ip": "10.88.145.191", "new_ip": "10.88.145.194"},
    {"vmid": 305, "name": "k3s-worker04", "old_ip": "10.88.145.191", "new_ip": "10.88.145.195"},
    {"vmid": 306, "name": "k3s-master03", "old_ip": "10.88.145.190", "new_ip": "10.88.145.196"},
]


def proxmox_request(method, endpoint, data=None):
    """Make Proxmox API request"""
    url = f"{API_BASE}{endpoint}"
    try:
        if method == "GET":
            r = requests.get(url, headers=headers, verify=False, timeout=30)
        elif method == "POST":
            r = requests.post(url, headers=headers, data=data, verify=False, timeout=30)
        elif method == "PUT":
            r = requests.put(url, headers=headers, data=data, verify=False, timeout=30)
        else:
            raise ValueError(f"Unsupported method: {method}")

        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"  API Error: {e}")
        if hasattr(e, 'response') and e.response:
            print(f"  Response: {e.response.text}")
        raise


def get_vm_status(vmid):
    """Get VM status"""
    result = proxmox_request("GET", f"/nodes/{NODE}/qemu/{vmid}/status/current")
    return result.get("data", {})


def start_vm(vmid):
    """Start VM"""
    print(f"  Starting VM {vmid}...")
    proxmox_request("POST", f"/nodes/{NODE}/qemu/{vmid}/status/start")
    time.sleep(20)

    # Wait for running status
    for i in range(30):
        status = get_vm_status(vmid)
        if status.get("status") == "running":
            print(f"  VM {vmid} is running")
            return True
        time.sleep(2)

    print(f"  Warning: VM {vmid} may not have started")
    return False


def wait_for_ssh(ip, timeout=180):
    """Wait for SSH to become available"""
    print(f"  Waiting for SSH on {ip}...")
    start_time = time.time()

    while time.time() - start_time < timeout:
        try:
            result = subprocess.run(
                ["ssh", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=5",
                 f"{K3S_USER}@{ip}", "echo ready"],
                capture_output=True,
                timeout=10,
                text=True
            )
            if result.returncode == 0:
                print(f"  SSH ready on {ip}")
                return True
        except:
            pass
        time.sleep(5)

    print(f"  SSH timeout on {ip}")
    return False


def run_ssh_command(ip, command, timeout=30):
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


def configure_vm_ip(vm):
    """Configure IP address for a VM via SSH"""
    vmid = vm["vmid"]
    name = vm["name"]
    old_ip = vm["old_ip"]
    new_ip = vm["new_ip"]

    print(f"\n{'='*70}")
    print(f"Configuring {name} (VMID {vmid}): {old_ip} -> {new_ip}")
    print(f"{'='*70}")

    # Ensure VM is running
    status = get_vm_status(vmid)
    if status.get("status") != "running":
        if not start_vm(vmid):
            print(f"  ERROR: Could not start VM {vmid}")
            return False
    else:
        print(f"  VM {vmid} is already running")

    # Wait for VM to be accessible (try old IP first since it's a clone)
    # VMs may have conflicting IPs, so we'll use a manual approach
    print(f"\n  Attempting to configure via SSH on {old_ip}...")

    # Try to wait for SSH on old IP
    ssh_ready = wait_for_ssh(old_ip, timeout=60)

    if not ssh_ready:
        print(f"\n  Cannot access VM via SSH (expected due to IP conflicts)")
        print(f"  Manual console configuration required")
        print(f"\n  MANUAL STEPS for VM {vmid} ({name}):")
        print(f"  1. Open Proxmox console: https://{PROXMOX_HOST}:8006")
        print(f"  2. Navigate to VM {vmid} and open Console")
        print(f"  3. Login: {K3S_USER} / {K3S_PASSWORD}")
        print(f"  4. Run these commands:")
        print(f"")
        print(f"     sudo sed -i 's/{old_ip}/{new_ip}/g' /etc/netplan/00-installer-config.yaml")
        print(f"     sudo hostnamectl set-hostname {name}")
        print(f"     sudo netplan apply")
        print(f"     sudo reboot")
        print(f"")
        return False

    # If SSH is accessible, configure automatically
    print(f"  SSH accessible - configuring automatically...")

    # Update netplan config
    print(f"  Updating netplan configuration...")
    cmd = f"sudo sed -i 's/{old_ip}/{new_ip}/g' /etc/netplan/00-installer-config.yaml"
    success, output = run_ssh_command(old_ip, cmd)

    if not success:
        print(f"  ERROR: Failed to update netplan: {output}")
        return False

    # Set hostname
    print(f"  Setting hostname to {name}...")
    success, output = run_ssh_command(old_ip, f"sudo hostnamectl set-hostname {name}")

    if not success:
        print(f"  WARNING: Failed to set hostname: {output}")

    # Apply netplan
    print(f"  Applying netplan configuration...")
    success, output = run_ssh_command(old_ip, "sudo netplan apply")

    if not success:
        print(f"  WARNING: Netplan apply may have failed: {output}")

    # Reboot
    print(f"  Rebooting VM...")
    run_ssh_command(old_ip, "sudo reboot")
    time.sleep(30)

    # Verify new IP
    print(f"\n  Verifying new IP {new_ip}...")
    if wait_for_ssh(new_ip, timeout=120):
        success, hostname = run_ssh_command(new_ip, "hostname")
        if success:
            print(f"  SUCCESS: {name} is now at {new_ip} with hostname: {hostname.strip()}")
            return True
        else:
            print(f"  WARNING: SSH works but hostname verification failed")
            return True
    else:
        print(f"  WARNING: Cannot verify SSH at {new_ip}")
        return False


def retrieve_k3s_token():
    """Retrieve K3s join token from master node"""
    print(f"\n{'='*70}")
    print("Retrieving K3s Join Token")
    print(f"{'='*70}")

    master_ip = "10.88.145.190"  # k3s-master01

    print(f"  Connecting to k3s-master01 ({master_ip})...")

    # Get token
    success, output = run_ssh_command(
        master_ip,
        "sudo cat /var/lib/rancher/k3s/server/node-token",
        timeout=15
    )

    if success:
        token = output.strip()
        print(f"  K3s Token: {token}")
        return token
    else:
        print(f"  ERROR: Could not retrieve token: {output}")
        return None


def join_node_to_cluster(vm, k3s_token, role="worker"):
    """Join a node to the K3s cluster"""
    vmid = vm["vmid"]
    name = vm["name"]
    new_ip = vm["new_ip"]

    print(f"\n{'='*70}")
    print(f"Joining {name} to K3s Cluster ({role} mode)")
    print(f"{'='*70}")

    # Wait for SSH
    if not wait_for_ssh(new_ip, timeout=120):
        print(f"  ERROR: Cannot access {name} at {new_ip}")
        return False

    master_ip = "10.88.145.190"

    if role == "master":
        # Join as server
        print(f"  Installing K3s in server mode...")
        install_cmd = f"""curl -sfL https://get.k3s.io | K3S_TOKEN='{k3s_token}' sh -s - server \\
  --server https://{master_ip}:6443 \\
  --disable traefik \\
  --disable servicelb \\
  --node-name {name}"""
    else:
        # Join as agent
        print(f"  Installing K3s in agent mode...")
        install_cmd = f"""curl -sfL https://get.k3s.io | K3S_TOKEN='{k3s_token}' sh -s - agent \\
  --server https://{master_ip}:6443 \\
  --node-name {name}"""

    success, output = run_ssh_command(new_ip, install_cmd, timeout=300)

    if success:
        print(f"  K3s installed successfully")
        print(f"  Waiting 30s for K3s to start...")
        time.sleep(30)

        # Verify service
        service_name = "k3s" if role == "master" else "k3s-agent"
        success, output = run_ssh_command(new_ip, f"sudo systemctl status {service_name}")

        if success:
            print(f"  {service_name} service is running")
        else:
            print(f"  WARNING: {service_name} service status: {output}")

        return True
    else:
        print(f"  ERROR: K3s installation failed: {output}")
        return False


def verify_cluster():
    """Verify cluster nodes"""
    print(f"\n{'='*70}")
    print("Final Cluster Verification")
    print(f"{'='*70}")

    master_ip = "10.88.145.190"

    print(f"\n  Getting cluster nodes...")
    success, output = run_ssh_command(master_ip, "kubectl get nodes -o wide", timeout=30)

    if success:
        print("\n" + output)

        # Count nodes
        lines = output.strip().split('\n')
        if len(lines) > 1:
            node_count = len(lines) - 1  # Subtract header
            print(f"\n  Total nodes: {node_count}")

            if node_count == 7:
                print(f"  SUCCESS: All 7 nodes are in the cluster!")
            else:
                print(f"  WARNING: Expected 7 nodes, found {node_count}")

        return True
    else:
        print(f"  ERROR: Could not get cluster nodes: {output}")
        return False


def main():
    """Main execution"""
    print("="*70)
    print("K3s VM IP Configuration and Cluster Join Script")
    print("="*70)

    print("\nVMs to configure:")
    for vm in VMS:
        role = "master" if "master" in vm["name"] else "worker"
        print(f"  - {vm['name']} (VMID {vm['vmid']}): {vm['old_ip']} -> {vm['new_ip']} [{role}]")

    print("\n" + "="*70)
    print("PHASE 1: Configure IP Addresses")
    print("="*70)

    # Track results
    configured_vms = []
    manual_vms = []

    # Configure each VM
    for vm in VMS:
        success = configure_vm_ip(vm)
        if success:
            configured_vms.append(vm)
        else:
            manual_vms.append(vm)

    # If manual configuration needed, pause
    if manual_vms:
        print(f"\n{'='*70}")
        print("Manual Configuration Required")
        print(f"{'='*70}")

        print(f"\n{len(manual_vms)} VM(s) need manual console configuration:")
        for vm in manual_vms:
            print(f"  - {vm['name']} (VMID {vm['vmid']})")

        print("\nPlease complete manual configuration for these VMs.")
        input("\nPress Enter once all manual configurations are complete...")

        # Verify manually configured VMs
        print("\nVerifying manually configured VMs...")
        for vm in manual_vms:
            if wait_for_ssh(vm["new_ip"], timeout=60):
                print(f"  {vm['name']}: SSH accessible at {vm['new_ip']}")
                configured_vms.append(vm)
            else:
                print(f"  WARNING: {vm['name']} not accessible at {vm['new_ip']}")

    # Summary of IP configuration
    print(f"\n{'='*70}")
    print("IP Configuration Summary")
    print(f"{'='*70}")

    for vm in VMS:
        if vm in configured_vms:
            print(f"  {vm['name']}: CONFIGURED at {vm['new_ip']}")
        else:
            print(f"  {vm['name']}: FAILED - needs attention")

    # Retrieve K3s token
    print(f"\n{'='*70}")
    print("PHASE 2: Join Nodes to Cluster")
    print(f"{'='*70}")

    k3s_token = retrieve_k3s_token()

    if not k3s_token:
        print("\nERROR: Could not retrieve K3s token")
        print("Please retrieve it manually:")
        print("  ssh k3s@10.88.145.190 'sudo cat /var/lib/rancher/k3s/server/node-token'")
        k3s_token = input("\nEnter K3s token: ").strip()

    if not k3s_token:
        print("\nERROR: No K3s token available. Cannot join nodes.")
        return 1

    # Join nodes to cluster
    for vm in configured_vms:
        role = "master" if "master" in vm["name"] else "worker"
        success = join_node_to_cluster(vm, k3s_token, role)

        if not success:
            print(f"\n  WARNING: Failed to join {vm['name']}")

    # Wait for cluster to stabilize
    print("\nWaiting 60s for cluster to stabilize...")
    time.sleep(60)

    # Final verification
    verify_cluster()

    # Final summary
    print(f"\n{'='*70}")
    print("Configuration Complete")
    print(f"{'='*70}")

    print("\nExpected cluster configuration:")
    print("  Control Plane Nodes: k3s-master01, k3s-master02, k3s-master03")
    print("  Worker Nodes: k3s-worker01, k3s-worker02, k3s-worker03, k3s-worker04")
    print("  Total: 3 masters + 4 workers = 7 nodes")

    print("\nNext steps:")
    print("  1. Verify all nodes are Ready: kubectl get nodes")
    print("  2. Check node roles: kubectl get nodes --show-labels")
    print("  3. Verify pods: kubectl get pods -A")

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
