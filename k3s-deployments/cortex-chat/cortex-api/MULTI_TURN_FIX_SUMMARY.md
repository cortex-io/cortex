# Multi-Turn Tool Use Fix - DEPLOYED

## Problem
The `processUserQuery` function in `server.js` was not handling multi-turn tool use correctly. When Claude's response had `stop_reason='tool_use'`, it meant Claude wanted to use MORE tools to process the previous tool results, but the code only executed tools once and then tried to extract a text response that didn't exist, returning "No response from Claude".

## Solution
Implemented a multi-turn tool execution loop that:
1. Maintains full conversation history across tool calls
2. Continues executing tools while `stop_reason === 'tool_use'`
3. Only stops when `stop_reason === 'end_turn'` or `'stop_sequence'`
4. Includes safety limit of MAX_ITERATIONS = 5 to prevent infinite loops
5. Tracks all tools used across all iterations
6. Includes iteration count in response for debugging

## Changes Made
**File**: `/Users/ryandahlberg/Projects/cortex/k3s-deployments/cortex-chat/cortex-api/server.js`
**Lines**: 1372-1453

### Key Implementation Details
```javascript
// Multi-turn tool use loop
while (toolUses.length > 0 && iteration < MAX_ITERATIONS) {
  iteration++;
  console.log(`[Cortex] Iteration ${iteration}: Executing ${toolUses.length} tool(s)`);

  // Execute tools
  // Add results to conversation
  // Get next Claude response
  // Check if more tools needed
}
```

## Deployment Process
1. Created ConfigMap with updated `server.js` and `self-heal-worker.sh`
2. Used Kaniko to build container image in-cluster
3. Pushed to internal registry: `10.43.170.72:5000/cortex-api:latest`
4. Rolled out deployment: `kubectl rollout restart deployment/cortex-orchestrator -n cortex`

## Verification
**Test Query**: "how many alerts do i have in sandfly?"

**Expected Behavior**:
- Turn 1: Claude uses `sandfly_query` tool
- Turn 2: Claude processes results and returns text answer

**Actual Result**:
```
[Cortex] Processing query: how many alerts do i have in sandfly?
[Cortex] Claude response - stop_reason: tool_use
[Cortex] Iteration 1: Executing 1 tool(s)
[Cortex] Executing tool: sandfly_query {"query":"security alerts"}
[Cortex] Sandfly query via MCP: "security alerts" -> sandfly_get_results { filter: {}, page: 1, size: 100, summary: false }
[Cortex] Iteration 1 response - stop_reason: end_turn
```

**User Response**: "You have **101 alerts** in Sandfly."

## Status
✅ **FIXED AND DEPLOYED**

- Build: Success (sha256:55adc72e04f58bcac56e7ca439a195e5bac150f57d7dd0f189e60eab708b5356)
- Deployment: Success (cortex-orchestrator-5c46d4df6-5vfhv)
- Testing: Success (user receives actual alert count)
- Date: 2025-12-26

## Image Tags
- `10.43.170.72:5000/cortex-api:latest` - Current production
- `10.43.170.72:5000/cortex-api:multi-turn-fix` - Tagged for reference

## Architecture Notes
This fix is ONLY in the Cortex orchestrator (`cortex-api/server.js`). The chat backend remains a simple pass-through. Cortex handles all multi-turn complexity:

```
Chat UI → Chat Backend → Cortex Orchestrator (multi-turn loop) → MCP Servers
                              ↓
                          Claude API (multiple turns with tools)
```

## Future Improvements
- Add metrics for iteration counts
- Track average iterations per query type
- Alert if MAX_ITERATIONS is frequently hit
- Consider dynamic iteration limits based on query complexity

## Files Modified
1. `/Users/ryandahlberg/Projects/cortex/k3s-deployments/cortex-chat/cortex-api/server.js` (Lines 1372-1453)

## Build Artifacts
- Build script: `/Users/ryandahlberg/Projects/cortex/k3s-deployments/cortex-chat/cortex-api/build-and-deploy.sh`
- Build job: `/Users/ryandahlberg/Projects/cortex/k3s-deployments/cortex-chat/cortex-api/build-job.yaml`
