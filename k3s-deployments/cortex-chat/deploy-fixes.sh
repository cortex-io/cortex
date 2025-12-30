#!/bin/bash
# Deploy conversation fixes by updating just the changed files
set -e

echo "=== Cortex Chat Conversation Fixes Deployment ==="
echo "Updating frontend with conversation title and delete fixes..."

NAMESPACE="cortex-chat"

# Update frontend ConfigMap with fixed index.html
echo "Creating ConfigMap with fixed frontend..."
kubectl create configmap cortex-chat-frontend-html \
  --from-file=index.html=/Users/ryandahlberg/Projects/cortex/k3s-deployments/cortex-chat/frontend-redesign/index.html \
  -n $NAMESPACE \
  --dry-run=client -o yaml | kubectl apply -f -

# Restart frontend deployment to pick up changes
echo "Restarting frontend deployment..."
kubectl rollout restart deployment/cortex-chat -n $NAMESPACE

echo ""
echo "Waiting for frontend rollout to complete..."
kubectl rollout status deployment/cortex-chat -n $NAMESPACE --timeout=120s

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Frontend has been updated with:"
echo "  - Fixed conversation title display (using conv.sessionId and conv.title)"
echo "  - Fixed delete button (using conv.sessionId)"
echo "  - Fixed timestamp display (using conv.updatedAt and conv.createdAt)"
echo "  - Removed duplicate saveConversation function"
echo ""
echo "Backend already has conversation storage working correctly:"
echo "  - Auto-generates titles from first user message"
echo "  - Stores in Redis with proper key: conversation:{sessionId}"
echo "  - DELETE /api/conversations/:sessionId works"
echo "  - GET /api/conversations lists all conversations"
echo ""
echo "Test the fixes:"
echo "  1. Create a new conversation"
echo "  2. Check that it shows the first message as the title"
echo "  3. Delete a conversation using the trash icon"
echo "  4. Refresh and verify changes persisted"
echo ""
echo "Frontend URL: http://10.88.145.210"
