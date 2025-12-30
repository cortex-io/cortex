#!/bin/bash
# Test creating a new conversation with title
set -e

NAMESPACE="cortex-chat"
SESSION_ID="title-test-$(date +%s)"

echo "Creating test conversation with sessionId: $SESSION_ID"
echo "Message: 'Test conversation for title generation'"
echo ""

kubectl exec -n $NAMESPACE deployment/cortex-chat-backend-simple -- \
  bun -e "
    async function test() {
      console.log('Sending chat request...');

      const res = await fetch('http://localhost:8080/api/chat', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          message: 'Test conversation for title generation',
          sessionId: '$SESSION_ID'
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

      console.log('Chat completed. Checking conversation...');

      // Check conversation
      const conv = await fetch('http://localhost:8080/api/conversations/$SESSION_ID')
        .then(r => r.json());

      console.log('Conversation data:', JSON.stringify(conv, null, 2));
    }
    test().catch(e => console.error('Error:', e));
  "
