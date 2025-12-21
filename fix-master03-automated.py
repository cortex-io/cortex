#!/Users/ryandahlberg/Projects/cortex/venv/bin/python3
"""
Automated fix for k3s-master03 IP using Proxmox qm commands
This script will attempt to configure the VM via Proxmox host SSH
"""
import subprocess
import time
import sys

# Configuration
PROXMOX_HOST = "10.88.140.164"
VMID = 306
TARGET_IP = "10.88.145.196"
NODE = "pve01"

def run_ssh_command(command, timeout=30):
    """Execute command on Proxmox host via SSH"""
    ssh_cmd = [
        "ssh",
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null",
        "-o", "ConnectTimeout=10",
        f"root@{PROXMOX_HOST}",
        command
    ]

    try:
        result = subprocess.run(
            ssh_cmd,
            capture_output=True,
            text=True,
            timeout=timeout
        )
        return result.returncode, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        return -1, "", "Command timed out"
    except Exception as e:
        return -1, "", str(e)

def check_vm_status():
    """Check if VM is running"""
    print("Checking VM status...")
    code, stdout, stderr = run_ssh_command(f"qm status {VMID}")

    if code == 0:
        print(f"VM Status: {stdout.strip()}")
        return "running" in stdout.lower()
    else:
        print(f"Error checking status: {stderr}")
        return False

def execute_vm_command(cmd):
    """Execute command inside VM using qm guest exec"""
    qm_cmd = f"qm guest exec {VMID} -- bash -c '{cmd}'"
    print(f"Executing in VM: {cmd}")
    return run_ssh_command(qm_cmd, timeout=60)

def main():
    print("="*70)
    print("Automated Fix for k3s-master03 IP Address")
    print("="*70)
    print()
    print(f"Target VM: {VMID} (k3s-master03)")
    print(f"Target IP: {TARGET_IP}/24")
    print()

    # Check if we can SSH to Proxmox
    print("Testing SSH connection to Proxmox host...")
    code, stdout, stderr = run_ssh_command("hostname")

    if code != 0:
        print(f"FAILED: Cannot SSH to Proxmox host")
        print(f"Error: {stderr}")
        print()
        print("Alternative: Use manual console access")
        print(f"  1. Open: https://{PROXMOX_HOST}:8006")
        print(f"  2. Go to VM {VMID}")
        print(f"  3. Click Console")
        print(f"  4. Login: k3s / toor")
        print(f"  5. Run:")
        print(f"     sudo sed -i 's/10\\.88\\.145\\.[0-9]*/10.88.145.196/g' /etc/netplan/50-cloud-init.yaml")
        print(f"     sudo hostnamectl set-hostname k3s-master03")
        print(f"     sudo netplan apply && sudo reboot")
        return 1

    print(f"Connected to Proxmox host: {stdout.strip()}")
    print()

    # Check VM status
    if not check_vm_status():
        print("VM is not running. Starting VM...")
        run_ssh_command(f"qm start {VMID}")
        print("Waiting 30 seconds for VM to boot...")
        time.sleep(30)

    print()
    print("Attempting to configure IP via qm guest commands...")
    print("Note: This requires qemu-guest-agent running in the VM")
    print()

    # Try to execute commands via qemu-guest-agent
    commands = [
        "cat /etc/netplan/50-cloud-init.yaml",
        "sed -i 's/10\\.88\\.145\\.[0-9]*/10.88.145.196/g' /etc/netplan/50-cloud-init.yaml",
        "hostnamectl set-hostname k3s-master03",
        "netplan apply",
    ]

    for cmd in commands:
        code, stdout, stderr = execute_vm_command(cmd)

        if code == 0:
            print(f"  SUCCESS: {cmd}")
            if stdout:
                print(f"  Output: {stdout[:200]}")
        else:
            print(f"  FAILED: {cmd}")
            print(f"  Error: {stderr}")

            # If qemu-guest-agent doesn't work, fall back to manual
            if "not enabled" in stderr.lower() or "not running" in stderr.lower():
                print()
                print("QEMU Guest Agent not available.")
                print()
                print("MANUAL CONSOLE STEPS REQUIRED:")
                print()
                print(f"1. Open Proxmox UI: https://{PROXMOX_HOST}:8006")
                print(f"2. Navigate to VM {VMID} (k3s-master03)")
                print(f"3. Click 'Console' button")
                print(f"4. Login: k3s / toor")
                print(f"5. Run these commands:")
                print()
                print(f"   sudo sed -i 's/10\\.88\\.145\\.[0-9]*/10.88.145.196/g' /etc/netplan/50-cloud-init.yaml")
                print(f"   sudo hostnamectl set-hostname k3s-master03")
                print(f"   sudo netplan apply")
                print(f"   sudo reboot")
                print()
                print(f"6. Wait 30 seconds, then verify:")
                print(f"   ssh k3s@{TARGET_IP} hostname")
                print()
                return 1

        time.sleep(2)

    # Reboot the VM
    print()
    print("Rebooting VM to apply changes...")
    code, stdout, stderr = run_ssh_command(f"qm reboot {VMID}")

    if code == 0:
        print("VM reboot initiated")
        print("Waiting 45 seconds for VM to restart...")
        time.sleep(45)

        # Try to verify
        print()
        print(f"Verifying SSH access at {TARGET_IP}...")
        verify_cmd = f"ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no k3s@{TARGET_IP} hostname"
        code, stdout, stderr = subprocess.run(
            verify_cmd.split(),
            capture_output=True,
            text=True,
            timeout=15
        )

        if code == 0 and "k3s-master03" in stdout:
            print()
            print("="*70)
            print("SUCCESS!")
            print("="*70)
            print(f"VM {VMID} is now accessible at {TARGET_IP}")
            print(f"Hostname: {stdout.strip()}")
            return 0
        else:
            print(f"Verification failed. SSH might not be ready yet.")
            print(f"Try: ssh k3s@{TARGET_IP} hostname")
            return 1
    else:
        print(f"Reboot failed: {stderr}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
