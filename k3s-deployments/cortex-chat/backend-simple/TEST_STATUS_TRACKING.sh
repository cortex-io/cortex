#!/bin/bash

# Test script for Conversation Status Tracking
# Run this after starting the backend server

BASE_URL="${BASE_URL:-http://localhost:8080}"
SESSION_ID="test-$(date +%s)"

echo "=================================================="
echo "Testing Conversation Status Tracking"
echo "=================================================="
echo ""
echo "Session ID: $SESSION_ID"
echo "Base URL: $BASE_URL"
echo ""

# Test 1: Create new conversation (should be 'active')
echo "[Test 1] Creating new conversation (status: active)"
echo "POST /api/chat"
curl -X POST "$BASE_URL/api/chat" \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"message\": \"What is the current cluster status?\",
    \"style\": \"standard\"
  }" > /dev/null 2>&1

sleep 2
echo "Done"
echo ""

# Test 2: Get conversation details
echo "[Test 2] Getting conversation details"
echo "GET /api/conversations/$SESSION_ID"
curl -s "$BASE_URL/api/conversations/$SESSION_ID" | jq '.conversation | {sessionId, status, messageCount}'
echo ""

# Test 3: Update status to 'in_progress'
echo "[Test 3] Updating status to 'in_progress'"
echo "PATCH /api/conversations/$SESSION_ID/status"
curl -s -X PATCH "$BASE_URL/api/conversations/$SESSION_ID/status" \
  -H "Content-Type: application/json" \
  -d '{"status": "in_progress"}' | jq
echo ""

# Test 4: Verify status changed
echo "[Test 4] Verifying status changed"
curl -s "$BASE_URL/api/conversations/$SESSION_ID" | jq '.conversation | {sessionId, status, messageCount}'
echo ""

# Test 5: Get all grouped conversations
echo "[Test 5] Getting all grouped conversations"
echo "GET /api/conversations"
curl -s "$BASE_URL/api/conversations" | jq '{counts, activeCount: (.conversations.active | length), inProgressCount: (.conversations.in_progress | length), completedCount: (.conversations.completed | length)}'
echo ""

# Test 6: Send action message (should auto-update to 'in_progress')
echo "[Test 6] Sending action message (isAction: true)"
SESSION_ID_2="test-action-$(date +%s)"
echo "POST /api/chat (with isAction=true)"
curl -X POST "$BASE_URL/api/chat" \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"$SESSION_ID_2\",
    \"message\": \"Fix the pod stuck in ContainerCreating\",
    \"style\": \"standard\",
    \"isAction\": true
  }" > /dev/null 2>&1

sleep 3
echo "Done"
echo ""

# Test 7: Verify action updated status
echo "[Test 7] Verifying action updated status to 'in_progress'"
curl -s "$BASE_URL/api/conversations/$SESSION_ID_2" | jq '.conversation | {sessionId, status, messageCount}'
echo ""

# Test 8: Update to 'completed'
echo "[Test 8] Updating status to 'completed'"
curl -s -X PATCH "$BASE_URL/api/conversations/$SESSION_ID/status" \
  -H "Content-Type: application/json" \
  -d '{"status": "completed"}' | jq
echo ""

# Test 9: Final grouped view
echo "[Test 9] Final grouped conversations view"
curl -s "$BASE_URL/api/conversations" | jq '{
  counts,
  active: (.conversations.active | map({sessionId, status, messageCount})),
  in_progress: (.conversations.in_progress | map({sessionId, status, messageCount})),
  completed: (.conversations.completed | map({sessionId, status, messageCount}))
}'
echo ""

echo "=================================================="
echo "Test Complete!"
echo "=================================================="
echo ""
echo "Summary:"
echo "- Created conversation with status 'active'"
echo "- Updated status to 'in_progress' manually"
echo "- Sent action message (auto-updated to 'in_progress')"
echo "- Updated status to 'completed'"
echo "- Retrieved grouped conversations"
echo ""
echo "Test sessions created:"
echo "  - $SESSION_ID"
echo "  - $SESSION_ID_2"
echo ""
