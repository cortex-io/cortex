#!/usr/bin/env python3
"""
Cortex: Create Container 101 via Proxmox API
"""

import httpx
import json
import time
import sys

# Proxmox API configuration
PROXMOX_HOST = "10.88.140.151"
PROXMOX_PORT = "8006"
PROXMOX_USER = "root@pam"
PROXMOX_TOKEN_NAME = "cortex-automation"
PROXMOX_TOKEN_VALUE = "8d1d247d-7798-4c02-b4a1-9ec74b90f5d9"

BASE_URL = f"https://{PROXMOX_HOST}:{PROXMOX_PORT}/api2/json"
AUTH_HEADER = f"PVEAPIToken={PROXMOX_USER}!{PROXMOX_TOKEN_NAME}={PROXMOX_TOKEN_VALUE}"

# Container configuration
CONTAINER_CONFIG = {
    "vmid": 101,
    "hostname": "cortex",
    "ostemplate": "local:vztmpl/debian-13-standard_13.0-1_amd64.tar.zst",
    "memory": 4096,
    "swap": 2048,
    "cores": 4,
    "rootfs": "local-lvm:20",
    "net0": "name=eth0,bridge=vmbr0,ip=10.88.140.159/24,gw=10.88.140.1",
    "nameserver": "8.8.8.8",
    "password": "cortex123",
    "unprivileged": 1,
    "features": "nesting=1",
    "start": 0
}

def print_section(title):
    print(f"\n{'='*70}")
    print(f"  {title}")
    print("="*70)

def main():
    print("╔══════════════════════════════════════════════════════════════════╗")
    print("║     Cortex: Creating Container 101 via Proxmox API              ║")
    print("╚══════════════════════════════════════════════════════════════════╝")

    client = httpx.Client(verify=False, timeout=30.0)
    headers = {"Authorization": AUTH_HEADER}

    try:
        # Check if container exists
        print_section("Checking if Container 101 exists")

        try:
            response = client.get(
                f"{BASE_URL}/nodes/pve01/lxc/101/status/current",
                headers=headers
            )
            if response.status_code == 200:
                print("⚠️  Container 101 already exists!")
                print("Stopping and destroying it...")

                # Stop
                client.post(f"{BASE_URL}/nodes/pve01/lxc/101/status/stop", headers=headers)
                time.sleep(3)

                # Destroy
                client.delete(f"{BASE_URL}/nodes/pve01/lxc/101", headers=headers)
                time.sleep(2)
                print("✓ Old container removed")
        except:
            print("✓ Container 101 does not exist, ready to create")

        # Create container
        print_section("Creating Container 101")
        print(f"Configuration:")
        print(f"  ID: {CONTAINER_CONFIG['vmid']}")
        print(f"  Hostname: {CONTAINER_CONFIG['hostname']}")
        print(f"  Memory: {CONTAINER_CONFIG['memory']}MB")
        print(f"  Cores: {CONTAINER_CONFIG['cores']}")
        print(f"  IP: 10.88.140.159/24")
        print()

        response = client.post(
            f"{BASE_URL}/nodes/pve01/lxc",
            headers=headers,
            data=CONTAINER_CONFIG
        )

        if response.status_code == 200:
            result = response.json()
            print("✅ Container creation task started!")
            print(f"Task ID: {result.get('data', 'N/A')}")

            # Wait for creation to complete
            print("\nWaiting for container creation...")
            time.sleep(10)

            # Start container
            print_section("Starting Container 101")
            start_response = client.post(
                f"{BASE_URL}/nodes/pve01/lxc/101/status/start",
                headers=headers
            )

            if start_response.status_code == 200:
                print("✅ Container started!")
                time.sleep(5)

                # Verify container is running
                status_response = client.get(
                    f"{BASE_URL}/nodes/pve01/lxc/101/status/current",
                    headers=headers
                )

                if status_response.status_code == 200:
                    status = status_response.json()
                    print(f"\n✅ Container Status: {status['data']['status']}")
                    print(f"   Uptime: {status['data'].get('uptime', 0)} seconds")

                    print("\n╔══════════════════════════════════════════════════════════════════╗")
                    print("║     ✅ Container 101 Created Successfully!                      ║")
                    print("╚══════════════════════════════════════════════════════════════════╝")
                    print()
                    print("Container Details:")
                    print("  ID: 101")
                    print("  Hostname: cortex")
                    print("  IP: 10.88.140.159")
                    print("  Password: cortex123")
                    print()
                    print("Access via Proxmox:")
                    print("  https://10.88.140.151:8006")
                    print("  pve01 → 101 (cortex) → Console")
                    print()
                    print("Next: Install Cortex inside the container!")

                    return 0
                else:
                    print(f"❌ Could not verify container status: {status_response.status_code}")
                    return 1
            else:
                print(f"❌ Failed to start container: {start_response.status_code}")
                print(start_response.text)
                return 1
        else:
            print(f"❌ Failed to create container: {response.status_code}")
            print(f"Response: {response.text}")
            return 1

    except httpx.HTTPError as e:
        print(f"❌ HTTP Error: {e}")
        return 1
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return 1
    finally:
        client.close()

if __name__ == "__main__":
    sys.exit(main())
