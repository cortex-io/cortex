# Agent Architecture Fix: Multi-Agent Claude Code Setup

## Current Problem

**Issue**: All masters and workers are running in a single Claude Code agent session, sharing one token budget. This causes:
- Token exhaustion affecting all operations
- No isolation between master agents
- Unable to see individual agents via `/agents` command
- commit-relay itself is not configured as an agent
- Cannot leverage Claude Code's multi-agent capabilities

## Root Cause

The current architecture treats commit-relay as a monolithic system running in one agent context, but it should be a **multi-agent system** where each master is a separate Claude Code agent with its own token budget.

## Desired Architecture

### Agent Hierarchy

```
commit-relay (meta-agent)
├── coordinator-master (agent)
├── security-master (agent)
├── development-master (agent)
├── inventory-master (agent)
├── dashboard-agent (agent)
└── workers/
    ├── scan-worker (ephemeral agent)
    ├── fix-worker (ephemeral agent)
    ├── implementation-worker (ephemeral agent)
    └── ... (other worker types)
```

### Token Budget Per Agent

Each agent should have its own independent token budget:

| Agent | Daily Budget | Purpose |
|-------|--------------|---------|
| commit-relay | 50k | Meta-orchestration, system oversight |
| coordinator-master | 50k | Task routing and coordination |
| security-master | 30k | Security strategy and oversight |
| development-master | 30k | Development planning and oversight |
| inventory-master | 35k | Repository cataloging oversight |
| dashboard-agent | 20k | Monitoring and analytics |
| Worker pool | 80k | Distributed across ephemeral workers |
| **Total** | **295k** | System-wide daily budget |

## Solution: Claude Code Multi-Agent Setup

### 1. Agent Configuration Files

Each agent needs a `.claude-code/` directory with:
- `config.json` - Agent-specific configuration
- `context/` - Agent's isolated context
- Token budget tracking

### 2. Directory Structure

```
/Users/ryandahlberg/
├── commit-relay/                    # Main project
│   └── .claude-code/
│       └── config.json              # commit-relay agent config
│
├── .claude-agents/                  # Agent definitions
    ├── coordinator-master/
    │   ├── .claude-code/
    │   │   └── config.json
    │   └── workspace -> /Users/ryandahlberg/commit-relay
    │
    ├── security-master/
    │   ├── .claude-code/
    │   │   └── config.json
    │   └── workspace -> /Users/ryandahlberg/commit-relay
    │
    ├── development-master/
    │   ├── .claude-code/
    │   │   └── config.json
    │   └── workspace -> /Users/ryandahlberg/commit-relay
    │
    ├── inventory-master/
    │   ├── .claude-code/
    │   │   └── config.json
    │   └── workspace -> /Users/ryandahlberg/commit-relay
    │
    └── dashboard-agent/
        ├── .claude-code/
        │   └── config.json
        └── workspace -> /Users/ryandahlberg/commit-relay
```

### 3. Agent Config Format

**commit-relay agent** (`commit-relay/.claude-code/config.json`):
```json
{
  "agent_id": "commit-relay",
  "agent_name": "Commit-Relay Meta-Agent",
  "agent_type": "meta",
  "description": "Meta-orchestration and system oversight for commit-relay",
  "working_directory": "/Users/ryandahlberg/commit-relay",
  "token_budget": {
    "daily_limit": 50000,
    "alert_threshold": 0.8
  },
  "capabilities": [
    "system_orchestration",
    "master_coordination",
    "escalation_handling",
    "reporting"
  ],
  "managed_agents": [
    "coordinator-master",
    "security-master",
    "development-master",
    "inventory-master",
    "dashboard-agent"
  ]
}
```

**coordinator-master agent**:
```json
{
  "agent_id": "coordinator-master",
  "agent_name": "Coordinator Master",
  "agent_type": "master",
  "description": "Task routing and coordination using MoE principles",
  "working_directory": "/Users/ryandahlberg/commit-relay",
  "context_directory": "coordination/masters/coordinator",
  "token_budget": {
    "daily_limit": 50000,
    "alert_threshold": 0.8,
    "worker_pool": 30000
  },
  "capabilities": [
    "task_routing",
    "moe_pattern_matching",
    "master_handoffs",
    "worker_spawning"
  ],
  "parent_agent": "commit-relay",
  "prompt_file": "agents/prompts/coordinator-master.md"
}
```

### 4. Launch Scripts Per Agent

**scripts/launch-coordinator-master.sh**:
```bash
#!/bin/bash
# Launch coordinator-master in its own agent context

AGENT_DIR="/Users/ryandahlberg/.claude-agents/coordinator-master"
cd "$AGENT_DIR"

# Launch with agent context
claude-code \
  --agent "coordinator-master" \
  --workspace "/Users/ryandahlberg/commit-relay" \
  --prompt-file "agents/prompts/coordinator-master.md"
```

### 5. Worker Spawning Updates

Workers should be spawned in the context of their parent master agent:

```bash
# scripts/spawn-worker.sh updates
spawn_worker() {
    local worker_type=$1
    local parent_master=$2

    # Launch in parent master's agent context
    claude-code \
      --agent "${parent_master}" \
      --spawn-worker "${worker_type}" \
      --workspace "/Users/ryandahlberg/commit-relay"
}
```

## Implementation Steps

### Phase 1: Agent Registration

1. Create `.claude-agents/` directory structure
2. Create agent config files for each master
3. Set up symlinks to commit-relay workspace
4. Register agents with Claude Code

### Phase 2: Launch Script Updates

1. Update `run-coordinator-master.sh` to use agent context
2. Update `run-security-master.sh` to use agent context
3. Update `run-development-master.sh` to use agent context
4. Update `run-inventory-master.sh` to use agent context
5. Create `launch-commit-relay.sh` for meta-agent

### Phase 3: Worker Spawning Updates

1. Update `spawn-worker.sh` to respect parent agent context
2. Ensure workers inherit token budget from parent
3. Update worker-daemon to use correct agent contexts

### Phase 4: Dashboard Integration

1. Update `/agents` endpoint to list all Claude Code agents
2. Show token usage per agent
3. Display agent status and health

## Benefits

✅ **Token Isolation**: Each agent has independent budget
✅ **Scalability**: Add new agents without affecting others
✅ **Visibility**: See all agents via `/agents` command
✅ **Proper Architecture**: Matches master-worker design
✅ **Fault Isolation**: One agent's issues don't affect others
✅ **Claude Code Native**: Leverages built-in multi-agent support

## Testing Plan

1. Register commit-relay agent and verify via `/agents`
2. Register all master agents
3. Launch coordinator-master in its own context
4. Verify token budget isolation
5. Spawn worker from master and check token attribution
6. Dashboard displays all agents correctly

## Next Steps

1. Research Claude Code agent registration API
2. Create agent configuration structure
3. Update launch scripts
4. Test multi-agent setup
5. Document for users
