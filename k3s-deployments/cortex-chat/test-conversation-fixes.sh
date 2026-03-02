#!/bin/bash
# Test conversation fixes
set -e

echo "======================================================"
echo "Cortex Chat Conversation Fixes - Automated Test"
echo "======================================================"
echo ""

NAMESPACE="cortex-chat"
BACKEND_SVC="cortex-chat-backend-simple:8080"

echo "1. Testing Backend Health..."
kubectl exec -n $NAMESPACE deployment/cortex-chat-backend-simple -- \
  bun -e "fetch('http://localhost:8080/api/health').then(r=>r.json()).then(d=>{console.log('✅ Backend:', d.backend);console.log('✅ Mode:', d.mode)})" 2>/dev/null || echo "⚠️  Backend health check failed"

echo ""
echo "2. Testing Conversation List Endpoint..."
kubectl exec -n $NAMESPACE deployment/cortex-chat-backend-simple -- \
  bun -e "fetch('http://localhost:8080/api/conversations').then(r=>r.json()).then(d=>{console.log('✅ Found', d.count, 'conversations');if(d.conversations && d.conversations.length>0){console.log('   Latest:', d.conversations[0].title || 'No title')}})" 2>/dev/null || echo "⚠️  Conversation list failed"

echo ""
echo "3. Creating Test Conversation..."
TEST_SESSION="test-$(date +%s)"
kubectl exec -n $NAMESPACE deployment/cortex-chat-backend-simple -- \
  bun -e "
    async function test() {
      const res = await fetch('http://localhost:8080/api/chat', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          message: 'This is a test conversation to verify titles work',
          sessionId: '$TEST_SESSION'
        })
      });

      // Read SSE stream
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, {stream: true});
        if (buffer.includes('[DONE]')) break;
      }

      console.log('✅ Test conversation created with sessionId:', '$TEST_SESSION');

      // Verify it was saved with title
      const conv = await fetch('http://localhost:8080/api/conversations/$TEST_SESSION')
        .then(r => r.json());

      if (conv.conversation && conv.conversation.title) {
        console.log('✅ Title saved:', conv.conversation.title);
      } else {
        console.log('⚠️  No title found');
      }
    }
    test().catch(e => console.error('❌ Test failed:', e.message));
  " 2>/dev/null || echo "⚠️  Test conversation creation failed"

echo ""
echo "4. Testing Delete Endpoint..."
kubectl exec -n $NAMESPACE deployment/cortex-chat-backend-simple -- \
  bun -e "
    async function test() {
      const res = await fetch('http://localhost:8080/api/conversations/$TEST_SESSION', {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        console.log('✅ Test conversation deleted successfully');
      } else {
        console.log('⚠️  Delete failed:', data.error);
      }
    }
    test().catch(e => console.error('❌ Delete failed:', e.message));
  " 2>/dev/null || echo "⚠️  Delete test failed"

echo ""
echo "5. Checking Frontend Deployment..."
FRONTEND_POD=$(kubectl get pod -n $NAMESPACE -l app=cortex-chat -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
if [ -n "$FRONTEND_POD" ]; then
  echo "✅ Frontend pod: $FRONTEND_POD"
  kubectl get pod $FRONTEND_POD -n $NAMESPACE | grep Running >/dev/null && echo "✅ Status: Running" || echo "⚠️  Not running"
else
  echo "⚠️  Frontend pod not found"
fi

echo ""
echo "6. Checking Frontend Service..."
EXTERNAL_IP=$(kubectl get svc cortex-chat-frontend -n $NAMESPACE -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null)
if [ -n "$EXTERNAL_IP" ]; then
  echo "✅ Frontend URL: http://$EXTERNAL_IP"
else
  echo "⚠️  No external IP found"
fi

echo ""
echo "======================================================"
echo "Test Summary"
echo "======================================================"
echo ""
echo "Backend Endpoints:"
echo "  - Health: http://cortex-chat-backend-simple:8080/api/health"
echo "  - Chat: POST http://cortex-chat-backend-simple:8080/api/chat"
echo "  - List: GET http://cortex-chat-backend-simple:8080/api/conversations"
echo "  - Delete: DELETE http://cortex-chat-backend-simple:8080/api/conversations/:id"
echo ""
echo "Frontend:"
echo "  - URL: http://$EXTERNAL_IP"
echo "  - Deployment: cortex-chat"
echo "  - Namespace: cortex-chat"
echo ""
echo "Manual Testing:"
echo "  1. Open http://$EXTERNAL_IP in browser"
echo "  2. Send a message"
echo "  3. Check sidebar for conversation title (should be first 50 chars)"
echo "  4. Hover over conversation and click trash icon to delete"
echo "  5. Refresh page to verify persistence"
echo ""
echo "======================================================"
