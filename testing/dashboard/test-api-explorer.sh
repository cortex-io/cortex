#!/bin/bash
# Test script for API Explorer functionality

echo "========================================"
echo "API Explorer Feature Test"
echo "========================================"
echo ""

BASE_URL="http://localhost:5001"
PASS_COUNT=0
FAIL_COUNT=0

# Function to test an endpoint
test_endpoint() {
    local method=$1
    local path=$2
    local expected_status=$3
    local description=$4

    echo -n "Testing: $description... "

    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "$BASE_URL$path")
    else
        echo "SKIP (requires params)"
        return
    fi

    status_code=$(echo "$response" | tail -n1)

    if [ "$status_code" = "$expected_status" ]; then
        echo "PASS ($status_code)"
        ((PASS_COUNT++))
    else
        echo "FAIL (expected $expected_status, got $status_code)"
        ((FAIL_COUNT++))
    fi
}

echo "Testing Metrics & Health Endpoints..."
test_endpoint "GET" "/api/health" "200" "Health Check"
test_endpoint "GET" "/api/metrics" "200" "System Metrics"
test_endpoint "GET" "/api/metrics/history" "200" "Metrics History"
echo ""

echo "Testing Workers & Tasks Endpoints..."
test_endpoint "GET" "/api/workers" "200" "Get Workers"
test_endpoint "GET" "/api/tasks" "200" "Get Tasks"
test_endpoint "GET" "/api/execution-managers" "200" "Get Execution Managers"
test_endpoint "GET" "/api/streams" "200" "Get Workforce Streams"
test_endpoint "GET" "/api/coordination/raw" "200" "Get Raw Coordination Data"
echo ""

echo "Testing Events & Logs Endpoints..."
test_endpoint "GET" "/api/events" "200" "Get Events"
echo ""

echo "Testing Git Operations Endpoints..."
test_endpoint "GET" "/api/git-operations" "200" "Get Git Operations"
test_endpoint "GET" "/api/git-info" "200" "Get Git Info"
echo ""

echo "Testing Daemon Status Endpoints..."
test_endpoint "GET" "/api/daemon/status" "200" "Worker Daemon Status"
test_endpoint "GET" "/api/pm-daemon/status" "200" "PM Daemon Status"
test_endpoint "GET" "/api/dashboard-server/status" "200" "Dashboard Server Status"
echo ""

echo "Testing Health Alerts Endpoints..."
test_endpoint "GET" "/api/health-alerts" "200" "Get Health Alerts"
echo ""

echo "========================================"
echo "Test Summary"
echo "========================================"
echo "PASSED: $PASS_COUNT"
echo "FAILED: $FAIL_COUNT"
echo "========================================"

if [ $FAIL_COUNT -eq 0 ]; then
    echo "All tests passed!"
    exit 0
else
    echo "Some tests failed."
    exit 1
fi
