# Contextual Suggestions Feature - Backend Implementation

## Overview

The Contextual Suggestions feature analyzes user queries and Cortex responses to automatically generate relevant follow-up actions and insights. This helps users discover related checks and optimizations they might not have considered.

## Architecture

### Components

1. **ContextAnalyzer Service** (`src/services/context-analyzer.ts`)
   - Pattern detection engine
   - Suggestion generation logic
   - Insight correlation

2. **Chat Route Integration** (`src/routes/chat-simple.ts`)
   - SSE event streaming
   - Suggestion emission after content completion

### Data Flow

```
User Query → Cortex Response → Context Analyzer → Suggestions SSE Event → Frontend
```

## API

### ContextualSuggestion Interface

```typescript
interface ContextualSuggestion {
  type: 'action' | 'insight' | 'question' | 'related_check';
  title: string;
  description: string;
  actions: Array<{
    label: string;
    prompt: string;
    priority?: 'high' | 'medium' | 'low';
  }>;
}
```

### SSE Event Format

```json
{
  "type": "suggestions",
  "suggestions": [
    {
      "type": "related_check",
      "title": "Network Performance Analysis",
      "description": "Deep dive into network health...",
      "actions": [
        {
          "label": "Run speed test across APs",
          "prompt": "Run a speed test on all UniFi access points...",
          "priority": "high"
        }
      ]
    }
  ]
}
```

## Pattern Detection

### 1. Network/UniFi Queries
**Triggers:** `unifi`, `network`, `wifi`, `ap`, `access point`, `ubiquiti`

**Suggestions:**
- Run speed test across APs (high priority)
- Check firmware status (medium)
- Analyze bandwidth usage (medium)
- Optimize channel allocation (low)

### 2. Kubernetes/Cluster Queries
**Triggers:** `k3s`, `kubernetes`, `cluster`, `pods`, `nodes`, `deployments`

**Suggestions:**
- Run resource audit (high priority)
- Review recent events (high)
- Security scan (medium)
- Optimize resources (low)

### 3. Security/Sandfly Queries
**Triggers:** `sandfly`, `security`, `alert`, `vulnerability`, `threat`

**Suggestions:**
- Triage active alerts (high priority)
- Compare against baseline (medium)
- Cross-reference threats (medium)
- Generate compliance report (low)

### 4. Proxmox/Infrastructure Queries
**Triggers:** `proxmox`, `vm`, `virtual machine`, `container`, `lxc`, `host`

**Suggestions:**
- Check K3s node health (high priority)
- Test network connectivity (medium)
- Review resource allocation (medium)
- Check backup status (low)

### 5. Performance Queries
**Triggers:** `performance`, `slow`, `latency`, `cpu`, `memory`, `bottleneck`

**Suggestions:**
- Profile resource usage (high priority)
- Analyze pod metrics (medium)
- Review storage performance (medium)

### 6. Error/Issue Queries
**Triggers:** `error`, `fail`, `crash`, `down`, `broken`, `problem`

**Suggestions:**
- Check recent logs (high priority)
- Verify dependencies (high)
- Compare with working state (medium)

### 7. Monitoring Queries
**Triggers:** `monitoring`, `metrics`, `prometheus`, `grafana`, `dashboard`

**Suggestions:**
- Show key metrics (medium priority)
- Analyze trends (medium)
- Create custom dashboard (low)

## Implementation Details

### Pattern Matching

The analyzer uses case-insensitive regex patterns to detect query types:

```typescript
const combined = userQuery.toLowerCase() + ' ' + cortexResponse.toLowerCase();

if (/unifi|network|wifi/i.test(combined)) {
  // Generate network suggestions
}
```

### Priority Levels

- **High Priority**: Immediate actions that address critical needs
- **Medium Priority**: Important follow-ups for comprehensive analysis
- **Low Priority**: Nice-to-have optimizations and long-term improvements

### Multiple Pattern Matching

Queries can match multiple patterns, generating suggestions from different operational areas:

```typescript
// Query: "Check k3s cluster and UniFi network"
// Result: 2 suggestion groups (cluster + network)
```

## Integration Points

### Backend (Chat Route)

Location: `src/routes/chat-simple.ts` (lines 191-204)

```typescript
// After content_block_stop event
const suggestions = contextAnalyzer.analyzeSuggestions(message, enhancedAnswer);

if (suggestions.length > 0) {
  await stream.writeSSE({
    data: JSON.stringify({
      type: 'suggestions',
      suggestions: suggestions
    }),
    event: 'suggestions'
  });
}
```

### Frontend Integration

The frontend should:
1. Listen for `suggestions` SSE events
2. Render suggestion cards with actions
3. Allow users to click actions to submit prompts
4. Handle multiple suggestion groups appropriately

## Testing

### Manual Test

```bash
cd /Users/ryandahlberg/Projects/cortex/k3s-deployments/cortex-chat/backend-simple
bun run src/services/context-analyzer.test.ts
```

### Example Outputs

**Network Query:**
```json
{
  "type": "related_check",
  "title": "Network Performance Analysis",
  "actions": [
    {
      "label": "Run speed test across APs",
      "prompt": "Run a speed test on all UniFi...",
      "priority": "high"
    }
  ]
}
```

**Cluster Query:**
```json
{
  "type": "action",
  "title": "Cluster Health & Optimization",
  "actions": [
    {
      "label": "Run resource audit",
      "prompt": "Audit cluster resource usage...",
      "priority": "high"
    }
  ]
}
```

## Performance Considerations

- Pattern matching is performed in-memory (fast)
- Suggestions only generated when patterns match
- Empty array returned for non-matching queries
- No external API calls or heavy computation

## Future Enhancements

1. **Machine Learning Integration**
   - Learn from user interactions with suggestions
   - Prioritize frequently used actions

2. **Context History**
   - Consider conversation history for better suggestions
   - Avoid suggesting already-executed actions

3. **Custom Patterns**
   - Allow users to define custom suggestion patterns
   - Organization-specific workflows

4. **Suggestion Analytics**
   - Track which suggestions are most useful
   - Optimize pattern detection based on usage

## File Locations

- **Service Implementation**: `/Users/ryandahlberg/Projects/cortex/k3s-deployments/cortex-chat/backend-simple/src/services/context-analyzer.ts`
- **Chat Route Integration**: `/Users/ryandahlberg/Projects/cortex/k3s-deployments/cortex-chat/backend-simple/src/routes/chat-simple.ts`
- **Test File**: `/Users/ryandahlberg/Projects/cortex/k3s-deployments/cortex-chat/backend-simple/src/services/context-analyzer.test.ts`
- **Documentation**: `/Users/ryandahlberg/Projects/cortex/k3s-deployments/cortex-chat/backend-simple/CONTEXTUAL_SUGGESTIONS.md`

## Support

For questions or issues:
- Check frontend integration (handled by Daryl)
- Review SSE event stream logs
- Verify pattern matching with test file
