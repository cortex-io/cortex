#!/Users/ryandahlberg/Projects/cortex/venv/bin/python3
"""
Fix k3s-master03 IP using Proxmox VNC/Console API
Execute commands directly in the VM console
"""
import requests
import urllib3
import time
import subprocess

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Proxmox Configuration
PROXMOX_HOST = "10.88.140.164"
PROXMOX_TOKEN = "root@pam!cortex-k3s-display=7e74841c-0eb1-4181-8926-aaa9f0103c58"
API_BASE = f"https://{PROXMOX_HOST}:8006/api2/json"
NODE = "pve01"
VMID = 306

headers = {"Authorization": f"PVEAPIToken={PROXMOX_TOKEN}"}

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

        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"API Error: {e}")
        return None

def execute_in_vm_via_ssh_tunnel():
    """
    Since VM might be accessible at another IP, let's try to find it first
    Then use that to configure it
    """
    print("Strategy: Use cloud-init drive to set IP")
    print("")

    # Stop the VM
    print("1. Stopping VM 306...")
    result = proxmox_request("POST", f"/nodes/{NODE}/qemu/{VMID}/status/stop")
    if result:
        print("   VM stop command sent")
        time.sleep(10)

    # Update cloud-init network config
    print("2. Setting IP via cloud-init...")
    update_data = {
        'ipconfig0': 'ip=10.88.145.196/24,gw=10.88.145.1',
        'nameserver': '8.8.8.8 8.8.4.4'
    }

    result = proxmox_request("PUT", f"/nodes/{NODE}/qemu/{VMID}/config", update_data)
    if result:
        print("   Cloud-init config updated")
    else:
        print("   Failed to update cloud-init - trying different method...")

        # Alternative: use cicustom to inject network config
        # This creates a custom cloud-init config
        update_data = {
            'net0': 'virtio,bridge=vmbr1',
            'ipconfig0': 'ip=10.88.145.196/24,gw=10.88.145.1'
        }
        result = proxmox_request("PUT", f"/nodes/{NODE}/qemu/{VMID}/config", update_data)

    # Start the VM
    print("3. Starting VM...")
    result = proxmox_request("POST", f"/nodes/{NODE}/qemu/{VMID}/status/start")
    if result:
        print("   VM start command sent")

    print("")
    print("Waiting 45 seconds for VM to boot with new config...")
    time.sleep(45)

    # Test SSH
    print("")
    print("4. Testing SSH at 10.88.145.196...")
    result = subprocess.run(
        ["ssh", "-o", "ConnectTimeout=5", "-o", "StrictHostKeyChecking=no",
         "k3s@10.88.145.196", "hostname && ip addr show ens18 | grep 'inet 10'"],
        capture_output=True,
        text=True,
        timeout=10
    )

    if result.returncode == 0:
        print("   ✓ SUCCESS!")
        print(f"   {result.stdout}")
        return True
    else:
        print("   ✗ Not accessible yet")
        print(f"   Error: {result.stderr}")
        return False

def main():
    print("="*70)
    print("Fix k3s-master03 (VMID 306) IP to 10.88.145.196")
    print("="*70)
    print("")

    result = execute_in_vm_via_ssh_tunnel()

    if result:
        print("")
        print("="*70)
        print("✓ SUCCESS - k3s-master03 is now at 10.88.145.196")
        print("="*70)
        return 0
    else:
        print("")
        print("="*70)
        print("⚠ VM started but need to verify")
        print("="*70)
        print("Check manually: ssh k3s@10.88.145.196 hostname")
        return 1

if __name__ == "__main__":
    exit(main())
