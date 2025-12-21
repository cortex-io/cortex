#!/Users/ryandahlberg/Projects/cortex/venv/bin/python3
"""
Finalize K3s HA Cluster Configuration
Handles network configuration and cluster joining for new VMs
"""

import subprocess
import time
import sys

K3S_USER = "k3s"
K3S_MASTER01_IP = "10.88.145.190"

# New VMs - Update these with actual current IPs if different
NEW_VMS = [
    {"name": "k3s-master02", "current_ip": "10.88.145.193", "final_ip": "10.88.145.193", "role": "master"},
    {"name": "k3s-worker03", "current_ip": "10.88.145.194", "final_ip": "10.88.145.194", "role": "worker"},
    {"name": "k3s-worker04", "current_ip": "10.88.145.195", "final_ip": "10.88.145.195", "role": "worker"},
    {"name": "k3s-master03", "current_ip": "10.88.145.196", "final_ip": "10.88.145.196", "role": "master"},
]


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


def check_connectivity(ip, name):
    """Check if we can connect to a VM"""
    print(f"  Checking connectivity to {name} ({ip})...")
    success, output = ssh(ip, "hostname")
    if success:
        print(f"  Connected to {name}: {output.strip()}")
        return True
    else:
        print(f"  Cannot connect to {ip}: {output[:100]}")
        return False


def configure_vm(vm):
    """Configure VM hostname and verify network"""
    ip = vm['current_ip']
    name = vm['name']

    print(f"\n{'='*80}")
    print(f"  Configuring {name}")
    print(f"{'='*80}")

    if not check_connectivity(ip, name):
        return False

    # Set hostname
    print(f"  Setting hostname to {name}...")
    success, output = ssh(ip, f"sudo hostnamectl set-hostname {name}")
    if success:
        print(f"  Hostname set successfully")
    else:
        print(f"  Warning: Could not set hostname: {output[:100]}")

    # Verify hostname
    success, output = ssh(ip, "hostname")
    if success:
        current_hostname = output.strip()
        print(f"  Current hostname: {current_hostname}")

    # If current IP != final IP, configure static IP
    if vm['current_ip'] != vm['final_ip']:
        print(f"  Configuring static IP: {vm['final_ip']}...")
        netplan = f"""network:
  version: 2
  ethernets:
    ens18:
      addresses:
        - {vm['final_ip']}/24
      routes:
        - to: default
          via: 10.88.145.1
      nameservers:
        addresses: [8.8.8.8, 8.8.4.4]
"""
        cmd = f"echo '{netplan}' | sudo tee /etc/netplan/50-cloud-init.yaml && sudo netplan apply"
        success, output = ssh(ip, cmd, timeout=20)
        if success:
            print(f"  Static IP configured")
            time.sleep(10)
        else:
            print(f"  Error configuring IP: {output[:200]}")
            return False

    return True


def get_k3s_token():
    """Get K3s token from master01"""
    print(f"\n{'='*80}")
    print(f"  Retrieving K3s Token")
    print(f"{'='*80}")

    success, output = ssh(K3S_MASTER01_IP, "sudo cat /var/lib/rancher/k3s/server/node-token")
    if success and output.strip():
        token = output.strip()
        print(f"  Token retrieved: {token[:50]}...")
        return token
    else:
        print(f"  Error: {output}")
        return None


def join_master(vm, token):
    """Join master to cluster"""
    ip = vm['final_ip']
    name = vm['name']

    print(f"\n{'='*80}")
    print(f"  Joining {name} as Master")
    print(f"{'='*80}")

    # Check if already joined
    success, output = ssh(ip, "sudo systemctl status k3s 2>/dev/null")
    if success and "active (running)" in output.lower():
        print(f"  K3s already running on {name}")
        return True

    # Install K3s in server mode
    print(f"  Installing K3s in server mode...")
    install_cmd = f"""curl -sfL https://get.k3s.io | K3S_TOKEN='{token}' sh -s - server \\
  --server https://{K3S_MASTER01_IP}:6443 \\
  --disable traefik \\
  --disable servicelb \\
  --node-name {name}"""

    success, output = ssh(ip, install_cmd, timeout=180)

    if success or "already exists" in output.lower():
        print(f"  K3s server installed")
        time.sleep(30)

        # Verify
        success, output = ssh(ip, "sudo systemctl status k3s")
        if "active (running)" in output.lower():
            print(f"  K3s is running on {name}")
            return True
        else:
            print(f"  Warning: K3s may not be running: {output[:200]}")
            return False
    else:
        print(f"  Installation failed: {output[:300]}")
        return False


def join_worker(vm, token):
    """Join worker to cluster"""
    ip = vm['final_ip']
    name = vm['name']

    print(f"\n{'='*80}")
    print(f"  Joining {name} as Worker")
    print(f"{'='*80}")

    # Check if already joined
    success, output = ssh(ip, "sudo systemctl status k3s-agent 2>/dev/null")
    if success and "active (running)" in output.lower():
        print(f"  K3s agent already running on {name}")
        return True

    # Install K3s in agent mode
    print(f"  Installing K3s in agent mode...")
    install_cmd = f"""curl -sfL https://get.k3s.io | K3S_TOKEN='{token}' sh -s - agent \\
  --server https://{K3S_MASTER01_IP}:6443 \\
  --node-name {name}"""

    success, output = ssh(ip, install_cmd, timeout=180)

    if success or "already exists" in output.lower():
        print(f"  K3s agent installed")
        time.sleep(30)

        # Verify
        success, output = ssh(ip, "sudo systemctl status k3s-agent")
        if "active (running)" in output.lower():
            print(f"  K3s agent is running on {name}")
            return True
        else:
            print(f"  Warning: K3s agent may not be running: {output[:200]}")
            return False
    else:
        print(f"  Installation failed: {output[:300]}")
        return False


def verify_cluster():
    """Verify cluster status"""
    print(f"\n{'='*80}")
    print(f"  Cluster Verification")
    print(f"{'='*80}")

    print("\nCluster nodes:")
    success, output = ssh(K3S_MASTER01_IP, "kubectl get nodes -o wide")
    if success:
        print(output)

        # Count nodes
        lines = output.strip().split('\n')
        if len(lines) > 1:
            node_count = len(lines) - 1
            print(f"\nNode count: {node_count}/7")

            if node_count == 7:
                print("\nSUCCESS: All 7 nodes are in the cluster!")
            else:
                print(f"\nWarning: Expected 7 nodes, found {node_count}")

    print("\n\nAll pods:")
    success, output = ssh(K3S_MASTER01_IP, "kubectl get pods -A")
    if success:
        print(output)


def main():
    print("="*80)
    print("  K3s HA Cluster Finalization")
    print("="*80)

    print("\nThis script will:")
    print("1. Configure hostnames on new VMs")
    print("2. Retrieve K3s token from master01")
    print("3. Join new masters to the cluster")
    print("4. Join new workers to the cluster")
    print("5. Verify cluster status")

    print("\n\nIMPORTANT: Before running this script, ensure:")
    print("- All new VMs are running and have network connectivity")
    print("- You can SSH into each VM (k3s@<ip>)")
    print("- The IPs in the script match the actual current IPs")

    print("\n\nCurrent VM configuration:")
    for vm in NEW_VMS:
        print(f"  {vm['name']}: {vm['current_ip']} -> {vm['final_ip']} ({vm['role']})")

    # Step 1: Configure VMs
    print(f"\n{'='*80}")
    print(f"  Step 1: Configure New VMs")
    print(f"{'='*80}")

    for vm in NEW_VMS:
        if not configure_vm(vm):
            print(f"\n  Warning: Failed to configure {vm['name']}")
            response = input(f"  Continue anyway? (yes/no): ")
            if response.lower() != 'yes':
                sys.exit(1)

    # Step 2: Get K3s token
    token = get_k3s_token()
    if not token:
        print("\nError: Could not retrieve K3s token")
        sys.exit(1)

    # Step 3: Join masters
    print(f"\n{'='*80}")
    print(f"  Step 3: Join New Masters")
    print(f"{'='*80}")

    for vm in NEW_VMS:
        if vm['role'] == 'master':
            join_master(vm, token)

    # Wait for masters to stabilize
    print("\n  Waiting 30 seconds for masters to stabilize...")
    time.sleep(30)

    # Step 4: Join workers
    print(f"\n{'='*80}")
    print(f"  Step 4: Join New Workers")
    print(f"{'='*80}")

    for vm in NEW_VMS:
        if vm['role'] == 'worker':
            join_worker(vm, token)

    # Wait for cluster to stabilize
    print("\n  Waiting 30 seconds for cluster to stabilize...")
    time.sleep(30)

    # Step 5: Verify
    verify_cluster()

    print(f"\n{'='*80}")
    print(f"  Finalization Complete")
    print(f"{'='*80}")

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
