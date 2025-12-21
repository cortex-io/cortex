#!/Users/ryandahlberg/Projects/cortex/venv/bin/python3
"""
Check current IPs for VMIDs 300, 303, 306 via Proxmox API
"""
import requests
import urllib3
import subprocess

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Proxmox Configuration
PROXMOX_HOST = "10.88.140.164"
PROXMOX_TOKEN = "root@pam!cortex-k3s-display=7e74841c-0eb1-4181-8926-aaa9f0103c58"
API_BASE = f"https://{PROXMOX_HOST}:8006/api2/json"
NODE = "pve01"

headers = {"Authorization": f"PVEAPIToken={PROXMOX_TOKEN}"}

K3S_USER = "k3s"

# Required mapping
REQUIRED_MAPPING = {
    300: {"expected_ip": "10.88.145.190"},
    303: {"expected_ip": "10.88.145.192"},
    306: {"expected_ip": "10.88.145.196"}
}

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

def check_ssh_ip(ip):
    """Check if we can SSH to this IP and get hostname"""
    try:
        result = subprocess.run(
            ["ssh", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=3",
             f"{K3S_USER}@{ip}", "hostname && ip addr show ens18 | grep 'inet 10'"],
            capture_output=True,
            timeout=5,
            text=True
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except:
        pass
    return None

def main():
    print("="*70)
    print("Checking VMIDs 300, 303, 306")
    print("="*70)
    print("")

    issues = []

    for vmid, config in REQUIRED_MAPPING.items():
        expected_ip = config["expected_ip"]

        print(f"VMID {vmid} (should be at {expected_ip}):")

        # Get VM info from Proxmox
        result = proxmox_request("GET", f"/nodes/{NODE}/qemu/{vmid}/status/current")
        if result:
            data = result.get("data", {})
            vm_name = data.get("name", "unknown")
            vm_status = data.get("status", "unknown")
            print(f"  Name: {vm_name}")
            print(f"  Status: {vm_status}")

            # Check if accessible at expected IP
            print(f"  Testing SSH at {expected_ip}...", end=" ")
            ssh_result = check_ssh_ip(expected_ip)
            if ssh_result:
                lines = ssh_result.split('\n')
                hostname = lines[0] if lines else "unknown"
                ip_info = lines[1] if len(lines) > 1 else ""

                if hostname == vm_name:
                    print(f"✓ CORRECT")
                    print(f"    Hostname: {hostname}")
                    print(f"    {ip_info}")
                else:
                    print(f"✗ WRONG HOSTNAME")
                    print(f"    Expected: {vm_name}, Got: {hostname}")
                    issues.append({
                        "vmid": vmid,
                        "name": vm_name,
                        "issue": f"Different hostname at {expected_ip}: {hostname}"
                    })
            else:
                print(f"✗ NOT ACCESSIBLE")
                # Try to find where it actually is
                print(f"  Scanning for {vm_name}...")
                for i in range(190, 200):
                    test_ip = f"10.88.145.{i}"
                    result = check_ssh_ip(test_ip)
                    if result and vm_name in result:
                        print(f"    Found at {test_ip} instead!")
                        issues.append({
                            "vmid": vmid,
                            "name": vm_name,
                            "current_ip": test_ip,
                            "expected_ip": expected_ip,
                            "issue": "wrong_ip"
                        })
                        break
                else:
                    print(f"    Not found in range .190-.199")
                    issues.append({
                        "vmid": vmid,
                        "name": vm_name,
                        "expected_ip": expected_ip,
                        "issue": "not_found"
                    })
        print("")

    print("="*70)
    print("Summary")
    print("="*70)
    print("")

    if not issues:
        print("✓ All VMs have correct IP addresses!")
    else:
        print(f"✗ {len(issues)} VMs need attention:")
        print("")
        for issue in issues:
            if issue.get("issue") == "wrong_ip":
                print(f"  VMID {issue['vmid']} ({issue['name']}):")
                print(f"    Current IP: {issue['current_ip']}")
                print(f"    Expected IP: {issue['expected_ip']}")
                print(f"    Action: Change IP from {issue['current_ip']} to {issue['expected_ip']}")
            elif issue.get("issue") == "not_found":
                print(f"  VMID {issue['vmid']} ({issue['name']}):")
                print(f"    Status: Not accessible via SSH")
                print(f"    Expected IP: {issue['expected_ip']}")
                print(f"    Action: Use Proxmox console to configure")
            else:
                print(f"  VMID {issue['vmid']} ({issue['name']}): {issue['issue']}")

        return issues

if __name__ == "__main__":
    main()
