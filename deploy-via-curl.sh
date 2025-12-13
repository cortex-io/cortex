#!/bin/bash
# One-Line Cortex Deployment
# Run from CT 300 console: curl -sSL https://raw.githubusercontent.com/ry-ops/cortex/docker-container/deploy-via-curl.sh | bash

set -e

echo "🚀 Cortex K3s Autonomous Deployment"
echo "===================================="
echo ""

# Check kubectl
if ! command -v kubectl &>/dev/null; then
    echo "❌ kubectl not found. Please run from K3s master."
    exit 1
fi

# Check cluster access
if ! kubectl cluster-info &>/dev/null; then
    echo "❌ Cannot access K8s cluster"
    exit 1
fi

echo "✅ K3s cluster accessible"
echo ""

# Deploy complete manifest from GitHub
echo "📦 Deploying Cortex from GitHub..."
kubectl apply -f https://raw.githubusercontent.com/ry-ops/cortex/docker-container/k8s/cortex-complete-deployment.yaml

echo ""
echo "🔐 Creating secrets..."

# Create secrets
kubectl create secret generic cortex-credentials \
    --namespace=cortex-system \
    --from-literal=anthropic-api-key="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" \
    --from-literal=github-token="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" \
    --from-literal=github-user="ry-ops" \
    --from-literal=wazuh-url="https://10.88.140.202:55000" \
    --from-literal=wazuh-user="admin" \
    --from-literal=wazuh-password='*B96Y7a0t8Ep9cw+z0RSevdRHwLnsiay' \
    --from-literal=proxmox-host="10.88.140.164" \
    --from-literal=proxmox-token='root@pam!n8n=b8cc165f-0153-43bb-a48a-5d7459587ca7' \
    --dry-run=client -o yaml | kubectl apply -f -

kubectl create configmap cortex-config \
    --namespace=cortex-system \
    --from-literal=enable-self-evaluation="true" \
    --from-literal=enable-rlhf="true" \
    --from-literal=enable-autonomous-remediation="true" \
    --dry-run=client -o yaml | kubectl apply -f -

echo ""
echo "⏳ Waiting for pods to start..."
sleep 10

kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=cortex -n cortex-system --timeout=300s 2>/dev/null || true

echo ""
echo "=========================================="
echo "  ✅ CORTEX DEPLOYED!"
echo "=========================================="
echo ""

kubectl get pods -n cortex-system -o wide
echo ""
kubectl get svc -n cortex-system

echo ""
echo "📊 Dashboard:"
DASHBOARD_IP=$(kubectl get svc cortex-dashboard -n cortex-system -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null)
if [ -n "$DASHBOARD_IP" ]; then
    echo "   http://$DASHBOARD_IP"
else
    DASHBOARD_PORT=$(kubectl get svc cortex-dashboard -n cortex-system -o jsonpath='{.spec.ports[0].nodePort}' 2>/dev/null)
    echo "   http://10.88.145.180:${DASHBOARD_PORT}"
fi

echo ""
echo "🔒 Wazuh: https://10.88.140.202"
echo ""
echo "🎉 Cortex is running autonomously!"
