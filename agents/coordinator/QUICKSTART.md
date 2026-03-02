# Coordinator Agent - Quick Start Guide

Get the Coordinator Agent up and running in 5 minutes.

## Installation

```bash
cd /Users/ryandahlberg/Projects/cortex/agents/coordinator
npm install
npm run build
```

## Basic Usage

### 1. Route a Simple Task

```bash
npm run route "Deploy VM" vm_provisioning p2_medium "Create staging VM"
```

**Output:**
```json
{
  "task_id": "task-123",
  "contractor": "infrastructure-contractor",
  "action": "assign",
  "priority": "p2_medium",
  "complexity_score": {
    "final_score": 2.8,
    "classification": "simple"
  },
  "reason": "Primary contractor available"
}
```

### 2. Route a Complex Task

```bash
npm run route "K8s Cluster" kubernetes_cluster p1_high "Bootstrap HA cluster"
```

### 3. Check Status

```bash
npm run status
```

### 4. Process Queue

```bash
npm run process-queue
```

### 5. Spawn PM Agent

```bash
npm run spawn-pm "Build Monitoring" p1_high "Deploy Prometheus" "Setup Grafana"
```

## Programmatic Usage

```typescript
import { CoordinatorAgent, Task } from '@cortex/coordinator-agent';

const coordinator = new CoordinatorAgent();

// Route a task
const task: Task = {
  task_id: 'task-001',
  task_name: 'Deploy application',
  description: 'Deploy app to production',
  domain: 'k8s_workloads',
  priority: 'p1_high',
  created_at: new Date().toISOString(),
  requester: 'ops',
};

const decision = await coordinator.routeTask(task);
console.log('Routed to:', decision.contractor);
```

## Task Domains

Available domains:
- `vm_provisioning` → infrastructure-contractor
- `network_configuration` → infrastructure-contractor
- `dns_management` → infrastructure-contractor
- `kubernetes_cluster` → talos-contractor
- `k8s_workloads` → talos-contractor
- `workflow_automation` → n8n-contractor
- `integration_design` → n8n-contractor
- `multi_system_orchestration` → infrastructure-contractor

## Priority Levels

- `p0_critical` - 15 min SLA, preempts all
- `p1_high` - 1 hour SLA, preempts P2/P3
- `p2_medium` - 4 hour SLA, normal queue
- `p3_low` - 24 hour SLA, lowest priority

## Quick Examples

### Example 1: Emergency Task
```bash
npm run route "Fix Production" dns_management p0_critical "DNS servers down"
```

### Example 2: Scheduled Work
```bash
npm run route "Update Config" network_configuration p3_low "Update firewall rules"
```

### Example 3: Complex Project
```bash
npm run spawn-pm "Infrastructure Upgrade" p1_high \
  "Upgrade all VMs" \
  "Update network topology" \
  "Migrate to new datacenter"
```

## Monitoring

Check coordinator health:
```bash
npm run status | grep Utilization
```

View load metrics:
```bash
npm run metrics
```

## Configuration

Edit `config/coordinator-config.json` to adjust:
- Token budgets
- SLA times
- Utilization thresholds
- Queue settings

## Troubleshooting

### Task Not Routing

Check contractor health:
```bash
npm run status | grep -A 10 "Contractor Health"
```

### Queue Building Up

Process the queue:
```bash
npm run process-queue
```

### Need More Capacity

Adjust in config:
```json
{
  "contractors": {
    "infrastructure-contractor": {
      "max_concurrent_tasks": 10  // Increase from 5
    }
  }
}
```

## Next Steps

1. Read the [README.md](README.md) for complete documentation
2. Review [examples/example-usage.ts](examples/example-usage.ts)
3. Check [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)

## Support

Location: `/Users/ryandahlberg/Projects/cortex/agents/coordinator/`

For issues, check logs:
```bash
tail -f coordinator.log
```
