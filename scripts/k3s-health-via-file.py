#!/usr/bin/env python3
"""
K3s Health Check - File-based approach to avoid encoding issues
Writes kubectl output to file, then reads file contents
"""

import httpx
import json
import time
import sys
import base64

# Proxmox API configuration
PROXMOX_HOST = "10.88.140.164"
PROXMOX_PORT = "8006"
PROXMOX_NODE = "pve01"
PROXMOX_USER = "root@pam"
PROXMOX_TOKEN_NAME = "cortex-deploy"
PROXMOX_TOKEN_VALUE = "15d84996-1afe-4c00-9e5c-c6c5aa12da33"

BASE_URL = f"https://{PROXMOX_HOST}:{PROXMOX_PORT}/api2/json"
AUTH_HEADER = f"PVEAPIToken={PROXMOX_USER}!{PROXMOX_TOKEN_NAME}={PROXMOX_TOKEN_VALUE}"
VMID = 310

def exec_and_get_file(client, headers, command, output_file="/tmp/kubectl-output.txt"):
    """
    Execute command, redirect output to file, then read file
    """
    # Step 1: Execute command with output redirection
    full_command = f"{command} > {output_file} 2>&1"

    try:
        print(f"Executing: {command}")

        # Execute via shell to allow redirection
        response = client.post(
            f"{BASE_URL}/nodes/{PROXMOX_NODE}/qemu/{VMID}/agent/exec",
            headers=headers,
            json={'command': ['/bin/bash', '-c', full_command]}
        )

        if response.status_code != 200:
            print(f"❌ Exec failed: {response.text}")
            return None

        result = response.json()
        pid = result.get('data', {}).get('pid')

        if not pid:
            print("❌ No PID")
            return None

        # Wait for completion
        for _ in range(10):
            time.sleep(0.5)
            status_response = client.get(
                f"{BASE_URL}/nodes/{PROXMOX_NODE}/qemu/{VMID}/agent/exec-status",
                headers=headers,
                params={'pid': pid}
            )

            if status_response.status_code == 200:
                status = status_response.json()
                data = status.get('data', {})

                if data.get('exited'):
                    break

        # Step 2: Read the file contents
        print(f"Reading file: {output_file}")

        read_response = client.post(
            f"{BASE_URL}/nodes/{PROXMOX_NODE}/qemu/{VMID}/agent/file-read",
            headers=headers,
            data={'file': output_file}
        )

        if read_response.status_code != 200:
            print(f"❌ File read failed: {read_response.text}")
            return None

        read_result = read_response.json()
        content_b64 = read_result.get('data', {}).get('content')

        if not content_b64:
            print("❌ No content returned")
            return None

        # Decode file contents
        try:
            content = base64.b64decode(content_b64).decode('utf-8')
            return content
        except Exception as e:
            print(f"❌ Decode error: {e}")
            return None

    except Exception as e:
        print(f"❌ Error: {e}")
        return None

def main():
    print("╔══════════════════════════════════════════════════════════════════╗")
    print("║       CORTEX K3S HEALTH CHECK (File-based Method)               ║")
    print("╚══════════════════════════════════════════════════════════════════╝\n")

    client = httpx.Client(verify=False, timeout=60.0)
    headers = {"Authorization": AUTH_HEADER}

    try:
        # Test 1: Get pods
        print("="*70)
        print("1. PODS STATUS (cortex-system)")
        print("="*70)
        output = exec_and_get_file(
            client, headers,
            "/usr/local/bin/kubectl get pods -n cortex-system -o wide",
            "/tmp/kubectl-pods.txt"
        )
        if output:
            print(output)

        # Test 2: Get deployments
        print("\n" + "="*70)
        print("2. DEPLOYMENTS")
        print("="*70)
        output = exec_and_get_file(
            client, headers,
            "/usr/local/bin/kubectl get deployments -n cortex-system",
            "/tmp/kubectl-deployments.txt"
        )
        if output:
            print(output)

        # Test 3: Get services
        print("\n" + "="*70)
        print("3. SERVICES")
        print("="*70)
        output = exec_and_get_file(
            client, headers,
            "/usr/local/bin/kubectl get services -n cortex-system",
            "/tmp/kubectl-services.txt"
        )
        if output:
            print(output)

        # Test 4: Get events
        print("\n" + "="*70)
        print("4. RECENT EVENTS")
        print("="*70)
        output = exec_and_get_file(
            client, headers,
            "/usr/local/bin/kubectl get events -n cortex-system --sort-by='.lastTimestamp' | tail -20",
            "/tmp/kubectl-events.txt"
        )
        if output:
            print(output)

        # Test 5: Check for problematic pods
        print("\n" + "="*70)
        print("5. CHECKING FOR CRASHLOOPBACKOFF")
        print("="*70)
        output = exec_and_get_file(
            client, headers,
            "/usr/local/bin/kubectl get pods -n cortex-system -o jsonpath='{range .items[*]}{.metadata.name}{\"\\t\"}{.status.phase}{\"\\t\"}{.status.containerStatuses[0].ready}{\"\\t\"}{.status.containerStatuses[0].restartCount}{\"\\n\"}{end}'",
            "/tmp/kubectl-pod-status.txt"
        )
        if output:
            print("Pod Name\t\tPhase\tReady\tRestarts")
            print("-"*70)
            print(output)

        # Test 6: Dashboard service IP
        print("\n" + "="*70)
        print("6. LOADBALANCER IP")
        print("="*70)
        output = exec_and_get_file(
            client, headers,
            "/usr/local/bin/kubectl get svc -n cortex-system dashboard-service -o jsonpath='{.status.loadBalancer.ingress[0].ip}'",
            "/tmp/kubectl-lb-ip.txt"
        )
        if output:
            print(f"LoadBalancer IP: {output}")
            print(f"Expected: 10.88.145.201")
            if output.strip() == "10.88.145.201":
                print("✅ LoadBalancer IP matches!")
            else:
                print("⚠️  LoadBalancer IP mismatch or not assigned")

        print("\n" + "="*70)
        print("VERIFICATION COMPLETE")
        print("="*70)

        return 0

    except Exception as e:
        print(f"❌ Fatal error: {e}")
        import traceback
        traceback.print_exc()
        return 1
    finally:
        client.close()

if __name__ == "__main__":
    sys.exit(main())
