# Cortex

[![Security Scan](https://github.com/ry-ops/cortex/actions/workflows/security-scan.yml/badge.svg)](https://github.com/ry-ops/cortex/actions/workflows/security-scan.yml)

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

### Organizational Structure
Cortex operates as **Cortex Holdings** - a multi-divisional organization using a construction company model:
- **Executive Level**: Cortex Prime (meta-agent), COO (orchestrator)
- **Shared Services**: Coordinator, Development, Security, Inventory, CI/CD
- **Divisions**: 6 specialized divisions managing 20 repositories
  - Infrastructure (Proxmox, UniFi, Cloudflare, Starlink)
  - Containers (Talos)
  - Workflows (n8n)
  - Configuration (Microsoft Graph)
  - Monitoring (Netdata, Grafana, CheckMK, Pulseway)
  - Intelligence (AIANA)

See [Cortex Holdings Structure](./coordination/divisions/README.md) for complete organizational details.

### Technical Architecture

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
- Token budget management (200k daily)
- File-based coordination (JSON/JSONL)
- **Observability Pipeline** - Complete event processing and analytics (NEW!)
- Elastic APM for observability
- PyTorch neural routing
- RAG system with vector search
- Governance framework

## Observability Pipeline

Production-ready event processing pipeline with 94 tests passing:

**Architecture:** Sources → Processors → Destinations → API → Dashboard

**Components:**
- **4 Processors**: Enrich, Filter, Sample, Redact PII
- **5 Destinations**: PostgreSQL, S3, Webhook, JSONL, Console
- **REST API**: 15+ endpoints for querying and analytics
- **Dashboard**: Real-time monitoring web interface

**Quick Start:**
```bash
# Start observability API server
node -e "
const { ObservabilityAPIServer, PostgreSQLDataSource } = require('./lib/observability/api');
const dataSource = new PostgreSQLDataSource({
  host: 'localhost',
  database: 'cortex_observability',
  user: 'postgres',
  password: process.env.POSTGRES_PASSWORD
});
const server = new ObservabilityAPIServer({ port: 3001, dataSource });
(async () => {
  await dataSource.initialize();
  await server.start();
  console.log('Dashboard: http://localhost:3001');
})();
"
```

**Features:**
- PII redaction (7 types: email, phone, SSN, API keys, etc.)
- Intelligent sampling (100% errors, 10% successes)
- Cost tracking and analysis
- Full-text search
- Time-series aggregations
- PostgreSQL storage with optimized indexes
- S3 archival with compression (60-80% reduction)
- Webhook integrations (Slack, PagerDuty, etc.)

**Documentation:**
- [Weeks 1-2: Pipeline Framework](./docs/observability-pipeline-weeks-1-2.md)
- [Weeks 3-4: Processors](./docs/observability-pipeline-weeks-3-4.md)
- [Weeks 5-6: Destinations](./docs/observability-pipeline-weeks-5-6.md)
- [Weeks 7-8: Search API & Dashboard](./docs/observability-pipeline-weeks-7-8.md)

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

### Organizational
- [Cortex Holdings Structure](./coordination/divisions/CORTEX_HOLDINGS.md) - Complete organizational chart
- [Divisions Quick Reference](./coordination/divisions/README.md) - Construction company model

### Technical
- [Master-Worker Architecture](./docs/master-worker-architecture.md) - Technical architecture details
- [API Reference](./docs/API-REFERENCE.md) - API documentation
- [Governance Framework](./docs/governance-framework.md) - Policies and procedures
- [Runbooks](./docs/) - Operational guides

## Monitoring

- Elastic APM: https://cloud.elastic.co
- Dashboard: http://localhost:3000 (when running)
- API endpoints: 128 instrumented REST endpoints

## Status

Production-ready. 94% worker success rate.

## License

MIT
