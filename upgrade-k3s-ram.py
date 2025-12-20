#!/usr/bin/env python3
"""
Proxmox RAM Upgrade Script for k3s Cluster
Upgrades RAM from 8GB to 16GB on all three k3s nodes

Author: Cortex Holdings AI Team
Date: 2025-12-19
"""

import requests
import time
import sys
import urllib3
from typing import Dict, Tuple

# Disable SSL warnings for self-signed certificates
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Proxmox Configuration
PROXMOX_HOST = "10.88.140.164"
PROXMOX_PORT = "8006"
PROXMOX_NODE = "pve01"
PROXMOX_TOKEN = "root@pam!cortex-k3s-display=7e74841c-0eb1-4181-8926-aaa9f0103c58"
API_BASE = f"https://{PROXMOX_HOST}:{PROXMOX_PORT}/api2/json"

# VM Configuration
VMS = [
    {"name": "k3s-master01", "vmid": 300, "ip": "10.88.145.190"},
    {"name": "k3s-worker01", "vmid": 301, "ip": "10.88.145.191"},
    {"name": "k3s-worker02", "vmid": 302, "ip": "10.88.145.192"},
]

# RAM Configuration (in MB)
CURRENT_RAM_MB = 8192  # 8GB
TARGET_RAM_MB = 16384  # 16GB

# Timeouts (in seconds)
SHUTDOWN_TIMEOUT = 120
STARTUP_TIMEOUT = 180
POLL_INTERVAL = 5


class ProxmoxAPI:
    """Proxmox API client"""

    def __init__(self):
        self.headers = {
            "Authorization": f"PVEAPIToken={PROXMOX_TOKEN}"
        }

    def _request(self, method: str, endpoint: str, data: Dict = None) -> Dict:
        """Make API request to Proxmox"""
        url = f"{API_BASE}{endpoint}"

        try:
            if method == "GET":
                response = requests.get(url, headers=self.headers, verify=False, timeout=30)
            elif method == "POST":
                response = requests.post(url, headers=self.headers, data=data, verify=False, timeout=30)
            elif method == "PUT":
                response = requests.put(url, headers=self.headers, data=data, verify=False, timeout=30)
            else:
                raise ValueError(f"Unsupported HTTP method: {method}")

            response.raise_for_status()
            return response.json()

        except requests.exceptions.RequestException as e:
            print(f"❌ API request failed: {e}")
            if hasattr(e, 'response') and e.response is not None:
                print(f"Response: {e.response.text}")
            raise

    def get_vm_status(self, vmid: int) -> Dict:
        """Get VM status"""
        endpoint = f"/nodes/{PROXMOX_NODE}/qemu/{vmid}/status/current"
        result = self._request("GET", endpoint)
        return result.get("data", {})

    def get_vm_config(self, vmid: int) -> Dict:
        """Get VM configuration"""
        endpoint = f"/nodes/{PROXMOX_NODE}/qemu/{vmid}/config"
        result = self._request("GET", endpoint)
        return result.get("data", {})

    def shutdown_vm(self, vmid: int) -> str:
        """Gracefully shutdown VM"""
        endpoint = f"/nodes/{PROXMOX_NODE}/qemu/{vmid}/status/shutdown"
        result = self._request("POST", endpoint)
        return result.get("data", "")

    def stop_vm(self, vmid: int) -> str:
        """Force stop VM (like pulling the power)"""
        endpoint = f"/nodes/{PROXMOX_NODE}/qemu/{vmid}/status/stop"
        result = self._request("POST", endpoint)
        return result.get("data", "")

    def start_vm(self, vmid: int) -> str:
        """Start VM"""
        endpoint = f"/nodes/{PROXMOX_NODE}/qemu/{vmid}/status/start"
        result = self._request("POST", endpoint)
        return result.get("data", "")

    def update_vm_config(self, vmid: int, config: Dict) -> None:
        """Update VM configuration"""
        endpoint = f"/nodes/{PROXMOX_NODE}/qemu/{vmid}/config"
        self._request("PUT", endpoint, data=config)

    def wait_for_status(self, vmid: int, expected_status: str, timeout: int) -> bool:
        """Wait for VM to reach expected status"""
        start_time = time.time()

        while time.time() - start_time < timeout:
            status = self.get_vm_status(vmid)
            current_status = status.get("status", "unknown")

            print(f"  Current status: {current_status}", end="\r")

            if current_status == expected_status:
                print(f"  ✓ Status: {current_status}        ")
                return True

            time.sleep(POLL_INTERVAL)

        print(f"  ✗ Timeout waiting for status '{expected_status}'")
        return False


def print_header(text: str):
    """Print formatted header"""
    print("\n" + "="*70)
    print(f"  {text}")
    print("="*70)


def print_section(text: str):
    """Print formatted section"""
    print(f"\n--- {text} ---")


def upgrade_vm_ram(api: ProxmoxAPI, vm: Dict) -> bool:
    """
    Upgrade RAM for a single VM

    Returns True if successful, False otherwise
    """
    vmid = vm["vmid"]
    name = vm["name"]
    ip = vm["ip"]

    print_header(f"Upgrading {name} (VMID {vmid})")

    # Step 1: Get current configuration
    print_section("Step 1: Verify current configuration")
    try:
        config = api.get_vm_config(vmid)
        current_ram = config.get("memory", 0)
        print(f"  Current RAM: {current_ram} MB")

        if current_ram == TARGET_RAM_MB:
            print(f"  ℹ VM already has {TARGET_RAM_MB} MB RAM - skipping")
            return True

        status = api.get_vm_status(vmid)
        current_status = status.get("status", "unknown")
        print(f"  Current status: {current_status}")

    except Exception as e:
        print(f"  ✗ Failed to get VM configuration: {e}")
        return False

    # Step 2: Shutdown VM if running
    if current_status != "stopped":
        print_section("Step 2: Shutting down VM gracefully")
        try:
            # First, try SSH shutdown from inside the OS
            import subprocess
            print(f"  Attempting SSH shutdown to {ip}...")
            ssh_result = subprocess.run(
                ["ssh", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=10",
                 f"k3s@{ip}", "sudo shutdown -h now"],
                capture_output=True,
                timeout=15
            )

            # Wait a bit for SSH shutdown to take effect
            print(f"  Waiting 60s for SSH shutdown to complete...")
            time.sleep(60)

            status = api.get_vm_status(vmid)
            if status.get("status") == "stopped":
                print(f"  ✓ SSH shutdown successful")
            else:
                # Fall back to Proxmox shutdown API
                print(f"  SSH shutdown incomplete, trying Proxmox shutdown API...")
                api.shutdown_vm(vmid)
                print(f"  Waiting 30s for ACPI shutdown...")
                time.sleep(30)

                status = api.get_vm_status(vmid)
                if status.get("status") == "stopped":
                    print(f"  ✓ ACPI shutdown successful")
                else:
                    # Last resort: force stop
                    print(f"  ACPI shutdown incomplete, forcing stop...")
                    api.stop_vm(vmid)
                    print(f"  Waiting 10s for force stop...")
                    time.sleep(10)

            # Final verification
            if not api.wait_for_status(vmid, "stopped", 30):
                print(f"  ✗ VM did not stop - ABORTING")
                return False

        except subprocess.TimeoutExpired:
            print(f"  ⚠ SSH timeout, falling back to Proxmox stop...")
            try:
                api.stop_vm(vmid)
                time.sleep(10)
                if not api.wait_for_status(vmid, "stopped", 30):
                    print(f"  ✗ VM did not stop - ABORTING")
                    return False
            except Exception as e:
                print(f"  ✗ Failed to stop VM: {e}")
                return False
        except Exception as e:
            print(f"  ⚠ SSH failed ({e}), trying Proxmox stop...")
            try:
                api.stop_vm(vmid)
                time.sleep(10)
                if not api.wait_for_status(vmid, "stopped", 30):
                    print(f"  ✗ VM did not stop - ABORTING")
                    return False
            except Exception as e:
                print(f"  ✗ Failed to stop VM: {e}")
                return False
    else:
        print_section("Step 2: VM already stopped")

    # Step 3: Update RAM configuration
    print_section("Step 3: Updating RAM configuration")
    try:
        print(f"  Setting RAM to {TARGET_RAM_MB} MB ({TARGET_RAM_MB // 1024} GB)")
        api.update_vm_config(vmid, {"memory": TARGET_RAM_MB})
        print(f"  ✓ RAM configuration updated")

        # Verify the change
        time.sleep(2)
        config = api.get_vm_config(vmid)
        new_ram = config.get("memory", 0)

        if new_ram == TARGET_RAM_MB:
            print(f"  ✓ Verified: RAM is now {new_ram} MB")
        else:
            print(f"  ✗ RAM verification failed: expected {TARGET_RAM_MB}, got {new_ram}")
            return False

    except Exception as e:
        print(f"  ✗ Failed to update RAM configuration: {e}")
        return False

    # Step 4: Start VM
    print_section("Step 4: Starting VM")
    try:
        api.start_vm(vmid)
        print(f"  Start command sent to {name}")
        print(f"  Waiting up to {STARTUP_TIMEOUT}s for boot...")

        if not api.wait_for_status(vmid, "running", STARTUP_TIMEOUT):
            print(f"  ✗ VM did not start in time")
            return False

        # Additional wait for system to fully initialize
        print(f"  Waiting 30s for system initialization...")
        time.sleep(30)

    except Exception as e:
        print(f"  ✗ Failed to start VM: {e}")
        return False

    # Step 5: Verify VM is healthy
    print_section("Step 5: Verifying VM health")
    try:
        status = api.get_vm_status(vmid)
        uptime = status.get("uptime", 0)
        print(f"  ✓ VM is running (uptime: {uptime}s)")
        print(f"  ✓ {name} upgrade complete!")
        return True

    except Exception as e:
        print(f"  ⚠ Warning: Could not verify VM health: {e}")
        return True  # Still consider it successful if it's running


def main():
    """Main execution function"""
    print_header("k3s Cluster RAM Upgrade - 8GB → 16GB")
    print(f"\nProxmox Host: {PROXMOX_HOST}")
    print(f"Node: {PROXMOX_NODE}")
    print(f"\nVMs to upgrade:")
    for vm in VMS:
        print(f"  - {vm['name']} (VMID {vm['vmid']}, IP {vm['ip']})")

    print(f"\nRAM Change: {CURRENT_RAM_MB}MB → {TARGET_RAM_MB}MB (+{TARGET_RAM_MB - CURRENT_RAM_MB}MB)")

    # Initialize API client
    print("\nInitializing Proxmox API client...")
    api = ProxmoxAPI()

    # Test API connection
    try:
        print("Testing API connection...")
        status = api.get_vm_status(VMS[0]["vmid"])
        print("✓ API connection successful\n")
    except Exception as e:
        print(f"✗ Failed to connect to Proxmox API: {e}")
        print("\nPlease verify:")
        print("  1. Proxmox host is reachable")
        print("  2. API token is valid")
        print("  3. Network connectivity")
        sys.exit(1)

    # Upgrade each VM
    results = []
    for vm in VMS:
        success = upgrade_vm_ram(api, vm)
        results.append((vm, success))

        if not success:
            print(f"\n⚠ WARNING: Upgrade failed for {vm['name']}")
            print("Continuing with remaining VMs...\n")
            time.sleep(5)
        else:
            print(f"\n✓ Successfully upgraded {vm['name']}\n")
            time.sleep(10)  # Wait between VMs

    # Print final summary
    print_header("Upgrade Summary")

    successful = [vm for vm, success in results if success]
    failed = [vm for vm, success in results if not success]

    print("\n✓ Successfully upgraded:")
    for vm in successful:
        print(f"  - {vm['name']} (VMID {vm['vmid']})")

    if failed:
        print("\n✗ Failed to upgrade:")
        for vm in failed:
            print(f"  - {vm['name']} (VMID {vm['vmid']})")

    # Final verification
    print_section("Final Verification")
    print("\nVerifying all VMs...")
    all_ok = True

    for vm in VMS:
        try:
            config = api.get_vm_config(vm["vmid"])
            status = api.get_vm_status(vm["vmid"])
            ram = config.get("memory", 0)
            vm_status = status.get("status", "unknown")

            status_icon = "✓" if vm_status == "running" and ram == TARGET_RAM_MB else "✗"
            print(f"  {status_icon} {vm['name']}: {ram}MB RAM, Status: {vm_status}")

            if vm_status != "running" or ram != TARGET_RAM_MB:
                all_ok = False

        except Exception as e:
            print(f"  ✗ {vm['name']}: Error - {e}")
            all_ok = False

    # Print final status
    print("\n" + "="*70)
    if all_ok:
        print("  ✓ ALL NODES SUCCESSFULLY UPGRADED TO 16GB RAM")
        print("="*70)
        print("\nNext steps:")
        print("  1. SSH to k3s-master01: ssh k3s@10.88.145.190")
        print("  2. Verify k3s cluster: kubectl get nodes -o wide")
        print("  3. Check RAM: free -h")
        print("  4. Verify pods: kubectl get pods -A")
        return 0
    else:
        print("  ⚠ SOME NODES MAY REQUIRE ATTENTION")
        print("="*70)
        print("\nPlease review the output above and verify manually.")
        return 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n\nOperation cancelled by user")
        sys.exit(130)
    except Exception as e:
        print(f"\n✗ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
