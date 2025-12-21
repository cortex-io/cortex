#!/Users/ryandahlberg/Projects/cortex/venv/bin/python3
"""
Find k3s-master03 via Proxmox API and get its console access
"""
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Proxmox Configuration
PROXMOX_HOST = "10.88.140.164"
PROXMOX_TOKEN = "root@pam!cortex-k3s-display=7e74841c-0eb1-4181-8926-aaa9f0103c58"
API_BASE = f"https://{PROXMOX_HOST}:8006/api2/json"
NODE = "pve01"

headers = {"Authorization": f"PVEAPIToken={PROXMOX_TOKEN}"}

def proxmox_request(method, endpoint):
    """Make Proxmox API request"""
    url = f"{API_BASE}{endpoint}"
    try:
        if method == "GET":
            r = requests.get(url, headers=headers, verify=False, timeout=30)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"API Error: {e}")
        return None

def main():
    print("="*70)
    print("Finding k3s-master03 (VMID 306)")
    print("="*70)

    # Get VM 306 status
    vmid = 306
    result = proxmox_request("GET", f"/nodes/{NODE}/qemu/{vmid}/status/current")

    if result:
        data = result.get("data", {})
        print(f"\nVM {vmid} Status:")
        print(f"  Name: {data.get('name', 'unknown')}")
        print(f"  Status: {data.get('status', 'unknown')}")
        print(f"  Memory: {data.get('mem', 0) / (1024**3):.1f}GB / {data.get('maxmem', 0) / (1024**3):.1f}GB")
        print(f"  CPUs: {data.get('cpus', 'unknown')}")
        print(f"  Uptime: {data.get('uptime', 0)} seconds")

        # Get network config
        config = proxmox_request("GET", f"/nodes/{NODE}/qemu/{vmid}/config")
        if config:
            cfg = config.get("data", {})
            print(f"\nNetwork Configuration:")
            for key, value in cfg.items():
                if key.startswith("net"):
                    print(f"  {key}: {value}")

        print(f"\n{'='*70}")
        print("Access Options:")
        print(f"{'='*70}")
        print(f"\n1. Via Proxmox Console:")
        print(f"   - Go to: https://{PROXMOX_HOST}:8006")
        print(f"   - Navigate to VM {vmid} (k3s-master03)")
        print(f"   - Click 'Console'")
        print(f"   - Login as: k3s / toor")
        print(f"   - Check current IP: ip addr show ens18 | grep 'inet 10'")

        print(f"\n2. Commands to fix IP (run in console):")
        print(f"   sudo nano /etc/netplan/50-cloud-init.yaml")
        print(f"   (Change IP to: 10.88.145.196/24)")
        print(f"   sudo netplan apply")
        print(f"   sudo reboot")

        print(f"\n3. Or use automated script (if SSH is accessible):")
        print(f"   ./fix-master03-ip.py")

if __name__ == "__main__":
    main()
