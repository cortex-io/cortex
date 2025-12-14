#!/bin/bash
#
# Test MCP Servers
#

set -euo pipefail

source /Users/ryandahlberg/Projects/cortex/.env
K3S_SSH="ssh -o StrictHostKeyChecking=no root@${K3S_MASTER_IP}"

echo "Testing MCP Servers..."
echo ""

# Test Wazuh MCP Server
echo "1. Testing Wazuh MCP Server..."
echo "   Health check:"
WAZUH_MCP_HEALTH=$($K3S_SSH "kubectl run wazuh-mcp-test-$RANDOM --image=curlimages/curl:latest --rm -i --restart=Never -- curl -s http://wazuh-mcp-server.mcp.svc.cluster.local:3000/health" 2>&1)
echo "   $WAZUH_MCP_HEALTH"
echo ""

# Test n8n MCP Server
echo "2. Testing n8n MCP Server..."
echo "   Health check:"
N8N_MCP_HEALTH=$($K3S_SSH "kubectl run n8n-mcp-test-$RANDOM --image=curlimages/curl:latest --rm -i --restart=Never -- curl -s http://n8n-mcp-server.mcp.svc.cluster.local:3001/health" 2>&1)
echo "   $N8N_MCP_HEALTH"
echo ""

# Test MCP list-tools endpoint
echo "3. Testing MCP tools endpoints..."
echo "   Wazuh MCP tools:"
$K3S_SSH "kubectl run wazuh-tools-test-$RANDOM --image=curlimages/curl:latest --rm -i --restart=Never -- curl -s http://wazuh-mcp-server.mcp.svc.cluster.local:3000/list-tools" 2>&1 || echo "   (endpoint may not be available)"
echo ""
echo "   n8n MCP tools:"
$K3S_SSH "kubectl run n8n-tools-test-$RANDOM --image=curlimages/curl:latest --rm -i --restart=Never -- curl -s http://n8n-mcp-server.mcp.svc.cluster.local:3001/list-tools" 2>&1 || echo "   (endpoint may not be available)"
echo ""

# Check MCP server logs
echo "4. Checking MCP server logs..."
echo "   Wazuh MCP Server:"
WAZUH_MCP_POD=$($K3S_SSH "kubectl get pod -n mcp -l app=wazuh-mcp-server -o jsonpath='{.items[0].metadata.name}'")
$K3S_SSH "kubectl logs -n mcp $WAZUH_MCP_POD --tail=20" 2>&1
echo ""
echo "   n8n MCP Server:"
N8N_MCP_POD=$($K3S_SSH "kubectl get pod -n mcp -l app=n8n-mcp-server -o jsonpath='{.items[0].metadata.name}'")
$K3S_SSH "kubectl logs -n mcp $N8N_MCP_POD --tail=20" 2>&1
echo ""

echo "MCP server tests complete!"
