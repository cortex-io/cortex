#!/Users/ryandahlberg/Projects/cortex/venv/bin/python3
"""
Fix k3s-master03 IP using Proxmox API
Since VM is not SSH accessible, we'll use cloud-init or API methods
"""
import requests
import urllib3
import time

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

def main():
    print("="*70)
    print("Fix k3s-master03 IP via Proxmox API")
    print("="*70)
    print("")

    # Get current VM config
    print("Getting VM configuration...")
    config = proxmox_request("GET", f"/nodes/{NODE}/qemu/{VMID}/config")

    if not config:
        print("ERROR: Could not get VM config")
        return 1

    vm_config = config.get("data", {})
    print(f"VM Name: {vm_config.get('name')}")
    print(f"Current config keys: {list(vm_config.keys())}")
    print("")

    # Check if cloud-init is available
    if 'ipconfig0' in vm_config or 'ciuser' in vm_config:
        print("Cloud-init detected! Using cloud-init to set IP...")

        # Set IP via cloud-init
        update_data = {
            'ipconfig0': 'ip=10.88.145.196/24,gw=10.88.145.1'
        }

        print("Updating cloud-init configuration...")
        result = proxmox_request("PUT", f"/nodes/{NODE}/qemu/{VMID}/config", update_data)

        if result:
            print("✓ Cloud-init config updated")
            print("")
            print("Rebooting VM to apply changes...")

            # Reboot VM
            proxmox_request("POST", f"/nodes/{NODE}/qemu/{VMID}/status/reboot")

            print("Waiting 45 seconds for VM to reboot...")
            time.sleep(45)

            print("")
            print("✓ VM rebooted")
            print("")
            print("Verify with: ssh k3s@10.88.145.196 hostname")
            return 0
        else:
            print("✗ Failed to update cloud-init config")
    else:
        print("⚠ Cloud-init not detected")
        print("")
        print("Manual console access required:")
        print("  1. Open: https://10.88.140.164:8006")
        print("  2. Navigate to VM 306")
        print("  3. Open Console")
        print("  4. Login: k3s / toor")
        print("  5. Edit: sudo nano /etc/netplan/50-cloud-init.yaml")
        print("  6. Set IP: 10.88.145.196/24")
        print("  7. Apply: sudo netplan apply && sudo reboot")
        print("")
        print("See: FIX-MASTER03-CONSOLE-NOW.md")
        return 1

if __name__ == "__main__":
    exit(main())
