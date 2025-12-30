# SSE Event Flow Example - Contextual Suggestions

## Complete Event Sequence

This document shows the complete Server-Sent Events (SSE) flow when a user submits a query that triggers contextual suggestions.

## Example Query

**User Input:**
```
"Show me the status of my k3s cluster and UniFi network"
```

## SSE Event Stream

### Event 1: content_block_start
```json
{
  "type": "content_block_start",
  "text": ""
}
```

### Event 2: content_block_delta
```json
{
  "type": "content_block_delta",
  "delta": "Your K3s cluster has 3 nodes (all Ready) with 45 pods running across 8 namespaces. All pods are healthy. Your UniFi network shows 4 access points online with 23 connected clients. Network performance is good with average latency of 12ms."
}
```

### Event 3: issues_detected (if any issues found)
```json
{
  "type": "issues_detected",
  "issues": []
}
```
*Note: Empty array in this example since no issues were detected*

### Event 4: content_block_stop
```json
{
  "type": "content_block_stop"
}
```

### Event 5: suggestions (NEW - from this implementation)
```json
{
  "type": "suggestions",
  "suggestions": [
    {
      "type": "action",
      "title": "Cluster Health & Optimization",
      "description": "Comprehensive cluster analysis and resource optimization suggestions",
      "actions": [
        {
          "label": "Run resource audit",
          "prompt": "Audit cluster resource usage and identify pods or namespaces with inefficient resource allocations",
          "priority": "high"
        },
        {
          "label": "Review recent events",
          "prompt": "Show critical Kubernetes events from the last 24 hours across all namespaces",
          "priority": "high"
        },
        {
          "label": "Security scan",
          "prompt": "Run security scan on cluster looking for vulnerabilities, exposed services, and misconfigurations",
          "priority": "medium"
        },
        {
          "label": "Optimize resources",
          "prompt": "Analyze pod resource requests/limits and recommend optimizations to improve cluster efficiency",
          "priority": "low"
        }
      ]
    },
    {
      "type": "related_check",
      "title": "Network Performance Analysis",
      "description": "Deep dive into network health, performance metrics, and optimization opportunities",
      "actions": [
        {
          "label": "Run speed test across APs",
          "prompt": "Run a speed test on all UniFi access points and compare against baseline performance",
          "priority": "high"
        },
        {
          "label": "Check firmware status",
          "prompt": "Check firmware versions on all UniFi devices and identify any pending updates",
          "priority": "medium"
        },
        {
          "label": "Analyze bandwidth usage",
          "prompt": "Show current bandwidth usage by client and identify top consumers",
          "priority": "medium"
        },
        {
          "label": "Optimize channel allocation",
          "prompt": "Analyze WiFi channel usage and recommend optimal channel assignments to reduce interference",
          "priority": "low"
        }
      ]
    }
  ]
}
```

### Event 6: message_stop
```json
{
  "type": "message_stop"
}
```

### Event 7: done
```
data: [DONE]
```

## Frontend Integration Pattern

```typescript
// SSE Event Handler
eventSource.addEventListener('message', (e) => {
  const event = JSON.parse(e.data);

  switch (event.type) {
    case 'content_block_start':
      // Initialize message area
      break;

    case 'content_block_delta':
      // Append text to message
      displayMessage(event.delta);
      break;

    case 'issues_detected':
      // Show detected issues
      if (event.issues.length > 0) {
        displayIssues(event.issues);
      }
      break;

    case 'content_block_stop':
      // Message complete
      break;

    case 'suggestions':
      // NEW: Render contextual suggestions
      displaySuggestions(event.suggestions);
      break;

    case 'message_stop':
      // Conversation turn complete
      break;
  }
});

// Suggestion Display Function
function displaySuggestions(suggestions) {
  suggestions.forEach(suggestion => {
    const card = createSuggestionCard(suggestion);
    suggestionsContainer.appendChild(card);
  });
}

// Suggestion Card Component
function createSuggestionCard(suggestion) {
  const card = document.createElement('div');
  card.className = `suggestion-card ${suggestion.type}`;

  card.innerHTML = `
    <div class="suggestion-header">
      <h3>${suggestion.title}</h3>
      <span class="suggestion-type">${suggestion.type}</span>
    </div>
    <p class="suggestion-description">${suggestion.description}</p>
    <div class="suggestion-actions">
      ${suggestion.actions.map(action => `
        <button
          class="action-button priority-${action.priority || 'medium'}"
          onclick="submitPrompt('${action.prompt}')"
        >
          ${action.label}
        </button>
      `).join('')}
    </div>
  `;

  return card;
}

// Action Button Handler
function submitPrompt(prompt) {
  // Submit the prompt as a new query
  sendMessage(prompt);
}
```

## UI/UX Recommendations

### Suggestion Card Layout

```
┌─────────────────────────────────────────────┐
│ Network Performance Analysis    related_check│
├─────────────────────────────────────────────┤
│ Deep dive into network health, performance  │
│ metrics, and optimization opportunities     │
├─────────────────────────────────────────────┤
│ [Run speed test]          HIGH              │
│ [Check firmware]          MEDIUM            │
│ [Analyze bandwidth]       MEDIUM            │
│ [Optimize channels]       LOW               │
└─────────────────────────────────────────────┘
```

### Priority Styling

- **High Priority**: Bold, prominent color (e.g., blue or orange)
- **Medium Priority**: Normal weight, standard color
- **Low Priority**: Subtle, lighter color

### Suggestion Types

- **action**: Direct actions to improve the system
- **insight**: Analytical deep-dives for understanding
- **question**: Diagnostic questions for troubleshooting
- **related_check**: Related health checks in other areas

### Interaction Pattern

1. User sees suggestions after each query response
2. Clicking an action submits that prompt automatically
3. Previous suggestions can remain visible or collapse
4. New suggestions replace old ones on new query

## Multiple Pattern Example

When a query matches multiple patterns, the user receives multiple suggestion groups:

**Query:** "Check cluster performance and security alerts"

**Result:** 3 suggestion groups
1. Cluster Health & Optimization (k8s pattern)
2. Performance Optimization (performance pattern)
3. Security Alert Triage (security pattern)

Each group has its own set of actions tailored to that operational area.

## Empty Suggestions Example

**Query:** "What's the weather like?"

**Result:** No suggestions event sent (event skipped entirely)

The backend only emits the `suggestions` event when `suggestions.length > 0`.

## Testing the Flow

### 1. Start the backend
```bash
cd /Users/ryandahlberg/Projects/cortex/k3s-deployments/cortex-chat/backend-simple
bun run dev
```

### 2. Send a test query
```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Show k3s cluster status",
    "sessionId": "test-123"
  }'
```

### 3. Watch for suggestions event
Look for the SSE event with `event: suggestions` in the response stream.

## Browser DevTools Debugging

In Chrome/Firefox DevTools:

1. Open Network tab
2. Find the `/chat` request
3. Click to view details
4. Look at EventStream tab
5. Find `suggestions` event
6. Inspect JSON payload

## Performance Notes

- Suggestions are generated in <1ms (in-memory pattern matching)
- No impact on response time
- Event is sent after main content (non-blocking)
- Multiple suggestion groups handled efficiently

## Backend Logs

When suggestions are generated, you'll see:
```
[ChatRoute] Generated 2 contextual suggestions
```

This confirms the feature is working and how many suggestion groups were created.
