# Sandfly Integration - Quick Start Guide

**Mission**: Integrate Sandfly MCP Server + Fix Conversational Context
**Status**: Ready for Execution
**Created**: 2025-12-25

---

## TL;DR - What Got Done

Larry (Coordinator Master) has completed the planning and coordination phase:

1. Analyzed chat backend architecture and Sandfly MCP server
2. Created 4 comprehensive handoff documents for Development Master
3. Updated coordination state and routing decisions
4. Documented complete mission plan with technical specifications

**Next Step**: Development Master picks up handoffs and spawns Daryl agents

---

## Quick Access Links

### Mission Documents
- **Master Plan**: `/Users/ryandahlberg/Projects/cortex/coordination/masters/coordinator/SANDFLY_INTEGRATION_MISSION.md`
- **Summary**: `/Users/ryandahlberg/Projects/cortex/coordination/masters/coordinator/MISSION_SUMMARY.md`
- **This File**: `/Users/ryandahlberg/Projects/cortex/SANDFLY_INTEGRATION_QUICK_START.md`

### Handoff Documents
```
/Users/ryandahlberg/Projects/cortex/coordination/masters/coordinator/handoffs/
├── task-sandfly-integration-001.json    (Sandfly MCP Deployment)
├── task-sandfly-integration-002.json    (Tool Integration)
├── task-context-persistence-003.json    (Context Persistence Fix)
└── task-deep-conversation-testing-004.json  (Deep Testing)
```

### Source Files
- **Sandfly MCP**: `/Users/ryandahlberg/Desktop/sandfly/`
- **Chat Backend**: `/tmp/cortex-chat/backend/`

---

## The 4 Phases

### Phase 1: Deploy Sandfly MCP to Kubernetes
**Time**: 2-4 hours | **Priority**: CRITICAL

Deploy the Sandfly MCP server to make 45+ security tools available:
- Deploy to cortex-system namespace
- Configure connection to 10.88.140.176
- Expose as K8s service

**Handoff**: `task-sandfly-integration-001.json`

---

### Phase 2: Integrate 45+ Sandfly Tools
**Time**: 3-5 hours | **Priority**: CRITICAL | **Depends**: Phase 1

Add all Sandfly tools to chat backend:
- Extract tools from Python server
- Convert to TypeScript
- Update routing logic

**Handoff**: `task-sandfly-integration-002.json`

**Tool Categories**:
- Host Management (11 tools)
- Security Scanning (2 tools)
- Results & Alerts (4 tools)
- Detection Rules (4 tools)
- Schedules (7 tools)
- Credentials (3 tools)
- Jump Hosts (3 tools)
- Notifications (3 tools)
- Reports (2 tools)
- System (3 tools)
- Audit (1 tool)

---

### Phase 3: Fix Context Dropping
**Time**: 4-6 hours | **Priority**: CRITICAL

Fix the conversation context issue:
- Deploy Redis for session storage
- Implement conversation persistence
- Add auto-summarization (15+ messages)
- Test deep conversations (20+ messages)

**Handoff**: `task-context-persistence-003.json`

**Why Context Drops**: The chat backend currently expects clients to send full conversation history with each request. Without server-side persistence, history gets lost.

**Solution**: Redis-based session storage with automatic summarization for long conversations.

---

### Phase 4: Deep Conversation Testing
**Time**: 4-8 hours | **Priority**: HIGH | **Depends**: All previous

Test "anything and everything" available through each vendor API:
- Sandfly: 20+ message security investigation
- Proxmox: 20+ message infrastructure management
- UniFi: 20+ message network operations
- Wazuh: 20+ message security monitoring

**Handoff**: `task-deep-conversation-testing-004.json`

Each test proves:
- Context is maintained
- All API capabilities accessible
- Multi-turn conversations work
- Tool execution is reliable

---

## Execution Instructions

### For Development Master

1. **Pick up handoffs**:
   ```bash
   ls -la /Users/ryandahlberg/Projects/cortex/coordination/masters/coordinator/handoffs/
   ```

2. **Read handoff documents** (they contain complete specs)

3. **Spawn Daryl agents** with `GOVERNANCE_BYPASS=true`:
   ```bash
   # Example spawn command
   GOVERNANCE_BYPASS=true ./scripts/spawn-daryl.sh task-sandfly-integration-001.json
   ```

4. **Execute in order**:
   - Phase 1 & 3 can run in parallel
   - Phase 2 depends on Phase 1
   - Phase 4 depends on all previous

5. **Report results** via coordination files

---

## Key Technical Details

### Sandfly MCP Server
- **Source**: `/Users/ryandahlberg/Desktop/sandfly/src/mcp_sandfly/server.py`
- **Tools**: 45+ fully implemented (lines 144-846)
- **Sandfly Server**: 10.88.140.176
- **Protocol**: MCP (Model Context Protocol)

### Chat Backend Architecture
```
Express/TypeScript Backend
├── Tool Definitions (tools/index.ts)
├── Tool Executor (services/tool-executor.ts)  ← Routes to MCP servers
├── Claude Service (services/claude.ts)        ← Handles conversations
└── Chat Routes (routes/chat.ts)               ← API endpoints
```

**Current MCP Servers**:
- wazuh-mcp
- unifi-mcp
- proxmox-mcp
- cortex-orchestrator

**After Integration**:
- + sandfly-mcp (NEW!)
- + Redis for sessions

### Conversation Flow
```
User Message
    ↓
Chat Backend (Express)
    ↓
Claude Service (with conversation history)
    ↓
Tool Use Detected
    ↓
Tool Executor (routes to MCP server)
    ↓
MCP Server (Sandfly, Proxmox, etc.)
    ↓
Vendor API (Sandfly at 10.88.140.176)
    ↓
Results back to Claude
    ↓
Response to User
```

---

## Testing Example

Here's what a successful deep Sandfly conversation looks like:

```
1. "List all hosts" → sandfly_list_hosts
2. "Show me k3s-worker-01" → sandfly_get_host
3. "What processes are running?" → sandfly_get_host_processes
4. "Any security alerts?" → sandfly_get_results
5. "Show me the critical alert" → sandfly_get_result
6. "What detection rules are active?" → sandfly_list_sandflies
7. "Show me scheduled scans" → sandfly_list_schedules
8. "Run a scan on this host" → sandfly_start_scan
9. "What credentials are configured?" → sandfly_list_credentials
10. "Show me the audit log" → sandfly_get_audit_log
... continues to 20+ messages
```

**Key**: Each response should reference previous context (host names, IDs, etc.)

---

## Success Criteria Checklist

### Integration
- [ ] Sandfly MCP deployed to cortex-system namespace
- [ ] Pod is running and healthy
- [ ] Service accessible at `sandfly-mcp.cortex-system.svc.cluster.local:3000`
- [ ] 45+ tools integrated into chat backend
- [ ] Tools visible in `/api/tools` endpoint
- [ ] Test tool execution succeeds

### Context Persistence
- [ ] Redis deployed to cortex-system namespace
- [ ] Session IDs generated for conversations
- [ ] Conversations persist across requests
- [ ] Context maintained for 20+ messages
- [ ] Summarization triggers at 15+ messages
- [ ] Tool execution history preserved

### Deep Testing
- [ ] Sandfly 20+ message conversation completed
- [ ] Proxmox 20+ message conversation completed
- [ ] UniFi 20+ message conversation completed
- [ ] Wazuh 20+ message conversation completed
- [ ] Test report generated
- [ ] All vendor capabilities documented

---

## Timeline

**Total Estimated Time**: 13-23 hours

- Phase 1: 2-4 hours
- Phase 2: 3-5 hours
- Phase 3: 4-6 hours
- Phase 4: 4-8 hours

Phases 1 & 3 can run in parallel, so actual wall time could be shorter.

---

## Files Modified/Created

### New Files (Created by Larry)
```
/Users/ryandahlberg/Projects/cortex/
├── coordination/masters/coordinator/
│   ├── handoffs/
│   │   ├── task-sandfly-integration-001.json
│   │   ├── task-sandfly-integration-002.json
│   │   ├── task-context-persistence-003.json
│   │   └── task-deep-conversation-testing-004.json
│   ├── SANDFLY_INTEGRATION_MISSION.md
│   └── MISSION_SUMMARY.md
└── SANDFLY_INTEGRATION_QUICK_START.md (this file)
```

### Files to be Modified (by Daryl agents)
```
/tmp/cortex-chat/backend/src/
├── tools/index.ts                    (Add 45+ Sandfly tools)
├── services/tool-executor.ts         (Add Sandfly routing)
├── services/claude.ts                (Add session management)
└── routes/chat.ts                    (Add Redis integration)
```

### Files to be Created (by Daryl agents)
```
/tmp/cortex-chat/backend/src/
├── services/conversation-store.ts    (Redis session storage)
└── services/summarization.ts         (Context summarization)

Kubernetes manifests:
├── sandfly-mcp-deployment.yaml
└── redis-deployment.yaml
```

---

## Environment Variables Needed

### Sandfly MCP
```bash
SANDFLY_HOST=10.88.140.176
SANDFLY_USERNAME=admin
SANDFLY_PASSWORD=<from-existing-config>
SANDFLY_VERIFY_SSL=false
```

### Redis
```bash
REDIS_HOST=redis.cortex-system.svc.cluster.local
REDIS_PORT=6379
SESSION_TTL=86400  # 24 hours
```

---

## Troubleshooting

### If Sandfly MCP won't connect
- Check network routing to 10.88.140.176
- Verify Sandfly credentials
- Check K8s network policies
- Test with: `curl http://10.88.140.176/v4/auth/login`

### If context still drops
- Verify Redis is running
- Check session ID generation
- Inspect conversation store logic
- Test Redis connectivity

### If tools don't show up
- Check tool prefix routing (`sandfly_*`)
- Verify tool definitions in tools/index.ts
- Test `/api/tools` endpoint
- Check MCP server health

---

## Next Actions

### Immediate
1. Development Master: Pick up handoffs
2. Spawn Daryl agents for Phase 1 & 3 (parallel)
3. Monitor deployment progress

### After Phase 1
1. Spawn Daryl agent for Phase 2
2. Verify tool integration
3. Test tool execution

### After Phase 2 & 3
1. Spawn Daryl agent for Phase 4
2. Execute deep conversation tests
3. Generate test report

### Final
1. Review all success criteria
2. Document any issues encountered
3. Report completion to Larry (Coordinator Master)

---

## Questions?

All details are in the handoff documents. If you need clarification:
1. Check the master plan: `SANDFLY_INTEGRATION_MISSION.md`
2. Check the summary: `MISSION_SUMMARY.md`
3. Review the specific handoff JSON files
4. Escalate to Cortex Meta-Agent if blocked

---

**Status**: READY TO EXECUTE
**Coordinator**: Larry
**Date**: 2025-12-25
**Estimated Completion**: 13-23 hours from start

---

## One-Liner Commands

```bash
# View handoffs
cat /Users/ryandahlberg/Projects/cortex/coordination/masters/coordinator/handoffs/task-sandfly-integration-001.json | jq

# Check coordinator state
cat /Users/ryandahlberg/Projects/cortex/coordination/masters/coordinator/context/master-state.json | jq

# View routing decisions
cat /Users/ryandahlberg/Projects/cortex/coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl | tail -4

# Check Sandfly tools
cat /Users/ryandahlberg/Desktop/sandfly/src/mcp_sandfly/server.py | grep -A 5 "name=\"sandfly_" | head -50
```

---

**Let's build this!**
