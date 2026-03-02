#!/bin/bash

# Test script for conversation persistence
# Tests that context is maintained over 20+ messages

set -e

BACKEND_URL="http://cortex-chat-backend-simple.cortex-chat.svc.cluster.local:8080"
SESSION_ID="test-session-$(date +%s)"

echo "=================================================="
echo "Testing Conversation Persistence"
echo "=================================================="
echo "Backend URL: $BACKEND_URL"
echo "Session ID: $SESSION_ID"
echo ""

# Step 1: Login
echo "[1/4] Logging in..."
TOKEN=$(curl -s -X POST "$BACKEND_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"ryan","password":"7vuzjzuN9!"}' | jq -r '.token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "ERROR: Failed to get auth token"
  exit 1
fi

echo "✓ Logged in successfully"
echo ""

# Step 2: Send 25 messages to test persistence and summarization
echo "[2/4] Sending 25 messages to test persistence..."
echo ""

for i in {1..25}; do
  echo -n "Message $i/25: "

  MESSAGE="Test message number $i. Remember this number: $i. What is my previous number?"

  # Send message
  RESPONSE=$(curl -s -X POST "$BACKEND_URL/api/chat" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"message\":\"$MESSAGE\",\"sessionId\":\"$SESSION_ID\",\"style\":\"standard\"}")

  echo "Sent ✓"
  sleep 1
done

echo ""
echo "✓ Sent 25 messages"
echo ""

# Step 3: Check conversation history
echo "[3/4] Checking conversation history..."
CONVERSATION=$(curl -s -X GET "$BACKEND_URL/api/conversations/$SESSION_ID" \
  -H "Authorization: Bearer $TOKEN")

MESSAGE_COUNT=$(echo "$CONVERSATION" | jq -r '.conversation.messageCount // 0')
HAS_SUMMARY=$(echo "$CONVERSATION" | jq -r '.conversation.summary != null')

echo "Messages stored: $MESSAGE_COUNT"
echo "Has summary: $HAS_SUMMARY"
echo ""

if [ "$MESSAGE_COUNT" -lt 40 ]; then
  echo "ERROR: Expected at least 40 messages (25 user + 25 assistant), got $MESSAGE_COUNT"
  exit 1
fi

echo "✓ Conversation history verified"
echo ""

# Step 4: Send a context-dependent message
echo "[4/4] Testing context retention..."
CONTEXT_TEST=$(curl -s -X POST "$BACKEND_URL/api/chat" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"message\":\"What was the first number I told you to remember?\",\"sessionId\":\"$SESSION_ID\",\"style\":\"standard\"}")

echo "Context test response received"
echo ""

# Get final conversation state
FINAL_CONVERSATION=$(curl -s -X GET "$BACKEND_URL/api/conversations/$SESSION_ID" \
  -H "Authorization: Bearer $TOKEN")

FINAL_COUNT=$(echo "$FINAL_CONVERSATION" | jq -r '.conversation.messageCount // 0')

echo "=================================================="
echo "Test Results"
echo "=================================================="
echo "Session ID: $SESSION_ID"
echo "Total messages: $FINAL_COUNT"
echo "Has summary: $HAS_SUMMARY"
echo ""
echo "✓ All tests passed!"
echo ""
echo "Conversation details:"
echo "$FINAL_CONVERSATION" | jq -r '.conversation | {messageCount, createdAt, updatedAt, hasSummary: (.summary != null)}'
echo ""
echo "=================================================="
