#!/Users/ryandahlberg/Projects/cortex/venv/bin/python3
"""
Complete K3s HA Cluster Build
Final script to join all new nodes and verify cluster
Run this AFTER manually configuring network on new VMs via Proxmox console
"""

import subprocess
import time
import sys

K3S_USER = "k3s"
K3S_MASTER01_IP = "10.88.145.190"

# All nodes in target cluster
ALL_NODES = [
    # Existing
    {"name": "k3s-master01", "ip": "10.88.145.190", "role": "master", "vmid": 300},
    {"name": "k3s-worker01", "ip": "10.88.145.191", "role": "worker", "vmid": 301},
    {"name": "k3s-worker02", "ip": "10.88.145.192", "role": "worker", "vmid": 302},
    # New
    {"name": "k3s-master02", "ip": "10.88.145.193", "role": "master", "vmid": 303},
    {"name": "k3s-worker03", "ip": "10.88.145.194", "role": "worker", "vmid": 304},
    {"name": "k3s-worker04", "ip": "10.88.145.195", "role": "worker", "vmid": 305},
    {"name": "k3s-master03", "ip": "10.88.145.196", "role": "master", "vmid": 306},
]

NEW_NODES = [n for n in ALL_NODES if n['vmid'] > 302]


def header(text):
    print(f"\n{'='*80}")
    print(f"  {text}")
    print(f"{'='*80}\n")


def ssh(ip, cmd, timeout=30, show_output=False):
    """Run SSH command"""
    try:
        result = subprocess.run(
            ["ssh", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=10",
             f"{K3S_USER}@{ip}", cmd],
            capture_output=True,
            timeout=timeout,
            text=True
        )
        if show_output and result.stdout:
            print(result.stdout)
        return result.returncode == 0, result.stdout + result.stderr
    except Exception as e:
        return False, str(e)


def check_connectivity():
    """Check connectivity to all nodes"""
    header("Checking Connectivity to All Nodes")

    all_accessible = True
    for node in ALL_NODES:
        print(f"Checking {node['name']} ({node['ip']})...")
        success, output = ssh(node['ip'], "hostname", timeout=5)
        if success:
            hostname = output.strip()
            print(f"  ✓ Connected - hostname: {hostname}")
            if hostname != node['name']:
                print(f"    WARNING: Hostname is '{hostname}', expected '{node['name']}'")
        else:
            print(f"  ✗ Cannot connect: {output[:100]}")
            all_accessible = False

    return all_accessible


def get_k3s_token():
    """Get K3s token from master01"""
    header("Retrieving K3s Token")

    print(f"Getting token from {K3S_MASTER01_IP}...")
    success, output = ssh(K3S_MASTER01_IP, "sudo cat /var/lib/rancher/k3s/server/node-token")

    if success and output.strip():
        token = output.strip()
        print(f"✓ Token retrieved: {token[:60]}...")
        return token
    else:
        print(f"✗ Error: {output}")
        return None


def is_k3s_running(ip, role):
    """Check if K3s is already running on a node"""
    if role == 'master':
        service = "k3s"
    else:
        service = "k3s-agent"

    success, output = ssh(ip, f"sudo systemctl is-active {service}", timeout=10)
    return success and "active" in output.lower()


def join_master(node, token):
    """Join master to cluster"""
    print(f"\nJoining {node['name']} as control-plane node...")

    # Check if already running
    if is_k3s_running(node['ip'], 'master'):
        print(f"  K3s already running on {node['name']}")
        return True

    # Install K3s in server mode
    print(f"  Installing K3s server...")
    install_cmd = f"""curl -sfL https://get.k3s.io | K3S_TOKEN='{token}' sh -s - server \\
  --server https://{K3S_MASTER01_IP}:6443 \\
  --disable traefik \\
  --disable servicelb \\
  --node-name {node['name']}"""

    success, output = ssh(node['ip'], install_cmd, timeout=180)

    if success or "already exists" in output.lower():
        print(f"  ✓ K3s server installed")
        time.sleep(20)

        # Verify
        if is_k3s_running(node['ip'], 'master'):
            print(f"  ✓ K3s is running on {node['name']}")
            return True
        else:
            print(f"  ! K3s may not be running yet, will check later")
            return True
    else:
        print(f"  ✗ Installation failed")
        print(f"     {output[:400]}")
        return False


def join_worker(node, token):
    """Join worker to cluster"""
    print(f"\nJoining {node['name']} as worker node...")

    # Check if already running
    if is_k3s_running(node['ip'], 'worker'):
        print(f"  K3s agent already running on {node['name']}")
        return True

    # Install K3s in agent mode
    print(f"  Installing K3s agent...")
    install_cmd = f"""curl -sfL https://get.k3s.io | K3S_TOKEN='{token}' sh -s - agent \\
  --server https://{K3S_MASTER01_IP}:6443 \\
  --node-name {node['name']}"""

    success, output = ssh(node['ip'], install_cmd, timeout=180)

    if success or "already exists" in output.lower():
        print(f"  ✓ K3s agent installed")
        time.sleep(20)

        # Verify
        if is_k3s_running(node['ip'], 'worker'):
            print(f"  ✓ K3s agent is running on {node['name']}")
            return True
        else:
            print(f"  ! K3s agent may not be running yet, will check later")
            return True
    else:
        print(f"  ✗ Installation failed")
        print(f"     {output[:400]}")
        return False


def verify_cluster():
    """Verify final cluster status"""
    header("Final Cluster Verification")

    print("Cluster nodes:\n")
    success, output = ssh(K3S_MASTER01_IP, "kubectl get nodes -o wide", show_output=True)

    if success:
        lines = output.strip().split('\n')
        if len(lines) > 1:
            node_count = len(lines) - 1
            print(f"\n{'='*80}")
            print(f"  Node Count: {node_count}/7")
            print(f"{'='*80}")

            if node_count == 7:
                print("\n✓✓✓ SUCCESS: All 7 nodes are in the cluster! ✓✓✓\n")

                # Count ready nodes
                ready_count = output.lower().count('ready')
                notready_count = output.lower().count('notready')
                print(f"  Ready nodes: {ready_count}")
                if notready_count > 0:
                    print(f"  NotReady nodes: {notready_count}")
                    print(f"  (Nodes may take a few minutes to become Ready)")

                # Show control-plane count
                cp_count = output.lower().count('control-plane')
                print(f"  Control-plane nodes: {cp_count}/3")

            else:
                print(f"\n! Warning: Expected 7 nodes, found {node_count}")
                print(f"  Some nodes may not have joined successfully")
    else:
        print(f"✗ Error getting nodes: {output}")
        return False

    # Show all pods
    print(f"\n{'='*80}")
    print("  All Pods in Cluster")
    print(f"{'='*80}\n")
    ssh(K3S_MASTER01_IP, "kubectl get pods -A", show_output=True)

    return True


def main():
    header("K3s HA Cluster - Final Build")

    print("This script will:")
    print("  1. Verify connectivity to all 7 nodes")
    print("  2. Retrieve K3s token from master01")
    print("  3. Join new master nodes (k3s-master02, k3s-master03)")
    print("  4. Join new worker nodes (k3s-worker03, k3s-worker04)")
    print("  5. Verify final cluster status")
    print("\nTarget: 3 masters + 4 workers = 7 total nodes")
    print("Resources: 14 cores, 42GB RAM total\n")

    # Step 1: Check connectivity
    if not check_connectivity():
        print("\n! Warning: Not all nodes are accessible")
        print("  Please ensure all new VMs have been configured via Proxmox console")
        print("  Required IPs:")
        for node in NEW_NODES:
            print(f"    {node['name']}: {node['ip']}")
        print("\nContinue anyway? (some operations may fail)")
        response = input("Continue? [y/N]: ")
        if response.lower() != 'y':
            return 1

    # Step 2: Get token
    token = get_k3s_token()
    if not token:
        print("\n✗ Error: Could not retrieve K3s token")
        print("  Ensure master01 is running and accessible")
        return 1

    # Step 3: Join new masters
    header("Joining New Master Nodes")
    for node in NEW_NODES:
        if node['role'] == 'master':
            join_master(node, token)
            print("\n  Waiting 15 seconds for node to join...")
            time.sleep(15)

    # Step 4: Join new workers
    header("Joining New Worker Nodes")
    for node in NEW_NODES:
        if node['role'] == 'worker':
            join_worker(node, token)
            print("\n  Waiting 15 seconds for node to join...")
            time.sleep(15)

    # Wait for cluster to stabilize
    print("\nWaiting 30 seconds for cluster to stabilize...")
    time.sleep(30)

    # Step 5: Verify
    verify_cluster()

    # Final message
    header("Build Complete")
    print("Cluster Configuration:")
    print("  • 3 Control-plane nodes (masters)")
    print("  • 4 Worker nodes")
    print("  • 14 cores total")
    print("  • 42GB RAM total")
    print("\nVerify cluster:")
    print(f"  ssh {K3S_USER}@{K3S_MASTER01_IP} 'kubectl get nodes -o wide'")
    print(f"  ssh {K3S_USER}@{K3S_MASTER01_IP} 'kubectl get pods -A'")
    print("\n")

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n\n! Cancelled by user")
        sys.exit(130)
    except Exception as e:
        print(f"\n\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
