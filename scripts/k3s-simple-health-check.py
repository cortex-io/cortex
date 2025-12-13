#!/usr/bin/env python3
"""
Simplified K3s Health Check - Execute individual kubectl commands
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

def exec_command(client, headers, command_list, description="Command"):
    """Execute a single command and return results"""
    print(f"\n{'='*70}")
    print(f"  {description}")
    print(f"  Command: {' '.join(command_list)}")
    print('='*70)

    try:
        response = client.post(
            f"{BASE_URL}/nodes/{PROXMOX_NODE}/qemu/{VMID}/agent/exec",
            headers=headers,
            json={'command': command_list}
        )

        if response.status_code != 200:
            print(f"❌ Failed: {response.text}")
            return None

        result = response.json()
        pid = result.get('data', {}).get('pid')

        if not pid:
            print("❌ No PID returned")
            return None

        # Wait for completion
        for _ in range(10):
            time.sleep(1)
            status_response = client.get(
                f"{BASE_URL}/nodes/{PROXMOX_NODE}/qemu/{VMID}/agent/exec-status",
                headers=headers,
                params={'pid': pid}
            )

            if status_response.status_code == 200:
                status = status_response.json()
                data = status.get('data', {})

                if data.get('exited'):
                    exitcode = data.get('exitcode', -1)

                    # Try to decode output
                    stdout = ""
                    if data.get('out-data'):
                        try:
                            stdout = base64.b64decode(data.get('out-data')).decode('utf-8', errors='ignore')
                        except:
                            pass

                    print(f"\nExit code: {exitcode}")
                    if stdout:
                        print(stdout)

                    return {'exitcode': exitcode, 'stdout': stdout}

        print("⚠️  Timeout waiting for command")
        return None

    except Exception as e:
        print(f"❌ Error: {e}")
        return None

def main():
    print("╔══════════════════════════════════════════════════════════════════╗")
    print("║       CORTEX K3S CLUSTER HEALTH CHECK (Simplified)              ║")
    print("╚══════════════════════════════════════════════════════════════════╝")

    client = httpx.Client(verify=False, timeout=60.0)
    headers = {"Authorization": AUTH_HEADER}

    try:
        # Check 1: Get all pods
        exec_command(
            client, headers,
            ['/usr/local/bin/kubectl', 'get', 'pods', '-n', 'cortex-system', '-o', 'wide'],
            "1. Pods in cortex-system namespace"
        )

        # Check 2: Get deployments
        exec_command(
            client, headers,
            ['/usr/local/bin/kubectl', 'get', 'deployments', '-n', 'cortex-system'],
            "2. Deployments"
        )

        # Check 3: Get services
        exec_command(
            client, headers,
            ['/usr/local/bin/kubectl', 'get', 'services', '-n', 'cortex-system'],
            "3. Services"
        )

        # Check 4: Get endpoints
        exec_command(
            client, headers,
            ['/usr/local/bin/kubectl', 'get', 'endpoints', '-n', 'cortex-system'],
            "4. Service Endpoints"
        )

        # Check 5: Coordinator logs
        exec_command(
            client, headers,
            ['/usr/local/bin/kubectl', 'logs', '-l', 'app=coordinator-master', '-n', 'cortex-system', '--tail=20'],
            "5. Coordinator Master Logs (Last 20)"
        )

        # Check 6: Development logs
        exec_command(
            client, headers,
            ['/usr/local/bin/kubectl', 'logs', '-l', 'app=development-master', '-n', 'cortex-system', '--tail=20'],
            "6. Development Master Logs (Last 20)"
        )

        # Check 7: Security logs
        exec_command(
            client, headers,
            ['/usr/local/bin/kubectl', 'logs', '-l', 'app=security-master', '-n', 'cortex-system', '--tail=20'],
            "7. Security Master Logs (Last 20)"
        )

        # Check 8: CI/CD logs
        exec_command(
            client, headers,
            ['/usr/local/bin/kubectl', 'logs', '-l', 'app=cicd-master', '-n', 'cortex-system', '--tail=20'],
            "8. CI/CD Master Logs (Last 20)"
        )

        # Check 9: Dashboard logs
        exec_command(
            client, headers,
            ['/usr/local/bin/kubectl', 'logs', '-l', 'app=dashboard', '-n', 'cortex-system', '--tail=20'],
            "9. Dashboard Logs (Last 20)"
        )

        # Check 10: Check for problematic pods
        result = exec_command(
            client, headers,
            ['/usr/local/bin/kubectl', 'get', 'pods', '-n', 'cortex-system', '-o', 'json'],
            "10. Checking Pod Health (JSON)"
        )

        print("\n" + "="*70)
        print("  SUMMARY")
        print("="*70)
        print("\nExpected Pods (1/1 Ready):")
        print("  - coordinator-master")
        print("  - development-master")
        print("  - security-master")
        print("  - cicd-master")
        print("  - dashboard")
        print("\nExpected LoadBalancer IP: 10.88.145.201")
        print("\nVerify all pods show '1/1' in the Ready column above.")

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
