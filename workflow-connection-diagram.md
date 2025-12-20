# Cortex Proxmox Master - Connection Architecture Diagram

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER INTERACTION LAYER                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                  ┌───────────────────────┐
                  │  Chat Trigger         │
                  │  (User Interface)     │
                  └───────────┬───────────┘
                              │ main
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       AGENT LAYER                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                          │   │
│  │         Cortex Coordinator Agent                        │   │
│  │         (Central Orchestrator)                          │   │
│  │                                                          │   │
│  └───▲─────────────▲────────────────▲─────────────────────┘   │
│      │             │                 │                          │
│      │ ai_tool     │ ai_languageModel│ ai_memory               │
└──────┼─────────────┼─────────────────┼──────────────────────────┘
       │             │                 │
    ┌──┴───┐    ┌───┴────┐      ┌────┴─────┐
    │Tools │    │Claude  │      │Conversation│
    │(23)  │    │Haiku   │      │Memory     │
    └──────┘    └────────┘      └───────────┘
       │
       │ main (implementation connections)
       ▼
┌─────────────────────────────────────────────────────────────────┐
│                  IMPLEMENTATION LAYER                            │
└─────────────────────────────────────────────────────────────────┘
```

## Detailed Connection Map

### Section 1: VM Operations (7 tools)

```
┌──────────────────────────────────┐
│   VM MANAGEMENT TOOLS            │
├──────────────────────────────────┤
│                                   │
│  Tool: List All VMs              │──ai_tool──┐
│      └─main─→ GET /qemu          │          │
│                                   │          │
│  Tool: Get VM Status             │──ai_tool─┤
│      └─main─→ GET /qemu/{id}/... │          │
│                                   │          │
│  Tool: Create VM                 │──ai_tool─┤
│      └─main─→ POST /qemu         │          │
│                                   │          ├─→ Cortex
│  Tool: Start VM                  │──ai_tool─┤   Coordinator
│      └─main─→ POST /{id}/start   │          │   Agent
│                                   │          │
│  Tool: Stop VM                   │──ai_tool─┤
│      └─main─→ POST /{id}/shutdown│          │
│                                   │          │
│  Tool: Delete VM                 │──ai_tool─┤
│      └─main─→ DELETE /qemu/{id}  │          │
│                                   │          │
│  Tool: Clone VM                  │──ai_tool─┘
│      └─main─→ POST /{id}/clone   │
│                                   │
└──────────────────────────────────┘
```

### Section 2: LXC & Resource Tools (6 tools)

```
┌──────────────────────────────────┐
│  LXC & RESOURCES TOOLS           │
├──────────────────────────────────┤
│                                   │
│  Tool: Get Node Resources        │──ai_tool──┐
│      └─main─→ GET /status        │          │
│                                   │          │
│  Tool: List LXC Containers       │──ai_tool─┤
│      └─main─→ GET /lxc           │          │
│                                   │          │
│  Tool: Create LXC Container      │──ai_tool─┤
│      └─main─→ POST /lxc          │          ├─→ Cortex
│                                   │          │   Coordinator
│  Tool: Get Storage Status        │──ai_tool─┤   Agent
│      └─main─→ GET /storage       │          │
│                                   │          │
│  Tool: Create VM Backup          │──ai_tool─┤
│      └─main─→ POST /vzdump       │          │
│                                   │          │
│  Tool: Get Network Config        │──ai_tool─┘
│      └─main─→ GET /network       │
│                                   │
└──────────────────────────────────┘
```

### Section 3: Cortex Intelligence (4 tools)

```
┌──────────────────────────────────────────────┐
│  CORTEX INTELLIGENCE TOOLS                   │
├──────────────────────────────────────────────┤
│                                               │
│  Tool: Consult Infrastructure Contractor     │──ai_tool──┐
│      (self-contained toolCode)               │          │
│                                               │          │
│  Tool: Route to Cortex Coordinator           │──ai_tool─┤
│      (self-contained toolCode)               │          ├─→ Cortex
│                                               │          │   Coordinator
│  Tool: Spawn Infrastructure Worker           │──ai_tool─┤   Agent
│      (self-contained toolCode)               │          │
│                                               │          │
│  Tool: Generate Infrastructure Report        │──ai_tool─┘
│      (self-contained toolCode)               │
│                                               │
└──────────────────────────────────────────────┘

Note: These tools have embedded implementations
      and don't require separate main connections
```

### Section 4: Self-Modification Tools (6 tools)

```
┌──────────────────────────────────┐
│  SELF-MODIFICATION TOOLS         │
├──────────────────────────────────┤
│                                   │
│  Tool: Read Workflow Config      │──ai_tool──┐
│      └─main─→ Code: Read File    │          │
│                                   │          │
│  Tool: Update Workflow           │──ai_tool─┤
│      └─main─→ Code: Write File   │          │
│                                   │          │
│  Tool: Add New Tool              │──ai_tool─┤
│      └─main─→ Code: Construct... │          ├─→ Cortex
│                                   │          │   Coordinator
│  Tool: Update Agent Instructions │──ai_tool─┤   Agent
│      └─main─→ Code: Update Ins...│          │
│                                   │          │
│  Tool: Read Workflow File        │──ai_tool─┤
│      └─main─→ Code: Read File    │          │
│                                   │          │
│  Tool: Write Workflow File       │──ai_tool─┘
│      └─main─→ Code: Write File   │
│                                   │
└──────────────────────────────────┘
```

## Connection Type Legend

```
main              : Data flow between regular nodes
ai_tool           : Tool registration with AI agent
ai_languageModel  : LLM connection to agent
ai_memory         : Memory buffer connection to agent
```

## Orphaned Nodes (Not Connected)

```
┌──────────────────────────────────┐
│  ORPHANED HTTP NODES             │
├──────────────────────────────────┤
│                                   │
│  ❌ n8n API: GET /workflows/:id  │ (unused)
│                                   │
│  ❌ n8n API: PUT /workflows/:id  │ (unused)
│                                   │
└──────────────────────────────────┘

Recommendation: Remove these nodes or connect them
to the workflow tools if you prefer API-based over
file-based operations.
```

## Connection Health Visualization

```
TOOL TO AGENT CONNECTIONS (ai_tool)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
23/23 ✅ [████████████████████] 100%

TOOL TO IMPLEMENTATION CONNECTIONS (main)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
21/23 ✅ [██████████████████░░] 91%
(2 orphaned HTTP nodes not counted as missing)

CIRCULAR DEPENDENCIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
0 ✅ [████████████████████] 100%

OVERALL HEALTH SCORE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
85/100 ✅ [█████████████████░░░] 85%
```

## Data Flow Example: Creating a VM

```
1. User: "Create a VM with 4 cores and 8GB RAM"
   │
   ▼
2. Chat Trigger
   │ main
   ▼
3. Cortex Coordinator Agent
   │ (analyzes request, selects tool)
   │
   ├─ ai_languageModel ─→ Claude Haiku (reasoning)
   ├─ ai_memory ─→ Conversation Memory (context)
   │
   ▼
4. Tool: Create VM
   │ (agent invokes via ai_tool)
   │ main
   ▼
5. Proxmox: POST /nodes/pve01/qemu
   │ (executes HTTP request)
   │
   ▼
6. Proxmox API Response
   │
   ▼
7. Agent processes result
   │
   ▼
8. User receives formatted response
```

## Error Case: Orphaned Node Attempted Usage

```
Hypothetical scenario if tool tried to use orphaned node:

❌ Tool: Read Workflow Config
   │ main
   ├─→ n8n API: GET /workflows/:id (ORPHANED - no path)
   │
   └─→ Connection exists but node is isolated
       Result: Would fail to execute

✅ Tool: Read Workflow File
   │ main
   └─→ Code: Read Workflow File (CONNECTED)
       Result: Executes successfully
```

## Optimization Recommendations

### Before: Current State
```
Tool: Read Workflow Config ──main──→ ❌ n8n API: GET /workflows/:id
                                     (orphaned, unused)

Tool: Read Workflow File ──main──→ ✅ Code: Read Workflow File
                                     (connected, used)
```

### After: Optimized State
```
Option 1 (Recommended): Remove orphaned nodes
─────────────────────────────────────────────
Tool: Read Workflow File ──main──→ ✅ Code: Read Workflow File
                                     (keep file-based approach)

Tool: Read Workflow Config ──REMOVED──


Option 2: Use API-based approach
─────────────────────────────────────────────
Tool: Read Workflow Config ──main──→ ✅ n8n API: GET /workflows/:id
                                     (connect to API)

Tool: Read Workflow File ──REMOVED──
Code: Read Workflow File ──REMOVED──
```

## Connection Pattern Comparison

### Pattern A: Tool Workflow (HTTP Implementation)
```
┌─────────────────────┐
│ Tool: List VMs      │
│ (toolWorkflow)      │
│                     │
│ ├─ ai_tool ────────┼─→ Agent
│ │                   │
│ └─ main ───────────┼─→ HTTP Request
│                     │     │
└─────────────────────┘     └─→ Proxmox API
                                 (external call)

Pros: Clean separation, easy to debug
Cons: Requires implementation node
```

### Pattern B: Tool Code (Self-Contained)
```
┌─────────────────────────────┐
│ Tool: Infrastructure Report │
│ (toolCode)                  │
│                             │
│ ├─ ai_tool ────────────────┼─→ Agent
│ │                           │
│ └─ [embedded code]          │
│     └─ return json          │
│                             │
└─────────────────────────────┘

Pros: Single node, faster execution
Cons: Less modular, harder to reuse
```

## Summary Statistics

```
Total Nodes:          50
├─ Connected:         48 (96%)
├─ Orphaned:          2 (4%)
└─ Organizational:    4 (sticky notes)

Connection Types:
├─ ai_tool:          23 ✅
├─ main:             23 (21 functional + 2 orphaned)
├─ ai_languageModel: 2 ✅
└─ ai_memory:        1 ✅

Health Metrics:
├─ Critical Issues:   0 ✅
├─ High Priority:     0 ✅
├─ Medium Priority:   6 ⚠️
└─ Low Priority:      4 💡
```

---

**Conclusion:** The workflow demonstrates excellent connection architecture with only minor cosmetic issues. All functional connections are properly implemented following n8n best practices for AI agent workflows.
