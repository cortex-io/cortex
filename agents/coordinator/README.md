# Cortex Coordinator Agent

The Coordinator Agent is the central orchestrator for Cortex Holdings' automation system. It routes tasks to appropriate contractors, manages priority queues, handles load balancing, and spawns PM agents for complex projects.

## Overview

The Coordinator Agent implements the GM Decision Engine logic to:

- **Route tasks** to appropriate contractors based on domain and complexity
- **Score complexity** using a weighted multi-dimensional algorithm
- **Manage priority queues** with starvation prevention
- **Balance load** across contractors to optimize throughput
- **Spawn PM agents** for complex multi-division projects
- **Escalate** when contractors are overloaded or tasks are too complex

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Coordinator Agent                         │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Complexity  │  │   Priority   │  │  Contractor  │      │
│  │   Scorer     │  │    Scorer    │  │   Selector   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │    Queue     │  │     Load     │  │  PM Spawner  │      │
│  │   Manager    │  │   Balancer   │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                             │
                             ├──> infrastructure-contractor
                             ├──> talos-contractor
                             ├──> n8n-contractor
                             ├──> security-contractor
                             └──> PM Agents
```

## Features

### 1. Task Routing

Routes tasks to contractors based on:
- **Domain matching**: VM provisioning → infrastructure-contractor
- **Complexity scoring**: Multi-dimensional weighted algorithm
- **Contractor availability**: Real-time load monitoring
- **Priority levels**: P0 (critical) to P3 (low)

### 2. Complexity Scoring

Scores tasks on 1-10 scale using 5 dimensions:
- Technical complexity (30% weight)
- Integration points (20% weight)
- Unknowns/ambiguity (20% weight)
- Risk level (15% weight)
- Dependencies (15% weight)

Classifies as: Simple, Moderate, Complex, Very Complex, Extremely Complex

### 3. Priority Queue Management

- **4 priority levels**: P0 (critical), P1 (high), P2 (medium), P3 (low)
- **FIFO within priority**: Fair ordering at same priority
- **Starvation prevention**: Automatic promotion after wait threshold
- **Priority preemption**: P0 can preempt all lower priorities

### 4. Load Balancing

- **Utilization thresholds**: Available (<80%), Busy (80-90%), Overloaded (>90%)
- **Token budget tracking**: Monitor token usage per contractor
- **Capacity-based routing**: Route to least-loaded contractor
- **Health monitoring**: Check contractor health before assignment

### 5. PM Agent Spawning

Spawns PM agents for complex projects:
- **Complexity threshold**: Projects with complexity > 7.0
- **Token budget allocation**: Based on estimated complexity
- **Division identification**: Auto-detect divisions involved
- **State machine integration**: Follows PM state machine workflow

## Installation

```bash
cd /Users/ryandahlberg/Projects/cortex/agents/coordinator
npm install
npm run build
```

## Usage

### CLI Commands

```bash
# Route a task
npm run route "Deploy VM" vm_provisioning p1_high "Deploy staging VM"

# Spawn PM for project
npm run spawn-pm "Build K8s Cluster" p1_high "3 control planes" "5 workers"

# Check status
npm run status

# Process queue
npm run process-queue

# View metrics
npm run metrics
```

### Programmatic Usage

```typescript
import { CoordinatorAgent, Task } from '@cortex/coordinator-agent';

const coordinator = new CoordinatorAgent();

// Route a task
const task: Task = {
  task_id: 'task-001',
  task_name: 'Deploy monitoring stack',
  description: 'Deploy Prometheus and Grafana',
  domain: 'kubernetes_cluster',
  priority: 'p1_high',
  created_at: new Date().toISOString(),
  requester: 'user',
};

const decision = await coordinator.routeTask(task);
console.log('Routing decision:', decision);

// Spawn PM agent
const project = {
  objective: 'Build production K8s cluster',
  priority: 'p1_high',
  requirements: [
    'High availability setup',
    '3 control plane nodes',
    '5 worker nodes',
  ],
  success_criteria: [
    'Cluster operational',
    'All nodes in Ready state',
  ],
  requester: 'ops-team',
};

const pmRequest = await coordinator.spawnPM(project);
console.log('PM spawned:', pmRequest.pm_id);
```

## Configuration

Configuration is in `config/coordinator-config.json`:

- **Divisions**: Token budgets per division
- **Contractors**: Capacity limits and token budgets
- **SLA**: Response and completion SLAs by priority
- **Load balancing**: Utilization thresholds
- **Queue management**: Starvation prevention settings
- **PM spawning**: Complexity thresholds and budgets

## Integration

### With GM Decision Engine

Implements the algorithms defined in:
- `/Users/ryandahlberg/Projects/cortex/coordination/divisions/gm-decision-engine.md`
- `/Users/ryandahlberg/Projects/cortex/coordination/divisions/gm-decision-engine.json`

### With Contractors

Creates handoff files in:
```
/Users/ryandahlberg/Projects/cortex/coordination/divisions/{division}/handoffs/from-coordinator/{handoff-id}.json
```

### With PM State Machine

Spawns PM agents following:
- `/Users/ryandahlberg/Projects/cortex/coordination/project-management/pm-state-machine.json`

Creates PM spawn requests in:
```
/Users/ryandahlberg/Projects/cortex/coordination/project-management/pm-spawns/{pm-id}.json
```

## Complexity Scoring Examples

### Simple Task (Score: 1.8)
```
Domain: DNS management
Technical: 2, Integration: 2, Unknowns: 1, Risk: 3, Dependencies: 1
→ 30 min, 2k tokens, infrastructure-contractor
```

### Complex Task (Score: 6.2)
```
Domain: Full stack deployment
Technical: 6, Integration: 7, Unknowns: 5, Risk: 7, Dependencies: 6
→ 3-4 hours, 10-12k tokens, infrastructure + talos contractors
```

### Very Complex Task (Score: 8.5)
```
Domain: New authentication system
Technical: 9, Integration: 8, Unknowns: 8, Risk: 10, Dependencies: 7
→ 6-8 hours, 18-22k tokens, multiple contractors + escalation
```

## Priority Scoring Examples

### P0 Critical (Score: 9.2)
```
Impact: 10 (company-wide), Urgency: 10 (hours), Business Value: 8, Risk: 9
→ 15 min response SLA, preempts all work
```

### P1 High (Score: 6.8)
```
Impact: 7 (multiple teams), Urgency: 7 (today), Business Value: 6, Risk: 6
→ 1 hour response SLA, preempts P2/P3
```

### P2 Medium (Score: 4.5)
```
Impact: 5 (team), Urgency: 4 (days), Business Value: 5, Risk: 4
→ 4 hour response SLA, normal queue
```

## Monitoring

The coordinator tracks:

- **Tasks routed**: Count and average routing time
- **Queue depth**: Total and by priority
- **Contractor utilization**: Per-contractor metrics
- **Escalations**: Count and reasons
- **Load imbalance**: Distribution across contractors

Access via:
```bash
npm run status  # Full status report
npm run metrics # Load metrics only
```

## Error Handling

### Contractor Overload
- **Action**: Queue task or escalate if P0
- **Recovery**: Process queue when capacity available

### No Domain Match
- **Action**: Escalate to COO with fallback to infrastructure
- **Recovery**: Manual contractor assignment

### Token Exhaustion
- **Action**: Escalate with token budget request
- **Recovery**: Approve additional tokens or defer tasks

## Development

### Build
```bash
npm run build
```

### Run in Development
```bash
npm run dev
```

### Test
```bash
npm test
```

### Lint
```bash
npm run lint
```

## File Structure

```
agents/coordinator/
├── src/
│   ├── coordinator.ts         # Main coordinator agent
│   ├── contractor-selector.ts # Contractor selection logic
│   ├── queue-manager.ts       # Priority queue management
│   ├── load-balancer.ts       # Load balancing
│   ├── cli.ts                 # Command-line interface
│   └── index.ts               # Entry point
├── utils/
│   ├── complexity-scorer.ts   # Complexity scoring algorithm
│   └── priority-scorer.ts     # Priority scoring algorithm
├── types/
│   └── index.ts               # TypeScript type definitions
├── config/
│   └── coordinator-config.json # Configuration
├── tests/
│   └── *.test.ts              # Unit tests
├── package.json
├── tsconfig.json
└── README.md
```

## License

MIT

## Support

For issues or questions, contact the Cortex Development Master.
