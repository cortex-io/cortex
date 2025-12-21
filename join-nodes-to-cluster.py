#!/Users/ryandahlberg/Projects/cortex/venv/bin/python3
"""
Join new K3s nodes to the cluster after IP fixes
"""
import subprocess
import time
import sys

K3S_USER = "k3s"
K3S_MASTER01_IP = "10.88.145.190"

# New nodes to join
NEW_NODES = [
    {"name": "k3s-master02", "ip": "10.88.145.193", "role": "server"},
    {"name": "k3s-master03", "ip": "10.88.145.196", "role": "server"},
    {"name": "k3s-worker03", "ip": "10.88.145.194", "role": "agent"},
    {"name": "k3s-worker04", "ip": "10.88.145.195", "role": "agent"},
]

def run_ssh_command(ip, command, timeout=30):
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
                text=True,
                stderr=subprocess.DEVNULL
            )
            if result.returncode == 0:
                print(f" OK")
                return True
        except:
            pass
        print(".", end="", flush=True)
        time.sleep(5)

    print(f" TIMEOUT")
    return False

def get_k3s_token():
    """Get K3s join token from master01"""
    print(f"\n{'='*70}")
    print("Retrieving K3s Join Token from master01")
    print(f"{'='*70}")

    success, output = run_ssh_command(
        K3S_MASTER01_IP,
        "sudo cat /var/lib/rancher/k3s/server/node-token"
    )

    if success:
        token = output.strip()
        print(f"  Token retrieved: {token[:50]}...")
        return token
    else:
        print(f"  Failed to retrieve token: {output}")
        return None

def verify_ssh_connectivity():
    """Verify SSH connectivity to all new nodes"""
    print(f"\n{'='*70}")
    print("Verifying SSH Connectivity")
    print(f"{'='*70}")

    all_ok = True

    for node in NEW_NODES:
        name = node["name"]
        ip = node["ip"]

        print(f"\n{name} ({ip})")
        if wait_for_ssh(ip, timeout=30):
            # Verify hostname
            success, hostname = run_ssh_command(ip, "hostname")
            if success:
                actual_hostname = hostname.strip()
                if actual_hostname == name:
                    print(f"  Hostname: {actual_hostname} - OK")
                else:
                    print(f"  Hostname mismatch: {actual_hostname} != {name}")
                    all_ok = False
            else:
                print(f"  Cannot verify hostname")
                all_ok = False
        else:
            print(f"  SSH failed")
            all_ok = False

    return all_ok

def join_server_node(node, token):
    """Join a server (master) node to the cluster"""
    name = node["name"]
    ip = node["ip"]

    print(f"\n{'='*70}")
    print(f"Joining {name} as Server Node")
    print(f"{'='*70}")

    # Check if k3s is already installed
    success, output = run_ssh_command(ip, "which k3s")
    if success and "/usr/local/bin/k3s" in output:
        print(f"  k3s already installed - checking if running...")
        success, output = run_ssh_command(ip, "sudo systemctl is-active k3s")
        if success and "active" in output:
            print(f"  k3s already running - skipping")
            return True

    # Install k3s in server mode
    install_cmd = f"""
curl -sfL https://get.k3s.io | K3S_TOKEN='{token}' sh -s - server \\
  --server https://{K3S_MASTER01_IP}:6443 \\
  --disable traefik \\
  --disable servicelb \\
  --node-name {name}
"""

    print(f"  Installing k3s in server mode...")
    success, output = run_ssh_command(ip, install_cmd, timeout=180)

    if not success:
        print(f"  Warning: k3s install may have issues: {output}")
        return False

    print(f"  k3s installed successfully")

    # Wait for k3s to start
    print(f"  Waiting 30s for k3s to initialize...")
    time.sleep(30)

    # Verify k3s is running
    success, output = run_ssh_command(ip, "sudo systemctl status k3s")
    if "active (running)" in output.lower():
        print(f"  k3s service is running")
        return True
    else:
        print(f"  Warning: k3s may not be running properly")
        print(f"  Status: {output[:200]}")
        return False

def join_agent_node(node, token):
    """Join an agent (worker) node to the cluster"""
    name = node["name"]
    ip = node["ip"]

    print(f"\n{'='*70}")
    print(f"Joining {name} as Agent Node")
    print(f"{'='*70}")

    # Check if k3s is already installed
    success, output = run_ssh_command(ip, "which k3s")
    if success and "/usr/local/bin/k3s" in output:
        print(f"  k3s already installed - checking if running...")
        success, output = run_ssh_command(ip, "sudo systemctl is-active k3s-agent")
        if success and "active" in output:
            print(f"  k3s-agent already running - skipping")
            return True

    # Install k3s in agent mode
    install_cmd = f"""
curl -sfL https://get.k3s.io | K3S_TOKEN='{token}' sh -s - agent \\
  --server https://{K3S_MASTER01_IP}:6443 \\
  --node-name {name}
"""

    print(f"  Installing k3s in agent mode...")
    success, output = run_ssh_command(ip, install_cmd, timeout=180)

    if not success:
        print(f"  Warning: k3s install may have issues: {output}")
        return False

    print(f"  k3s-agent installed successfully")

    # Wait for k3s-agent to start
    print(f"  Waiting 30s for k3s-agent to initialize...")
    time.sleep(30)

    # Verify k3s-agent is running
    success, output = run_ssh_command(ip, "sudo systemctl status k3s-agent")
    if "active (running)" in output.lower():
        print(f"  k3s-agent service is running")
        return True
    else:
        print(f"  Warning: k3s-agent may not be running properly")
        print(f"  Status: {output[:200]}")
        return False

def verify_cluster():
    """Verify all nodes are in the cluster"""
    print(f"\n{'='*70}")
    print("Verifying Cluster")
    print(f"{'='*70}")

    success, output = run_ssh_command(K3S_MASTER01_IP, "kubectl get nodes -o wide")

    if success:
        print("\nCluster Nodes:")
        print(output)

        # Count nodes
        lines = output.strip().split('\n')
        node_count = len(lines) - 1  # Exclude header

        print(f"\nTotal nodes: {node_count}")

        if node_count >= 7:
            print("SUCCESS: All 7 nodes are in the cluster!")
            return True
        else:
            print(f"WARNING: Expected 7 nodes, found {node_count}")
            return False
    else:
        print(f"Failed to get cluster nodes: {output}")
        return False

def main():
    print("="*70)
    print("K3s Cluster Node Join Script")
    print("="*70)

    print("\nNew nodes to join:")
    for node in NEW_NODES:
        print(f"  {node['name']} ({node['ip']}) - {node['role']}")

    # Step 1: Verify SSH connectivity
    if not verify_ssh_connectivity():
        print(f"\n{'='*70}")
        print("ERROR: SSH connectivity check failed")
        print(f"{'='*70}")
        print("\nPlease ensure all VMs have correct IP addresses.")
        print("Run the IP fix script first if you haven't already.")
        return 1

    # Step 2: Get K3s token
    token = get_k3s_token()
    if not token:
        print("\nFailed to retrieve K3s token from master01")
        return 1

    # Step 3: Join server nodes first
    print(f"\n{'='*70}")
    print("Phase 1: Joining Server Nodes")
    print(f"{'='*70}")

    server_nodes = [n for n in NEW_NODES if n["role"] == "server"]
    for node in server_nodes:
        if not join_server_node(node, token):
            print(f"Warning: Failed to join {node['name']}")

    # Wait for servers to stabilize
    if server_nodes:
        print(f"\nWaiting 60s for server nodes to stabilize...")
        time.sleep(60)

    # Step 4: Join agent nodes
    print(f"\n{'='*70}")
    print("Phase 2: Joining Agent Nodes")
    print(f"{'='*70}")

    agent_nodes = [n for n in NEW_NODES if n["role"] == "agent"]
    for node in agent_nodes:
        if not join_agent_node(node, token):
            print(f"Warning: Failed to join {node['name']}")

    # Wait for agents to stabilize
    if agent_nodes:
        print(f"\nWaiting 30s for agent nodes to stabilize...")
        time.sleep(30)

    # Step 5: Verify cluster
    if verify_cluster():
        print(f"\n{'='*70}")
        print("SUCCESS: All nodes joined the cluster!")
        print(f"{'='*70}")
        return 0
    else:
        print(f"\n{'='*70}")
        print("WARNING: Some nodes may not have joined properly")
        print(f"{'='*70}")
        return 1

if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n\nCancelled by user")
        sys.exit(130)
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
