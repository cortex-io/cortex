#!/Users/ryandahlberg/Projects/cortex/venv/bin/python3
"""
URGENT: Fix IP conflicts for VMIDs 300, 303, 306
Required state:
- VMID 300 (k3s-master01) → 10.88.145.190 ✓ ALREADY CORRECT
- VMID 303 (k3s-master02) → 10.88.145.192 (currently at .193)
- VMID 306 (k3s-master03) → 10.88.145.196 (not accessible)

Current conflicts:
- k3s-worker02 is at .192 (blocking VMID 303)
"""
import subprocess
import time

K3S_USER = "k3s"

def run_ssh(ip, command, timeout=30):
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

def wait_for_ssh(ip, timeout=120):
    """Wait for SSH"""
    print(f"  Waiting for SSH on {ip}...", end="", flush=True)
    start = time.time()
    while time.time() - start < timeout:
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

def change_ip(hostname, old_ip, new_ip):
    """Change IP for a VM"""
    print(f"\n{'='*70}")
    print(f"{hostname}: {old_ip} → {new_ip}")
    print(f"{'='*70}")

    # Find netplan file
    success, output = run_ssh(old_ip, "ls /etc/netplan/")
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

    print(f"  Using netplan: /etc/netplan/{netplan_file}")

    # Update IP
    print(f"  Updating IP address...")
    cmd = f"sudo sed -i 's/{old_ip}/{new_ip}/g' /etc/netplan/{netplan_file}"
    success, output = run_ssh(old_ip, cmd)
    if not success:
        print(f"  ERROR: {output}")
        return False

    # Apply netplan
    print(f"  Applying netplan...")
    run_ssh(old_ip, "sudo netplan apply", timeout=20)

    # Reboot
    print(f"  Rebooting...")
    run_ssh(old_ip, "sudo reboot", timeout=10)
    time.sleep(30)

    # Verify
    print(f"  Verifying {new_ip}...")
    if wait_for_ssh(new_ip):
        success, hostname_check = run_ssh(new_ip, "hostname")
        if success and hostname in hostname_check:
            print(f"  ✓ SUCCESS: {hostname} now at {new_ip}")
            return True

    print(f"  ✗ FAILED to verify")
    return False

def main():
    print("="*70)
    print("URGENT IP FIX - VMIDs 300, 303, 306")
    print("="*70)
    print("")
    print("Required configuration:")
    print("  VMID 300 (k3s-master01) → 10.88.145.190 ✓ Already correct")
    print("  VMID 303 (k3s-master02) → 10.88.145.192 (currently at .193)")
    print("  VMID 306 (k3s-master03) → 10.88.145.196 (not accessible)")
    print("")
    print("Strategy:")
    print("  1. Move k3s-worker02: .192 → .197 (temporary)")
    print("  2. Move k3s-master02: .193 → .192")
    print("  3. Move k3s-worker02: .197 → .193")
    print("  4. Find k3s-master03 and configure to .196")
    print("")

    input("Press Enter to start immediate fix (or Ctrl+C to cancel)...")

    # Step 1: Move k3s-worker02 out of the way
    if not change_ip("k3s-worker02", "10.88.145.192", "10.88.145.197"):
        print("\n✗ Failed at step 1")
        return 1

    # Step 2: Move k3s-master02 to correct IP
    if not change_ip("k3s-master02", "10.88.145.193", "10.88.145.192"):
        print("\n✗ Failed at step 2")
        return 1

    # Step 3: Move k3s-worker02 to .193
    if not change_ip("k3s-worker02", "10.88.145.197", "10.88.145.193"):
        print("\n✗ Failed at step 3")
        return 1

    print(f"\n{'='*70}")
    print("Phase 1 Complete - k3s-master02 now at .192")
    print(f"{'='*70}")
    print("")
    print("Remaining: k3s-master03 needs console configuration to .196")
    print("Run: ./find-master03.py for console access instructions")

    return 0

if __name__ == "__main__":
    try:
        exit(main())
    except KeyboardInterrupt:
        print("\n\nCancelled")
        exit(130)
