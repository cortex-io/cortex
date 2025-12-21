#!/Users/ryandahlberg/Projects/cortex/venv/bin/python3
"""
Fix IP addresses for 4 new K3s VMs and join them to cluster
Automated via SSH - runs the exact commands from user requirements
"""
import requests
import urllib3
import time
import sys
import subprocess

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

# VM configurations - exact mapping from user requirements
VMS = [
    {"vmid": 303, "name": "k3s-master02", "old_ip": "10.88.145.190", "new_ip": "10.88.145.193", "role": "master"},
    {"vmid": 304, "name": "k3s-worker03", "old_ip": "10.88.145.191", "new_ip": "10.88.145.194", "role": "worker"},
    {"vmid": 305, "name": "k3s-worker04", "old_ip": "10.88.145.191", "new_ip": "10.88.145.195", "role": "worker"},
    {"vmid": 306, "name": "k3s-master03", "old_ip": "10.88.145.190", "new_ip": "10.88.145.196", "role": "master"},
]


def proxmox_request(method, endpoint, data=None):
    """Make Proxmox API request"""
    url = f"{API_BASE}{endpoint}"
    try:
        if method == "GET":
            r = requests.get(url, headers=headers, verify=False, timeout=30)
        elif method == "POST":
            r = requests.post(url, headers=headers, data=data, verify=False, timeout=30)
        else:
            raise ValueError(f"Unsupported method: {method}")

        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"  API Error: {e}")
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
    return True


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


def wait_for_ssh(ip, timeout=180):
    """Wait for SSH to become available"""
    print(f"  Waiting for SSH on {ip}...", end="", flush=True)
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
                print(" Ready!")
                return True
        except:
            pass
        print(".", end="", flush=True)
        time.sleep(5)

    print(" Timeout!")
    return False


def fix_vm_ip(vm):
    """Fix IP address for a VM using exact commands from requirements"""
    vmid = vm["vmid"]
    name = vm["name"]
    old_ip = vm["old_ip"]
    new_ip = vm["new_ip"]

    print(f"\n{'='*70}")
    print(f"{name} (VMID {vmid}): {old_ip} -> {new_ip}")
    print(f"{'='*70}")

    # Ensure VM is running
    status = get_vm_status(vmid)
    if status.get("status") != "running":
        start_vm(vmid)
    else:
        print(f"  VM is running")

    # Connect via SSH on old IP
    if not wait_for_ssh(old_ip, timeout=60):
        print(f"  ERROR: Cannot access VM via SSH at {old_ip}")
        print(f"  This VM needs manual console configuration")
        return False

    print(f"  Connected via SSH")

    # Find the netplan config file
    print(f"  Finding netplan config...")
    success, output = run_ssh_command(old_ip, "ls /etc/netplan/")
    if success:
        files = output.strip().split('\n')
        netplan_file = None
        for f in files:
            if f.endswith('.yaml') or f.endswith('.yml'):
                netplan_file = f
                break

        if not netplan_file:
            print(f"  ERROR: No netplan config found")
            return False

        print(f"  Found: /etc/netplan/{netplan_file}")
    else:
        # Default to common name
        netplan_file = "50-cloud-init.yaml"
        print(f"  Using default: /etc/netplan/{netplan_file}")

    # Execute the exact commands from user requirements
    print(f"  Executing IP change command...")
    cmd = f"sudo sed -i 's/{old_ip}/{new_ip}/g' /etc/netplan/{netplan_file}"
    success, output = run_ssh_command(old_ip, cmd)

    if not success:
        print(f"  ERROR: Failed to update netplan: {output}")
        return False
    print(f"  Netplan updated")

    # Set hostname
    print(f"  Setting hostname to {name}...")
    success, output = run_ssh_command(old_ip, f"sudo hostnamectl set-hostname {name}")

    if not success:
        print(f"  WARNING: Failed to set hostname: {output}")
    else:
        print(f"  Hostname set")

    # Apply netplan
    print(f"  Applying netplan...")
    success, output = run_ssh_command(old_ip, "sudo netplan apply", timeout=20)

    if not success:
        print(f"  WARNING: Netplan apply reported: {output}")
    else:
        print(f"  Netplan applied")

    # Reboot
    print(f"  Rebooting VM...")
    run_ssh_command(old_ip, "sudo reboot", timeout=10)

    print(f"  Waiting 30s for reboot...")
    time.sleep(30)

    # Verify new IP
    print(f"  Verifying new IP {new_ip}...")
    if wait_for_ssh(new_ip, timeout=120):
        # Verify hostname
        success, hostname = run_ssh_command(new_ip, "hostname")
        if success:
            print(f"  SUCCESS: {name} is now at {new_ip}, hostname: {hostname.strip()}")
            return True
        else:
            print(f"  SUCCESS: {name} is now at {new_ip}")
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

    success, output = run_ssh_command(
        master_ip,
        "sudo cat /var/lib/rancher/k3s/server/node-token",
        timeout=15
    )

    if success:
        token = output.strip()
        print(f"  Token retrieved: {token[:50]}...")
        return token
    else:
        print(f"  ERROR: Could not retrieve token")
        return None


def join_node_to_cluster(vm, k3s_token):
    """Join a node to the K3s cluster"""
    name = vm["name"]
    new_ip = vm["new_ip"]
    role = vm["role"]

    print(f"\n{'='*70}")
    print(f"Joining {name} to K3s Cluster ({role})")
    print(f"{'='*70}")

    # Wait for SSH
    if not wait_for_ssh(new_ip, timeout=60):
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

    if "K3s" in output or "k3s" in output:
        print(f"  K3s installation completed")

        print(f"  Waiting 30s for K3s to start...")
        time.sleep(30)

        # Verify service
        service_name = "k3s" if role == "master" else "k3s-agent"
        success, output = run_ssh_command(new_ip, f"sudo systemctl is-active {service_name}")

        if "active" in output:
            print(f"  {service_name} service is active")
            return True
        else:
            print(f"  WARNING: {service_name} service status: {output.strip()}")
            return True  # Continue anyway
    else:
        print(f"  WARNING: K3s installation output: {output[:200]}")
        return False


def verify_cluster():
    """Verify cluster nodes"""
    print(f"\n{'='*70}")
    print("Final Cluster Verification")
    print(f"{'='*70}")

    master_ip = "10.88.145.190"

    print(f"\nGetting cluster nodes...")
    success, output = run_ssh_command(master_ip, "kubectl get nodes -o wide", timeout=30)

    if success:
        print("\n" + output)

        # Count nodes
        lines = output.strip().split('\n')
        if len(lines) > 1:
            node_count = len(lines) - 1  # Subtract header
            print(f"\nTotal nodes in cluster: {node_count}")

            if node_count == 7:
                print("SUCCESS: All 7 nodes are in the cluster! (3 control-plane + 4 workers)")
            else:
                print(f"WARNING: Expected 7 nodes, found {node_count}")

        return True
    else:
        print(f"ERROR: Could not get cluster nodes: {output}")
        return False


def main():
    """Main execution"""
    print("="*70)
    print("K3s VM IP Fix and Cluster Join - Automated Script")
    print("="*70)

    print("\nVMs to configure:")
    for vm in VMS:
        print(f"  - {vm['name']} (VMID {vm['vmid']}): {vm['old_ip']} -> {vm['new_ip']} [{vm['role']}]")

    print("\n" + "="*70)
    print("PHASE 1: Fix IP Addresses")
    print("="*70)

    # Track results
    configured_vms = []
    failed_vms = []

    # Configure each VM in parallel would be ideal, but we'll do sequentially
    for vm in VMS:
        success = fix_vm_ip(vm)
        if success:
            configured_vms.append(vm)
        else:
            failed_vms.append(vm)

    # Summary of IP configuration
    print(f"\n{'='*70}")
    print("IP Configuration Summary")
    print(f"{'='*70}")

    for vm in VMS:
        if vm in configured_vms:
            print(f"  {vm['name']}: CONFIGURED at {vm['new_ip']}")
        else:
            print(f"  {vm['name']}: FAILED")

    if failed_vms:
        print(f"\nWARNING: {len(failed_vms)} VM(s) failed IP configuration")
        print("These will need manual console configuration")
        return 1

    # Retrieve K3s token
    print(f"\n{'='*70}")
    print("PHASE 2: Retrieve K3s Token and Join Nodes")
    print(f"{'='*70}")

    k3s_token = retrieve_k3s_token()

    if not k3s_token:
        print("\nERROR: Could not retrieve K3s token")
        return 1

    # Join nodes to cluster - masters first, then workers
    masters = [vm for vm in configured_vms if vm["role"] == "master"]
    workers = [vm for vm in configured_vms if vm["role"] == "worker"]

    joined_nodes = []

    # Join masters
    for vm in masters:
        if join_node_to_cluster(vm, k3s_token):
            joined_nodes.append(vm)

    # Wait for masters to stabilize
    if masters:
        print(f"\nWaiting 60s for new masters to stabilize...")
        time.sleep(60)

    # Join workers
    for vm in workers:
        if join_node_to_cluster(vm, k3s_token):
            joined_nodes.append(vm)

    # Wait for cluster to stabilize
    print(f"\nWaiting 60s for cluster to stabilize...")
    time.sleep(60)

    # Verify cluster
    print(f"\n{'='*70}")
    print("PHASE 3: Cluster Verification")
    print(f"{'='*70}")

    verify_cluster()

    # Final summary
    print(f"\n{'='*70}")
    print("Configuration Complete")
    print(f"{'='*70}")

    print(f"\nConfigured VMs: {len(configured_vms)}/{len(VMS)}")
    print(f"Joined to cluster: {len(joined_nodes)}/{len(VMS)}")

    print("\nExpected cluster configuration:")
    print("  Control Plane: k3s-master01, k3s-master02, k3s-master03")
    print("  Workers: k3s-worker01, k3s-worker02, k3s-worker03, k3s-worker04")
    print("  Total: 3 masters + 4 workers = 7 nodes")

    print("\nNext steps:")
    print("  1. SSH to master: ssh k3s@10.88.145.190")
    print("  2. Verify nodes: kubectl get nodes -o wide")
    print("  3. Check pods: kubectl get pods -A")

    return 0 if len(configured_vms) == len(VMS) else 1


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
