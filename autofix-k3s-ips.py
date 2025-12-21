#!/Users/ryandahlberg/Projects/cortex/venv/bin/python3
"""
Automated IP fix for K3s VMs using Proxmox API commands
This script will stop each VM, modify the disk to fix IPs, then restart
"""
import requests
import urllib3
import time
import sys
import subprocess
import os

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

PROXMOX_HOST = "10.88.140.164"
PROXMOX_TOKEN = "root@pam!cortex-k3s-display=7e74841c-0eb1-4181-8926-aaa9f0103c58"
API_BASE = f"https://{PROXMOX_HOST}:8006/api2/json"
NODE = "pve01"
K3S_USER = "k3s"
K3S_PASSWORD = "toor"

headers = {"Authorization": f"PVEAPIToken={PROXMOX_TOKEN}"}

VMS = [
    {"vmid": 303, "name": "k3s-master02", "new_ip": "10.88.145.193"},
    {"vmid": 304, "name": "k3s-worker03", "new_ip": "10.88.145.194"},
    {"vmid": 305, "name": "k3s-worker04", "new_ip": "10.88.145.195"},
    {"vmid": 306, "name": "k3s-master03", "new_ip": "10.88.145.196"},
]

def proxmox_request(method, endpoint, data=None):
    """Make Proxmox API request"""
    url = f"{API_BASE}{endpoint}"
    try:
        if method == "GET":
            r = requests.get(url, headers=headers, verify=False, timeout=30)
        elif method == "POST":
            r = requests.post(url, headers=headers, data=data, verify=False, timeout=30)
        elif method == "PUT":
            r = requests.put(url, headers=headers, data=data, verify=False, timeout=30)
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
    time.sleep(10)

def stop_vm(vmid):
    """Stop VM"""
    print(f"  Stopping VM {vmid}...")
    proxmox_request("POST", f"/nodes/{NODE}/qemu/{vmid}/status/stop")

    # Wait for shutdown
    for i in range(30):
        status = get_vm_status(vmid)
        if status.get("status") == "stopped":
            print(f"  VM {vmid} stopped")
            return True
        time.sleep(2)

    print(f"  Warning: VM {vmid} may not have stopped cleanly")
    return False

def wait_for_ssh(ip, timeout=180):
    """Wait for SSH to become available"""
    print(f"  Waiting for SSH on {ip}...")
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
                print(f"  SSH ready on {ip}")
                return True
        except:
            pass
        time.sleep(5)

    return False

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

def fix_vm_via_script(vm):
    """Fix VM IP by using a boot script via cloud-init or similar"""
    vmid = vm["vmid"]
    name = vm["name"]
    new_ip = vm["new_ip"]

    print(f"\n{'='*70}")
    print(f"Fixing {name} (VMID {vmid}) -> {new_ip}")
    print(f"{'='*70}")

    # Make sure VM is running
    status = get_vm_status(vmid)
    if status.get("status") != "running":
        start_vm(vmid)
        time.sleep(30)

    # Create a script to fix IP
    fix_script = f"""#!/bin/bash
# Fix IP address for {name}

# Update netplan
cat > /tmp/netplan.yaml << 'EOF'
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

sudo cp /tmp/netplan.yaml /etc/netplan/00-installer-config.yaml
sudo hostnamectl set-hostname {name}
sudo netplan apply
echo "IP fixed to {new_ip}"
"""

    # Try to create the script via qemu-agent if available
    # Otherwise we'll need manual intervention

    print(f"  VM {vmid} needs manual IP configuration")
    print(f"  Please use Proxmox console to:")
    print(f"    1. Login as {K3S_USER}")
    print(f"    2. sudo nano /etc/netplan/00-installer-config.yaml")
    print(f"    3. Change IP to: {new_ip}/24")
    print(f"    4. sudo hostnamectl set-hostname {name}")
    print(f"    5. sudo netplan apply && sudo reboot")

    return False

def main():
    print("="*70)
    print("K3s VM IP Address Automated Fix")
    print("="*70)

    print("\nThis script will guide you through fixing IPs for 4 VMs:")
    for vm in VMS:
        print(f"  - {vm['name']} (VMID {vm['vmid']}) -> {vm['new_ip']}")

    print("\n" + "="*70)
    print("APPROACH: Manual console access required")
    print("="*70)
    print("\nDue to IP conflicts, each VM needs manual console configuration.")
    print(f"Open Proxmox: https://{PROXMOX_HOST}:8006")
    print("")

    for vm in VMS:
        vmid = vm["vmid"]
        name = vm["name"]
        new_ip = vm["new_ip"]

        print(f"\n{'='*70}")
        print(f"VM {vmid}: {name} -> {new_ip}")
        print(f"{'='*70}")

        # Ensure VM is started
        status = get_vm_status(vmid)
        if status.get("status") != "running":
            print(f"  Starting VM {vmid}...")
            start_vm(vmid)
            time.sleep(20)
        else:
            print(f"  VM {vmid} is already running")

        print(f"\nConsole commands for {name}:")
        print(f"  1. Open console for VM {vmid} in Proxmox UI")
        print(f"  2. Login: {K3S_USER} / {K3S_PASSWORD}")
        print(f"  3. Run:")
        print(f"")
        print(f"     sudo nano /etc/netplan/00-installer-config.yaml")
        print(f"")
        print(f"     Change this line:")
        print(f"       addresses:")
        print(f"         - {new_ip}/24")
        print(f"")
        print(f"     Save: Ctrl+O, Exit: Ctrl+X")
        print(f"")
        print(f"     sudo hostnamectl set-hostname {name}")
        print(f"     sudo netplan apply")
        print(f"     sudo reboot")
        print(f"")

        input(f"Press Enter when {name} configuration is complete...")

        # Wait a bit for reboot
        print(f"  Waiting 30s for {name} to reboot...")
        time.sleep(30)

        # Try to verify SSH
        if wait_for_ssh(new_ip, timeout=120):
            print(f"  SUCCESS: {name} is accessible at {new_ip}")

            # Verify hostname
            success, output = run_ssh_command(new_ip, "hostname")
            if success:
                print(f"  Hostname: {output.strip()}")
        else:
            print(f"  WARNING: Cannot verify SSH at {new_ip}")
            print(f"  You may need to check the VM manually")

    # Final verification
    print(f"\n{'='*70}")
    print("Final Verification")
    print(f"{'='*70}")

    all_good = True
    for vm in VMS:
        name = vm["name"]
        new_ip = vm["new_ip"]

        print(f"\nTesting {name} ({new_ip})...")
        if wait_for_ssh(new_ip, timeout=30):
            success, hostname = run_ssh_command(new_ip, "hostname")
            if success:
                print(f"  SUCCESS: {hostname.strip()} at {new_ip}")
            else:
                print(f"  WARNING: SSH works but hostname check failed")
                all_good = False
        else:
            print(f"  FAILED: Cannot SSH to {new_ip}")
            all_good = False

    if all_good:
        print(f"\n{'='*70}")
        print("All VMs configured successfully!")
        print(f"{'='*70}")
        return 0
    else:
        print(f"\n{'='*70}")
        print("Some VMs need attention - check manually")
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
