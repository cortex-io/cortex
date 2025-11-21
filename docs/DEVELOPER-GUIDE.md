# Commit-Relay Developer Guide

A comprehensive guide for developers working with and extending the Commit-Relay system.

---

## Overview

Commit-Relay is an autonomous AI agent coordination system that manages multiple Claude-powered workers to accomplish complex software development tasks. The system uses a Mixture of Experts (MoE) architecture to route tasks to specialized workers based on their capabilities.

### Key Features

- **Autonomous Task Execution**: Workers operate independently with minimal human intervention
- **Self-Healing**: Automatic detection and recovery from failures
- **Token Budget Management**: Intelligent allocation of API tokens across workers
- **Pattern Detection**: Learn from failures and apply automatic fixes
- **Real-Time Monitoring**: Live dashboards for system observability

---

## Architecture

### System Overview

```
+------------------+     +------------------+     +------------------+
|   Task Queue     | --> |  MoE Router      | --> |  Worker Pool     |
+------------------+     +------------------+     +------------------+
        |                        |                        |
        v                        v                        v
+------------------+     +------------------+     +------------------+
|  Coordinator     |     |  Pattern DB      |     |  Token Budget    |
|    Daemon        |     |                  |     |                  |
+------------------+     +------------------+     +------------------+
```

### Core Components

#### 1. Coordinator Daemon
- Orchestrates task distribution
- Manages worker lifecycle
- Coordinates master-worker communication

**Location**: `scripts/coordinator-daemon.sh`

#### 2. Worker Daemon
- Spawns and monitors Claude workers
- Manages PID files and logs
- Handles worker cleanup

**Location**: `scripts/worker-daemon.sh`

#### 3. MoE Router
- Routes tasks to appropriate worker types
- Uses learned patterns for optimization
- Supports circuit breaker patterns

**Configuration**: `coordination/moe/router-config.json`

#### 4. Token Budget Manager
- Tracks token allocation across workers
- Prevents budget exhaustion
- Supports priority-based allocation

**State**: `coordination/token-budget.json`

### Directory Structure

```
commit-relay/
|-- agents/
|   |-- logs/                  # Worker and system logs
|   |   |-- system/            # Daemon logs
|   |   +-- workers/           # Per-worker logs
|   +-- prompts/               # Agent prompt templates
|
|-- coordination/
|   |-- config/                # System configuration
|   |-- events/                # Event streams
|   |-- masters/               # Master agent state
|   |-- metrics/               # Performance metrics
|   |-- moe/                   # MoE router state
|   |-- patterns/              # Learned patterns
|   |-- tasks/                 # Task definitions
|   |-- worker-specs/          # Worker specifications
|   |   |-- active/            # Running workers
|   |   |-- completed/         # Finished workers
|   |   +-- zombie/            # Failed workers
|   +-- task-queue.json        # Task queue state
|
|-- scripts/
|   |-- daemons/               # Background daemons
|   |-- dashboards/            # Monitoring dashboards
|   |-- lib/                   # Shared libraries
|   +-- wizards/               # Interactive tools
|
+-- docs/
    |-- runbooks/              # Operational runbooks
    +-- *.md                   # Documentation
```

---

## Key Concepts

### Workers

Workers are autonomous Claude agents that execute specific tasks. Each worker:

- Has a unique ID (e.g., `worker-implementation-001`)
- Belongs to a worker type (e.g., `implementation-worker`)
- Has a token budget allocation
- Maintains heartbeat status
- Produces structured output

#### Worker Types

| Type | Purpose | Default Budget |
|------|---------|----------------|
| `scan-worker` | Security scanning | 70,000 tokens |
| `fix-worker` | Apply code fixes | 70,000 tokens |
| `analysis-worker` | Code analysis | 50,000 tokens |
| `implementation-worker` | Feature development | 100,000 tokens |
| `test-worker` | Test creation | 70,000 tokens |
| `review-worker` | Code review | 50,000 tokens |
| `documentation-worker` | Write documentation | 70,000 tokens |

#### Worker Lifecycle

1. **Pending**: Task assigned, waiting to spawn
2. **Running**: Actively processing task
3. **Idle**: Spawned but no active task
4. **Completed**: Task finished successfully
5. **Failed**: Task failed, moved to zombie
6. **Zombie**: Marked for cleanup

### Tasks

Tasks are units of work assigned to workers.

```json
{
  "task_id": "task-001",
  "description": "Implement user authentication",
  "priority": "high",
  "assigned_worker": "worker-implementation-001",
  "status": "in_progress",
  "created_at": "2025-11-21T10:00:00Z"
}
```

### Heartbeats

Workers emit heartbeats to indicate health:

```json
{
  "worker_id": "worker-implementation-001",
  "timestamp": "2025-11-21T10:05:00Z",
  "health_score": 85,
  "tokens_used": 25000,
  "progress": 50
}
```

### Patterns

The system learns from failures and stores patterns:

```json
{
  "pattern_id": "pattern-001",
  "type": "timeout",
  "confidence": 0.85,
  "root_cause": "Task too complex for allocated budget",
  "suggested_fix": "Increase token allocation",
  "occurrences": 5
}
```

---

## Getting Started

### Prerequisites

- macOS or Linux
- Bash 4.0+
- Node.js 18+ (for some utilities)
- jq (JSON processor)
- Claude CLI configured with API key

### Installation

1. Clone the repository:
```bash
git clone https://github.com/ry-ops/commit-relay.git
cd commit-relay
```

2. Set environment variable:
```bash
export COMMIT_RELAY_HOME=$(pwd)
```

3. Initialize the system:
```bash
./scripts/start-commit-relay.sh
```

4. Verify installation:
```bash
./scripts/dashboards/system-live.sh
```

### Quick Start

1. **Start daemons**:
```bash
./scripts/wizards/daemon-control.sh
```

2. **Create a worker**:
```bash
./scripts/wizards/create-worker.sh
```

3. **Monitor system**:
```bash
./scripts/dashboards/system-live.sh
```

---

## Development Workflow

### Creating a New Worker Type

1. Define the worker type in `coordination/config/worker-types.json`:

```json
{
  "worker_type": "my-custom-worker",
  "description": "Custom worker for specific task",
  "default_budget": 50000,
  "default_duration": 20,
  "skills": ["skill1", "skill2"]
}
```

2. Create a prompt template in `agents/prompts/`:

```bash
cat > agents/prompts/my-custom-worker.md << 'EOF'
# Custom Worker

You are a custom worker specialized in...

## Instructions
...

## Output Format
...
EOF
```

3. Register with MoE router in `coordination/moe/router-config.json`.

### Adding a New Daemon

1. Create daemon script in `scripts/daemons/`:

```bash
#!/bin/bash
# scripts/daemons/my-daemon.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMIT_RELAY_HOME="${COMMIT_RELAY_HOME:-$(cd "$SCRIPT_DIR/../.." && pwd)}"

# PID file
PID_FILE="/tmp/commit-relay-my-daemon.pid"
LOG_FILE="$COMMIT_RELAY_HOME/agents/logs/system/my-daemon.log"

# Write PID
echo $$ > "$PID_FILE"

# Main loop
while true; do
    # Your daemon logic here
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) Daemon cycle" >> "$LOG_FILE"

    sleep 60
done
```

2. Add to daemon registry in `scripts/dashboards/daemon-monitor.sh`.

3. Make executable:
```bash
chmod +x scripts/daemons/my-daemon.sh
```

### Working with Events

Emit events to the dashboard:

```bash
# Using emit-event.sh
./scripts/emit-event.sh \
  --type "custom_event" \
  --message "Something happened" \
  --severity "info"

# Direct JSONL append
cat >> coordination/dashboard-events.jsonl << EOF
{"timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","event_type":"custom_event","message":"Details"}
EOF
```

### Extending the MoE Router

1. Add routing rules to `coordination/moe/router-config.json`:

```json
{
  "rules": [
    {
      "pattern": "security.*scan",
      "worker_type": "scan-worker",
      "priority": "high"
    }
  ]
}
```

2. Update routing decision log:

```bash
cat >> coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl << EOF
{"task_type":"security","worker_type":"scan-worker","confidence":0.95,"timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF
```

---

## Testing

### Unit Testing Scripts

Run specific test scripts:

```bash
# Test core foundation
./scripts/test-core-foundation.sh

# Test autonomous execution
./scripts/test-autonomous-execution.sh
```

### Load Testing

Stress test the system:

```bash
# Run stress test
./scripts/stress-test-ddqd.sh --workers 10 --tasks 50

# Monitor during test
./scripts/dashboards/system-live.sh
```

### Integration Testing

```bash
# Validate worker spawn
./scripts/demo-validated-worker-spawn.sh

# Test full workflow
./scripts/demo-full-workflow.sh
```

### Manual Testing

1. Create a test task:
```bash
./scripts/create-task.sh \
  --description "Test task" \
  --priority "low" \
  --type "analysis"
```

2. Monitor worker:
```bash
tail -f agents/logs/workers/$(date +%Y-%m-%d)/worker-*/worker.log
```

3. Verify completion:
```bash
cat coordination/task-queue.json | jq '.tasks[] | select(.task_id == "task-001")'
```

---

## Troubleshooting

### Common Issues

#### Workers Not Spawning

**Symptoms**: Task queued but no worker created

**Diagnosis**:
```bash
# Check token budget
cat coordination/token-budget.json | jq '.available'

# Check daemon status
ps aux | grep worker-daemon

# Check logs
tail -f agents/logs/system/worker-daemon.log
```

**Resolution**:
1. Ensure sufficient token budget
2. Restart worker daemon
3. Check for zombie workers consuming budget

#### Daemon Failures

**Symptoms**: System not processing tasks

**Diagnosis**:
```bash
# Check all daemons
./scripts/dashboards/daemon-monitor.sh --status

# Look for errors
grep -i error agents/logs/system/*.log
```

**Resolution**:
1. Restart failed daemons
2. Check PID files in `/tmp/commit-relay-*.pid`
3. Clear stale PID files

#### Token Budget Exhaustion

**Symptoms**: Error "insufficient budget"

**Resolution**:
```bash
# Cleanup zombie workers
./scripts/cleanup-zombie-workers.sh

# Check budget
cat coordination/token-budget.json | jq .

# Manual reset (emergency)
# Edit coordination/token-budget.json
```

### Debug Mode

Enable verbose logging:

```bash
export DEBUG=1
./scripts/worker-daemon.sh
```

### Log Locations

| Component | Log Location |
|-----------|--------------|
| System daemons | `agents/logs/system/` |
| Workers | `agents/logs/workers/<date>/worker-<id>/` |
| Events | `coordination/dashboard-events.jsonl` |
| Health alerts | `coordination/health-alerts.json` |

---

## Best Practices

### Worker Design

1. **Keep workers focused**: One worker type per specialized task
2. **Set appropriate budgets**: Match token allocation to task complexity
3. **Use heartbeats**: Emit regular heartbeats for health monitoring
4. **Handle failures gracefully**: Always clean up resources

### Task Management

1. **Use priorities wisely**: Reserve "critical" for emergencies
2. **Break down complex tasks**: Smaller tasks are more reliable
3. **Include context**: Provide sufficient information in task description
4. **Set timeouts**: Prevent runaway workers

### System Operations

1. **Monitor regularly**: Use dashboards during active development
2. **Cleanup zombies**: Run cleanup after test sessions
3. **Rotate logs**: Prevent disk space issues
4. **Backup state**: Keep copies of critical state files

### Code Style

1. **Use shellcheck**: Validate all bash scripts
2. **Quote variables**: Prevent word splitting issues
3. **Check exit codes**: Handle errors appropriately
4. **Document scripts**: Include usage information

---

## API Reference

### Script APIs

#### spawn-worker.sh

```bash
./scripts/spawn-worker.sh \
  --type <worker-type> \
  --task-id <task-id> \
  --master <master-name> \
  --priority <priority> \
  --repo <owner/repo>
```

#### emit-event.sh

```bash
./scripts/emit-event.sh \
  --type <event-type> \
  --message <message> \
  --severity <info|warning|critical>
```

#### cleanup-zombie-workers.sh

```bash
./scripts/cleanup-zombie-workers.sh [worker-id]
```

### JSON Schemas

#### Worker Spec

```json
{
  "worker_id": "string",
  "worker_type": "string",
  "status": "pending|running|idle|completed|failed|zombie",
  "task_id": "string",
  "priority": "low|medium|high|critical",
  "token_budget": {
    "allocated": "number",
    "used": "number"
  },
  "heartbeat": {
    "last_seen": "ISO 8601 timestamp",
    "health_score": "number 0-100"
  },
  "created_at": "ISO 8601 timestamp"
}
```

#### Task

```json
{
  "task_id": "string",
  "description": "string",
  "status": "queued|in_progress|completed|failed",
  "priority": "low|medium|high|critical",
  "assigned_worker": "string",
  "created_at": "ISO 8601 timestamp",
  "completed_at": "ISO 8601 timestamp"
}
```

---

## Contributing

### Development Setup

1. Fork the repository
2. Create feature branch: `git checkout -b feature/my-feature`
3. Make changes with tests
4. Run validation: `./scripts/test-core-foundation.sh`
5. Submit pull request

### Code Review Checklist

- [ ] Scripts pass shellcheck
- [ ] Documentation updated
- [ ] Tests added/updated
- [ ] No hardcoded paths
- [ ] Error handling complete

---

## Resources

### Documentation

- [Quick Start Guide](./QUICK-START.md)
- [Cheatsheet](./CHEATSHEET.md)
- [MoE Architecture](./MOE-ARCHITECTURE.md)
- [Worker Lifecycle](./WORKER-LIFECYCLE.md)

### Runbooks

- [Worker Failure](./runbooks/worker-failure.md)
- [Daemon Failure](./runbooks/daemon-failure.md)
- [Daily Operations](./runbooks/daily-operations.md)
- [Emergency Recovery](./runbooks/emergency-recovery.md)

### Tools

- `./scripts/dashboards/system-live.sh` - System overview
- `./scripts/dashboards/daemon-monitor.sh` - Daemon management
- `./scripts/dashboards/metrics-dashboard.sh` - Metrics visualization
- `./scripts/wizards/daemon-control.sh` - Interactive daemon control
- `./scripts/wizards/create-worker.sh` - Worker creation wizard

---

## Changelog

### v4.0.0 (2025-11-21)
- MoE routing optimization with 100% confidence
- Single-expert routing for efficiency
- Phase 3 Developer Experience features

### v3.0.0 (2025-11-15)
- Self-healing system with pattern detection
- Auto-fix daemon
- Heartbeat monitoring

### v2.0.0 (2025-11-01)
- Master-worker architecture
- Token budget management
- Observability stack

---

**Last Updated**: 2025-11-21

**Maintained by**: Commit-Relay Team
