#!/usr/bin/env python3
"""
Proxmox Storage Expansion Script for k3s Cluster
Expands disk storage to 100GB on three k3s nodes

Author: Cortex Holdings AI Team
Date: 2025-12-20
"""

import requests
import time
import sys
import subprocess
import urllib3
from typing import Dict, List, Tuple

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

# Storage Configuration
TARGET_DISK_SIZE = "100G"  # Target disk size
SSH_USER = "k3s"
SSH_PASS = "toor"

# Timeouts
SSH_TIMEOUT = 30


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
            print(f"  X API request failed: {e}")
            if hasattr(e, 'response') and e.response is not None:
                print(f"  Response: {e.response.text}")
            raise

    def get_vm_config(self, vmid: int) -> Dict:
        """Get VM configuration"""
        endpoint = f"/nodes/{PROXMOX_NODE}/qemu/{vmid}/config"
        result = self._request("GET", endpoint)
        return result.get("data", {})

    def resize_disk(self, vmid: int, disk: str, size: str) -> Dict:
        """Resize VM disk"""
        endpoint = f"/nodes/{PROXMOX_NODE}/qemu/{vmid}/resize"
        data = {"disk": disk, "size": size}
        return self._request("PUT", endpoint, data=data)


def print_header(text: str):
    """Print formatted header"""
    print("\n" + "="*80)
    print(f"  {text}")
    print("="*80)


def print_section(text: str):
    """Print formatted section"""
    print(f"\n--- {text} ---")


def run_ssh_command(ip: str, command: str, use_sudo: bool = True) -> Tuple[bool, str, str]:
    """
    Run command via SSH on remote host

    Returns: (success, stdout, stderr)
    """
    if use_sudo:
        # Use sudo with the command
        ssh_command = f"sudo {command}"
    else:
        ssh_command = command

    try:
        # Using sshpass to handle password authentication
        result = subprocess.run(
            ["sshpass", "-p", SSH_PASS, "ssh",
             "-o", "StrictHostKeyChecking=no",
             "-o", "UserKnownHostsFile=/dev/null",
             "-o", "ConnectTimeout=10",
             f"{SSH_USER}@{ip}",
             ssh_command],
            capture_output=True,
            text=True,
            timeout=SSH_TIMEOUT
        )

        return (result.returncode == 0, result.stdout, result.stderr)

    except subprocess.TimeoutExpired:
        return (False, "", "SSH command timed out")
    except FileNotFoundError:
        # sshpass not installed, try alternative method
        print("  ! sshpass not found, trying alternative SSH method...")
        try:
            # Try with expect script or direct SSH
            result = subprocess.run(
                ["ssh",
                 "-o", "StrictHostKeyChecking=no",
                 "-o", "UserKnownHostsFile=/dev/null",
                 "-o", "ConnectTimeout=10",
                 f"{SSH_USER}@{ip}",
                 ssh_command],
                capture_output=True,
                text=True,
                timeout=SSH_TIMEOUT,
                input=SSH_PASS + "\n"
            )
            return (result.returncode == 0, result.stdout, result.stderr)
        except Exception as e:
            return (False, "", f"SSH failed: {e}")
    except Exception as e:
        return (False, "", f"SSH error: {e}")


def get_current_disk_info(ip: str, vm_name: str) -> Dict:
    """Get current disk information from VM"""
    print(f"  Checking current disk status...")

    # Get filesystem info
    success, stdout, stderr = run_ssh_command(ip, "df -h / | tail -1")

    if success:
        parts = stdout.split()
        if len(parts) >= 6:
            return {
                "filesystem": parts[0],
                "size": parts[1],
                "used": parts[2],
                "available": parts[3],
                "use_percent": parts[4],
                "mount": parts[5]
            }

    return {}


def expand_vm_storage(api: ProxmoxAPI, vm: Dict) -> bool:
    """
    Expand storage for a single VM

    Returns True if successful, False otherwise
    """
    vmid = vm["vmid"]
    name = vm["name"]
    ip = vm["ip"]

    print_header(f"Expanding Storage: {name} (VMID {vmid})")

    # Step 1: Get current VM configuration
    print_section("Step 1: Check current VM disk configuration")
    try:
        config = api.get_vm_config(vmid)

        # Find the main disk (usually scsi0 or virtio0)
        disk_key = None
        disk_info = None

        for key in ["scsi0", "virtio0", "sata0", "ide0"]:
            if key in config:
                disk_key = key
                disk_info = config[key]
                break

        if not disk_key:
            print(f"  X Could not find main disk in VM configuration")
            return False

        print(f"  Found disk: {disk_key}")
        print(f"  Current config: {disk_info}")

    except Exception as e:
        print(f"  X Failed to get VM configuration: {e}")
        return False

    # Step 2: Get current disk usage from inside VM
    print_section("Step 2: Check current disk usage inside VM")
    disk_info_before = get_current_disk_info(ip, name)

    if disk_info_before:
        print(f"  Filesystem: {disk_info_before.get('filesystem', 'unknown')}")
        print(f"  Size: {disk_info_before.get('size', 'unknown')}")
        print(f"  Used: {disk_info_before.get('used', 'unknown')}")
        print(f"  Available: {disk_info_before.get('available', 'unknown')}")
        print(f"  Use%: {disk_info_before.get('use_percent', 'unknown')}")
    else:
        print(f"  ! Could not retrieve disk info (VM may be offline)")

    # Step 3: Resize disk in Proxmox
    print_section("Step 3: Resize VM disk in Proxmox")
    try:
        print(f"  Resizing {disk_key} to {TARGET_DISK_SIZE}...")
        result = api.resize_disk(vmid, disk_key, TARGET_DISK_SIZE)
        print(f"  √ Disk resize successful in Proxmox")
        time.sleep(5)  # Wait for changes to propagate

    except Exception as e:
        error_msg = str(e)
        if "already at" in error_msg.lower() or "same size" in error_msg.lower():
            print(f"  i Disk is already at or larger than target size")
        else:
            print(f"  X Failed to resize disk: {e}")
            return False

    # Step 4: Detect partition layout and storage type
    print_section("Step 4: Detect partition layout")
    print(f"  Connecting to {ip}...")

    # Get partition info
    success, stdout, stderr = run_ssh_command(ip, "lsblk -o NAME,SIZE,TYPE,MOUNTPOINT")
    if success:
        print("  Current partition layout:")
        for line in stdout.split('\n'):
            if line.strip():
                print(f"    {line}")

    # Detect the root device and partition
    success, stdout, stderr = run_ssh_command(ip, "findmnt -n -o SOURCE /")
    if not success:
        print(f"  X Could not detect root partition: {stderr}")
        return False

    root_device = stdout.strip()
    print(f"  Root device: {root_device}")

    # Check if this is LVM
    is_lvm = root_device.startswith('/dev/mapper/') or '-' in root_device
    print(f"  Storage type: {'LVM' if is_lvm else 'Direct partition'}")

    if is_lvm:
        # LVM-based system
        print_section("Step 5: Expand LVM physical volume and logical volume")

        # Get the volume group name from the LV path
        import re
        # Extract VG and LV names from /dev/mapper/ubuntu--vg-ubuntu--lv or /dev/vg/lv format
        if '/dev/mapper/' in root_device:
            # Format: /dev/mapper/ubuntu--vg-ubuntu--lv
            lv_name = root_device.replace('/dev/mapper/', '')
            # LVM uses -- to escape single dashes, so ubuntu--vg means ubuntu-vg
            parts = lv_name.split('--')
            if len(parts) >= 2:
                vg_name = '--'.join(parts[:-1])  # Everything except last part
                lv_simple_name = parts[-1]
            else:
                vg_name = parts[0]
                lv_simple_name = 'ubuntu-lv'
        else:
            # Format: /dev/vgname/lvname
            parts = root_device.split('/')
            vg_name = parts[-2] if len(parts) >= 3 else 'ubuntu-vg'
            lv_simple_name = parts[-1] if len(parts) >= 3 else 'ubuntu-lv'

        print(f"  Volume Group: {vg_name}")
        print(f"  Logical Volume: {lv_simple_name}")

        # Find the physical disk and partition
        success, stdout, stderr = run_ssh_command(ip, "pvdisplay -c")
        if success and stdout.strip():
            # PV display format: /dev/sda3:vg_name:size:...
            pv_line = stdout.strip().split('\n')[0]
            pv_device = pv_line.split(':')[0]
            print(f"  Physical Volume: {pv_device}")

            # Extract disk device and partition number
            match = re.match(r'(/dev/[a-z]+)(\d+)', pv_device)
            if match:
                disk_device = match.group(1)
                partition_num = match.group(2)
                print(f"  Disk device: {disk_device}")
                print(f"  Partition number: {partition_num}")

                # Step 5a: Resize the physical partition
                print(f"\n  Step 5a: Resizing partition {partition_num}...")
                success, stdout, stderr = run_ssh_command(ip, "which growpart")
                has_growpart = success

                if has_growpart:
                    print(f"  Using growpart to expand partition {partition_num}...")
                    success, stdout, stderr = run_ssh_command(
                        ip,
                        f"growpart {disk_device} {partition_num}"
                    )
                    if success or "NOCHANGE" in stdout or "NOCHANGE" in stderr:
                        print(f"  √ Partition expanded (or already at max size)")
                    else:
                        print(f"  Output: {stdout}")
                        if stderr:
                            print(f"  Errors: {stderr}")
                else:
                    print(f"  growpart not available, trying parted...")
                    success, stdout, stderr = run_ssh_command(
                        ip,
                        f"parted {disk_device} ---pretend-input-tty resizepart {partition_num} 100% yes"
                    )
                    if success or "Warning" not in stderr:
                        print(f"  √ Partition expanded with parted")

                # Inform kernel of partition changes
                print(f"  Informing kernel of partition table changes...")
                run_ssh_command(ip, f"partprobe {disk_device}")
                time.sleep(2)

                # Step 5b: Resize the physical volume
                print(f"\n  Step 5b: Resizing physical volume {pv_device}...")
                success, stdout, stderr = run_ssh_command(ip, f"pvresize {pv_device}")
                if success:
                    print(f"  √ Physical volume resized")
                    if stdout.strip():
                        print(f"    {stdout.strip()}")
                else:
                    print(f"  ! PV resize output: {stderr}")

                # Display PV info
                success, stdout, stderr = run_ssh_command(ip, f"pvs {pv_device}")
                if success:
                    print(f"  PV info:\n{stdout}")

                # Step 5c: Extend the logical volume
                print(f"\n  Step 5c: Extending logical volume...")
                # Use the full VG/LV path or mapper path
                success, stdout, stderr = run_ssh_command(
                    ip,
                    f"lvextend -l +100%FREE {root_device}"
                )
                if success or "matches existing size" in stderr.lower():
                    print(f"  √ Logical volume extended (or already at max size)")
                    if stdout.strip():
                        print(f"    {stdout.strip()}")
                else:
                    print(f"  ! LV extend output: {stderr}")

                # Display LV info
                success, stdout, stderr = run_ssh_command(ip, f"lvs")
                if success:
                    print(f"  LV info:\n{stdout}")

        else:
            print(f"  ! Could not find physical volume info")
            return False

        # Step 6: Resize the filesystem
        print_section("Step 6: Resize filesystem on LVM")

        # Detect filesystem type
        success, stdout, stderr = run_ssh_command(ip, f"blkid -o value -s TYPE {root_device}")
        if success:
            fs_type = stdout.strip()
            print(f"  Filesystem type: {fs_type}")
        else:
            # Try df to get filesystem type
            success, stdout, stderr = run_ssh_command(ip, "df -T / | tail -1 | awk '{print $2}'")
            fs_type = stdout.strip() if success else "ext4"
            print(f"  Filesystem type: {fs_type}")

        # Resize based on filesystem type
        if fs_type in ["ext4", "ext3", "ext2"]:
            print(f"  Resizing ext filesystem on {root_device}...")
            success, stdout, stderr = run_ssh_command(ip, f"resize2fs {root_device}")
            if success:
                print(f"  √ Filesystem resized successfully")
                print(f"    {stdout.strip()}")
            else:
                print(f"  X Failed to resize filesystem: {stderr}")
                return False

        elif fs_type == "xfs":
            print(f"  Growing XFS filesystem...")
            success, stdout, stderr = run_ssh_command(ip, "xfs_growfs /")
            if success:
                print(f"  √ XFS filesystem grown successfully")
                print(f"    {stdout.strip()}")
            else:
                print(f"  X Failed to grow XFS filesystem: {stderr}")
                return False

        else:
            print(f"  ! Unsupported filesystem type: {fs_type}")
            return False

    else:
        # Direct partition system (non-LVM)
        import re
        match = re.match(r'(/dev/[a-z]+)(\d+)', root_device)
        if not match:
            print(f"  X Could not parse root device: {root_device}")
            return False

        disk_device = match.group(1)
        partition_num = match.group(2)
        print(f"  Disk device: {disk_device}")
        print(f"  Partition number: {partition_num}")

        # Step 5: Resize partition
        print_section("Step 5: Resize partition")

        success, stdout, stderr = run_ssh_command(ip, "which growpart")
        has_growpart = success

        if has_growpart:
            print(f"  Using growpart to expand partition {partition_num}...")
            success, stdout, stderr = run_ssh_command(
                ip,
                f"growpart {disk_device} {partition_num}"
            )
            if success or "NOCHANGE" in stdout or "NOCHANGE" in stderr:
                print(f"  √ Partition expanded (or already at max size)")
            else:
                print(f"  ! growpart output: {stdout}")
                print(f"  ! growpart errors: {stderr}")
        else:
            print(f"  Using parted to expand partition...")
            success, stdout, stderr = run_ssh_command(
                ip,
                f"parted {disk_device} resizepart {partition_num} 100%"
            )
            if success:
                print(f"  √ Partition expanded with parted")
            else:
                print(f"  ! Parted output: {stderr}")

        # Inform kernel of partition changes
        print(f"  Informing kernel of partition table changes...")
        run_ssh_command(ip, f"partprobe {disk_device}")
        time.sleep(2)

        # Step 6: Detect filesystem type and resize
        print_section("Step 6: Resize filesystem")

        success, stdout, stderr = run_ssh_command(ip, f"blkid -o value -s TYPE {root_device}")
        if success:
            fs_type = stdout.strip()
            print(f"  Filesystem type: {fs_type}")
        else:
            fs_type = "ext4"
            print(f"  ! Could not detect filesystem type, assuming ext4")

        if fs_type in ["ext4", "ext3", "ext2"]:
            print(f"  Resizing ext filesystem on {root_device}...")
            success, stdout, stderr = run_ssh_command(ip, f"resize2fs {root_device}")
            if success:
                print(f"  √ Filesystem resized successfully")
                print(f"    {stdout.strip()}")
            else:
                print(f"  X Failed to resize filesystem: {stderr}")
                return False

        elif fs_type == "xfs":
            print(f"  Growing XFS filesystem...")
            success, stdout, stderr = run_ssh_command(ip, "xfs_growfs /")
            if success:
                print(f"  √ XFS filesystem grown successfully")
                print(f"    {stdout.strip()}")
            else:
                print(f"  X Failed to grow XFS filesystem: {stderr}")
                return False

        else:
            print(f"  ! Unsupported filesystem type: {fs_type}")
            return False

    # Step 7: Verify new size
    print_section("Step 7: Verify new disk size")
    time.sleep(2)

    disk_info_after = get_current_disk_info(ip, name)

    if disk_info_after:
        print(f"  Filesystem: {disk_info_after.get('filesystem', 'unknown')}")
        print(f"  Size: {disk_info_after.get('size', 'unknown')}")
        print(f"  Used: {disk_info_after.get('used', 'unknown')}")
        print(f"  Available: {disk_info_after.get('available', 'unknown')}")
        print(f"  Use%: {disk_info_after.get('use_percent', 'unknown')}")

        # Check if size increased
        if disk_info_before and disk_info_after:
            if disk_info_after['size'] != disk_info_before['size']:
                print(f"  √ SUCCESS: Disk expanded from {disk_info_before['size']} to {disk_info_after['size']}")
            else:
                print(f"  i Disk size appears unchanged (may already have been at target size)")

        return True
    else:
        print(f"  ! Could not verify final disk size")
        return False


def verify_all_nodes(api: ProxmoxAPI):
    """Verify storage on all nodes"""
    print_section("Final Storage Status for All Nodes")

    results = []

    for vm in VMS:
        try:
            disk_info = get_current_disk_info(vm["ip"], vm["name"])
            if disk_info:
                results.append({
                    "name": vm["name"],
                    "ip": vm["ip"],
                    "size": disk_info.get("size", "unknown"),
                    "used": disk_info.get("used", "unknown"),
                    "available": disk_info.get("available", "unknown"),
                    "use_percent": disk_info.get("use_percent", "unknown"),
                })
            else:
                results.append({
                    "name": vm["name"],
                    "ip": vm["ip"],
                    "size": "ERROR",
                    "used": "N/A",
                    "available": "N/A",
                    "use_percent": "N/A",
                })
        except Exception as e:
            print(f"  X Error checking {vm['name']}: {e}")
            results.append({
                "name": vm["name"],
                "ip": vm["ip"],
                "size": "ERROR",
                "used": "N/A",
                "available": "N/A",
                "use_percent": "N/A",
            })

    # Print table
    print(f"\n  {'Node':<20} {'IP':<15} {'Size':<10} {'Used':<10} {'Available':<10} {'Use%':<6}")
    print(f"  {'-'*20} {'-'*15} {'-'*10} {'-'*10} {'-'*10} {'-'*6}")

    for result in results:
        print(f"  {result['name']:<20} {result['ip']:<15} {result['size']:<10} "
              f"{result['used']:<10} {result['available']:<10} {result['use_percent']:<6}")


def main():
    """Main execution function"""
    print_header("K3s Cluster Storage Expansion - Target: 100GB per node")
    print(f"\nProxmox Host: {PROXMOX_HOST}")
    print(f"Node: {PROXMOX_NODE}")
    print(f"\nVMs to expand:")
    for vm in VMS:
        print(f"  - {vm['name']} (VMID {vm['vmid']}, IP {vm['ip']})")

    print(f"\nTarget Disk Size: {TARGET_DISK_SIZE}")
    print(f"SSH User: {SSH_USER}")

    # Check for sshpass
    try:
        subprocess.run(["which", "sshpass"], capture_output=True, check=True)
        print("\n√ sshpass is available")
    except:
        print("\n! Warning: sshpass not found. SSH operations may require manual password entry.")
        print("  Install with: brew install hudochenkov/sshpass/sshpass (macOS)")
        print("  or: apt-get install sshpass (Linux)")

    # Initialize API client
    print("\nInitializing Proxmox API client...")
    api = ProxmoxAPI()

    # Test API connection
    try:
        print("Testing API connection...")
        config = api.get_vm_config(VMS[0]["vmid"])
        print("√ API connection successful\n")
    except Exception as e:
        print(f"X Failed to connect to Proxmox API: {e}")
        print("\nPlease verify:")
        print("  1. Proxmox host is reachable")
        print("  2. API token is valid")
        print("  3. Network connectivity")
        sys.exit(1)

    # Expand storage on each VM
    results = []
    for vm in VMS:
        success = expand_vm_storage(api, vm)
        results.append((vm, success))

        if not success:
            print(f"\n! WARNING: Storage expansion may have issues on {vm['name']}")
            print("Continuing with remaining VMs...\n")
            time.sleep(3)
        else:
            print(f"\n√ Successfully expanded storage on {vm['name']}\n")
            time.sleep(5)  # Wait between VMs

    # Print final summary
    print_header("Storage Expansion Summary")

    successful = [vm for vm, success in results if success]
    failed = [vm for vm, success in results if not success]

    if successful:
        print("\n√ Successfully expanded:")
        for vm in successful:
            print(f"  - {vm['name']} (VMID {vm['vmid']})")

    if failed:
        print("\n! May need attention:")
        for vm in failed:
            print(f"  - {vm['name']} (VMID {vm['vmid']})")

    # Final verification
    print_header("Final Verification")
    verify_all_nodes(api)

    # Print final status
    print("\n" + "="*80)
    if len(successful) == len(VMS):
        print("  √ ALL NODES STORAGE EXPANDED SUCCESSFULLY")
    else:
        print("  ! SOME NODES MAY REQUIRE MANUAL VERIFICATION")
    print("="*80)

    print("\nNext steps:")
    print("  1. Verify on each node with: ssh k3s@<IP> 'df -h /'")
    print("  2. Check k3s cluster health: kubectl get nodes")
    print("  3. Monitor disk usage: kubectl top nodes")

    return 0 if len(failed) == 0 else 1


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
