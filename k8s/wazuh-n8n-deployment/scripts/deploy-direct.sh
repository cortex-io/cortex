#!/bin/bash
set -euo pipefail

# Direct deployment script using kubectl from local machine
# Requires kubectl configured with k3s cluster context

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"

# Source environment
source /Users/ryandahlberg/Projects/cortex/.env

echo "=========================================="
echo "Wazuh + n8n + MCP Deployment (Direct)"
echo "=========================================="
echo "K3s Master: $K3S_MASTER_IP"
echo ""

# Check kubectl connectivity
if ! kubectl cluster-info &>/dev/null; then
    echo "ERROR: kubectl not configured for k3s cluster"
    echo "Run: export KUBECONFIG=/path/to/k3s.yaml"
    exit 1
fi

echo "Step 1: Deploying Wazuh stack..."
kubectl apply -f "$BASE_DIR/wazuh/"
echo ""

echo "Step 2: Deploying n8n stack..."
kubectl apply -f "$BASE_DIR/n8n/"
echo ""

echo "Step 3: Waiting for Wazuh Indexer to be ready..."
kubectl wait --for=condition=ready pod -l app=wazuh-indexer -n wazuh --timeout=300s || echo "Wazuh Indexer not ready yet"
echo ""

echo "Step 4: Waiting for n8n PostgreSQL to be ready..."
kubectl wait --for=condition=ready pod -l app=n8n-postgres -n n8n --timeout=300s || echo "PostgreSQL not ready yet"
echo ""

echo "Step 5: Building and loading MCP server images..."
echo "This step requires Docker images to be built and loaded on k3s nodes"
echo "Please run the image build script first if not done already"
echo ""

echo "Step 6: Deploying MCP servers..."
kubectl apply -f "$BASE_DIR/mcp/"
echo ""

echo "Step 7: Checking deployment status..."
echo ""
echo "=== Wazuh Stack ==="
kubectl get all -n wazuh
echo ""
echo "=== n8n Stack ==="
kubectl get all -n n8n
echo ""
echo "=== MCP Servers ==="
kubectl get all -n mcp
echo ""

echo "=========================================="
echo "Deployment initiated!"
echo "=========================================="
echo ""
echo "Monitor with:"
echo "  kubectl get pods -n wazuh -w"
echo "  kubectl get pods -n n8n -w"
echo "  kubectl get pods -n mcp -w"
echo ""
