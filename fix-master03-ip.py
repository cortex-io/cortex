#!/Users/ryandahlberg/Projects/cortex/venv/bin/python3
"""
Fix IP address for k3s-master03: OLD_IP -> 10.88.145.196
Simple focused script for single node
"""
import subprocess
import time
import sys

# Configuration
OLD_IP = None  # Set this if you know the current IP, otherwise we'll try to find it
NEW_IP = "10.88.145.196"
HOSTNAME = "k3s-master03"
K3S_USER = "k3s"

# If OLD_IP is provided as command line argument
if len(sys.argv) > 1:
    OLD_IP = sys.argv[1]
    print(f"Using OLD_IP from command line: {OLD_IP}")
elif OLD_IP is None:
    print("ERROR: OLD_IP not set!")
    print("Usage: ./fix-master03-ip.py <current_ip>")
    print("\nExample: ./fix-master03-ip.py 10.88.145.XXX")
    print("\nTo find the current IP, use Proxmox console:")
    print("  1. Access VM 306 console in Proxmox")
    print("  2. Login as k3s/toor")
    print("  3. Run: ip addr show ens18 | grep 'inet 10'")
    sys.exit(1)

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

def main():
    print("="*70)
    print(f"Fix IP for {HOSTNAME}: {OLD_IP} -> {NEW_IP}")
    print("="*70)

    # Verify SSH access on old IP
    print(f"\n1. Verifying SSH access on old IP {OLD_IP}...")
    success, hostname = run_ssh_command(OLD_IP, "hostname")
    if not success:
        print(f"  ERROR: Cannot access {OLD_IP}")
        return 1
    print(f"  Connected to: {hostname.strip()}")

    # Find netplan config
    print(f"\n2. Finding netplan config...")
    success, output = run_ssh_command(OLD_IP, "ls /etc/netplan/")
    if success:
        files = output.strip().split('\n')
        netplan_file = None
        for f in files:
            if f.endswith('.yaml') or f.endswith('.yml'):
                netplan_file = f
                break
        if not netplan_file:
            netplan_file = "50-cloud-init.yaml"
    else:
        netplan_file = "50-cloud-init.yaml"
    print(f"  Using: /etc/netplan/{netplan_file}")

    # Update IP in netplan
    print(f"\n3. Updating IP address in netplan...")
    cmd = f"sudo sed -i 's/{OLD_IP}/{NEW_IP}/g' /etc/netplan/{netplan_file}"
    success, output = run_ssh_command(OLD_IP, cmd)
    if not success:
        print(f"  ERROR: Failed to update netplan: {output}")
        return 1
    print(f"  Netplan updated")

    # Set hostname
    print(f"\n4. Setting hostname to {HOSTNAME}...")
    success, output = run_ssh_command(OLD_IP, f"sudo hostnamectl set-hostname {HOSTNAME}")
    if not success:
        print(f"  WARNING: Failed to set hostname: {output}")
    else:
        print(f"  Hostname set")

    # Apply netplan
    print(f"\n5. Applying netplan...")
    success, output = run_ssh_command(OLD_IP, "sudo netplan apply", timeout=20)
    if not success:
        print(f"  WARNING: Netplan apply reported: {output}")
    else:
        print(f"  Netplan applied")

    # Reboot
    print(f"\n6. Rebooting VM...")
    run_ssh_command(OLD_IP, "sudo reboot", timeout=10)
    print(f"  Waiting 30s for reboot...")
    time.sleep(30)

    # Verify new IP
    print(f"\n7. Verifying new IP {NEW_IP}...")
    if wait_for_ssh(NEW_IP, timeout=120):
        success, hostname = run_ssh_command(NEW_IP, "hostname")
        if success:
            print(f"  SUCCESS: {HOSTNAME} is now at {NEW_IP}")
            print(f"  Hostname: {hostname.strip()}")

            # Show IP config
            success, output = run_ssh_command(NEW_IP, "ip addr show ens18 | grep 'inet 10'")
            if success:
                print(f"  IP config: {output.strip()}")

            print(f"\n{'='*70}")
            print("IP Change Complete!")
            print(f"{'='*70}")
            print(f"\nNext: Join {HOSTNAME} to the K3s cluster")
            print(f"Run: ./join-k3s-nodes.py")
            return 0
        else:
            print(f"  SUCCESS: {HOSTNAME} is now at {NEW_IP}")
            return 0
    else:
        print(f"  ERROR: Cannot verify SSH at {NEW_IP}")
        print(f"  The IP may have been changed, but verification failed")
        return 1

if __name__ == "__main__":
    try:
        exit(main())
    except KeyboardInterrupt:
        print("\n\nOperation cancelled by user")
        exit(130)
    except Exception as e:
        print(f"\nUnexpected error: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
