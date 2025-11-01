<img src="https://github.com/ry-ops/commit-relay/blob/main/commit-relay.png" width="100%">

# Commit-Relay

A multi-agent AI system for autonomous GitHub repository management.

## Overview

Commit-Relay uses specialized AI agents that collaborate to manage repositories, handle security updates, create pull requests, and maintain documentation. Each agent has distinct responsibilities but communicates through a shared coordination layer.

## Architecture

- **Coordination Layer**: JSON-based task queue and handoff system
- **Agent Communication**: Git-based async coordination
- **Activity Logging**: Markdown logs for full auditability
- **GitHub Integration**: Native tools (gh CLI, git, GitHub Actions)

## Agents (MVP - Phase 1)

### 1. Development Agent
- Primary coding and feature development
- Bug fixes and optimizations
- Test execution and code quality

### 2. Security Agent
- Vulnerability scanning
- Dependency updates
- Security audits and patches

### 3. Coordinator Agent
- Agent orchestration and handoffs
- Gap identification
- Human escalation

## Repository Structure

```
commit-relay/
├── agents/               # Agent definitions
│   ├── prompts/         # Agent initialization prompts
│   ├── configs/         # Agent configuration
│   └── logs/            # Agent activity logs
├── coordination/        # Coordination layer
│   ├── task-queue.json  # Active tasks
│   ├── handoffs.json    # Agent handoffs
│   └── status.json      # System status
├── docs/                # Documentation
└── scripts/             # Helper scripts
```

## Getting Started

### Prerequisites

- Claude Code or Claude Pro
- GitHub account and gh CLI
- Git configured
- Access to target repositories

### Setup

1. Clone this repository
2. Review agent prompts in `agents/prompts/`
3. Initialize first agent (Coordinator recommended)
4. Add target repositories to agent configuration

### Agent Workflow

Each agent follows this cycle:

1. **Check-in**: Pull latest coordination state
2. **Process**: Execute assigned tasks
3. **Log**: Document activities
4. **Update**: Modify coordination files
5. **Commit**: Push changes to coordination repository

## Coordination Protocol

Agents communicate asynchronously via:
- **task-queue.json**: Task assignments and status
- **handoffs.json**: Inter-agent work transfers
- **status.json**: System-wide health monitoring
- **Activity logs**: Detailed operation records

## Handoff Process

1. Completing agent creates handoff entry
2. Receiving agent accepts during next check-in
3. Context fully transferred via handoff data
4. Original task marked as completed
5. New task created or existing task updated

## Human Oversight

Human approval required for:
- New agent proposals
- Critical security patches
- System configuration changes
- Conflict resolution
- Emergency escalations

## Roadmap

- **Phase 1** (Current): Core agents (Development, Security, Coordinator)
- **Phase 2**: PR Management Agent
- **Phase 3**: Content/Documentation Agent
- **Phase 4**: Dynamic agent expansion

## Contributing

This is a personal automation project for managing [@ry-ops](https://github.com/ry-ops) repositories. If you're interested in the architecture or want to adapt it for your own use, feel free to fork and customize.

## License

MIT

---

**Status**: 🚧 In Development (Phase 1 - MVP)
