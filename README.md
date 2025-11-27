# Cortex

Multi-agent AI system for autonomous GitHub repository management.

## What It Does

Cortex automates repository workflows using a master-worker architecture. Master agents (Coordinator, Development, Security, Inventory, CI/CD) route tasks to specialized workers that handle implementation, testing, scanning, fixes, and documentation.

## Quick Start

```bash
# Install worker daemon (one-time setup)
./scripts/daemon-control.sh install

# Start a master agent
./scripts/run-coordinator-master.sh
./scripts/run-security-master.sh
./scripts/run-development-master.sh
./scripts/run-inventory-master.sh

# Check system status
./scripts/status-check.sh

# View active workers
./scripts/worker-status.sh
```

## Architecture

**5 Master Agents:**
- Coordinator - Routes tasks using MoE pattern matching
- Development - Feature implementation, bug fixes
- Security - CVE detection and remediation
- Inventory - Repository cataloging
- CI/CD - Build automation and deployment

**7 Worker Types:**
- Implementation, Fix, Test, Scan, Security Fix, Documentation, Analysis

**9 Daemons:**
- Core: Coordinator, Worker, PM
- Self-healing: Heartbeat Monitor, Zombie Cleanup, Worker Restart, Failure Pattern Detection, Auto-Fix
- Monitoring: Dashboard Server

**Key Components:**
- Token budget management (270k daily)
- File-based coordination (JSON/JSONL)
- Elastic APM for observability
- PyTorch neural routing
- RAG system with vector search
- Governance framework

## Common Commands

```bash
# Daemon management
./scripts/daemon-control.sh status
./scripts/daemon-control.sh logs
./scripts/daemon-control.sh restart

# System monitoring
./scripts/system-live.sh              # Real-time dashboard
./scripts/worker-monitor.sh           # Worker status
./scripts/task-queue-monitor.sh       # Task queue

# Debugging
./scripts/debug-helper.sh             # Interactive troubleshooting
cat coordination/task-queue.json | jq
cat coordination/worker-pool.json | jq
```

## Coordination Files

All agent communication happens through files in `coordination/`:
- `task-queue.json` - Task assignments
- `worker-pool.json` - Active workers
- `token-budget.json` - Budget tracking
- `repository-inventory.json` - Repo catalog
- `dashboard-events.jsonl` - Event stream

## Documentation

- [Architecture Details](./docs/master-worker-architecture.md)
- [API Reference](./docs/API-REFERENCE.md)
- [Governance Framework](./docs/governance-framework.md)
- [Runbooks](./docs/) - Operational guides

## Monitoring

- Elastic APM: https://cloud.elastic.co
- Dashboard: http://localhost:3000 (when running)
- API endpoints: 128 instrumented REST endpoints

## Status

Production-ready. 94% worker success rate.

## License

MIT
