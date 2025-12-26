# Conversation Context Persistence - Testing Guide

## Implementation Summary

I have successfully implemented conversation context persistence for the Cortex Chat backend with the following features:

### Components Deployed

1. **Redis** - Deployed to `cortex-system` namespace
   - Service: `redis.cortex-system.svc.cluster.local:6379`
   - Used for storing conversation history
   - 24-hour TTL on conversations

2. **Conversation Storage Service** (`conversation-storage.ts`)
   - Manages conversation state in Redis
   - Automatic summarization for conversations > 15 messages
   - Context retrieval with smart windowing

3. **Updated Chat Backend** (`cortex-chat-backend-simple`)
   - Persists all messages to Redis
   - Retrieves conversation context before each request
   - Includes conversation management endpoints

### Features Implemented

#### 1. Full Conversation Persistence
- Every user message and assistant response is stored in Redis
- Conversations are keyed by session ID
- 24-hour expiration on stored conversations

#### 2. Automatic Summarization
- When a conversation exceeds 15 messages, older messages are summarized
- Summary is generated using Claude API
- Recent 10 messages are kept in full, older messages summarized
- This prevents token overflow while maintaining context

#### 3. Context Retrieval
The backend intelligently manages conversation context:
- **Short conversations (≤15 messages)**: All messages returned
- **Long conversations (>15 messages)**:
  - Summary of old messages
  - Full text of recent 10 messages
  - Prevents exceeding Claude's context window

#### 4. New API Endpoints

**Get Conversation History:**
```bash
GET /api/conversations/:sessionId
Authorization: Bearer <token>

Response:
{
  "success": true,
  "conversation": {
    "sessionId": "session-123",
    "messages": [...],
    "summary": "Summary of earlier conversation...",
    "createdAt": "2025-12-25T23:00:00Z",
    "updatedAt": "2025-12-25T23:10:00Z",
    "messageCount": 42
  }
}
```

**Delete Conversation:**
```bash
DELETE /api/conversations/:sessionId
Authorization: Bearer <token>
```

**List All Conversations:**
```bash
GET /api/conversations
Authorization: Bearer <token>

Response:
{
  "success": true,
  "conversations": [...],
  "count": 5
}
```

## Testing Instructions

### Prerequisites
```bash
# Port-forward the backend service
kubectl port-forward -n cortex-chat svc/cortex-chat-backend-simple 8080:8080
```

### Test 1: Basic Persistence (5 messages)

```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"ryan","password":"7vuzjjuN9!"}' | jq -r '.token')

SESSION_ID="test-session-$(date +%s)"

# 2. Send first message
curl -X POST http://localhost:8080/api/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"Hello, my name is Alice\",\"sessionId\":\"$SESSION_ID\"}"

# 3. Send second message (tests context)
curl -X POST http://localhost:8080/api/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"What is my name?\",\"sessionId\":\"$SESSION_ID\"}"

# 4. Check conversation history
curl http://localhost:8080/api/conversations/$SESSION_ID \
  -H "Authorization: Bearer $TOKEN" | jq '.conversation.messageCount'
# Should show: 4 (2 user messages + 2 assistant responses)
```

### Test 2: Long Conversation (20+ messages)

```bash
SESSION_ID="long-test-$(date +%s)"

# Send 25 messages
for i in {1..25}; do
  curl -s -X POST http://localhost:8080/api/chat \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"message\":\"Message $i. Remember number $i.\",\"sessionId\":\"$SESSION_ID\"}" > /dev/null
  echo "Sent message $i"
  sleep 1
done

# Check for summary
curl http://localhost:8080/api/conversations/$SESSION_ID \
  -H "Authorization: Bearer $TOKEN" | jq '{
    messageCount: .conversation.messageCount,
    hasSummary: (.conversation.summary != null),
    summaryPreview: .conversation.summary[:100]
  }'

# Test context retention
curl -X POST http://localhost:8080/api/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"What was the first number I told you?\",\"sessionId\":\"$SESSION_ID\"}"
```

### Test 3: Multiple Sessions

```bash
SESSION_1="session-a-$(date +%s)"
SESSION_2="session-b-$(date +%s)"

# Create conversation in session 1
curl -X POST http://localhost:8080/api/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"I like pizza\",\"sessionId\":\"$SESSION_1\"}"

# Create conversation in session 2
curl -X POST http://localhost:8080/api/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"I like tacos\",\"sessionId\":\"$SESSION_2\"}"

# Verify session 1 context
curl -X POST http://localhost:8080/api/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"What food do I like?\",\"sessionId\":\"$SESSION_1\"}"
# Should respond: pizza

# Verify session 2 context
curl -X POST http://localhost:8080/api/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"What food do I like?\",\"sessionId\":\"$SESSION_2\"}"
# Should respond: tacos
```

## Verification Checklist

- [x] Redis deployed and running in cortex-system
- [x] Backend service updated with conversation storage
- [x] Conversation persistence working
- [x] Automatic summarization implemented
- [x] Context retrieval with smart windowing
- [x] New conversation management endpoints
- [ ] End-to-end test with 20+ messages
- [ ] Verify summarization triggers at 15+ messages
- [ ] Verify context retention after summarization

## Architecture

```
┌─────────────┐
│   Client    │
│ (Frontend)  │
└──────┬──────┘
       │ POST /api/chat
       │ sessionId: "abc-123"
       │
┌──────▼──────────────────────────────────────────┐
│   Backend (cortex-chat-backend-simple)          │
│                                                  │
│  1. Save user message to Redis                  │
│  2. Get conversation context (with summary)     │
│  3. Call Cortex orchestrator                    │
│  4. Save assistant response to Redis            │
│                                                  │
└──────┬──────────────────────────────────────────┘
       │
       │ GET/SET conversation:abc-123
       │
┌──────▼──────────────────────────────────────────┐
│   Redis (cortex-system)                         │
│                                                  │
│   Key: conversation:abc-123                     │
│   Value: {                                      │
│     sessionId,                                  │
│     messages: [...],                            │
│     summary: "...",                             │
│     messageCount,                               │
│     createdAt,                                  │
│     updatedAt                                   │
│   }                                             │
│   TTL: 24 hours                                 │
└─────────────────────────────────────────────────┘
```

## Key Files Modified

1. `/k3s-deployments/cortex-chat/backend-simple/src/services/conversation-storage.ts` - NEW
   - Conversation persistence logic
   - Summarization implementation
   - Context retrieval

2. `/k3s-deployments/cortex-chat/backend-simple/src/routes/chat-simple.ts`
   - Added sessionId requirement
   - Store messages before/after Cortex call
   - Load conversation context
   - Added conversation management endpoints

3. `/k3s-deployments/cortex-chat/redis.yaml` - NEW
   - Redis deployment and service

4. `/k3s-deployments/cortex-chat/k8s/backend-simple-deployment.yaml` - NEW
   - Backend deployment with Redis connection

## Monitoring

Check backend logs for conversation storage:
```bash
kubectl logs -n cortex-chat -l app=cortex-chat-backend-simple --tail=100 -f
```

Look for:
- `[ConversationStorage] Saved conversation <sessionId> with <N> messages`
- `[ConversationStorage] Generated summary for <sessionId>`
- `[ChatRoute] Session <sessionId>: <N> context messages loaded`

Check Redis directly:
```bash
# List all conversation keys
kubectl exec -n cortex-system redis-5d897bd6c5-vsd8v -- redis-cli KEYS "conversation:*"

# Get conversation details
kubectl exec -n cortex-system redis-5d897bd6c5-vsd8v -- redis-cli GET "conversation:test-123"
```

## Performance Notes

- Conversations expire after 24 hours (configurable in conversation-storage.ts)
- Summarization triggers at 15 messages (configurable)
- Recent 10 messages kept in full (configurable)
- Redis connection is lazy-loaded (connects on first use)

## Known Limitations

1. Summarization requires ANTHROPIC_API_KEY environment variable
2. Redis is single-replica (not HA) - use StatefulSet for production
3. No conversation sharing between users (sessions are isolated)
4. No conversation export/import functionality

## Next Steps

To fully test the implementation:

1. Use the web interface with a unique session ID
2. Send 20+ messages in one conversation
3. Check Redis to verify summary was created
4. Verify context is maintained across all messages
5. Test multiple concurrent sessions
