# Quick Reference - Contextual Suggestions

## For Backend Developers (Larry)

### SSE Event Format
Send this event after analyzing conversation context:

```javascript
res.write(`data: ${JSON.stringify({
  type: 'suggestions',
  suggestions: [
    {
      type: 'action',              // or: insight, question, related_check
      title: 'Next Steps',
      description: 'Consider these checks:',
      actions: [
        {
          label: 'Check Nodes',
          prompt: 'Check the status of all nodes',
          priority: 'high'        // or: medium, low
        }
      ]
    }
  ]
})}\n\n`);
```

### Suggestion Types
- `action` → 💡 (Actionable recommendations)
- `insight` → 📊 (Data insights)
- `question` → 🔍 (Follow-up questions)
- `related_check` → 🔗 (Related health checks)

### Priority Levels
- `high` → Blue accent, highlighted (critical actions)
- `medium` → Default styling (standard suggestions)
- `low` → 70% opacity (optional actions)

---

## For Frontend Developers

### Key Functions

```javascript
// Execute a suggestion (auto-populates input and sends)
window.executeSuggestion('Your prompt here');

// Render suggestions to a message div
renderSuggestions(suggestions, messageDiv);
```

### CSS Classes

```css
.suggestion-card            /* Container */
.suggestion-header          /* Icon + title row */
.suggestion-icon            /* Emoji icon */
.suggestion-title           /* Title text */
.suggestion-description     /* Description text */
.suggestion-actions         /* Button container */
.suggestion-action-btn      /* Base button */
.priority-high              /* High priority modifier */
.priority-low               /* Low priority modifier */
```

---

## Example Usage

### Simple Suggestion
```json
{
  "type": "suggestions",
  "suggestions": [{
    "type": "action",
    "title": "Next Steps",
    "description": "Check cluster nodes",
    "actions": [{
      "label": "Check Nodes",
      "prompt": "Show me node status",
      "priority": "high"
    }]
  }]
}
```

### Multiple Suggestions
```json
{
  "type": "suggestions",
  "suggestions": [
    {
      "type": "related_check",
      "title": "Related Checks",
      "description": "You might also want to:",
      "actions": [
        {"label": "Check Nodes", "prompt": "...", "priority": "high"},
        {"label": "View Events", "prompt": "...", "priority": "medium"}
      ]
    },
    {
      "type": "insight",
      "title": "Performance",
      "description": "CPU usage is normal",
      "actions": [
        {"label": "View Metrics", "prompt": "...", "priority": "low"}
      ]
    }
  ]
}
```

---

## Testing

### Browser Console Test
```javascript
// Inject test suggestion
const testDiv = document.querySelector('.message.assistant');
renderSuggestions([{
  type: 'action',
  title: 'Test',
  description: 'Testing suggestion UI',
  actions: [{
    label: 'Click Me',
    prompt: 'Test prompt',
    priority: 'high'
  }]
}], testDiv);
```

### Backend Test
```bash
# Send SSE event
curl -N http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"test","sessionId":"test"}'
```

---

## Common Patterns

### After Health Check
```javascript
{
  type: 'related_check',
  title: 'Related Health Checks',
  description: 'You checked pods. Also check:',
  actions: [
    {label: 'Nodes', prompt: 'Check nodes', priority: 'high'},
    {label: 'Events', prompt: 'Show events', priority: 'medium'}
  ]
}
```

### After Finding Issue
```javascript
{
  type: 'action',
  title: 'Investigation Steps',
  description: 'Found pod issue. Next steps:',
  actions: [
    {label: 'View Logs', prompt: 'Show pod logs', priority: 'high'},
    {label: 'Describe Pod', prompt: 'Describe pod', priority: 'high'}
  ]
}
```

### Resource Optimization
```javascript
{
  type: 'insight',
  title: 'Resource Usage',
  description: 'Pods using <20% of resources',
  actions: [
    {label: 'Optimize', prompt: 'Optimize resources', priority: 'low'}
  ]
}
```

---

## Files & Documentation

| File | Purpose |
|------|---------|
| `index.html` | Main implementation |
| `CONTEXTUAL-SUGGESTIONS-IMPLEMENTATION.md` | Technical details |
| `CONTEXTUAL-SUGGESTIONS-VISUAL-GUIDE.md` | Design specs |
| `TESTING-SUGGESTIONS.md` | Test procedures |
| `DARYL-IMPLEMENTATION-SUMMARY.md` | Complete summary |
| `QUICK-REFERENCE.md` | This file |

---

## Integration Checklist

Backend (Larry):
- [ ] Analyze conversation context
- [ ] Generate relevant suggestions
- [ ] Send SSE event with type `suggestions`
- [ ] Include proper data structure
- [ ] Test with different contexts

Frontend (Daryl):
- [x] CSS styling implemented
- [x] JavaScript functions created
- [x] SSE event handler added
- [x] Icon mapping configured
- [x] Priority system working
- [x] Mobile responsive
- [x] Documentation complete

Testing:
- [ ] Browser console test
- [ ] Backend integration test
- [ ] Edge cases verified
- [ ] Mobile tested
- [ ] Accessibility checked

---

## Support

Questions? Check:
1. `TESTING-SUGGESTIONS.md` for testing help
2. `CONTEXTUAL-SUGGESTIONS-VISUAL-GUIDE.md` for design specs
3. `CONTEXTUAL-SUGGESTIONS-IMPLEMENTATION.md` for technical details

**Status**: Frontend implementation complete, ready for backend integration
