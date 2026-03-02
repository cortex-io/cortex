#!/bin/bash
# Test script for UniFi MCP JSON-RPC endpoint
# This demonstrates how the orchestrator should call the MCP server

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# MCP server endpoint
MCP_URL="http://unifi-mcp-server.cortex-system.svc.cluster.local:3000/"

echo -e "${BLUE}=== UniFi MCP JSON-RPC Tests ===${NC}\n"

# Test 1: List Tools
echo -e "${BLUE}Test 1: List Available Tools${NC}"
echo "Request: POST $MCP_URL"
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
echo ""

RESPONSE=$(curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')

if echo "$RESPONSE" | jq -e '.result.tools | length' > /dev/null 2>&1; then
  TOOL_COUNT=$(echo "$RESPONSE" | jq '.result.tools | length')
  echo -e "${GREEN}SUCCESS: Found $TOOL_COUNT tools${NC}"
  echo "Sample tools:"
  echo "$RESPONSE" | jq -r '.result.tools[:5] | .[] | "  - \(.name): \(.description)"'
else
  echo -e "${RED}FAILED: Invalid response${NC}"
  echo "$RESPONSE" | jq .
  exit 1
fi

echo -e "\n---\n"

# Test 2: Call get_device_health
echo -e "${BLUE}Test 2: Call get_device_health Tool${NC}"
echo "Request: POST $MCP_URL"
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_device_health","arguments":{}}}'
echo ""

RESPONSE=$(curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_device_health","arguments":{}}}')

if echo "$RESPONSE" | jq -e '.result.content[0].text' > /dev/null 2>&1; then
  echo -e "${GREEN}SUCCESS: Tool executed${NC}"
  echo "Response:"
  echo "$RESPONSE" | jq '.result.content[0].text' -r | head -20
else
  echo -e "${RED}FAILED: Invalid response${NC}"
  echo "$RESPONSE" | jq .
  exit 1
fi

echo -e "\n---\n"

# Test 3: Call get_quick_status
echo -e "${BLUE}Test 3: Call get_quick_status Tool${NC}"
echo "Request: POST $MCP_URL"
echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_quick_status","arguments":{}}}'
echo ""

RESPONSE=$(curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_quick_status","arguments":{}}}')

if echo "$RESPONSE" | jq -e '.result.content[0].text' > /dev/null 2>&1; then
  echo -e "${GREEN}SUCCESS: Tool executed${NC}"
  echo "Status:"
  echo "$RESPONSE" | jq '.result.content[0].text' -r
else
  echo -e "${RED}FAILED: Invalid response${NC}"
  echo "$RESPONSE" | jq .
  exit 1
fi

echo -e "\n---\n"

# Test 4: Call list_active_clients
echo -e "${BLUE}Test 4: Call list_active_clients Tool${NC}"
echo "Request: POST $MCP_URL"
echo '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"list_active_clients","arguments":{}}}'
echo ""

RESPONSE=$(curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"list_active_clients","arguments":{}}}')

if echo "$RESPONSE" | jq -e '.result.content[0].text' > /dev/null 2>&1; then
  echo -e "${GREEN}SUCCESS: Tool executed${NC}"
  echo "Response:"
  echo "$RESPONSE" | jq '.result.content[0].text' -r | head -10
else
  echo -e "${RED}FAILED: Invalid response${NC}"
  echo "$RESPONSE" | jq .
  exit 1
fi

echo -e "\n---\n"

# Test 5: Error handling - Invalid method
echo -e "${BLUE}Test 5: Error Handling - Invalid Method${NC}"
echo "Request: POST $MCP_URL"
echo '{"jsonrpc":"2.0","id":5,"method":"invalid/method"}'
echo ""

RESPONSE=$(curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":5,"method":"invalid/method"}')

if echo "$RESPONSE" | jq -e '.error.code == -32601' > /dev/null 2>&1; then
  echo -e "${GREEN}SUCCESS: Proper error response${NC}"
  echo "Error:"
  echo "$RESPONSE" | jq .
else
  echo -e "${RED}FAILED: Expected method not found error${NC}"
  echo "$RESPONSE" | jq .
  exit 1
fi

echo -e "\n---\n"

# Test 6: Error handling - Missing params
echo -e "${BLUE}Test 6: Error Handling - Missing Params${NC}"
echo "Request: POST $MCP_URL"
echo '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{}}'
echo ""

RESPONSE=$(curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{}}')

if echo "$RESPONSE" | jq -e '.error.code == -32602' > /dev/null 2>&1; then
  echo -e "${GREEN}SUCCESS: Proper error response${NC}"
  echo "Error:"
  echo "$RESPONSE" | jq .
else
  echo -e "${RED}FAILED: Expected invalid params error${NC}"
  echo "$RESPONSE" | jq .
  exit 1
fi

echo -e "\n${GREEN}=== All Tests Passed ===${NC}\n"
echo "The UniFi MCP server is properly configured for MCP JSON-RPC!"
echo ""
echo "Orchestrator Integration:"
echo "  URL: $MCP_URL"
echo "  Protocol: MCP JSON-RPC 2.0"
echo "  Methods: tools/list, tools/call, resources/*, prompts/*"
