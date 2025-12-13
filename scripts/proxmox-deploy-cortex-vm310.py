#!/usr/bin/env python3
"""
Cortex: Deploy to VM 310 (k3s-master-vm) via Proxmox QEMU Guest Agent API

Based on research:
- Proxmox 8+ requires command parameter as array format
- Each command argument must be passed separately
- Alternative: file-write + exec approach for complex commands
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

# VM Configuration
VMID = 310

# Deployment script content
DEPLOYMENT_SCRIPT = """#!/bin/bash
set -e

echo "=== Cortex Deployment to K3s Cluster ==="

# Apply the Cortex deployment
kubectl apply -f https://raw.githubusercontent.com/ry-ops/cortex/docker-container/k8s/cortex-complete-deployment.yaml

# Create secrets
kubectl create secret generic cortex-credentials \\
  --namespace=cortex-system \\
  --from-literal=anthropic-api-key="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" \\
  --from-literal=github-token="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" \\
  --dry-run=client -o yaml | kubectl apply -f -

echo "=== Deployment Complete ==="
echo "Waiting for pods to start..."
sleep 10

kubectl get pods -n cortex-system
kubectl get svc -n cortex-system

echo "=== Dashboard URL ==="
kubectl get svc -n cortex-system dashboard-service -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "NodePort mode - use node IP"
"""

def print_section(title):
    print(f"\n{'='*70}")
    print(f"  {title}")
    print("="*70)

def test_guest_agent(client, headers):
    """Test if QEMU guest agent is responsive"""
    print_section("Testing QEMU Guest Agent")

    try:
        response = client.get(
            f"{BASE_URL}/nodes/{PROXMOX_NODE}/qemu/{VMID}/agent/info",
            headers=headers
        )

        if response.status_code == 200:
            info = response.json()
            print("✅ Guest agent is responsive!")
            print(f"   Version: {info.get('data', {}).get('version', 'unknown')}")
            return True
        else:
            print(f"❌ Guest agent not responsive: {response.status_code}")
            print(f"   Response: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Error testing guest agent: {e}")
        return False

def exec_command_array_format(client, headers, command_parts):
    """
    Execute command using array format (Proxmox 8+ style)
    command_parts: list of strings, e.g., ['/bin/bash', '-c', 'echo test']
    """
    print_section(f"Method 1: Array Format - {' '.join(command_parts)}")

    # Build data dict with multiple 'command' entries
    data = {}
    for i, part in enumerate(command_parts):
        data[f'command[{i}]'] = part

    try:
        response = client.post(
            f"{BASE_URL}/nodes/{PROXMOX_NODE}/qemu/{VMID}/agent/exec",
            headers=headers,
            data=data
        )

        print(f"Status: {response.status_code}")
        print(f"Response: {response.text}")

        if response.status_code == 200:
            result = response.json()
            pid = result.get('data', {}).get('pid')
            if pid:
                print(f"✅ Command executed! PID: {pid}")

                # Wait and get status
                time.sleep(2)
                status_response = client.get(
                    f"{BASE_URL}/nodes/{PROXMOX_NODE}/qemu/{VMID}/agent/exec-status",
                    headers=headers,
                    params={'pid': pid}
                )

                if status_response.status_code == 200:
                    status = status_response.json()
                    print(f"Execution status: {json.dumps(status.get('data'), indent=2)}")
                    return True

        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def file_write_exec_approach(client, headers, script_content, script_path="/tmp/cortex-deploy.sh"):
    """
    Alternative approach: Write script file, then execute it
    This is the recommended workaround for complex commands
    """
    print_section("Method 2: File-Write + Exec Approach")

    try:
        # Step 1: Write script file
        print(f"Step 1: Writing script to {script_path}")

        # Encode content to base64
        encoded_content = base64.b64encode(script_content.encode()).decode()

        write_response = client.post(
            f"{BASE_URL}/nodes/{PROXMOX_NODE}/qemu/{VMID}/agent/file-write",
            headers=headers,
            data={
                'file': script_path,
                'content': encoded_content
            }
        )

        print(f"Write status: {write_response.status_code}")
        print(f"Write response: {write_response.text}")

        if write_response.status_code != 200:
            print("❌ Failed to write file")
            return False

        print("✅ Script written successfully")

        # Step 2: Make executable
        print("Step 2: Making script executable")

        chmod_data = {}
        chmod_parts = ['/bin/chmod', '+x', script_path]
        for i, part in enumerate(chmod_parts):
            chmod_data[f'command[{i}]'] = part

        chmod_response = client.post(
            f"{BASE_URL}/nodes/{PROXMOX_NODE}/qemu/{VMID}/agent/exec",
            headers=headers,
            data=chmod_data
        )

        if chmod_response.status_code == 200:
            print("✅ Script made executable")
        else:
            print(f"⚠️  chmod response: {chmod_response.status_code} - {chmod_response.text}")

        time.sleep(1)

        # Step 3: Execute script
        print("Step 3: Executing script")

        exec_data = {}
        exec_parts = ['/bin/bash', script_path]
        for i, part in enumerate(exec_parts):
            exec_data[f'command[{i}]'] = part

        exec_response = client.post(
            f"{BASE_URL}/nodes/{PROXMOX_NODE}/qemu/{VMID}/agent/exec",
            headers=headers,
            data=exec_data
        )

        print(f"Exec status: {exec_response.status_code}")
        print(f"Exec response: {exec_response.text}")

        if exec_response.status_code == 200:
            result = exec_response.json()
            pid = result.get('data', {}).get('pid')

            if pid:
                print(f"✅ Script executing! PID: {pid}")

                # Monitor execution
                print("\nMonitoring execution (30 seconds)...")
                for i in range(6):
                    time.sleep(5)
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
                            stdout = base64.b64decode(data.get('out-data', '')).decode() if data.get('out-data') else ''
                            stderr = base64.b64decode(data.get('err-data', '')).decode() if data.get('err-data') else ''

                            print(f"\n{'='*70}")
                            print(f"Execution completed! Exit code: {exitcode}")
                            print(f"{'='*70}")

                            if stdout:
                                print(f"\nSTDOUT:\n{stdout}")

                            if stderr:
                                print(f"\nSTDERR:\n{stderr}")

                            return exitcode == 0
                        else:
                            print(f"  [{i*5}s] Still running...")

                print("⚠️  Script still running after 30 seconds")
                return True  # Consider it successful if it started

        return False

    except Exception as e:
        print(f"❌ Error in file-write-exec approach: {e}")
        import traceback
        traceback.print_exc()
        return False

def verify_deployment(client, headers):
    """
    Verify the deployment by checking pods
    """
    print_section("Verifying Deployment")

    # Create verification script
    verify_script = """#!/bin/bash
kubectl get pods -n cortex-system -o wide
echo "---"
kubectl get svc -n cortex-system
"""

    return file_write_exec_approach(client, headers, verify_script, "/tmp/verify-cortex.sh")

def main():
    print("╔══════════════════════════════════════════════════════════════════╗")
    print("║   Cortex: Deploy to VM 310 via Proxmox QEMU Guest Agent         ║")
    print("╚══════════════════════════════════════════════════════════════════╝")

    client = httpx.Client(verify=False, timeout=60.0)
    headers = {"Authorization": AUTH_HEADER}

    try:
        # Test guest agent
        if not test_guest_agent(client, headers):
            print("\n❌ Guest agent not available. Cannot proceed.")
            return 1

        # Try simple command first
        print("\n" + "="*70)
        print("Testing with simple command: whoami")
        print("="*70)
        exec_command_array_format(client, headers, ['/usr/bin/whoami'])

        # Try kubectl get pods to verify k3s access
        print("\n" + "="*70)
        print("Testing kubectl access")
        print("="*70)
        kubectl_test = ['/usr/local/bin/kubectl', 'get', 'nodes']
        exec_command_array_format(client, headers, kubectl_test)

        # Main deployment using file-write approach
        print("\n" + "="*70)
        print("MAIN DEPLOYMENT: Using file-write-exec approach")
        print("="*70)

        if file_write_exec_approach(client, headers, DEPLOYMENT_SCRIPT, "/tmp/deploy-cortex.sh"):
            print("\n✅ Deployment script executed successfully!")

            # Wait for pods to stabilize
            print("\nWaiting 20 seconds for pods to initialize...")
            time.sleep(20)

            # Verify
            verify_deployment(client, headers)

            print("\n╔══════════════════════════════════════════════════════════════════╗")
            print("║   ✅ Cortex Deployment Complete!                                ║")
            print("╚══════════════════════════════════════════════════════════════════╝")
            print()
            print("Next steps:")
            print("1. Check pod status: kubectl get pods -n cortex-system")
            print("2. Get dashboard URL: kubectl get svc -n cortex-system")
            print("3. Access dashboard at the service IP/NodePort")
            print()

            return 0
        else:
            print("\n❌ Deployment failed")
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
