#!/bin/bash
#
# Example test queries for Cortex Chat
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_CHAT="${TEST_CHAT:-/tmp/test-chat.sh}"

echo "Cortex Chat Test Examples"
echo "========================="
echo ""

# Test 1: Cluster info
echo "Test 1: Cluster Information"
$TEST_CHAT "what can you tell me about my k3s cluster?"
echo ""
echo "---"
echo ""

# Test 2: Pod count
echo "Test 2: Pod Count"
$TEST_CHAT "how many pods are running in total?"
echo ""
echo "---"
echo ""

# Test 3: UniFi network
echo "Test 3: UniFi Network"
$TEST_CHAT "show me unifi network devices"
echo ""
echo "---"
echo ""

# Test 4: Specific namespace
echo "Test 4: Cortex System Namespace"
$TEST_CHAT "what pods are running in cortex-system namespace?"
echo ""
echo "---"
echo ""

# Test 5: Services
echo "Test 5: LoadBalancer Services"
$TEST_CHAT "list all loadbalancer services"
echo ""
echo "---"
echo ""

echo "All tests complete!"
