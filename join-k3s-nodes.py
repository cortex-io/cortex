#!/Users/ryandahlberg/Projects/cortex/venv/bin/python3
"""
Join the successfully configured VMs to the K3s cluster
"""
import subprocess
import time
import sys


K3S_USER = "k3s"

# VMs that were successfully configured
VMS = [
    {"name": "k3s-master02", "ip": "10.88.145.193", "role": "master"},
    {"name": "k3s-worker03", "ip": "10.88.145.194", "role": "worker"},
    {"name": "k3s-worker04", "ip": "10.88.145.195", "role": "worker"},
]

# Add k3s-master03 if it becomes available
# {"name": "k3s-master03", "ip": "10.88.145.196", "role": "master"},


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


def wait_for_ssh(ip, timeout=60):
    """Wait for SSH to become available"""
    print(f"  Checking SSH on {ip}...", end="", flush=True)
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
        time.sleep(3)

    print(" Not accessible")
    return False


def retrieve_k3s_token():
    """Retrieve K3s join token from master node"""
    print(f"\n{'='*70}")
    print("Retrieving K3s Join Token from k3s-master01")
    print(f"{'='*70}")

    master_ip = "10.88.145.190"

    success, output = run_ssh_command(
        master_ip,
        "sudo cat /var/lib/rancher/k3s/server/node-token",
        timeout=15
    )

    if success:
        token = output.strip()
        print(f"  Token: {token[:50]}...")
        return token
    else:
        print(f"  ERROR: {output}")
        return None


def join_node_to_cluster(vm, k3s_token):
    """Join a node to the K3s cluster"""
    name = vm["name"]
    ip = vm["ip"]
    role = vm["role"]

    print(f"\n{'='*70}")
    print(f"Joining {name} ({ip}) as {role}")
    print(f"{'='*70}")

    # Verify SSH
    if not wait_for_ssh(ip, timeout=30):
        print(f"  ERROR: Cannot access {name}")
        return False

    master_ip = "10.88.145.190"

    if role == "master":
        print(f"  Installing K3s server...")
        install_cmd = f"""curl -sfL https://get.k3s.io | K3S_TOKEN='{k3s_token}' sh -s - server \\
  --server https://{master_ip}:6443 \\
  --disable traefik \\
  --disable servicelb \\
  --node-name {name}"""
        service_name = "k3s"
    else:
        print(f"  Installing K3s agent...")
        install_cmd = f"""curl -sfL https://get.k3s.io | K3S_TOKEN='{k3s_token}' sh -s - agent \\
  --server https://{master_ip}:6443 \\
  --node-name {name}"""
        service_name = "k3s-agent"

    success, output = run_ssh_command(ip, install_cmd, timeout=300)

    # Check for success indicators
    if "K3s" in output or "k3s" in output or success:
        print(f"  K3s installation output received")

        print(f"  Waiting 30s for K3s to start...")
        time.sleep(30)

        # Check service status
        success, status_output = run_ssh_command(ip, f"sudo systemctl is-active {service_name}", timeout=15)

        if "active" in status_output:
            print(f"  SUCCESS: {service_name} is active")
            return True
        else:
            print(f"  Status: {status_output.strip()}")
            # Try to get more details
            success, journal = run_ssh_command(ip, f"sudo journalctl -u {service_name} -n 20 --no-pager", timeout=15)
            if success:
                print(f"  Recent logs:\n{journal[-500:]}")
            return True  # Continue anyway
    else:
        print(f"  WARNING: Unexpected output: {output[:300]}")
        return False


def verify_cluster():
    """Verify cluster status"""
    print(f"\n{'='*70}")
    print("Cluster Verification")
    print(f"{'='*70}")

    master_ip = "10.88.145.190"

    print(f"\nQuerying cluster nodes...")
    success, output = run_ssh_command(master_ip, "kubectl get nodes -o wide", timeout=30)

    if success:
        print("\n" + output)

        # Count nodes
        lines = output.strip().split('\n')
        if len(lines) > 1:
            node_count = len(lines) - 1
            print(f"\nTotal nodes: {node_count}")

            # Count by role
            control_plane = sum(1 for line in lines[1:] if 'control-plane' in line or 'master' in line)
            workers = node_count - control_plane

            print(f"Control plane: {control_plane}")
            print(f"Workers: {workers}")

            if node_count == 7:
                print("\nSUCCESS: All 7 nodes present!")
            elif node_count >= 6:
                print(f"\nGOOD: {node_count} nodes present (1 may still be joining)")
            else:
                print(f"\nWARNING: Only {node_count} nodes found")

        return True
    else:
        print(f"  ERROR: {output}")
        return False


def main():
    """Main execution"""
    print("="*70)
    print("K3s Cluster Join Script")
    print("="*70)

    print("\nNodes to join:")
    for vm in VMS:
        print(f"  - {vm['name']} ({vm['ip']}) [{vm['role']}]")

    # Try to add k3s-master03 if accessible
    print(f"\nChecking if k3s-master03 is available...")
    test_vm = {"name": "k3s-master03", "ip": "10.88.145.196", "role": "master"}
    if wait_for_ssh(test_vm["ip"], timeout=10):
        print(f"  k3s-master03 is accessible! Adding to join list.")
        VMS.append(test_vm)
    else:
        print(f"  k3s-master03 not accessible yet - will join 3 nodes")

    # Get K3s token
    k3s_token = retrieve_k3s_token()

    if not k3s_token:
        print("\nERROR: Cannot proceed without K3s token")
        return 1

    # Separate masters and workers
    masters = [vm for vm in VMS if vm["role"] == "master"]
    workers = [vm for vm in VMS if vm["role"] == "worker"]

    print(f"\n{'='*70}")
    print("Joining Nodes to Cluster")
    print(f"{'='*70}")

    # Join masters first
    if masters:
        print(f"\nJoining {len(masters)} master node(s)...")
        for vm in masters:
            join_node_to_cluster(vm, k3s_token)

        print(f"\nWaiting 60s for master(s) to stabilize...")
        time.sleep(60)

    # Join workers
    if workers:
        print(f"\nJoining {len(workers)} worker node(s)...")
        for vm in workers:
            join_node_to_cluster(vm, k3s_token)

    # Wait for cluster to stabilize
    print(f"\nWaiting 60s for cluster to stabilize...")
    time.sleep(60)

    # Verify
    verify_cluster()

    # Final summary
    print(f"\n{'='*70}")
    print("Join Complete")
    print(f"{'='*70}")

    print("\nExpected final configuration:")
    print("  Control Plane: k3s-master01, k3s-master02, k3s-master03")
    print("  Workers: k3s-worker01, k3s-worker02, k3s-worker03, k3s-worker04")
    print("  Total: 7 nodes (3 control-plane + 4 workers)")

    print("\nVerification commands:")
    print("  ssh k3s@10.88.145.190")
    print("  kubectl get nodes")
    print("  kubectl get pods -A")

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n\nCancelled")
        sys.exit(130)
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
