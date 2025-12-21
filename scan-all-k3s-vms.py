#!/Users/ryandahlberg/Projects/cortex/venv/bin/python3
"""
Scan all IPs in the range to find all K3s VMs
Then verify against expected VMID → IP mapping
"""
import subprocess
import concurrent.futures

K3S_USER = "k3s"
IP_RANGE = "10.88.145.{}"

# Expected mapping based on VMID 300-306 → IP .190-.196
EXPECTED_MAPPING = {
    "k3s-master01": "10.88.145.190",  # VMID 300
    "k3s-worker01": "10.88.145.191",  # VMID 301
    "k3s-worker02": "10.88.145.192",  # VMID 302
    "k3s-master02": "10.88.145.193",  # VMID 303
    "k3s-worker03": "10.88.145.194",  # VMID 304
    "k3s-worker04": "10.88.145.195",  # VMID 305
    "k3s-master03": "10.88.145.196",  # VMID 306
}

def check_ip(ip):
    """Check if we can SSH to this IP and get hostname"""
    try:
        result = subprocess.run(
            ["ssh", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=2",
             f"{K3S_USER}@{ip}", "hostname"],
            capture_output=True,
            timeout=5,
            text=True
        )
        if result.returncode == 0:
            hostname = result.stdout.strip()
            return ip, hostname
    except:
        pass
    return None, None

def main():
    print("="*70)
    print("Scanning K3s VMs - Full Network Scan")
    print("="*70)
    print("\nScanning 10.88.145.0/24 range...")
    print("")

    found_nodes = {}

    # Scan range 150-210 to catch any misconfigurations
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
        futures = []
        for i in range(150, 211):
            ip = IP_RANGE.format(i)
            futures.append(executor.submit(check_ip, ip))

        for future in concurrent.futures.as_completed(futures):
            ip, hostname = future.result()
            if ip and hostname:
                if "k3s" in hostname:
                    found_nodes[hostname] = ip
                    print(f"  Found: {hostname:15s} @ {ip}")

    print("")
    print("="*70)
    print("Verification Against Expected Mapping")
    print("="*70)
    print("")

    all_correct = True
    missing_nodes = []
    wrong_ip_nodes = []

    for expected_hostname, expected_ip in EXPECTED_MAPPING.items():
        if expected_hostname in found_nodes:
            actual_ip = found_nodes[expected_hostname]
            if actual_ip == expected_ip:
                print(f"  ✓ {expected_hostname:15s} @ {expected_ip} (CORRECT)")
            else:
                print(f"  ✗ {expected_hostname:15s} @ {actual_ip} (WRONG - should be {expected_ip})")
                wrong_ip_nodes.append({
                    "hostname": expected_hostname,
                    "current_ip": actual_ip,
                    "expected_ip": expected_ip
                })
                all_correct = False
        else:
            print(f"  ✗ {expected_hostname:15s} NOT FOUND (should be @ {expected_ip})")
            missing_nodes.append(expected_hostname)
            all_correct = False

    print("")
    print("="*70)
    print("Summary")
    print("="*70)
    print("")

    if all_correct:
        print("✓ All nodes have correct IP addresses!")
    else:
        if wrong_ip_nodes:
            print(f"Nodes with WRONG IPs: {len(wrong_ip_nodes)}")
            for node in wrong_ip_nodes:
                print(f"  - {node['hostname']}: {node['current_ip']} → should be {node['expected_ip']}")

        if missing_nodes:
            print(f"\nNodes NOT ACCESSIBLE: {len(missing_nodes)}")
            for hostname in missing_nodes:
                print(f"  - {hostname} (expected @ {EXPECTED_MAPPING[hostname]})")

        print("\nAction Required:")
        print(f"  {len(wrong_ip_nodes)} nodes need IP reconfiguration")
        print(f"  {len(missing_nodes)} nodes need to be located/fixed")

if __name__ == "__main__":
    main()
