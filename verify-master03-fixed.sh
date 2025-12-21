#!/bin/bash
# Verification script for k3s-master03 IP fix
# Run this AFTER you complete the console configuration

TARGET_IP="10.88.145.196"
EXPECTED_HOSTNAME="k3s-master03"

echo "======================================================================="
echo "k3s-master03 Configuration Verification"
echo "======================================================================="
echo ""
echo "Target IP: $TARGET_IP"
echo "Expected hostname: $EXPECTED_HOSTNAME"
echo ""

# Test 1: SSH Connectivity
echo "Test 1: SSH Connectivity"
echo -n "  Checking SSH at $TARGET_IP... "

if timeout 10 ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no k3s@$TARGET_IP "echo 'connected'" >/dev/null 2>&1; then
    echo "✅ SUCCESS"
    SSH_OK=1
else
    echo "❌ FAILED"
    echo "    Error: Cannot connect via SSH"
    echo "    Verify: VM is running and network is configured"
    SSH_OK=0
fi

echo ""

# Test 2: Hostname Verification
if [ $SSH_OK -eq 1 ]; then
    echo "Test 2: Hostname Verification"
    echo -n "  Checking hostname... "

    ACTUAL_HOSTNAME=$(ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no k3s@$TARGET_IP "hostname" 2>/dev/null)

    if [ "$ACTUAL_HOSTNAME" = "$EXPECTED_HOSTNAME" ]; then
        echo "✅ SUCCESS"
        echo "    Hostname: $ACTUAL_HOSTNAME"
        HOSTNAME_OK=1
    else
        echo "❌ FAILED"
        echo "    Expected: $EXPECTED_HOSTNAME"
        echo "    Actual: $ACTUAL_HOSTNAME"
        HOSTNAME_OK=0
    fi

    echo ""

    # Test 3: IP Address Verification
    echo "Test 3: IP Address Configuration"
    echo -n "  Checking network configuration... "

    IP_INFO=$(ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no k3s@$TARGET_IP "ip addr show ens18 | grep 'inet 10'" 2>/dev/null)

    if echo "$IP_INFO" | grep -q "$TARGET_IP"; then
        echo "✅ SUCCESS"
        echo "    $IP_INFO"
        IP_OK=1
    else
        echo "❌ FAILED"
        echo "    IP not found: $TARGET_IP"
        echo "    Current config: $IP_INFO"
        IP_OK=0
    fi

    echo ""

    # Test 4: Gateway Connectivity
    echo "Test 4: Gateway Connectivity"
    echo -n "  Testing gateway reachability... "

    if ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no k3s@$TARGET_IP "ping -c 1 -W 2 10.88.145.1 >/dev/null 2>&1"; then
        echo "✅ SUCCESS"
        GATEWAY_OK=1
    else
        echo "❌ FAILED"
        echo "    Cannot reach gateway 10.88.145.1"
        GATEWAY_OK=0
    fi

    echo ""

    # Test 5: DNS Resolution
    echo "Test 5: DNS Resolution"
    echo -n "  Testing DNS... "

    if ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no k3s@$TARGET_IP "ping -c 1 -W 3 google.com >/dev/null 2>&1"; then
        echo "✅ SUCCESS"
        DNS_OK=1
    else
        echo "⚠️  WARNING"
        echo "    DNS resolution may not be working"
        DNS_OK=0
    fi

    echo ""

else
    echo "⚠️  Skipping additional tests - SSH not available"
    HOSTNAME_OK=0
    IP_OK=0
    GATEWAY_OK=0
    DNS_OK=0
fi

# Summary
echo "======================================================================="
echo "Verification Summary"
echo "======================================================================="
echo ""

if [ $SSH_OK -eq 1 ] && [ $HOSTNAME_OK -eq 1 ] && [ $IP_OK -eq 1 ] && [ $GATEWAY_OK -eq 1 ]; then
    echo "✅ ALL CRITICAL TESTS PASSED"
    echo ""
    echo "VM 306 (k3s-master03) is correctly configured:"
    echo "  - IP Address: $TARGET_IP ✅"
    echo "  - Hostname: $EXPECTED_HOSTNAME ✅"
    echo "  - SSH Access: Working ✅"
    echo "  - Network: Configured ✅"
    echo ""
    echo "Ready for K3s cluster integration!"
    echo ""
    echo "Next steps:"
    echo "  1. Initialize K3s on master nodes"
    echo "  2. Join worker nodes"
    echo "  3. Deploy workloads"
    echo ""
    exit 0
else
    echo "❌ SOME TESTS FAILED"
    echo ""
    echo "Test Results:"
    [ $SSH_OK -eq 1 ] && echo "  ✅ SSH Connectivity" || echo "  ❌ SSH Connectivity"
    [ $HOSTNAME_OK -eq 1 ] && echo "  ✅ Hostname" || echo "  ❌ Hostname"
    [ $IP_OK -eq 1 ] && echo "  ✅ IP Address" || echo "  ❌ IP Address"
    [ $GATEWAY_OK -eq 1 ] && echo "  ✅ Gateway" || echo "  ❌ Gateway"
    [ $DNS_OK -eq 1 ] && echo "  ✅ DNS" || echo "  ⚠️  DNS"
    echo ""
    echo "Review FINAL-MASTER03-FIX-INSTRUCTIONS.md for troubleshooting"
    echo ""
    exit 1
fi
