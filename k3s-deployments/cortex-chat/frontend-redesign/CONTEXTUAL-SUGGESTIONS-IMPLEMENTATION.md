# Contextual Suggestions Feature - Frontend Implementation

## Implementation Summary

Successfully implemented the contextual suggestions feature in the frontend to display actionable suggestions sent from the backend context analyzer.

## Files Modified

- `/Users/ryandahlberg/Projects/cortex/k3s-deployments/cortex-chat/frontend-redesign/index.html`

## Changes Made

### 1. CSS Styling (Lines 456-530)

Added comprehensive styling for suggestion cards:

```css
/* Contextual Suggestion Cards */
.suggestion-card {
    background: rgba(91, 143, 217, 0.05);
    border: 1px solid rgba(91, 143, 217, 0.15);
    border-radius: 8px;
    padding: 12px;
    margin-top: 12px;
}
```

**Features:**
- Light blue background (`rgba(91, 143, 217, 0.05)`) - lighter than fix-suggestion cards
- Subtle border with matching color scheme
- Consistent spacing with existing UI components
- Three priority levels for action buttons:
  - **High priority**: Blue accent color, highlighted background
  - **Medium priority**: Default styling
  - **Low priority**: Reduced opacity (70%)

### 2. JavaScript Functions

#### `executeSuggestion()` (Lines 1494-1498)

```javascript
window.executeSuggestion = async function(prompt) {
    messageInput.value = prompt;
    await sendMessage();
};
```

Populates the message input with the suggestion prompt and triggers sending.

#### `renderSuggestions()` (Lines 1500-1542)

```javascript
function renderSuggestions(suggestions, messageDiv) {
    // Icon mapping
    const iconMap = {
        'action': '💡',
        'insight': '📊',
        'question': '🔍',
        'related_check': '🔗'
    };

    // Render each suggestion card
    suggestions.forEach(suggestion => {
        // Create card with header, description, and action buttons
    });
}
```

**Features:**
- Maps suggestion types to appropriate icons
- Renders title, description, and action buttons
- Handles priority styling for buttons
- Escapes special characters in prompts

### 3. SSE Event Handler (Lines 1363-1372)

```javascript
else if (data.type === 'suggestions' && data.suggestions) {
    if (!messageDiv) {
        messageDiv = document.createElement('div');
        messageDiv.className = 'message assistant';
        messagesContainer.appendChild(messageDiv);
    }

    renderSuggestions(data.suggestions, messageDiv);
}
```

Listens for `suggestions` events from the backend and renders them.

## Data Format Expected

The backend should send SSE events in this format:

```json
{
  "type": "suggestions",
  "suggestions": [
    {
      "type": "action",
      "title": "Suggestion Title",
      "description": "Detailed description of the suggestion",
      "actions": [
        {
          "label": "Button Label",
          "prompt": "The prompt to execute",
          "priority": "high"
        }
      ]
    }
  ]
}
```

## Suggestion Types

| Type | Icon | Use Case |
|------|------|----------|
| `action` | 💡 | Actionable recommendations |
| `insight` | 📊 | Data insights and analysis |
| `question` | 🔍 | Follow-up questions |
| `related_check` | 🔗 | Related health checks |

## Priority Levels

| Priority | Styling | Use Case |
|----------|---------|----------|
| `high` | Blue accent, highlighted | Critical or most relevant actions |
| `medium` | Default styling | Standard suggestions |
| `low` | 70% opacity | Optional or less important actions |

## UI/UX Design

### Visual Hierarchy

1. **Suggestion appears after assistant response**
2. **Light blue theme** distinguishes from error fix suggestions (red theme)
3. **Multiple cards can stack** for complex contexts
4. **Action buttons clearly labeled** and prioritized

### User Flow

1. User asks a question
2. Backend analyzes context and generates suggestions
3. Frontend receives `suggestions` SSE event
4. Suggestion cards render below assistant message
5. User clicks action button
6. Prompt populates message input
7. Message sends automatically

### Accessibility

- Clear visual hierarchy with icons and colors
- Readable text sizes (13px title, 12px description)
- Hover states for all interactive elements
- Semantic HTML structure

## Integration Notes

### Backend Integration

The backend context analyzer (implemented by Larry) should:

1. Analyze conversation context
2. Generate relevant suggestions
3. Send SSE event with type `suggestions`
4. Include properly formatted suggestion objects

### Testing Scenarios

Test with these contexts:

1. **After health check**: Suggest related checks (CPU, memory, pods)
2. **After finding issue**: Suggest investigation actions
3. **After successful fix**: Suggest verification steps
4. **During investigation**: Suggest alternative approaches

## Example Suggestion Payload

```json
{
  "type": "suggestions",
  "suggestions": [
    {
      "type": "related_check",
      "title": "Related Health Checks",
      "description": "You checked pod status. These related checks might be useful:",
      "actions": [
        {
          "label": "Check Node Status",
          "prompt": "Check the status of all nodes in the cluster",
          "priority": "high"
        },
        {
          "label": "Review Events",
          "prompt": "Show recent cluster events",
          "priority": "medium"
        },
        {
          "label": "Check Resource Usage",
          "prompt": "Check CPU and memory usage across pods",
          "priority": "medium"
        }
      ]
    },
    {
      "type": "insight",
      "title": "Resource Optimization",
      "description": "Several pods are using less than 20% of requested resources.",
      "actions": [
        {
          "label": "Optimize Requests",
          "prompt": "Help me optimize resource requests for underutilized pods",
          "priority": "low"
        }
      ]
    }
  ]
}
```

## Compatibility

- Works with existing SSE streaming architecture
- Non-blocking - won't interfere with other event types
- Backward compatible - gracefully handles missing suggestions
- Mobile responsive (inherits from existing card styles)

## Future Enhancements

Possible improvements:

1. **Suggestion dismissal**: Allow users to hide suggestions
2. **Suggestion history**: Track which suggestions were helpful
3. **Smart ordering**: Reorder suggestions based on context
4. **Collapsible cards**: Collapse less relevant suggestions
5. **Keyboard shortcuts**: Quick access to suggestion actions

## Status

✅ **Implementation Complete**

The frontend is ready to receive and display contextual suggestions from the backend context analyzer.
