#!/Users/ryandahlberg/Projects/cortex/venv/bin/python3
"""
Scan IP range to find k3s-master03
"""
import subprocess
import concurrent.futures

K3S_USER = "k3s"
IP_RANGE = "10.88.145.{}"

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
    print("Scanning for k3s-master03 in range 10.88.145.0/24")
    print("="*70)
    print("\nScanning IPs 185-200...\n")

    # Scan range 185-200
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = []
        for i in range(185, 201):
            ip = IP_RANGE.format(i)
            futures.append(executor.submit(check_ip, ip))

        for future in concurrent.futures.as_completed(futures):
            ip, hostname = future.result()
            if ip and hostname:
                print(f"  {ip} -> {hostname}")
                if "master03" in hostname:
                    print(f"\n  FOUND k3s-master03 at {ip}!")

    print("\nScan complete.")

if __name__ == "__main__":
    main()
