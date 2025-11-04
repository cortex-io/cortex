# Workforce Streams Architecture

## Overview

The Workforce Streams architecture enables parallel task execution across multiple independent worker pools, increasing system throughput by 3-5x compared to single-stream execution. This document describes the multi-workforce stream system implemented in commit-relay.

## Architecture

### Multi-Stream Design

Commit-relay implements **5 independent workforce streams**, each with dedicated worker pools, token budgets, and scheduling policies:

| Stream ID | Name | Priority | Max Workers | Token Budget | Purpose |
|-----------|------|----------|-------------|--------------|---------|
| **Stream A** | Critical Priority | 1 | 5 | 20,000 | Critical security issues, production incidents, emergency rollbacks |
| **Stream B** | Standard Development | 2 | 5 | 20,000 | Feature implementation, bug fixes, refactoring |
| **Stream C** | Background/Maintenance | 3 | 5 | 15,000 | Scheduled scans, cleanup, optimization, analytics |
| **Stream D** | CI/CD Pipeline | 1 | 5 | 25,000 | Builds, tests, deployments, releases |
| **Stream E** | Security/Audit | 2 | 5 | 20,000 | Security scans, audits, compliance checks |

### Global Configuration

- **Total Worker Capacity**: 25 workers
- **Emergency Pool**: 5 workers (reserved for overflow)
- **Scheduling Algorithm**: Priority-based with load balancing
- **Preemption**: Enabled for Priority 1 tasks
- **Max Parallel Tasks**: 5 simultaneous tasks (1 per stream)

## Performance Targets

### Throughput
- **Parallel Capacity**: 5 simultaneous tasks
- **Throughput Multiplier**: 3-5x vs single-stream
- **Worker Utilization Target**: > 80%

### Latency
- **Stream Switching Overhead**: < 100ms
- **Task Assignment Latency**: < 500ms
- **Mean Time to Assignment**: < 30s

## Stream Details

### Stream A: Critical Priority

**Priority**: 1 (highest)
**Preemption**: Enabled

**Assigned Masters**:
- Security Master
- CI/CD Master

**Task Types**:
- Critical security vulnerabilities
- Production incidents
- Emergency rollbacks
- Critical bug fixes

**Scheduling**: FIFO with preemption capability

**Use Cases**:
```bash
# Example: Critical security vulnerability detected
./scripts/create-task.sh \
  --type critical_security \
  --priority 1 \
  --stream stream-a \
  --title "CRITICAL: CVE-2025-12345 in production dependencies"
```

### Stream B: Standard Development

**Priority**: 2
**Preemption**: Disabled

**Assigned Masters**:
- Development Master
- Inventory Master

**Task Types**:
- Feature implementation
- Bug fixes
- Code refactoring
- Documentation updates

**Scheduling**: Priority-weighted FIFO

**Use Cases**:
```bash
# Example: New feature implementation
./scripts/create-task.sh \
  --type feature_implementation \
  --priority 2 \
  --stream stream-b \
  --title "Implement user authentication system"
```

### Stream C: Background/Maintenance

**Priority**: 3 (lowest)
**Preemption**: Disabled

**Assigned Masters**:
- Security Master
- Inventory Master

**Task Types**:
- Scheduled security scans
- Cleanup tasks
- Performance optimization
- Analytics and reporting

**Scheduling**: Round-robin

**Use Cases**:
```bash
# Example: Scheduled weekly security scan
./scripts/create-task.sh \
  --type scheduled_scan \
  --priority 3 \
  --stream stream-c \
  --title "Weekly security audit - all repositories"
```

### Stream D: CI/CD Pipeline

**Priority**: 1 (highest)
**Preemption**: Enabled

**Assigned Masters**:
- CI/CD Master (exclusive)

**Task Types**:
- Build automation
- Test orchestration
- Deployments
- Releases
- Pipeline optimization

**Scheduling**: Pipeline-stage aware (supports parallel stages)

**Use Cases**:
```bash
# Example: Production deployment
./scripts/create-task.sh \
  --type deploy \
  --priority 1 \
  --stream stream-d \
  --title "Deploy v2.0 to production"
```

### Stream E: Security/Audit

**Priority**: 2
**Preemption**: Disabled

**Assigned Masters**:
- Security Master

**Task Types**:
- Security scanning
- Vulnerability audits
- Compliance checks
- Secrets detection
- Dependency audits

**Scheduling**: Priority-weighted

**Use Cases**:
```bash
# Example: Compliance audit
./scripts/create-task.sh \
  --type compliance_check \
  --priority 2 \
  --stream stream-e \
  --title "SOC 2 compliance audit"
```

## Scheduling Policies

### Priority Resolution

**Policy**: Priority 1 preempts all lower priorities

**Rules**:
1. Priority 1 tasks can preempt lower priority streams
2. Within same priority, use FIFO ordering
3. Emergency pool available for Priority 1 overflow
4. Fair scheduling ensures all streams make progress

**Example**:
```
Scenario: Stream B has 3 active workers processing Priority 2 tasks.
A Priority 1 task arrives for Stream A (currently idle).

Action:
1. Allocate 1 worker from pool to Stream A immediately
2. If pool exhausted, preempt 1 worker from Stream B
3. Stream B task paused and re-queued
4. Stream A task begins execution
```

### Load Balancing

**Policy**: Dynamic allocation based on demand

**Rules**:
1. Workers assigned based on stream demand
2. Minimum 1 worker per active stream
3. Maximum max_workers per stream (5)
4. Idle workers returned to pool
5. Emergency pool held in reserve

**Rebalancing**: Every 5 minutes or on task completion

**Example**:
```
Current State:
- Pool: 25 workers
- Stream A: 0 active workers, 2 queued tasks
- Stream B: 3 active workers, 5 queued tasks
- Stream C: 0 active workers, 0 queued tasks
- Stream D: 2 active workers, 1 queued task
- Stream E: 0 active workers, 0 queued tasks

After Rebalancing:
- Stream A: 2 workers (priority 1, has demand)
- Stream B: 5 workers (max capacity, high demand)
- Stream C: 0 workers (no demand)
- Stream D: 3 workers (priority 1, has demand)
- Stream E: 0 workers (no demand)
- Pool: 15 available workers
- Emergency: 5 reserved
```

### Fairness

**Policy**: Time-slicing ensures progress for all priorities

**Rules**:
1. Monitor stream starvation (>15 min without worker)
2. Guarantee minimum throughput for all priorities
3. Rebalance every 5 minutes
4. Alert on stream blocking

**Starvation Prevention**:
- If Stream B (Priority 2) has been waiting >15 minutes while Priority 1 streams are busy
- Guarantee at least 1 worker allocation to Stream B
- Log warning and alert in dashboard

## Configuration

### File Location

```
coordination/workforce-streams.json
```

### Schema

```json
{
  "version": "1.0",
  "global_config": {
    "total_worker_pool": 25,
    "emergency_pool": 5,
    "scheduling_algorithm": "priority_load_balanced",
    "preemption_enabled": true
  },
  "streams": [
    {
      "id": "stream-a",
      "name": "Critical Priority",
      "priority": 1,
      "max_workers": 5,
      "token_allocation": 20000,
      "preemption_enabled": true,
      "assigned_masters": ["security", "cicd"]
    }
    // ... additional streams
  ]
}
```

## Monitoring

### Dashboard Visualization

Access the Streams view in the dashboard:
```
http://localhost:3000/
Navigate to: Streams tab
```

**Metrics Displayed**:
- Total worker capacity
- Active workers per stream
- Queued tasks per stream
- Token budget utilization
- Stream utilization percentage

### API Endpoints

```bash
# Get all streams data
curl http://localhost:3000/api/streams

# Get specific stream metrics
curl http://localhost:3000/api/streams?stream=stream-a
```

### Alert Thresholds

- **Worker Utilization Low**: < 50%
- **Worker Utilization High**: > 95%
- **Queue Depth High**: > 10 tasks
- **Stream Starvation**: > 15 minutes without worker
- **Task Timeout Rate**: > 10%

## Migration from Single-Stream

### Before (Single Stream)
```
Sequential execution:
- Task 1 (45 min) → Task 2 (30 min) → Task 3 (60 min)
- Total time: 135 minutes
- Token usage: Concentrated bursts
```

### After (Multi-Stream)
```
Parallel execution:
- Stream A: Task 1 (45 min)
- Stream B: Task 2 (30 min) ✓ → Task 4 (20 min)
- Stream D: Task 3 (60 min)
- Total time: 60 minutes (2.25x faster)
- Token usage: Distributed across streams
```

## Best Practices

### Stream Selection

1. **Use Stream A for**:
   - Security vulnerabilities (CVSS > 7.0)
   - Production incidents
   - Emergency rollbacks

2. **Use Stream B for**:
   - Regular feature development
   - Non-critical bug fixes
   - Code refactoring

3. **Use Stream C for**:
   - Scheduled maintenance tasks
   - Background analytics
   - Optimization work

4. **Use Stream D for**:
   - All CI/CD operations
   - Deployment workflows
   - Release management

5. **Use Stream E for**:
   - Security audits
   - Compliance checks
   - Scheduled vulnerability scans

### Task Decomposition

When creating large tasks, decompose into stream-compatible subtasks:

```bash
# Bad: Single monolithic task
create-task.sh "Implement and deploy authentication system"

# Good: Decomposed into multiple streams
create-task.sh --stream stream-b "Implement authentication backend API"
create-task.sh --stream stream-b "Implement authentication frontend UI"
create-task.sh --stream stream-d "Test authentication system"
create-task.sh --stream stream-d "Deploy authentication to staging"
create-task.sh --stream stream-e "Security audit authentication implementation"
create-task.sh --stream stream-d "Deploy authentication to production"
```

## Troubleshooting

### Stream Starvation

**Symptom**: Low-priority stream not receiving workers

**Solution**:
1. Check queue depth: `curl http://localhost:3000/api/streams`
2. Review priority distribution
3. Adjust max_workers if needed
4. Consider increasing emergency pool

### Token Budget Exhaustion

**Symptom**: Stream shows "token budget exceeded"

**Solution**:
1. Review token usage in dashboard
2. Adjust stream token_allocation in workforce-streams.json
3. Increase global token budget
4. Optimize worker token consumption

### Low Worker Utilization

**Symptom**: < 50% worker utilization

**Solution**:
1. Check for idle streams with no queued tasks
2. Reduce max_workers for idle streams
3. Review task assignment latency
4. Consider consolidating streams

## References

- [CI/CD Master Documentation](./CICD_MASTER.md)
- [Token Budget Configuration](../coordination/token-budget.json)
- [Worker Pool Management](../coordination/worker-pool.json)
- [Dashboard API Documentation](../dashboard/README.md)
