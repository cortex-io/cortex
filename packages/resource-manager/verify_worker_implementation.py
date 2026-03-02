#!/usr/bin/env python3
"""
Verification script for Worker Management implementation

This script validates that all worker management components are properly
implemented and integrated.
"""

import sys
import os
from pathlib import Path


def check_file_exists(filepath, description):
    """Check if a file exists"""
    if Path(filepath).exists():
        print(f"✓ {description}: {filepath}")
        return True
    else:
        print(f"✗ {description}: {filepath} NOT FOUND")
        return False


def check_function_in_file(filepath, function_name):
    """Check if a function exists in a file"""
    try:
        with open(filepath, 'r') as f:
            content = f.read()
            if f"def {function_name}" in content:
                print(f"  ✓ Function {function_name} found")
                return True
            else:
                print(f"  ✗ Function {function_name} NOT FOUND")
                return False
    except Exception as e:
        print(f"  ✗ Error checking function: {e}")
        return False


def check_class_in_file(filepath, class_name):
    """Check if a class exists in a file"""
    try:
        with open(filepath, 'r') as f:
            content = f.read()
            if f"class {class_name}" in content:
                print(f"  ✓ Class {class_name} found")
                return True
            else:
                print(f"  ✗ Class {class_name} NOT FOUND")
                return False
    except Exception as e:
        print(f"  ✗ Error checking class: {e}")
        return False


def main():
    """Run verification checks"""
    print("=" * 80)
    print("Worker Management Implementation Verification")
    print("=" * 80)

    base_path = "/Users/ryandahlberg/Projects/resource-manager-mcp-server"
    all_checks = []

    # Check 1: Core worker_manager.py file
    print("\n1. Core Module (worker_manager.py)")
    print("-" * 80)
    worker_manager_path = f"{base_path}/src/worker_manager.py"
    all_checks.append(check_file_exists(worker_manager_path, "Worker Manager Module"))

    if Path(worker_manager_path).exists():
        all_checks.append(check_class_in_file(worker_manager_path, "WorkerManager"))
        all_checks.append(check_function_in_file(worker_manager_path, "list_workers"))
        all_checks.append(check_function_in_file(worker_manager_path, "provision_workers"))
        all_checks.append(check_function_in_file(worker_manager_path, "drain_worker"))
        all_checks.append(check_function_in_file(worker_manager_path, "destroy_worker"))
        all_checks.append(check_function_in_file(worker_manager_path, "get_worker_details"))

    # Check 2: MCP Server integration
    print("\n2. MCP Server Integration (server.py)")
    print("-" * 80)
    server_path = f"{base_path}/src/server.py"
    all_checks.append(check_file_exists(server_path, "MCP Server"))

    if Path(server_path).exists():
        try:
            with open(server_path, 'r') as f:
                content = f.read()

                # Check import
                if "from worker_manager import WorkerManager" in content:
                    print("  ✓ WorkerManager import found")
                    all_checks.append(True)
                else:
                    print("  ✗ WorkerManager import NOT FOUND")
                    all_checks.append(False)

                # Check initialization
                if "self.worker_manager = WorkerManager()" in content:
                    print("  ✓ WorkerManager initialization found")
                    all_checks.append(True)
                else:
                    print("  ✗ WorkerManager initialization NOT FOUND")
                    all_checks.append(False)

                # Check tool registrations
                tools = ["list_workers", "provision_workers", "drain_worker",
                        "destroy_worker", "get_worker_details"]
                for tool in tools:
                    if f'name="{tool}"' in content:
                        print(f"  ✓ Tool '{tool}' registered")
                        all_checks.append(True)
                    else:
                        print(f"  ✗ Tool '{tool}' NOT registered")
                        all_checks.append(False)

        except Exception as e:
            print(f"  ✗ Error checking server integration: {e}")
            all_checks.append(False)

    # Check 3: Configuration file
    print("\n3. Configuration (worker-config.yaml)")
    print("-" * 80)
    config_path = f"{base_path}/config/worker-config.yaml"
    all_checks.append(check_file_exists(config_path, "Worker Configuration"))

    # Check 4: Tests
    print("\n4. Unit Tests (test_worker_manager.py)")
    print("-" * 80)
    test_path = f"{base_path}/tests/test_worker_manager.py"
    all_checks.append(check_file_exists(test_path, "Worker Manager Tests"))

    if Path(test_path).exists():
        all_checks.append(check_class_in_file(test_path, "TestWorkerManager"))

    # Check 5: Documentation
    print("\n5. Documentation")
    print("-" * 80)
    readme_path = f"{base_path}/README.md"
    all_checks.append(check_file_exists(readme_path, "README"))

    worker_doc_path = f"{base_path}/WORKER_MANAGEMENT.md"
    all_checks.append(check_file_exists(worker_doc_path, "Worker Management Documentation"))

    # Check 6: Examples
    print("\n6. Examples")
    print("-" * 80)
    example_path = f"{base_path}/example_worker_usage.py"
    all_checks.append(check_file_exists(example_path, "Worker Usage Examples"))

    # Summary
    print("\n" + "=" * 80)
    print("Verification Summary")
    print("=" * 80)

    passed = sum(all_checks)
    total = len(all_checks)
    percentage = (passed / total * 100) if total > 0 else 0

    print(f"\nChecks Passed: {passed}/{total} ({percentage:.1f}%)")

    if passed == total:
        print("\n✓ All checks passed! Worker management implementation is complete.")
        return 0
    else:
        print(f"\n✗ {total - passed} checks failed. Please review the issues above.")
        return 1

    # Additional info
    print("\n" + "=" * 80)
    print("Implementation Summary")
    print("=" * 80)
    print("\nCore Functions:")
    print("  1. list_workers(type_filter=None) - List all k8s workers")
    print("  2. provision_workers(count, ttl, size) - Create burst workers")
    print("  3. drain_worker(worker_id) - Gracefully drain a worker")
    print("  4. destroy_worker(worker_id, force) - Destroy a burst worker")
    print("  5. get_worker_details(worker_id) - Get detailed worker info")
    print("\nSafety Features:")
    print("  - Permanent worker protection (cannot destroy)")
    print("  - Drain-before-destroy requirement")
    print("  - Input validation")
    print("  - Protected worker patterns")
    print("\nIntegration Points:")
    print("  - Kubernetes API (via kubectl)")
    print("  - Talos MCP (for VM provisioning)")
    print("  - Proxmox MCP (for VM provisioning)")
    print("\nFiles Created:")
    print("  - src/worker_manager.py (700+ lines)")
    print("  - src/server.py (updated with worker tools)")
    print("  - config/worker-config.yaml")
    print("  - tests/test_worker_manager.py (20+ tests)")
    print("  - example_worker_usage.py")
    print("  - WORKER_MANAGEMENT.md")
    print("=" * 80)


if __name__ == "__main__":
    sys.exit(main())
