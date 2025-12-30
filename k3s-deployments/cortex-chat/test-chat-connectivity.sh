#!/bin/bash
# Comprehensive chat connectivity test
# Run this BEFORE and AFTER any changes to verify network access

set -e

echo "========================================="
echo "CORTEX CHAT CONNECTIVITY TEST"
echo "========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

FAILED=0

# Test function
test_endpoint() {
  local name="$1"
  local url="$2"
  local expected_code="$3"

  echo -n "Testing $name... "

  response=$(curl -s -o /dev/null -w "%{http_code}" "$url" -m 10 2>/dev/null || echo "FAILED")

  if [ "$response" = "$expected_code" ]; then
    echo -e "${GREEN}✓ PASS${NC} (HTTP $response)"
    return 0
  else
    echo -e "${RED}✗ FAIL${NC} (Expected $expected_code, got $response)"
    FAILED=$((FAILED + 1))
    return 1
  fi
}

# Test POST endpoint
test_post_endpoint() {
  local name="$1"
  local url="$2"
  local data="$3"
  local expected_pattern="$4"

  echo -n "Testing $name... "

  response=$(curl -s -X POST "$url" \
    -H "Content-Type: application/json" \
    -d "$data" \
    -m 15 2>/dev/null || echo "FAILED")

  if echo "$response" | grep -q "$expected_pattern"; then
    echo -e "${GREEN}✓ PASS${NC}"
    return 0
  else
    echo -e "${RED}✗ FAIL${NC}"
    echo "Response: ${response:0:200}"
    FAILED=$((FAILED + 1))
    return 1
  fi
}

echo "=== 1. DNS RESOLUTION ==="
echo -n "Resolving chat.ry-ops.dev... "
DNS_IP=$(nslookup chat.ry-ops.dev 2>/dev/null | grep "Address:" | tail -1 | awk '{print $2}')
if [ -n "$DNS_IP" ]; then
  echo -e "${GREEN}✓${NC} Resolves to: $DNS_IP"
  if [[ "$DNS_IP" == 100.* ]]; then
    echo -e "${YELLOW}  → Tailscale IP detected${NC}"
  fi
else
  echo -e "${RED}✗ FAILED${NC}"
  FAILED=$((FAILED + 1))
fi
echo ""

echo "=== 2. INTERNAL KUBERNETES SERVICES ==="
# Test services from within cluster
kubectl run -n cortex-chat test-connectivity --image=curlimages/curl:latest --rm -i --restart=Never --timeout=30s -- sh -c "
echo 'Backend service:' && curl -s -o /dev/null -w '%{http_code}' http://cortex-chat-backend-simple:8080/health -m 5 && echo ''
echo 'Orchestrator service:' && curl -s -o /dev/null -w '%{http_code}' http://cortex-orchestrator.cortex.svc.cluster.local:8000/health -m 5 && echo ''
" 2>/dev/null || echo -e "${RED}✗ Internal service test failed${NC}"
echo ""

echo "=== 3. TRAEFIK LOADBALANCER ==="
TRAEFIK_IP=$(kubectl get svc traefik -n kube-system -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
echo "Traefik IP: $TRAEFIK_IP"
test_endpoint "Traefik (with Host header)" "http://$TRAEFIK_IP" "200"
echo ""

echo "=== 4. EXTERNAL ACCESS (via DNS) ==="
test_endpoint "Frontend (chat.ry-ops.dev)" "http://chat.ry-ops.dev" "200"
test_endpoint "Backend health (/api/health)" "http://chat.ry-ops.dev/api/health" "200"
echo ""

echo "=== 5. BACKEND API FUNCTIONALITY ==="
test_post_endpoint "Chat endpoint" "http://chat.ry-ops.dev/api/chat" \
  '{"message":"test","sessionId":"connectivity-test"}' \
  "content_block_start"
echo ""

echo "=== 6. TAILSCALE INGRESS ==="
TAILSCALE_POD=$(kubectl get pod -n tailscale -l app=tailscale-ingress -o jsonpath='{.items[0].metadata.name}')
if [ -n "$TAILSCALE_POD" ]; then
  echo -n "Tailscale ingress pod: "
  TAILSCALE_STATUS=$(kubectl get pod -n tailscale "$TAILSCALE_POD" -o jsonpath='{.status.phase}')
  if [ "$TAILSCALE_STATUS" = "Running" ]; then
    echo -e "${GREEN}✓ Running${NC}"
  else
    echo -e "${RED}✗ $TAILSCALE_STATUS${NC}"
    FAILED=$((FAILED + 1))
  fi

  # Check nginx proxy container
  echo -n "Nginx proxy container: "
  NGINX_READY=$(kubectl get pod -n tailscale "$TAILSCALE_POD" -o jsonpath='{.status.containerStatuses[?(@.name=="nginx-proxy")].ready}')
  if [ "$NGINX_READY" = "true" ]; then
    echo -e "${GREEN}✓ Ready${NC}"
  else
    echo -e "${RED}✗ Not Ready${NC}"
    FAILED=$((FAILED + 1))
  fi
else
  echo -e "${RED}✗ Tailscale pod not found${NC}"
  FAILED=$((FAILED + 1))
fi
echo ""

echo "=== 7. KEY DEPLOYMENTS STATUS ==="
echo "Backend:"
kubectl get deployment cortex-chat-backend-simple -n cortex-chat -o jsonpath='  Replicas: {.status.replicas}/{.spec.replicas} | Ready: {.status.readyReplicas} | Image: {.spec.template.spec.containers[0].image}' && echo ""

echo "Orchestrator:"
kubectl get deployment cortex-orchestrator -n cortex -o jsonpath='  Replicas: {.status.replicas}/{.spec.replicas} | Ready: {.status.readyReplicas} | Image: {.spec.template.spec.containers[0].image}' && echo ""

echo "Frontend:"
kubectl get deployment cortex-chat -n cortex-chat -o jsonpath='  Replicas: {.status.replicas}/{.spec.replicas} | Ready: {.status.readyReplicas}' && echo ""
echo ""

echo "========================================="
if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ ALL TESTS PASSED${NC}"
  echo "Chat is fully accessible and functional"
  exit 0
else
  echo -e "${RED}✗ $FAILED TEST(S) FAILED${NC}"
  echo "Chat connectivity is BROKEN"
  exit 1
fi
