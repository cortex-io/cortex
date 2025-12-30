# Conversation Status Tracking - Quick Reference

## Status Types
- `active` - New conversation, no actions triggered
- `in_progress` - Action button clicked, Cortex is processing
- `completed` - Cortex finished processing

## API Endpoints

### Get Grouped Conversations
```bash
GET /api/conversations
```
Returns:
```json
{
  "success": true,
  "conversations": {
    "active": [...],
    "in_progress": [...],
    "completed": [...]
  },
  "counts": {
    "active": 5,
    "in_progress": 2,
    "completed": 17
  }
}
```

### Update Status Manually
```bash
PATCH /api/conversations/:sessionId/status
Content-Type: application/json

{ "status": "in_progress" }
```

### Send Action Message (Frontend)
```bash
POST /api/chat
Content-Type: application/json

{
  "sessionId": "session-123",
  "message": "Fix the pod",
  "isAction": true  // Triggers in_progress status
}
```

## Status Transitions

```
NEW -> [active]
  |
  | User clicks Fix/Investigate
  v
[in_progress]
  |
  | Cortex completes (message_stop)
  v
[completed]
```

## TypeScript Interfaces

```typescript
interface Conversation {
  sessionId: string;
  title?: string;
  messages: Message[];
  summary?: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  status: 'active' | 'in_progress' | 'completed';
}
```

## Methods Added

```typescript
// Update conversation status
await conversationStorage.updateConversationStatus(
  sessionId,
  'in_progress'
);

// Get grouped conversations
const grouped = await conversationStorage.getGroupedConversations();
```

## Frontend Integration

```javascript
// When action button clicked
fetch('/api/chat', {
  method: 'POST',
  body: JSON.stringify({
    sessionId: currentSessionId,
    message: fixPrompt,
    isAction: true  // KEY: Sets status to in_progress
  })
});

// Load conversations by category
const response = await fetch('/api/conversations');
const { conversations, counts } = await response.json();

// conversations.active
// conversations.in_progress
// conversations.completed
```

## Backward Compatibility
- Existing conversations without status default to 'active'
- No migration required
- Automatic handling in getConversation() and getAllConversations()

## Files Modified
1. `/src/services/conversation-storage.ts` - Added status field and methods
2. `/src/routes/chat-simple.ts` - Added endpoints and status transitions
