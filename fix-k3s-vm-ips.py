#!/Users/ryandahlberg/Projects/cortex/venv/bin/python3
"""
Fix IP addresses for cloned K3s VMs using Proxmox console
"""
import requests
import urllib3
import time
import sys
import subprocess

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

PROXMOX_HOST = "10.88.140.164"
PROXMOX_TOKEN = "root@pam!cortex-k3s-display=7e74841c-0eb1-4181-8926-aaa9f0103c58"
API_BASE = f"https://{PROXMOX_HOST}:8006/api2/json"
NODE = "pve01"
K3S_USER = "k3s"
K3S_PASSWORD = "toor"
NETWORK_GATEWAY = "10.88.145.1"

headers = {"Authorization": f"PVEAPIToken={PROXMOX_TOKEN}"}

# VM configurations: vmid, name, current_ip, new_ip
VMS_TO_FIX = [
    {"vmid": 303, "name": "k3s-master02", "current_ip": "10.88.145.190", "new_ip": "10.88.145.193"},
    {"vmid": 304, "name": "k3s-worker03", "current_ip": "10.88.145.191", "new_ip": "10.88.145.194"},
    {"vmid": 305, "name": "k3s-worker04", "current_ip": "10.88.145.191", "new_ip": "10.88.145.195"},
    {"vmid": 306, "name": "k3s-master03", "current_ip": "10.88.145.190", "new_ip": "10.88.145.196"},
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

def wait_for_ssh(ip, timeout=300):
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

def start_vm(vmid):
    """Start a VM"""
    print(f"  Starting VM {vmid}...")
    try:
        r = requests.post(
            f"{API_BASE}/nodes/{NODE}/qemu/{vmid}/status/start",
            headers=headers,
            verify=False,
            timeout=30
        )
        if r.status_code == 200:
            print(f"  VM {vmid} started")
            time.sleep(30)  # Wait for boot
            return True
        else:
            print(f"  Failed to start VM: {r.text}")
            return False
    except Exception as e:
        print(f"  Error starting VM: {e}")
        return False

def fix_vm_ip(vm):
    """Fix IP address for a single VM via SSH"""
    vmid = vm["vmid"]
    name = vm["name"]
    new_ip = vm["new_ip"]

    print(f"\n{'='*70}")
    print(f"Fixing {name} (VMID {vmid})")
    print(f"{'='*70}")

    # Make sure VM is running
    start_vm(vmid)

    # Try SSH with current IP (might work if no conflicts)
    current_ip = vm["current_ip"]
    print(f"\nAttempting SSH to {current_ip}...")

    if not wait_for_ssh(current_ip, timeout=60):
        print(f"\n  Cannot SSH to {current_ip} - this is expected due to IP conflicts")
        print(f"  Manual console access required for VM {vmid}")
        print(f"\n  To fix manually via Proxmox console:")
        print(f"    1. Open console for VM {vmid} in Proxmox web UI")
        print(f"    2. Login as: {K3S_USER} / {K3S_PASSWORD}")
        print(f"    3. Edit netplan: sudo nano /etc/netplan/00-installer-config.yaml")
        print(f"    4. Change IP to: {new_ip}/24")
        print(f"    5. Save and run: sudo netplan apply")
        print(f"    6. Change hostname: sudo hostnamectl set-hostname {name}")
        print(f"    7. Reboot: sudo reboot")
        return False

    # If we can SSH, fix the IP
    print(f"\n  Connected via SSH - fixing configuration...")

    # Create netplan config
    netplan_config = f"""network:
  version: 2
  ethernets:
    ens18:
      addresses:
        - {new_ip}/24
      routes:
        - to: default
          via: {NETWORK_GATEWAY}
      nameservers:
        addresses: [8.8.8.8, 8.8.4.4]
"""

    # Write netplan config
    print("  Writing netplan configuration...")
    cmd = f"echo '{netplan_config}' | sudo tee /etc/netplan/00-installer-config.yaml"
    success, output = run_ssh_command(current_ip, cmd)

    if not success:
        print(f"  Failed to write netplan config: {output}")
        return False

    # Set hostname
    print(f"  Setting hostname to {name}...")
    success, output = run_ssh_command(current_ip, f"sudo hostnamectl set-hostname {name}")

    if not success:
        print(f"  Warning: Failed to set hostname: {output}")

    # Apply netplan
    print("  Applying netplan configuration...")
    success, output = run_ssh_command(current_ip, "sudo netplan apply")

    if success:
        print(f"  Netplan applied successfully")
        print(f"  Waiting 10s for network to stabilize...")
        time.sleep(10)
    else:
        print(f"  Warning: Netplan apply may have failed: {output}")

    # Reboot to ensure changes take effect
    print("  Rebooting VM...")
    run_ssh_command(current_ip, "sudo reboot")
    time.sleep(30)

    # Verify new IP
    print(f"\n  Verifying new IP {new_ip}...")
    if wait_for_ssh(new_ip, timeout=120):
        print(f"  SUCCESS: {name} is now accessible at {new_ip}")
        return True
    else:
        print(f"  WARNING: Cannot verify {name} at {new_ip}")
        return False

def main():
    print("="*70)
    print("K3s VM IP Address Fix Script")
    print("="*70)
    print("\nVMs to fix:")
    for vm in VMS_TO_FIX:
        print(f"  - {vm['name']} (VMID {vm['vmid']}): {vm['current_ip']} -> {vm['new_ip']}")

    print("\n" + "="*70)
    print("IMPORTANT: If SSH fails, you will need to use Proxmox console")
    print("="*70)

    input("\nPress Enter to continue or Ctrl+C to cancel...")

    results = {}

    # Try to fix all VMs
    for vm in VMS_TO_FIX:
        success = fix_vm_ip(vm)
        results[vm['name']] = success

    # Summary
    print("\n" + "="*70)
    print("Summary")
    print("="*70)

    for name, success in results.items():
        status = "SUCCESS" if success else "NEEDS MANUAL FIX"
        print(f"  {name}: {status}")

    # Check if all succeeded
    all_success = all(results.values())

    if all_success:
        print("\nAll VMs fixed successfully!")
        return 0
    else:
        print("\nSome VMs need manual configuration via Proxmox console.")
        print("See instructions above for each failed VM.")
        return 1

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
