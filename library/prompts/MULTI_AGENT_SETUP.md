# Multi-Agent Setup Guide for Commit-Relay

## Overview

This guide explains how to use commit-relay's multi-agent architecture where each master operates as an independent Claude Code subagent with its own token budget.

## Problem Solved

**Before**: All operations ran in a single Claude Code session, sharing one token budget, leading to token exhaustion.

**After**: Each master is a separate subagent with isolated context and independent token budget, visible via `/agents` command.

## Architecture

```
commit-relay (meta-agent)           50k tokens
├── coordinator-master (subagent)   50k + 30k worker pool
├── security-master (subagent)      30k + 15k worker pool
├── development-master (subagent)   30k + 20k worker pool
├── inventory-master (subagent)     35k + 15k worker pool
└── dashboard-agent (subagent)      20k tokens (observer)
```

**Total System Budget**: 295k tokens daily

## Subagent Files

All subagents are defined in `.claude/agents/`:

```
.claude/agents/
├── commit-relay.md             # Meta-agent (system orchestration)
├── coordinator-master.md       # Task routing (MoE)
├── security-master.md          # Security operations
├── development-master.md       # Development work
├── inventory-master.md         # Repository management
└── dashboard-agent.md          # Monitoring (observer)
```

## Using Subagents

### Viewing Available Subagents

In Claude Code, use the `/agents` command:

```
/agents
```

This will show all 6 subagents:
- commit-relay
- coordinator-master
- security-master
- development-master
- inventory-master
- dashboard-agent

### Launching a Subagent

**Method 1: Via `/agents` Command**

1. Type `/agents` in Claude Code
2. Select the desired subagent from the list
3. The subagent launches in its own context with its own token budget

**Method 2: Direct Invocation** (from within another conversation)

```
@coordinator-master please route the pending tasks
```

**Method 3: Via Scripts** (for automation)

```bash
# These scripts should be updated to use subagent context
./scripts/run-coordinator-master.sh
./scripts/run-security-master.sh
./scripts/run-development-master.sh
./scripts/run-inventory-master.sh
```

## Token Budget Independence

Each subagent operates with its own token budget:

| Subagent | Daily Budget | Purpose |
|----------|--------------|---------|
| commit-relay | 50k | Meta-orchestration, strategic decisions |
| coordinator-master | 50k + 30k pool | Task routing, master coordination |
| security-master | 30k + 15k pool | Security scans, CVE response |
| development-master | 30k + 20k pool | Feature development, bug fixes |
| inventory-master | 35k + 15k pool | Repository cataloging |
| dashboard-agent | 20k | Monitoring (read-only) |

**Benefits**:
- ✅ No token sharing or conflicts
- ✅ Each agent can work independently
- ✅ Token exhaustion in one agent doesn't affect others
- ✅ Clear visibility of token usage per agent

## Subagent Capabilities

### commit-relay (Meta-Agent)

**Use for**:
- System-wide strategic decisions
- Cross-master coordination
- Critical escalations
- Budget management
- Executive reporting

**Example**:
```
@commit-relay we need to coordinate a security audit across all repositories
while simultaneously implementing a new authentication system
```

### coordinator-master

**Use for**:
- Task routing to appropriate masters
- Task decomposition
- Master-to-master handoffs
- System orchestration

**Example**:
```
@coordinator-master route these 5 tasks to the appropriate specialist masters
```

### security-master

**Use for**:
- Vulnerability scanning
- Dependency audits
- CVE remediation
- Secrets detection
- Compliance monitoring

**Example**:
```
@security-master scan all repositories for critical vulnerabilities
```

### development-master

**Use for**:
- Feature implementation
- Bug fixes
- Code refactoring
- Performance optimization

**Example**:
```
@development-master implement OAuth authentication with JWT tokens
```

### inventory-master

**Use for**:
- Repository discovery
- Documentation generation
- Dependency tracking
- Health monitoring

**Example**:
```
@inventory-master catalog all repositories and generate missing README files
```

### dashboard-agent

**Use for**:
- Monitoring and observability
- Metrics generation
- Event detection
- Analytics

**Example**:
```
@dashboard-agent generate a report on worker efficiency over the last week
```

## Workflow Examples

### Example 1: Security Scan (Using Specific Subagent)

```
1. Open Claude Code
2. Type: /agents
3. Select: security-master
4. Say: "Scan the n8n-mcp-server repository for vulnerabilities"
5. Security-master uses its 30k budget independently
6. Results logged to coordination/masters/security/
```

### Example 2: Feature Development (Multi-Master)

```
1. Use meta-agent: @commit-relay
2. Say: "Implement user authentication system"
3. Meta-agent coordinates:
   - @security-master: Audit security requirements
   - @development-master: Implement code
   - @inventory-master: Update documentation
4. Each master uses its own budget
5. No token conflicts
```

### Example 3: Emergency CVE Response

```
1. @security-master discovers CVE
2. Escalates to @commit-relay
3. @commit-relay deploys emergency reserve
4. @security-master + @development-master coordinate fix
5. Each uses independent budget
6. @dashboard-agent monitors progress
```

## Context Isolation

Each subagent maintains isolated context:

```
coordination/masters/
├── coordinator/
│   ├── context/master-state.json    # Coordinator's state
│   └── knowledge-base/               # Coordinator's knowledge
├── security/
│   ├── context/master-state.json    # Security's state
│   └── knowledge-base/               # Security's knowledge
├── development/
│   ├── context/master-state.json    # Development's state
│   └── knowledge-base/               # Development's knowledge
└── inventory/
    ├── context/master-state.json    # Inventory's state
    └── knowledge-base/               # Inventory's knowledge
```

**Benefits**:
- No state pollution between agents
- Clear ownership of context
- Independent learning per agent
- Easier debugging

## Monitoring Token Usage

### Via Dashboard

Visit http://localhost:3000 to see:
- Token usage per subagent
- Active workers per master
- Budget alerts and warnings

### Via Command Line

```bash
# Check coordinator budget
jq '.masters[] | select(.id == "coordinator") | .token_usage' \
  coordination/token-budget.json

# Check all master budgets
jq '.masters[] | {id: .id, used: .tokens_used, limit: .daily_limit}' \
  coordination/token-budget.json
```

## Best Practices

### 1. Use the Right Subagent

- **Strategic decisions** → @commit-relay
- **Task routing** → @coordinator-master
- **Security work** → @security-master
- **Development** → @development-master
- **Documentation** → @inventory-master
- **Monitoring** → @dashboard-agent

### 2. Let Subagents Work Independently

Don't micromanage. Each subagent knows its role:

✅ Good: "@security-master scan for vulnerabilities"
❌ Bad: "Scan for vulnerabilities using bandit and safety, then..."

### 3. Use Meta-Agent for Coordination

When work spans multiple domains:

✅ Good: "@commit-relay implement secure authentication"
❌ Bad: "@security-master scan then @development-master implement..."

### 4. Monitor Token Usage

Check dashboard regularly to ensure balanced usage across subagents.

### 5. Trust the ASI/MoE/RAG Architecture

- **ASI**: Agents learn from outcomes
- **MoE**: Right expert for each task
- **RAG**: Historical context informs decisions

## Troubleshooting

### Subagent Not Visible in /agents

**Solution**: Ensure `.claude/agents/*.md` files exist and have correct YAML frontmatter.

### Token Exhaustion in One Subagent

**Solution**: That's OK! Other subagents can still work. The exhausted agent will be rate-limited but won't affect others.

### Worker Not Spawning

**Solution**: Check that parent master has budget in worker pool. Example:
```bash
jq '.masters[] | select(.id == "development") | .worker_pool' \
  coordination/token-budget.json
```

### Subagent Context Confusion

**Solution**: Each subagent initializes via its script:
```bash
./scripts/run-{master}-master.sh
```

This creates isolated context on first run.

## Migration from Old Architecture

**Old Way** (single agent):
```
# Everything in one session
claude-code # All work here, shared tokens
```

**New Way** (multi-agent):
```
# Launch specific subagent for each task
/agents → select coordinator-master
/agents → select security-master
/agents → select development-master
```

**Benefits of Migration**:
- ✅ 295k total budget vs 200k before
- ✅ Token isolation prevents exhaustion
- ✅ Parallel operation without conflicts
- ✅ Clear visibility per agent
- ✅ Better failure isolation

## Integration with Existing Scripts

Update scripts to specify subagent context:

**Before**:
```bash
#!/bin/bash
./scripts/run-security-master.sh
# Runs in current agent context
```

**After**:
```bash
#!/bin/bash
# Launch security-master subagent
# Uses security-master's 30k budget + 15k worker pool
claude-code --subagent security-master \
  --exec "./scripts/run-security-master.sh"
```

## Next Steps

1. ✅ Subagents created in `.claude/agents/`
2. ⏳ Test via `/agents` command
3. ⏳ Launch each subagent and verify isolation
4. ⏳ Update scripts to use subagent contexts
5. ⏳ Monitor token usage per agent
6. ⏳ Adjust budgets based on usage patterns

## Summary

The multi-agent architecture solves token exhaustion by:

1. **Separate Contexts**: Each master is independent subagent
2. **Token Isolation**: Each has own budget (no sharing)
3. **Visibility**: All agents visible via `/agents`
4. **Scalability**: Add more subagents as needed
5. **Proper Design**: Matches master-worker architecture

Now each master can work autonomously without affecting others, and you can see all agents via `/agents` command in Claude Code.

## Questions?

- Check specific subagent files in `.claude/agents/` for detailed capabilities
- Use `/agents` command to see all available subagents
- Monitor http://localhost:3000 for real-time metrics
- Refer to PHASE_1_IMPLEMENTATION.md for architecture details
