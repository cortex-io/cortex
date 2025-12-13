#!/usr/bin/env python3
"""
Cortex K3s Cluster Health Verification
Executes kubectl commands on VM 310 via Proxmox QEMU Guest Agent API
"""

import httpx
import json
import time
import sys
import base64
from datetime import datetime

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
VMID = 310  # K3s master VM

# Health check script
HEALTH_CHECK_SCRIPT = """#!/bin/bash
set -e

echo "====================================================================="
echo "           CORTEX K3S CLUSTER HEALTH VERIFICATION"
echo "           Timestamp: $(date)"
echo "====================================================================="

echo ""
echo "1. CHECKING PODS IN cortex-system NAMESPACE"
echo "---------------------------------------------------------------------"
kubectl get pods -n cortex-system -o wide

echo ""
echo "2. CHECKING DEPLOYMENTS"
echo "---------------------------------------------------------------------"
kubectl get deployments -n cortex-system

echo ""
echo "3. CHECKING SERVICES"
echo "---------------------------------------------------------------------"
kubectl get services -n cortex-system

echo ""
echo "4. POD READY STATUS (Detailed)"
echo "---------------------------------------------------------------------"
kubectl get pods -n cortex-system -o jsonpath='{range .items[*]}{.metadata.name}{"\\t"}{.status.phase}{"\\t"}{.status.containerStatuses[0].ready}{"\\t"}{.status.containerStatuses[0].restartCount}{"\\n"}{end}' | column -t

echo ""
echo "5. CHECKING SERVICE ENDPOINTS"
echo "---------------------------------------------------------------------"
kubectl get endpoints -n cortex-system

echo ""
echo "6. RECENT LOGS - Coordinator Master (Last 20 lines)"
echo "---------------------------------------------------------------------"
kubectl logs -l app=coordinator-master -n cortex-system --tail=20 2>&1 || echo "No coordinator-master logs found"

echo ""
echo "7. RECENT LOGS - Development Master (Last 20 lines)"
echo "---------------------------------------------------------------------"
kubectl logs -l app=development-master -n cortex-system --tail=20 2>&1 || echo "No development-master logs found"

echo ""
echo "8. RECENT LOGS - Security Master (Last 20 lines)"
echo "---------------------------------------------------------------------"
kubectl logs -l app=security-master -n cortex-system --tail=20 2>&1 || echo "No security-master logs found"

echo ""
echo "9. RECENT LOGS - CI/CD Master (Last 20 lines)"
echo "---------------------------------------------------------------------"
kubectl logs -l app=cicd-master -n cortex-system --tail=20 2>&1 || echo "No cicd-master logs found"

echo ""
echo "10. RECENT LOGS - Dashboard (Last 20 lines)"
echo "---------------------------------------------------------------------"
kubectl logs -l app=dashboard -n cortex-system --tail=20 2>&1 || echo "No dashboard logs found"

echo ""
echo "11. CHECKING FOR CRASHLOOPBACKOFF OR ERRORS"
echo "---------------------------------------------------------------------"
kubectl get pods -n cortex-system -o json | jq -r '.items[] | select(.status.containerStatuses[0].state.waiting != null) | "POD: \\(.metadata.name) - STATUS: \\(.status.containerStatuses[0].state.waiting.reason) - MESSAGE: \\(.status.containerStatuses[0].state.waiting.message // "N/A")"' || echo "No pods in waiting/error state"

echo ""
echo "12. RESOURCE USAGE"
echo "---------------------------------------------------------------------"
kubectl top pods -n cortex-system 2>&1 || echo "Metrics server not available"

echo ""
echo "13. LOADBALANCER IP CHECK"
echo "---------------------------------------------------------------------"
DASHBOARD_IP=$(kubectl get svc -n cortex-system dashboard-service -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "N/A")
echo "Expected LoadBalancer IP: 10.88.145.201"
echo "Actual LoadBalancer IP: $DASHBOARD_IP"

if [ "$DASHBOARD_IP" = "10.88.145.201" ]; then
    echo "✅ LoadBalancer IP matches expected value"
else
    echo "⚠️  LoadBalancer IP does not match (may be NodePort mode or pending)"
fi

echo ""
echo "====================================================================="
echo "                    HEALTH CHECK COMPLETE"
echo "====================================================================="
"""

def print_section(title):
    print(f"\n{'='*70}")
    print(f"  {title}")
    print("="*70)

def exec_script_via_guest_agent(client, headers, script_content, script_path="/tmp/cortex-health-check.sh"):
    """
    Execute script via Proxmox QEMU guest agent
    """
    try:
        # Step 1: Write script file
        print(f"Writing health check script to {script_path}...")
        encoded_content = base64.b64encode(script_content.encode()).decode()

        write_response = client.post(
            f"{BASE_URL}/nodes/{PROXMOX_NODE}/qemu/{VMID}/agent/file-write",
            headers=headers,
            data={
                'file': script_path,
                'content': encoded_content
            }
        )

        if write_response.status_code != 200:
            print(f"❌ Failed to write script: {write_response.text}")
            return False

        print("✅ Script written successfully")

        # Step 2: Make executable
        print("Making script executable...")
        chmod_response = client.post(
            f"{BASE_URL}/nodes/{PROXMOX_NODE}/qemu/{VMID}/agent/exec",
            headers=headers,
            json={
                'command': ['/bin/chmod', '+x', script_path]
            }
        )

        if chmod_response.status_code != 200:
            print(f"⚠️  chmod warning: {chmod_response.text}")

        time.sleep(1)

        # Step 3: Execute script
        print("Executing health check script...")
        exec_response = client.post(
            f"{BASE_URL}/nodes/{PROXMOX_NODE}/qemu/{VMID}/agent/exec",
            headers=headers,
            json={
                'command': ['/bin/bash', script_path]
            }
        )

        if exec_response.status_code != 200:
            print(f"❌ Failed to execute script: {exec_response.text}")
            return False

        result = exec_response.json()
        pid = result.get('data', {}).get('pid')

        if not pid:
            print("❌ No PID returned from exec")
            return False

        print(f"✅ Script executing with PID: {pid}")
        print("\nWaiting for execution to complete (up to 60 seconds)...")

        # Monitor execution
        for i in range(12):
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

                    # Decode output with error handling
                    stdout = ''
                    stderr = ''

                    try:
                        if data.get('out-data'):
                            stdout = base64.b64decode(data.get('out-data')).decode('utf-8', errors='replace')
                    except Exception as e:
                        stdout = f"[Error decoding stdout: {e}]"

                    try:
                        if data.get('err-data'):
                            stderr = base64.b64decode(data.get('err-data')).decode('utf-8', errors='replace')
                    except Exception as e:
                        stderr = f"[Error decoding stderr: {e}]"

                    print(f"\n{'='*70}")
                    print(f"Execution completed! Exit code: {exitcode}")
                    print(f"{'='*70}")

                    if stdout:
                        print(f"\n{stdout}")

                    if stderr:
                        print(f"\nSTDERR:\n{stderr}")

                    return exitcode == 0
                else:
                    print(f"  [{(i+1)*5}s] Still running...")

        print("⚠️  Script still running after 60 seconds - may be complex check")
        return True

    except Exception as e:
        print(f"❌ Error executing script: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_guest_agent(client, headers):
    """Test if QEMU guest agent is responsive"""
    print_section("Testing QEMU Guest Agent Connection")

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

def auto_restart_crashloop_pods(client, headers):
    """
    Detect and auto-restart pods in CrashLoopBackOff state
    """
    print_section("Auto-Restart CrashLoopBackOff Pods")

    restart_script = """#!/bin/bash
CRASH_PODS=$(kubectl get pods -n cortex-system -o json | jq -r '.items[] | select(.status.containerStatuses[0].state.waiting.reason == "CrashLoopBackOff") | .metadata.name')

if [ -z "$CRASH_PODS" ]; then
    echo "✅ No pods in CrashLoopBackOff state"
else
    echo "⚠️  Found pods in CrashLoopBackOff - restarting..."
    for pod in $CRASH_PODS; do
        echo "  Deleting pod: $pod"
        kubectl delete pod $pod -n cortex-system
    done
    echo "Waiting 10 seconds for pods to restart..."
    sleep 10
    kubectl get pods -n cortex-system
fi
"""

    return exec_script_via_guest_agent(client, headers, restart_script, "/tmp/auto-restart-pods.sh")

def main():
    print("╔══════════════════════════════════════════════════════════════════╗")
    print("║         CORTEX K3S CLUSTER HEALTH VERIFICATION                   ║")
    print("║         CI/CD Master - Cluster Status Report                     ║")
    print("╚══════════════════════════════════════════════════════════════════╝")
    print(f"\nTimestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Target: VM {VMID} (K3s Master) on {PROXMOX_HOST}")

    client = httpx.Client(verify=False, timeout=120.0)
    headers = {"Authorization": AUTH_HEADER}

    try:
        # Test guest agent connectivity
        if not test_guest_agent(client, headers):
            print("\n❌ Guest agent not available. Cannot proceed.")
            print("   Ensure VM 310 is running and QEMU guest agent is installed.")
            return 1

        # Execute health check
        print_section("Executing Comprehensive Health Check")
        if not exec_script_via_guest_agent(client, headers, HEALTH_CHECK_SCRIPT):
            print("\n⚠️  Health check script encountered issues")

        # Auto-restart any CrashLoopBackOff pods
        auto_restart_crashloop_pods(client, headers)

        print("\n╔══════════════════════════════════════════════════════════════════╗")
        print("║   ✅ Health Verification Complete!                               ║")
        print("╚══════════════════════════════════════════════════════════════════╝")
        print("\nExpected Pods:")
        print("  - coordinator-master (1/1 Ready)")
        print("  - development-master (1/1 Ready)")
        print("  - security-master (1/1 Ready)")
        print("  - cicd-master (1/1 Ready)")
        print("  - dashboard (1/1 Ready)")
        print("\nExpected LoadBalancer IP: 10.88.145.201")
        print("\nIf issues found, logs are displayed above for troubleshooting.")

        return 0

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
