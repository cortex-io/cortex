# Testing Contextual Suggestions Feature

## Quick Test Guide

### 1. Manual Testing with Browser Console

Open browser console and inject a test suggestion event:

```javascript
// Simulate a suggestions SSE event
const testSuggestion = {
  type: 'suggestions',
  suggestions: [
    {
      type: 'action',
      title: 'Test Suggestion',
      description: 'This is a test suggestion to verify the UI works correctly.',
      actions: [
        {
          label: 'High Priority Action',
          prompt: 'Execute this high priority test action',
          priority: 'high'
        },
        {
          label: 'Medium Priority Action',
          prompt: 'Execute this medium priority test action',
          priority: 'medium'
        },
        {
          label: 'Low Priority Action',
          prompt: 'Execute this low priority test action',
          priority: 'low'
        }
      ]
    },
    {
      type: 'insight',
      title: 'Performance Insight',
      description: 'Your cluster is running efficiently with low resource usage.',
      actions: [
        {
          label: 'View Metrics',
          prompt: 'Show me detailed performance metrics',
          priority: 'medium'
        }
      ]
    }
  ]
};

// Get the message container
const messagesContainer = document.getElementById('messagesContainer');

// Create a test message div
const testMessageDiv = document.createElement('div');
testMessageDiv.className = 'message assistant';
const bubble = document.createElement('div');
bubble.className = 'message-bubble';
bubble.textContent = 'Test assistant message';
testMessageDiv.appendChild(bubble);
messagesContainer.appendChild(testMessageDiv);

// Render suggestions
renderSuggestions(testSuggestion.suggestions, testMessageDiv);
```

### 2. Backend Integration Test

Larry should send this SSE event after analyzing context:

```javascript
// In backend SSE stream
const suggestions = {
  type: 'suggestions',
  suggestions: [
    {
      type: 'related_check',
      title: 'Related Health Checks',
      description: 'You checked pod status. These related checks might be useful:',
      actions: [
        {
          label: 'Check Node Status',
          prompt: 'Check the status of all nodes in the cluster',
          priority: 'high'
        },
        {
          label: 'Review Events',
          prompt: 'Show recent cluster events',
          priority: 'medium'
        }
      ]
    }
  ]
};

res.write(`data: ${JSON.stringify(suggestions)}\n\n`);
```

### 3. Test Scenarios

#### Scenario A: After Health Check
**User Query**: "Check pod status"

**Expected Backend Response**:
```json
{
  "type": "suggestions",
  "suggestions": [{
    "type": "related_check",
    "title": "Related Health Checks",
    "description": "You might also want to check:",
    "actions": [
      {"label": "Check Nodes", "prompt": "Check node status", "priority": "high"},
      {"label": "View Events", "prompt": "Show cluster events", "priority": "medium"},
      {"label": "Resource Usage", "prompt": "Check resource usage", "priority": "medium"}
    ]
  }]
}
```

**Visual Verification**:
- Blue suggestion card appears below assistant message
- Title shows with 🔗 icon
- Three buttons display with correct priority styling
- Clicking a button populates input and sends message

---

#### Scenario B: After Finding Issue
**User Query**: "Are there any issues?"

**Expected Backend Response**:
```json
{
  "type": "suggestions",
  "suggestions": [{
    "type": "action",
    "title": "Investigation Steps",
    "description": "Found 1 pod with high restart count. Recommended actions:",
    "actions": [
      {"label": "View Pod Logs", "prompt": "Show logs for pod nginx-xyz", "priority": "high"},
      {"label": "Describe Pod", "prompt": "Describe pod nginx-xyz", "priority": "high"},
      {"label": "Check Events", "prompt": "Get events for nginx-xyz", "priority": "medium"}
    ]
  }]
}
```

**Visual Verification**:
- Suggestion card appears with 💡 icon
- High priority buttons have blue accent styling
- All buttons are clickable

---

#### Scenario C: Multiple Suggestions
**User Query**: "Check cluster health"

**Expected Backend Response**:
```json
{
  "type": "suggestions",
  "suggestions": [
    {
      "type": "insight",
      "title": "Resource Usage",
      "description": "CPU usage is at 45%, memory at 60%. Normal operating range.",
      "actions": [
        {"label": "Optimize Resources", "prompt": "Help optimize resource usage", "priority": "low"}
      ]
    },
    {
      "type": "question",
      "title": "Security Check",
      "description": "Last security audit was 7 days ago. Want to run another?",
      "actions": [
        {"label": "Run Security Audit", "prompt": "Run a security audit", "priority": "medium"}
      ]
    }
  ]
}
```

**Visual Verification**:
- Two suggestion cards stack vertically
- Each has appropriate icon (📊 and 🔍)
- Different priority levels are visible
- Page scrolls to show all cards

---

### 4. Edge Cases

#### Empty Suggestions
```javascript
{
  "type": "suggestions",
  "suggestions": []
}
```
**Expected**: Nothing renders, no errors

#### Missing Actions
```javascript
{
  "type": "suggestions",
  "suggestions": [{
    "type": "action",
    "title": "No Actions",
    "description": "This suggestion has no actions"
  }]
}
```
**Expected**: Card renders without action buttons

#### Special Characters in Prompts
```javascript
{
  "type": "suggestions",
  "suggestions": [{
    "type": "action",
    "title": "Test Special Chars",
    "description": "Testing escaping",
    "actions": [{
      "label": "Test",
      "prompt": "Check pod 'nginx' in namespace \"default\"",
      "priority": "medium"
    }]
  }]
}
```
**Expected**: Special characters properly escaped, button works correctly

#### Long Text
```javascript
{
  "type": "suggestions",
  "suggestions": [{
    "type": "action",
    "title": "This is a very long title that should wrap or truncate appropriately",
    "description": "This is a very long description that should wrap to multiple lines and maintain good readability even with a lot of text content that goes on and on.",
    "actions": [
      {"label": "Very Long Button Label That Might Wrap", "prompt": "...", "priority": "medium"}
    ]
  }]
}
```
**Expected**: Text wraps gracefully, card remains readable

---

### 5. UI/UX Verification Checklist

- [ ] Suggestion cards appear below assistant messages
- [ ] Blue theme distinguishable from red fix-suggestion cards
- [ ] Icons display correctly for all types
- [ ] Title is bold and blue-colored
- [ ] Description is readable with good line height
- [ ] Action buttons have proper spacing (6px gap)
- [ ] High priority buttons have blue accent
- [ ] Low priority buttons have reduced opacity
- [ ] Hover states work on all buttons
- [ ] Clicking button populates message input
- [ ] Message sends automatically after button click
- [ ] Multiple cards stack vertically with spacing
- [ ] Page scrolls to show new suggestions
- [ ] Mobile responsive (buttons wrap on small screens)

---

### 6. Browser Console Tests

#### Test Icon Mapping
```javascript
const iconMap = {
  'action': '💡',
  'insight': '📊',
  'question': '🔍',
  'related_check': '🔗'
};

// Verify all icons render correctly
Object.entries(iconMap).forEach(([type, icon]) => {
  console.log(`${type}: ${icon}`);
});
```

#### Test executeSuggestion Function
```javascript
// Should populate input and send
window.executeSuggestion('Test prompt from suggestion');

// Verify:
// 1. messageInput.value === 'Test prompt from suggestion'
// 2. Message sends to backend
// 3. Input clears after send
```

#### Test Priority Styling
```javascript
// Create test buttons with different priorities
['high', 'medium', 'low'].forEach(priority => {
  const btn = document.createElement('button');
  btn.className = 'suggestion-action-btn';
  if (priority === 'high') btn.classList.add('priority-high');
  if (priority === 'low') btn.classList.add('priority-low');
  btn.textContent = `${priority} priority`;
  document.body.appendChild(btn);
});

// Verify:
// high: blue accent, darker background
// medium: default styling
// low: 70% opacity
```

---

### 7. Integration Test with Backend

Complete end-to-end test:

1. **Setup**: Ensure backend context analyzer is running
2. **Action**: Send message "Check pod status in default namespace"
3. **Verify**:
   - Assistant responds with pod information
   - Contextual suggestions appear below response
   - Suggestions are relevant to pod check context
4. **Action**: Click a suggestion button
5. **Verify**:
   - Input populates with suggestion prompt
   - Message sends automatically
   - New response appears
   - New suggestions appear (if applicable)

---

### 8. Performance Testing

#### Memory Leak Check
```javascript
// Send 10 messages with suggestions
for (let i = 0; i < 10; i++) {
  // Trigger message with suggestions
  // Wait for response
}

// Open Chrome DevTools > Memory
// Take heap snapshot
// Verify no detached DOM nodes from suggestion cards
```

#### Render Performance
```javascript
// Test rendering many suggestions
const manySuggestions = Array(10).fill({
  type: 'action',
  title: 'Test Suggestion',
  description: 'Performance test',
  actions: [
    {label: 'Action 1', prompt: 'test', priority: 'medium'},
    {label: 'Action 2', prompt: 'test', priority: 'medium'},
    {label: 'Action 3', prompt: 'test', priority: 'medium'}
  ]
});

console.time('renderSuggestions');
renderSuggestions(manySuggestions, messageDiv);
console.timeEnd('renderSuggestions');

// Should complete in < 50ms
```

---

### 9. Cross-Browser Testing

Test in:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)

Verify:
- CSS renders correctly
- Icons display properly
- Buttons are clickable
- Hover states work
- Text is readable

---

### 10. Accessibility Testing

#### Keyboard Navigation
```
1. Tab to first suggestion button
2. Press Tab to move to next button
3. Press Enter to activate button
4. Verify message sends
```

#### Screen Reader Testing
```
1. Enable screen reader (VoiceOver/NVDA)
2. Navigate to suggestion card
3. Verify:
   - Card structure is announced
   - Title is read
   - Description is read
   - Buttons are identified as interactive
   - Button labels are descriptive
```

---

## Test Results Template

```markdown
## Test Results - [Date]

### Environment
- Browser: Chrome 120
- OS: macOS 14
- Backend: Running
- Frontend: Production build

### Scenario Tests
- [x] After Health Check - PASS
- [x] After Finding Issue - PASS
- [x] Multiple Suggestions - PASS

### Edge Cases
- [x] Empty suggestions - PASS
- [x] Missing actions - PASS
- [x] Special characters - PASS
- [x] Long text - PASS

### UI/UX Verification
- [x] All styling correct
- [x] Icons display
- [x] Buttons functional
- [x] Mobile responsive

### Issues Found
- None

### Notes
- All tests passing
- Ready for production
```
