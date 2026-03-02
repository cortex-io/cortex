# Visual Guide: Mobile-First UI and Conversation Categories

## Mobile-First Card Layout

### BEFORE (Side-by-side layout issue):
```
┌─────────────────────────────────────┐
│ Response text here...               │
├──────────────┬──────────────────────┤
│ Card 1       │ Card 2               │  ← PROBLEM: Cards side-by-side
│              │                      │
└──────────────┴──────────────────────┘
```

### AFTER (Vertical stacking):
```
┌─────────────────────────────────────┐
│ Response text here...               │
├─────────────────────────────────────┤
│ Card 1                              │  ✓ Vertical stack
├─────────────────────────────────────┤
│ Card 2                              │  ✓ Vertical stack
├─────────────────────────────────────┤
│ Card 3                              │  ✓ 100% width
└─────────────────────────────────────┘
```

## Conversation Categories Sidebar

### New Sidebar Structure:
```
┌─────────────────────────────┐
│   CORTEX                    │
├─────────────────────────────┤
│  + New chat                 │
├─────────────────────────────┤
│                             │
│  SUGGESTIONS                │
│  • Check cluster health     │
│  • Fix any issues           │
│                             │
├─────────────────────────────┤
│  ACTIVE CHATS         ▼     │  ← Expanded by default
├─────────────────────────────┤
│  Chat 1                   × │
│  Chat 2                   × │
│  Chat 3                   × │
├─────────────────────────────┤
│  IN PROGRESS          ▶ [5] │  ← Collapsed, badge shown
├─────────────────────────────┤
│  COMPLETED            ▶ [12]│  ← Collapsed, badge shown
├─────────────────────────────┤
│  [Logout]                   │
└─────────────────────────────┘
```

### Expanded View (all sections):
```
┌─────────────────────────────┐
│  ACTIVE CHATS         ▼     │
├─────────────────────────────┤
│  Current chat             × │
│  2m ago                     │
├─────────────────────────────┤
│  IN PROGRESS          ▼ [5] │
├─────────────────────────────┤
│  Cluster health check     × │
│  15m ago                    │
├─────────────────────────────┤
│  Security scan            × │
│  1h ago                     │
├─────────────────────────────┤
│  COMPLETED            ▼ [12]│
├─────────────────────────────┤
│  Fixed pod crash          × │
│  2h ago                     │
├─────────────────────────────┤
│  Updated deployment       × │
│  3h ago                     │
└─────────────────────────────┘
```

## Badge Behavior

### When count > 0:
```
IN PROGRESS          ▼ [5]
                        ↑
                     Badge visible
```

### When count = 0:
```
IN PROGRESS          ▼
                      ↑
                   Badge hidden
```

## Responsive Behavior

### Mobile (< 768px):
- All cards: 100% width
- Vertical stacking enforced with `!important`
- Fix suggestions: Column layout (icon, content, button stacked)

### Desktop (≥ 769px):
- Cards: Still 100% width (no side-by-side)
- Fix suggestions: Row layout (icon | content | button)
- Better use of horizontal space for buttons

## Color Scheme (Claude.ai Dark Theme)

```
Active section header:   #757575 (text-tertiary)
Badge background:        rgba(91, 143, 217, 0.3)
Badge text:              #e3e3e3 (text-primary)
Section hover:           rgba(255, 255, 255, 0.03)
Border:                  rgba(255, 255, 255, 0.06)
```

## Interaction States

### Section Header Hover:
```css
background: rgba(255, 255, 255, 0.03);
cursor: pointer;
```

### Collapsed Section:
```css
display: none;
```

### Transition:
```css
transition: all 0.2s ease-in-out;
```

## Testing Checklist

- [ ] Cards stack vertically on mobile
- [ ] Cards stack vertically on desktop
- [ ] No horizontal scrolling on small screens
- [ ] All cards are 100% width
- [ ] Active section expanded by default
- [ ] Other sections collapsed by default
- [ ] Click header to toggle section
- [ ] Badges show correct counts
- [ ] Badges hide when count is 0
- [ ] Smooth expand/collapse animation
- [ ] Conversation selection works
- [ ] Delete conversation works
- [ ] Mobile hamburger menu works
- [ ] Sidebar scrolls correctly
