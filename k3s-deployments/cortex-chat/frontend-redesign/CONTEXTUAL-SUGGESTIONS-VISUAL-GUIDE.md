# Contextual Suggestions - Visual Design Guide

## UI Layout

```
┌─────────────────────────────────────────────────────────┐
│ Assistant Message                                       │
│                                                         │
│ I've checked the pod status. All pods are running      │
│ normally in the default namespace.                     │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ 💡 Next Steps                                           │
│ ─────────────────────────────────────────────────────  │
│ You might want to check related resources:             │
│                                                         │
│ [ Check Nodes ]  [ View Events ]  [ Resource Usage ]   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ 📊 Cluster Insights                                     │
│ ─────────────────────────────────────────────────────  │
│ 3 pods are using less than 20% of allocated memory.   │
│                                                         │
│ [ Optimize Resources ]                                  │
└─────────────────────────────────────────────────────────┘
```

## Color Scheme

### Suggestion Cards
- **Background**: `rgba(91, 143, 217, 0.05)` - Very light blue
- **Border**: `rgba(91, 143, 217, 0.15)` - Subtle blue border
- **Title Color**: `var(--accent-blue)` - Blue accent (#5b8fd9)

### Action Buttons

#### Default (Medium Priority)
```css
background: var(--bg-secondary)         /* Dark gray */
border: 1px solid rgba(91, 143, 217, 0.3)
color: var(--text-primary)              /* Light text */
```

#### High Priority
```css
background: rgba(91, 143, 217, 0.1)     /* Light blue tint */
border-color: var(--accent-blue)        /* Blue border */
color: var(--accent-blue)               /* Blue text */
```

#### Low Priority
```css
opacity: 0.7                            /* 70% opacity */
border-color: rgba(91, 143, 217, 0.2)   /* Lighter border */
```

## Icon Mapping

| Type | Icon | Description |
|------|------|-------------|
| `action` | 💡 | Actionable next steps |
| `insight` | 📊 | Data-driven insights |
| `question` | 🔍 | Investigative questions |
| `related_check` | 🔗 | Related health checks |

## Typography

```
Suggestion Title:
  - Font Size: 13px
  - Font Weight: 600 (semi-bold)
  - Color: Blue accent

Suggestion Description:
  - Font Size: 12px
  - Line Height: 1.4
  - Color: Secondary text (muted)

Action Buttons:
  - Font Size: 12px
  - Font Weight: 500 (medium)
  - Padding: 6px 12px
```

## Spacing & Layout

```
Suggestion Card:
  ├── Padding: 12px
  ├── Margin Top: 12px
  ├── Border Radius: 8px
  │
  ├── Header (flex)
  │   ├── Icon (16px)
  │   ├── Gap: 8px
  │   └── Title
  │
  ├── Margin Bottom: 8px
  │
  ├── Description
  │   └── Margin Bottom: 10px
  │
  └── Actions (flex-wrap)
      └── Gap: 6px between buttons
```

## Interactive States

### Button Hover States

```css
Default Button:hover {
  background: rgba(91, 143, 217, 0.15)
  border-color: rgba(91, 143, 217, 0.5)
}

High Priority Button:hover {
  background: rgba(91, 143, 217, 0.2)
}

Low Priority Button:hover {
  opacity: 1  /* Full opacity on hover */
}
```

## Example Scenarios

### 1. After Health Check
```html
┌─────────────────────────────────────────────┐
│ 🔗 Related Health Checks                    │
│ ─────────────────────────────────────────  │
│ You checked pod status. These related      │
│ checks might be useful:                    │
│                                             │
│ [ Check Nodes ]  [ Review Events ]         │
│ [ Check Resource Usage ]                    │
└─────────────────────────────────────────────┘
```

### 2. After Finding Issue
```html
┌─────────────────────────────────────────────┐
│ 💡 Investigation Actions                    │
│ ─────────────────────────────────────────  │
│ Pod crash detected. Next steps:            │
│                                             │
│ [ View Pod Logs ]  [ Check Events ]        │
│ [ Describe Pod ]                            │
└─────────────────────────────────────────────┘
```

### 3. Resource Optimization
```html
┌─────────────────────────────────────────────┐
│ 📊 Resource Optimization                    │
│ ─────────────────────────────────────────  │
│ Several pods are underutilized:            │
│                                             │
│ [ Optimize Requests ]                       │
└─────────────────────────────────────────────┘
```

### 4. Security Alert
```html
┌─────────────────────────────────────────────┐
│ 🔍 Security Recommendations                 │
│ ─────────────────────────────────────────  │
│ Found pods running as root:                │
│                                             │
│ [ Review Security Context ]                 │
│ [ Check Network Policies ]                  │
└─────────────────────────────────────────────┘
```

## Multiple Suggestions Stack

```
┌─────────────────────────────────────────────┐
│ Assistant: Cluster health looks good       │
└─────────────────────────────────────────────┘
      ↓
┌─────────────────────────────────────────────┐
│ 💡 Suggested Next Steps                     │
│ Consider these proactive checks:           │
│ [ Check for Updates ]  [ Review Logs ]     │
└─────────────────────────────────────────────┘
      ↓
┌─────────────────────────────────────────────┐
│ 📊 Performance Insights                     │
│ API response times have increased 15%      │
│ [ Investigate Latency ]                     │
└─────────────────────────────────────────────┘
      ↓
┌─────────────────────────────────────────────┐
│ 🔗 Related Checks                           │
│ You might also want to:                    │
│ [ Check Database ]  [ Review Metrics ]     │
└─────────────────────────────────────────────┘
```

## Mobile Responsiveness

On mobile devices (< 768px):
- Buttons wrap to multiple rows if needed
- Card maintains 12px padding
- Text remains readable
- Touch targets are sufficient (min 44x44px)

```
┌───────────────────────┐
│ 💡 Next Steps         │
│ ─────────────────────│
│ Check these:         │
│                      │
│ [ Check Nodes ]      │
│ [ View Events ]      │
│ [ Resource Usage ]   │
└───────────────────────┘
```

## Accessibility

### Color Contrast
- Title (blue on dark): WCAG AA compliant
- Description (muted on dark): WCAG AA compliant
- Buttons: Clear borders and backgrounds

### Keyboard Navigation
- All buttons are focusable
- Tab order follows visual order
- Enter key activates buttons

### Screen Reader Support
- Icons are decorative (aria-hidden possible)
- Button labels are descriptive
- Card structure is semantic

## Design Comparison

### vs. Fix Suggestion Cards

```
Fix Suggestion (Red theme):
┌─────────────────────────────────┐
│ ⚠ Issue detected: kubectl      │
│ Background: rgba(217, 105, 95, 0.08)
│ Border: rgba(217, 105, 95, 0.25)
│ [ Fix it ]  (Orange button)
└─────────────────────────────────┘

Contextual Suggestion (Blue theme):
┌─────────────────────────────────┐
│ 💡 Next Steps                   │
│ Background: rgba(91, 143, 217, 0.05)
│ Border: rgba(91, 143, 217, 0.15)
│ [ Check Nodes ]  (Blue button)
└─────────────────────────────────┘
```

### Visual Hierarchy
1. Fix suggestions (red) - Higher urgency
2. Contextual suggestions (blue) - Helpful, not urgent
3. Both appear after assistant messages
4. Multiple cards stack vertically

## Animation & Transitions

```css
All transitions: 0.2s ease

Button hover:
  - Background color fades in
  - Border color strengthens
  - Opacity increases (for low priority)

Card appearance:
  - Instantly appears (no fade)
  - Scrolls into view smoothly
```

## Best Practices

### Do's
- Keep titles concise (< 50 chars)
- Make descriptions actionable
- Limit to 3-5 action buttons per card
- Use appropriate icons for context
- Order suggestions by relevance

### Don'ts
- Don't use too many high-priority buttons
- Don't make descriptions too long
- Don't stack more than 3-4 suggestion cards
- Don't use suggestions for critical errors (use fix-suggestion)
- Don't repeat suggestions for the same context

## Integration Example

Backend sends:
```json
{
  "type": "suggestions",
  "suggestions": [{
    "type": "action",
    "title": "Next Steps",
    "description": "Consider these proactive checks:",
    "actions": [
      {"label": "Check Nodes", "prompt": "...", "priority": "high"},
      {"label": "View Events", "prompt": "...", "priority": "medium"}
    ]
  }]
}
```

Frontend renders:
```
┌─────────────────────────────────────────────┐
│ 💡 Next Steps                                │
│ ─────────────────────────────────────────  │
│ Consider these proactive checks:            │
│                                             │
│ [ Check Nodes ]  [ View Events ]           │
│   (blue accent)    (default)                │
└─────────────────────────────────────────────┘
```
