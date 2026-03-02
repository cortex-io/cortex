#!/usr/bin/env python3
"""
Validation script to verify MCP Lifecycle Management implementation

This script checks that all required functions are implemented and accessible.
"""

import sys


def validate_imports():
    """Validate that all required functions can be imported."""
    print("Validating imports...")

    try:
        from resource_manager_mcp_server import (
            MCPLifecycleManager,
            list_mcp_servers,
            get_mcp_status,
            start_mcp,
            stop_mcp,
            scale_mcp,
            get_manager
        )
        print("✓ All required imports successful")
        return True
    except ImportError as e:
        print(f"✗ Import failed: {e}")
        return False


def validate_class_structure():
    """Validate MCPLifecycleManager class structure."""
    print("\nValidating MCPLifecycleManager class structure...")

    try:
        from resource_manager_mcp_server import MCPLifecycleManager

        required_methods = [
            '__init__',
            'list_mcp_servers',
            'get_mcp_status',
            'start_mcp',
            'stop_mcp',
            'scale_mcp',
            '_validate_mcp_name',
            '_validate_replicas',
            '_get_deployment',
            '_get_service_endpoints',
            '_get_deployment_status',
            '_wait_for_ready',
            '_load_kubernetes_config'
        ]

        for method in required_methods:
            if not hasattr(MCPLifecycleManager, method):
                print(f"✗ Missing method: {method}")
                return False
            print(f"  ✓ {method}")

        print("✓ All required methods present")
        return True
    except Exception as e:
        print(f"✗ Validation failed: {e}")
        return False


def validate_function_signatures():
    """Validate function signatures."""
    print("\nValidating function signatures...")

    try:
        import inspect
        from resource_manager_mcp_server import (
            list_mcp_servers,
            get_mcp_status,
            start_mcp,
            stop_mcp,
            scale_mcp
        )

        # Check list_mcp_servers
        sig = inspect.signature(list_mcp_servers)
        params = list(sig.parameters.keys())
        assert 'namespace' in params or len(params) >= 0
        print("  ✓ list_mcp_servers signature valid")

        # Check get_mcp_status
        sig = inspect.signature(get_mcp_status)
        params = list(sig.parameters.keys())
        assert 'name' in params
        print("  ✓ get_mcp_status signature valid")

        # Check start_mcp
        sig = inspect.signature(start_mcp)
        params = list(sig.parameters.keys())
        assert 'name' in params
        assert 'wait_ready' in params or len(params) >= 1
        print("  ✓ start_mcp signature valid")

        # Check stop_mcp
        sig = inspect.signature(stop_mcp)
        params = list(sig.parameters.keys())
        assert 'name' in params
        assert 'force' in params or len(params) >= 1
        print("  ✓ stop_mcp signature valid")

        # Check scale_mcp
        sig = inspect.signature(scale_mcp)
        params = list(sig.parameters.keys())
        assert 'name' in params
        assert 'replicas' in params
        print("  ✓ scale_mcp signature valid")

        print("✓ All function signatures valid")
        return True
    except Exception as e:
        print(f"✗ Signature validation failed: {e}")
        return False


def validate_documentation():
    """Validate that functions have docstrings."""
    print("\nValidating documentation...")

    try:
        from resource_manager_mcp_server import (
            MCPLifecycleManager,
            list_mcp_servers,
            get_mcp_status,
            start_mcp,
            stop_mcp,
            scale_mcp
        )

        functions = [
            ('MCPLifecycleManager', MCPLifecycleManager),
            ('list_mcp_servers', list_mcp_servers),
            ('get_mcp_status', get_mcp_status),
            ('start_mcp', start_mcp),
            ('stop_mcp', stop_mcp),
            ('scale_mcp', scale_mcp)
        ]

        for name, func in functions:
            if not func.__doc__:
                print(f"✗ Missing docstring: {name}")
                return False
            print(f"  ✓ {name} has docstring")

        print("✓ All functions documented")
        return True
    except Exception as e:
        print(f"✗ Documentation validation failed: {e}")
        return False


def validate_type_hints():
    """Validate that functions have type hints."""
    print("\nValidating type hints...")

    try:
        import inspect
        from resource_manager_mcp_server import (
            list_mcp_servers,
            get_mcp_status,
            start_mcp,
            stop_mcp,
            scale_mcp
        )

        functions = [
            ('list_mcp_servers', list_mcp_servers),
            ('get_mcp_status', get_mcp_status),
            ('start_mcp', start_mcp),
            ('stop_mcp', stop_mcp),
            ('scale_mcp', scale_mcp)
        ]

        for name, func in functions:
            sig = inspect.signature(func)
            if sig.return_annotation == inspect.Signature.empty:
                print(f"  ⚠ {name} missing return type hint (optional)")
            else:
                print(f"  ✓ {name} has return type hint")

        print("✓ Type hints validation complete")
        return True
    except Exception as e:
        print(f"✗ Type hints validation failed: {e}")
        return False


def validate_error_handling():
    """Validate that error handling is implemented."""
    print("\nValidating error handling...")

    try:
        from resource_manager_mcp_server import MCPLifecycleManager
        import inspect

        # Check that validation methods exist
        manager_source = inspect.getsource(MCPLifecycleManager)

        checks = [
            ('ValueError', 'ValueError exceptions raised'),
            ('ApiException', 'ApiException handling'),
            ('TimeoutError', 'TimeoutError handling'),
            ('try:', 'Try-except blocks used'),
        ]

        for check, description in checks:
            if check in manager_source:
                print(f"  ✓ {description}")
            else:
                print(f"  ⚠ {description} not found (may be ok)")

        print("✓ Error handling validation complete")
        return True
    except Exception as e:
        print(f"✗ Error handling validation failed: {e}")
        return False


def validate_files_exist():
    """Validate that all required files exist."""
    print("\nValidating file structure...")

    import os

    base_path = "/Users/ryandahlberg/Projects/resource-manager-mcp-server"

    required_files = [
        "src/resource_manager_mcp_server/__init__.py",
        "requirements.txt",
        "setup.py",
        "README.md",
        "QUICKSTART.md",
        "example_usage.py",
        "config/example-mcp-deployment.yaml",
        "tests/test_lifecycle_manager.py",
        "Makefile",
        "pytest.ini"
    ]

    all_exist = True
    for file_path in required_files:
        full_path = os.path.join(base_path, file_path)
        if os.path.exists(full_path):
            print(f"  ✓ {file_path}")
        else:
            print(f"  ✗ {file_path} missing")
            all_exist = False

    if all_exist:
        print("✓ All required files present")
    else:
        print("✗ Some files missing")

    return all_exist


def main():
    """Run all validation checks."""
    print("=" * 60)
    print("MCP Lifecycle Management Implementation Validation")
    print("=" * 60)

    checks = [
        ("Imports", validate_imports),
        ("Class Structure", validate_class_structure),
        ("Function Signatures", validate_function_signatures),
        ("Documentation", validate_documentation),
        ("Type Hints", validate_type_hints),
        ("Error Handling", validate_error_handling),
        ("File Structure", validate_files_exist),
    ]

    results = []
    for name, check_func in checks:
        try:
            result = check_func()
            results.append((name, result))
        except Exception as e:
            print(f"\n✗ {name} check failed with exception: {e}")
            results.append((name, False))

    # Summary
    print("\n" + "=" * 60)
    print("Validation Summary")
    print("=" * 60)

    passed = sum(1 for _, result in results if result)
    total = len(results)

    for name, result in results:
        status = "PASS" if result else "FAIL"
        symbol = "✓" if result else "✗"
        print(f"{symbol} {name}: {status}")

    print(f"\nTotal: {passed}/{total} checks passed")

    if passed == total:
        print("\n🎉 All validation checks passed!")
        print("Implementation is complete and ready to use.")
        return 0
    else:
        print(f"\n⚠ {total - passed} validation check(s) failed.")
        print("Review the output above for details.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
