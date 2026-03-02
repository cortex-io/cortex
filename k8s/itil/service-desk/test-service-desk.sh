#!/bin/bash

# Test script for AI Service Desk and Request Fulfillment

set -e

echo "=== Testing Cortex AI Service Desk ==="
echo ""

# Get service desk pod
SERVICE_DESK_POD=$(kubectl get pods -n cortex-service-desk -l app=ai-service-desk -o jsonpath='{.items[0].metadata.name}')
FULFILLMENT_POD=$(kubectl get pods -n cortex-service-desk -l app=fulfillment-engine -o jsonpath='{.items[0].metadata.name}')

echo "Service Desk Pod: $SERVICE_DESK_POD"
echo "Fulfillment Pod: $FULFILLMENT_POD"
echo ""

# Wait for service desk to be ready
echo "Waiting for AI Service Desk to be ready..."
kubectl wait --for=condition=ready pod -l app=ai-service-desk -n cortex-service-desk --timeout=300s

echo ""
echo "=== Test 1: Health Check ==="
kubectl exec -n cortex-service-desk $SERVICE_DESK_POD -- curl -s http://localhost:5000/health | python3 -m json.tool

echo ""
echo "=== Test 2: Get Service Catalog ==="
kubectl exec -n cortex-service-desk $SERVICE_DESK_POD -- curl -s http://localhost:5000/api/v1/catalog | python3 -m json.tool | head -50

echo ""
echo "=== Test 3: Create Session ==="
SESSION_RESPONSE=$(kubectl exec -n cortex-service-desk $SERVICE_DESK_POD -- curl -s -X POST http://localhost:5000/api/v1/session \
  -H "Content-Type: application/json" \
  -d '{"user_id": "test_user", "channel": "cli"}')

echo $SESSION_RESPONSE | python3 -m json.tool

SESSION_ID=$(echo $SESSION_RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin)['session_id'])")
echo ""
echo "Session ID: $SESSION_ID"

echo ""
echo "=== Test 4: Password Reset Request (NLP) ==="
kubectl exec -n cortex-service-desk $SERVICE_DESK_POD -- curl -s -X POST http://localhost:5000/api/v1/message \
  -H "Content-Type: application/json" \
  -d "{\"session_id\": \"$SESSION_ID\", \"message\": \"I need to reset my password for email system\"}" | python3 -m json.tool

echo ""
echo "=== Test 5: Access Request (NLP) ==="
kubectl exec -n cortex-service-desk $SERVICE_DESK_POD -- curl -s -X POST http://localhost:5000/api/v1/message \
  -H "Content-Type: application/json" \
  -d "{\"session_id\": \"$SESSION_ID\", \"message\": \"I need access to the CRM application\"}" | python3 -m json.tool

echo ""
echo "=== Test 6: VPN Access Request (NLP) ==="
kubectl exec -n cortex-service-desk $SERVICE_DESK_POD -- curl -s -X POST http://localhost:5000/api/v1/message \
  -H "Content-Type: application/json" \
  -d "{\"session_id\": \"$SESSION_ID\", \"message\": \"I need VPN access to work from home\"}" | python3 -m json.tool

echo ""
echo "=== Test 7: Fulfillment Engine Health ==="
kubectl exec -n cortex-service-desk $FULFILLMENT_POD -- curl -s http://localhost:5002/health | python3 -m json.tool

echo ""
echo "=== Test 8: Check Workflow Definitions ==="
kubectl exec -n cortex-service-desk $FULFILLMENT_POD -- curl -s http://localhost:5002/api/v1/workflow/password-reset-auto | python3 -m json.tool

echo ""
echo "=== Test 9: Check Redis Queue ==="
kubectl exec -n cortex-system deployment/redis -- redis-cli llen fulfillment:queue

echo ""
echo "=== Test 10: Metrics Collection ==="
echo "Service Desk Metrics:"
kubectl exec -n cortex-service-desk $SERVICE_DESK_POD -- curl -s http://localhost:9090/metrics | grep -E "^service_desk" | head -10

echo ""
echo "Fulfillment Metrics:"
kubectl exec -n cortex-service-desk $FULFILLMENT_POD -- curl -s http://localhost:9090/metrics | grep -E "^fulfillment" | head -10

echo ""
echo "=== All Tests Complete ==="
