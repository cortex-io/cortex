#!/Users/ryandahlberg/Projects/cortex/venv/bin/python3
"""Quick script to create K3s VMs"""
import requests
import urllib3
import time
import sys

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

PROXMOX_HOST = "10.88.140.164"
PROXMOX_TOKEN = "root@pam!cortex-k3s-display=7e74841c-0eb1-4181-8926-aaa9f0103c58"
API_BASE = f"https://{PROXMOX_HOST}:8006/api2/json"
NODE = "pve01"

headers = {"Authorization": f"PVEAPIToken={PROXMOX_TOKEN}"}

print("Creating k3s-master02 (VMID 303)...")
try:
    r = requests.post(
        f"{API_BASE}/nodes/{NODE}/qemu/300/clone",
        headers=headers,
        data={"newid": 303, "name": "k3s-master02", "full": 1},
        verify=False,
        timeout=30
    )
    print(f"Status: {r.status_code}")
    print(f"Response: {r.json()}")

    if r.status_code == 200:
        upid = r.json().get("data")
        print(f"Clone task started: {upid}")
        print("Waiting for clone to complete...")
        time.sleep(90)  # Wait for clone

        # Update resources
        print("Updating resources to 6 cores, 18GB RAM...")
        r2 = requests.put(
            f"{API_BASE}/nodes/{NODE}/qemu/303/config",
            headers=headers,
            data={"cores": 6, "memory": 18432},
            verify=False,
            timeout=30
        )
        print(f"Update status: {r2.status_code}")
        print("k3s-master02 created successfully!")

except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)

print("\nCreating k3s-master03 (VMID 304)...")
try:
    r = requests.post(
        f"{API_BASE}/nodes/{NODE}/qemu/300/clone",
        headers=headers,
        data={"newid": 304, "name": "k3s-master03", "full": 1},
        verify=False,
        timeout=30
    )
    print(f"Status: {r.status_code}")
    print(f"Response: {r.json()}")

    if r.status_code == 200:
        upid = r.json().get("data")
        print(f"Clone task started: {upid}")
        print("Waiting for clone to complete...")
        time.sleep(90)

        # Update resources
        print("Updating resources to 6 cores, 18GB RAM...")
        r2 = requests.put(
            f"{API_BASE}/nodes/{NODE}/qemu/304/config",
            headers=headers,
            data={"cores": 6, "memory": 18432},
            verify=False,
            timeout=30
        )
        print(f"Update status: {r2.status_code}")
        print("k3s-master03 created successfully!")

except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)

print("\nCreating k3s-worker03 (VMID 305)...")
try:
    r = requests.post(
        f"{API_BASE}/nodes/{NODE}/qemu/300/clone",
        headers=headers,
        data={"newid": 305, "name": "k3s-worker03", "full": 1},
        verify=False,
        timeout=30
    )
    print(f"Status: {r.status_code}")
    print(f"Response: {r.json()}")

    if r.status_code == 200:
        upid = r.json().get("data")
        print(f"Clone task started: {upid}")
        print("Waiting for clone to complete...")
        time.sleep(90)

        # Update resources
        print("Updating resources to 8 cores, 24GB RAM...")
        r2 = requests.put(
            f"{API_BASE}/nodes/{NODE}/qemu/305/config",
            headers=headers,
            data={"cores": 8, "memory": 24576},
            verify=False,
            timeout=30
        )
        print(f"Update status: {r2.status_code}")
        print("k3s-worker03 created successfully!")

except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)

print("\n" + "="*50)
print("All VMs created successfully!")
print("="*50)
