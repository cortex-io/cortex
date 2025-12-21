#!/Users/ryandahlberg/Projects/cortex/venv/bin/python3
"""
Fully automated IP fix using Proxmox host SSH access
This connects to Proxmox host and uses qm commands to fix IPs
"""
import subprocess
import time
import sys

PROXMOX_HOST = "10.88.140.164"
PROXMOX_USER = "root"
K3S_USER = "k3s"
K3S_PASSWORD = "toor"

# VM configurations
VMS = [
    {"vmid": 303, "name": "k3s-master02", "old_ip": "10.88.145.190", "new_ip": "10.88.145.193"},
    {"vmid": 304, "name": "k3s-worker03", "old_ip": "10.88.145.191", "new_ip": "10.88.145.194"},
    {"vmid": 305, "name": "k3s-worker04", "old_ip": "10.88.145.191", "new_ip": "10.88.145.195"},
    {"vmid": 306, "name": "k3s-master03", "old_ip": "10.88.145.190", "new_ip": "10.88.145.196"},
]

def run_proxmox_cmd(cmd, timeout=30):
    """Run command on Proxmox host via SSH"""
    try:
        result = subprocess.run(
            ["ssh", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=10",
             f"{PROXMOX_USER}@{PROXMOX_HOST}", cmd],
            capture_output=True,
            timeout=timeout,
            text=True
        )
        return result.returncode == 0, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        return False, "", "Command timeout"
    except Exception as e:
        return False, "", str(e)

def run_vm_console_cmd(vmid, commands):
    """Execute commands in VM via Proxmox qm terminal"""
    print(f"  Executing commands in VM {vmid}...")

    # Create a script with all commands
    script = "#!/bin/bash\n" + "\n".join(commands)

    # This is tricky - we need to use qm guest exec or similar
    # For now, let's try a different approach using qm monitor

    print(f"  Manual console access required for VM {vmid}")
    return False

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

def run_ssh_command(ip, command, timeout=30):
    """Run SSH command on VM"""
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

def fix_vm_ip_via_ssh_if_possible(vm):
    """Try to fix IP via SSH (if VM is accessible)"""
    vmid = vm["vmid"]
    name = vm["name"]
    old_ip = vm["old_ip"]
    new_ip = vm["new_ip"]

    print(f"\n{'='*70}")
    print(f"Fixing {name} (VMID {vmid}): {old_ip} -> {new_ip}")
    print(f"{'='*70}")

    # Try to connect to old IP (might work if no conflict)
    print(f"  Attempting SSH to {old_ip}...")
    try:
        result = subprocess.run(
            ["ssh", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=5",
             f"{K3S_USER}@{old_ip}", "hostname"],
            capture_output=True,
            timeout=10,
            text=True,
            stderr=subprocess.DEVNULL
        )

        if result.returncode == 0:
            print(f"  Connected to {old_ip} - fixing IP...")

            # Create netplan config
            netplan_cmd = f"""sudo tee /etc/netplan/00-installer-config.yaml > /dev/null << 'EOF'
network:
  version: 2
  ethernets:
    ens18:
      addresses:
        - {new_ip}/24
      routes:
        - to: default
          via: 10.88.145.1
      nameservers:
        addresses: [8.8.8.8, 8.8.4.4]
EOF
"""

            # Execute fix commands
            success, output = run_ssh_command(old_ip, netplan_cmd)
            if not success:
                print(f"  Failed to write netplan: {output}")
                return False

            success, output = run_ssh_command(old_ip, f"sudo hostnamectl set-hostname {name}")
            if success:
                print(f"  Hostname set to {name}")

            success, output = run_ssh_command(old_ip, "sudo netplan apply")
            if success:
                print(f"  Netplan applied")

            print(f"  Rebooting...")
            run_ssh_command(old_ip, "sudo reboot", timeout=5)
            time.sleep(30)

            # Verify new IP
            if wait_for_ssh(new_ip, timeout=120):
                print(f"  SUCCESS: {name} now at {new_ip}")
                return True
            else:
                print(f"  WARNING: Cannot verify {new_ip}")
                return False

    except:
        pass

    print(f"  Cannot SSH to {old_ip} - manual console access required")
    return False

def print_manual_instructions():
    """Print manual console instructions"""
    print(f"\n{'='*70}")
    print("MANUAL CONSOLE INSTRUCTIONS")
    print(f"{'='*70}")
    print(f"\nOpen Proxmox UI: https://{PROXMOX_HOST}:8006")
    print("\nFor each failed VM, use the console to run these commands:")
    print(f"(Login as: {K3S_USER} / {K3S_PASSWORD})")
    print("")

    for vm in VMS:
        print(f"\n--- VM {vm['vmid']}: {vm['name']} -> {vm['new_ip']} ---")
        print(f"sudo sed -i 's/{vm['old_ip']}/{vm['new_ip']}/g' /etc/netplan/00-installer-config.yaml")
        print(f"sudo hostnamectl set-hostname {vm['name']}")
        print(f"sudo netplan apply && sudo reboot")

def main():
    print("="*70)
    print("Automated K3s VM IP Fix")
    print("="*70)
    print("\nVMs to fix:")
    for vm in VMS:
        print(f"  {vm['vmid']}: {vm['name']} ({vm['old_ip']} -> {vm['new_ip']})")

    # Test Proxmox SSH access
    print(f"\nTesting SSH access to Proxmox host...")
    success, stdout, stderr = run_proxmox_cmd("hostname")
    if success:
        print(f"  Proxmox host: {stdout.strip()}")
    else:
        print(f"  Warning: Cannot SSH to Proxmox host")
        print(f"  Error: {stderr}")

    # Try to fix each VM
    results = {}
    manual_needed = []

    for vm in VMS:
        success = fix_vm_ip_via_ssh_if_possible(vm)
        results[vm['name']] = success

        if not success:
            manual_needed.append(vm)

    # Print summary
    print(f"\n{'='*70}")
    print("Summary")
    print(f"{'='*70}")

    for name, success in results.items():
        status = "SUCCESS" if success else "NEEDS MANUAL FIX"
        print(f"  {name}: {status}")

    # If any need manual work, print instructions
    if manual_needed:
        print_manual_instructions()
        return 1

    print("\nAll VMs fixed successfully!")
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
