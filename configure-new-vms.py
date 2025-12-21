#!/Users/ryandahlberg/Projects/cortex/venv/bin/python3
"""
Configure new K3s VMs with static IPs
Uses cloud-init or direct netplan configuration
"""

import subprocess
import time

K3S_USER = "k3s"

# New VMs configuration
NEW_VMS = [
    {"vmid": 303, "name": "k3s-master02", "ip": "10.88.145.193", "role": "master"},
    {"vmid": 304, "name": "k3s-worker03", "ip": "10.88.145.194", "role": "worker"},
    {"vmid": 305, "name": "k3s-worker04", "ip": "10.88.145.195", "role": "worker"},
    {"vmid": 306, "name": "k3s-master03", "ip": "10.88.145.196", "role": "master"},
]


def find_dhcp_ip(vmid, name):
    """Try to find the DHCP IP by scanning common ranges"""
    print(f"\nFinding DHCP IP for {name} (VMID {vmid})...")

    # Try to ping IPs in the DHCP range (typically .100-.199)
    # We can also look for IPs that aren't in our static list
    static_ips = ["10.88.145.190", "10.88.145.191", "10.88.145.192",
                  "10.88.145.193", "10.88.145.194", "10.88.145.195", "10.88.145.196"]

    print(f"  Scanning for active IPs not in static list...")

    for i in range(100, 200):
        test_ip = f"10.88.145.{i}"
        if test_ip in static_ips:
            continue

        # Try SSH
        result = subprocess.run(
            ["ssh", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=2",
             f"{K3S_USER}@{test_ip}", "hostname"],
            capture_output=True,
            timeout=5,
            text=True
        )

        if result.returncode == 0:
            hostname = result.stdout.strip()
            # Check if it's one of our cloned VMs
            if "k3s-master01" in hostname or "k3s-worker01" in hostname:
                print(f"  Found potential DHCP IP: {test_ip} (hostname: {hostname})")
                return test_ip

    return None


def configure_static_ip(current_ip, new_ip, hostname):
    """Configure static IP on a VM"""
    print(f"\nConfiguring {hostname} with static IP {new_ip}...")

    # Set hostname
    print("  Setting hostname...")
    subprocess.run(
        ["ssh", "-o", "StrictHostKeyChecking=no", f"{K3S_USER}@{current_ip}",
         f"sudo hostnamectl set-hostname {hostname}"],
        timeout=10
    )

    # Create netplan config
    netplan = f"""network:
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
"""

    # Write netplan config
    print("  Writing netplan config...")
    cmd = f"echo '{netplan}' | sudo tee /etc/netplan/50-cloud-init.yaml && sudo netplan apply"
    subprocess.run(
        ["ssh", "-o", "StrictHostKeyChecking=no", f"{K3S_USER}@{current_ip}", cmd],
        timeout=15
    )

    print(f"  Static IP configured. New IP: {new_ip}")
    time.sleep(10)

    # Verify connectivity on new IP
    result = subprocess.run(
        ["ssh", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=5",
         f"{K3S_USER}@{new_ip}", "echo 'Connected'"],
        capture_output=True,
        timeout=10
    )

    if result.returncode == 0:
        print(f"  Verified: Can connect to {new_ip}")
        return True
    else:
        print(f"  Warning: Cannot connect to {new_ip} yet")
        return False


print("="*80)
print("  Configure New VMs with Static IPs")
print("="*80)

print("\nNote: This script will try to auto-detect DHCP IPs.")
print("If auto-detection fails, you'll need to provide them manually.\n")

for vm in NEW_VMS:
    print("\n" + "="*80)
    print(f"  {vm['name']} (VMID {vm['vmid']}) -> {vm['ip']}")
    print("="*80)

    # Try to find DHCP IP
    dhcp_ip = find_dhcp_ip(vm['vmid'], vm['name'])

    if not dhcp_ip:
        print(f"\n  Could not auto-detect DHCP IP for {vm['name']}")
        print(f"  Please check Proxmox console or DHCP server")
        dhcp_ip = input(f"  Enter current DHCP IP for {vm['name']} (or 'skip' to skip): ").strip()

        if dhcp_ip.lower() == 'skip':
            print(f"  Skipping {vm['name']}")
            continue

    # Configure static IP
    configure_static_ip(dhcp_ip, vm['ip'], vm['name'])

print("\n" + "="*80)
print("  Configuration Complete")
print("="*80)
print("\nConfigured VMs:")
for vm in NEW_VMS:
    print(f"  {vm['name']}: {vm['ip']}")
