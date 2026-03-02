#!/bin/bash
# Cortex MCP Server Structure Verification
# Verifies all components are in place

echo "=================================="
echo "Cortex MCP Server Verification"
echo "=================================="
echo ""

ERRORS=0

# Check files exist
check_file() {
    if [ -f "$1" ]; then
        echo "✓ $1"
    else
        echo "✗ $1 - MISSING"
        ((ERRORS++))
    fi
}

check_dir() {
    if [ -d "$1" ]; then
        echo "✓ $1/"
    else
        echo "✗ $1/ - MISSING"
        ((ERRORS++))
    fi
}

echo "Checking directory structure..."
check_dir "src"
check_dir "src/clients"
check_dir "src/tools"
check_dir "src/worker-pool"
check_dir "src/masters"
check_dir "src/resources"
check_dir "k8s"
check_dir "tests"
echo ""

echo "Checking core files..."
check_file "package.json"
check_file "Dockerfile"
check_file "README.md"
check_file "src/index.js"
check_file "src/moe-router.js"
echo ""

echo "Checking infrastructure clients..."
check_file "src/clients/unifi.js"
check_file "src/clients/proxmox.js"
check_file "src/clients/wazuh.js"
check_file "src/clients/k8s.js"
echo ""

echo "Checking orchestration layer..."
check_file "src/worker-pool/spawner.js"
check_file "src/worker-pool/monitor.js"
check_file "src/masters/registry.js"
check_file "src/masters/interface.js"
echo ""

echo "Checking tools..."
check_file "src/tools/index.js"
echo ""

echo "Checking deployment..."
check_file "k8s/cortex-mcp-server.yaml"
echo ""

# Count components
echo "Component counts:"
echo "  Infrastructure clients: $(ls src/clients/*.js 2>/dev/null | wc -l)"
echo "  Worker pool components: $(ls src/worker-pool/*.js 2>/dev/null | wc -l)"
echo "  Master components: $(ls src/masters/*.js 2>/dev/null | wc -l)"
echo "  Total JS files: $(find src -name "*.js" | wc -l)"
echo ""

# Check package.json dependencies
if [ -f "package.json" ]; then
    echo "Dependencies check..."
    if grep -q "axios" package.json; then
        echo "  ✓ axios (HTTP client)"
    else
        echo "  ✗ axios - MISSING"
        ((ERRORS++))
    fi

    if grep -q "uuid" package.json; then
        echo "  ✓ uuid (ID generation)"
    else
        echo "  ✗ uuid - MISSING"
        ((ERRORS++))
    fi
    echo ""
fi

# Summary
echo "=================================="
if [ $ERRORS -eq 0 ]; then
    echo "✓ ALL CHECKS PASSED"
    echo "=================================="
    echo ""
    echo "Cortex MCP Server is ready!"
    echo ""
    echo "Next steps:"
    echo "  1. npm install"
    echo "  2. npm start (or npm run dev)"
    echo "  3. curl http://localhost:8080/health"
    echo ""
    exit 0
else
    echo "✗ $ERRORS ERRORS FOUND"
    echo "=================================="
    exit 1
fi
