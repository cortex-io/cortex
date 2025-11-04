# CI/CD Master Agent

## Overview

The CI/CD Master is a specialized master agent in the commit-relay system responsible for continuous integration and continuous deployment workflows. It orchestrates build automation, test execution, deployment strategies, and release management across the CI/CD pipeline.

## Responsibilities

The CI/CD Master handles:

1. **Build Automation**: Orchestrate build processes (npm, docker, webpack, etc.)
2. **Test Orchestration**: Coordinate unit, integration, and end-to-end test execution
3. **Deployment Management**: Execute deployment strategies (blue-green, canary, rolling)
4. **Release Workflows**: Manage versioning, changelog generation, and release publishing
5. **Pipeline Optimization**: Improve pipeline performance and reliability
6. **Environment Management**: Coordinate dev, staging, and production environments
7. **Rollback Coordination**: Execute emergency rollbacks when deployments fail

## Architecture

### Agent Definition

**Location**: `.claude/agents/cicd-master.md`

**Model**: Claude Sonnet 4.5

**Invocation**:
```bash
claude code --agent cicd-master
```

### Context & State

**Directory Structure**:
```
coordination/masters/cicd/
├── context/
│   └── master-state.json          # CI/CD master state and metrics
├── handoffs/
│   └── to-cicd-*.json             # Incoming task handoffs from coordinator
└── knowledge-base/
    ├── deployment-patterns.jsonl  # Successful deployment strategies
    ├── pipeline-optimizations.json # Pipeline performance improvements
    ├── rollback-procedures.json   # Emergency rollback strategies
    └── environment-configs.json   # Environment-specific configurations
```

### Initialization

Run the CI/CD master launcher script:
```bash
./scripts/run-cicd-master.sh
```

This initializes:
1. Master state with session ID and pipeline metrics
2. Knowledge base with deployment patterns
3. Worker type registry (5 CI/CD worker types)
4. Context directories

## Worker Types (MoE Specialization)

The CI/CD Master spawns specialized workers for different pipeline stages:

| Worker Type | Token Budget | Purpose | Skills |
|-------------|--------------|---------|--------|
| **build-worker** | 12k | Build automation | npm, docker, webpack, compilation |
| **test-worker** | 15k | Test execution | unit_tests, integration_tests, e2e_tests |
| **deploy-worker** | 18k | Deployment execution | deployment_strategies, infrastructure, monitoring |
| **release-worker** | 10k | Release management | versioning, changelogs, tagging, publishing |
| **pipeline-optimizer** | 13k | Pipeline improvement | performance_tuning, caching, parallelization |

## Workforce Stream Integration

The CI/CD Master has dedicated access to **Stream D (CI/CD Pipeline)**:

### Stream D Configuration

- **Priority**: 1 (Critical)
- **Max Workers**: 5
- **Token Allocation**: 25,000 tokens
- **Preemption**: Enabled
- **Parallel Execution**: Enabled for independent pipeline stages

**Assigned Masters**: CI/CD Master (exclusive)

**Task Types**: build, test, deploy, release, rollback, pipeline_optimization

## Token Budget

**Daily Allocation**:
- **Master Allocation**: 35,000 tokens
- **Worker Pool**: 25,000 tokens (shared with Stream D)
- **Alert Threshold**: 80% usage

**Budget File**: `coordination/token-budget.json`

```json
{
  "masters": {
    "cicd": {
      "allocated": 35000,
      "used": 0,
      "worker_pool": 25000,
      "workforce_stream": "stream-d"
    }
  }
}
```

## Deployment Strategies

### Blue-Green Deployment

**Description**: Maintain two identical production environments (blue and green). Deploy to inactive environment, then switch traffic.

**Benefits**:
- Zero downtime
- Instant rollback capability
- Full testing before traffic switch

**Implementation**:
```bash
# CI/CD Master spawns deploy-worker with blue-green strategy
{
  "strategy": "blue_green",
  "environments": {
    "blue": "production-blue",
    "green": "production-green"
  },
  "health_checks": true,
  "rollback_on_failure": true
}
```

**Use Cases**:
- Production deployments
- Major version releases
- Database schema changes

### Canary Deployment

**Description**: Deploy to small percentage of users first, monitor metrics, then gradually increase traffic.

**Benefits**:
- Early issue detection
- Gradual rollout
- Automated rollback on errors

**Implementation**:
```bash
# CI/CD Master configures canary deployment
{
  "strategy": "canary",
  "stages": [
    {"percentage": 10, "duration": "10min"},
    {"percentage": 50, "duration": "20min"},
    {"percentage": 100}
  ],
  "error_threshold": 0.01,
  "rollback_on_threshold": true
}
```

**Use Cases**:
- High-traffic applications
- Risk-averse deployments
- A/B testing integration

### Rolling Deployment

**Description**: Update instances gradually in batches while maintaining service availability.

**Benefits**:
- No additional infrastructure
- Continuous availability
- Simple implementation

**Implementation**:
```bash
# CI/CD Master executes rolling deployment
{
  "strategy": "rolling",
  "batch_size": 2,
  "wait_between_batches": "5min",
  "health_check_interval": "30s"
}
```

**Use Cases**:
- Microservices updates
- Standard releases
- Resource-constrained environments

## Pipeline Workflows

### Build, Test, Deploy Pipeline (Parallel)

**Scenario**: Deploy new feature to production

**Execution Flow**:
```
1. Coordinator assigns task to CI/CD Master
2. CI/CD Master analyzes task and decomposes into stages
3. Spawn workers in parallel for independent stages:

   Stage 1 (Parallel):
   - build-worker-1: Build backend
   - build-worker-2: Build frontend

   Stage 2 (Parallel, after Stage 1):
   - test-worker-1: Unit tests
   - test-worker-2: Integration tests
   - test-worker-3: E2E tests

   Stage 3 (Sequential, after Stage 2):
   - deploy-worker: Deploy to staging
   - test-worker: Smoke tests on staging

   Stage 4 (Sequential, after Stage 3):
   - deploy-worker: Deploy to production (blue-green)
   - test-worker: Production health checks

   Stage 5 (Sequential, after Stage 4):
   - release-worker: Create release notes and version tag

Total Time: ~20 minutes (vs 60+ minutes sequential)
Tokens: 60k distributed across Stream D
```

### Emergency Rollback Workflow

**Scenario**: Production deployment failed, rollback required

**Execution Flow**:
```
1. Monitoring detects deployment failure (error rate spike)
2. Coordinator creates CRITICAL task for CI/CD Master (Stream A)
3. CI/CD Master receives task via handoff
4. Spawn deploy-worker with rollback strategy:
   - Retrieve previous stable version
   - Execute rollback deployment
   - Verify health checks
   - Notify coordinato r completion
5. Record rollback in knowledge base

Total Time: ~5 minutes
Tokens: 15k from Stream A (critical priority)
```

### Pipeline Optimization

**Scenario**: Slow test suite impacting developer velocity

**Execution Flow**:
```
1. CI/CD Master identifies slow pipeline (>30 min avg)
2. Spawn pipeline-optimizer worker
3. Optimizer analyzes test execution:
   - Identifies parallelization opportunities
   - Recommends caching strategies
   - Suggests test ordering optimization
4. Implement optimizations:
   - Configure parallel test runners
   - Add dependency caching
   - Reorder tests (fast-fail first)
5. Measure improvement: 30min → 8min (3.75x faster)
6. Record optimization in knowledge base

Total Time: 1 hour analysis + implementation
Result: Permanent 3.75x pipeline speedup
```

## Task Flow

### 1. Receive Handoff

CI/CD Master checks for handoffs from Coordinator:

```bash
coordination/masters/coordinator/handoffs/to-cicd-*.json
```

Example handoff:
```json
{
  "handoff_id": "handoff-001",
  "task_id": "task-050",
  "from_master": "coordinator",
  "to_master": "cicd",
  "task_type": "deploy",
  "priority": "critical",
  "task_data": {
    "repository": "ry-ops/my-app",
    "target_environment": "production",
    "deployment_strategy": "blue_green"
  }
}
```

### 2. Select Worker Type

CI/CD Master matches task to worker specialization:

```bash
deploy → deploy-worker
test → test-worker
build → build-worker
release → release-worker
optimize → pipeline-optimizer
```

### 3. RAG Retrieval

Before spawning workers, retrieve relevant patterns from knowledge base:

```bash
# Retrieve successful deployment patterns
tail -5 deployment-patterns.jsonl | jq -s '.'

# Example pattern:
{
  "pattern_id": "deploy-001",
  "strategy": "blue_green",
  "target_environment": "production",
  "success_rate": 0.98,
  "avg_duration_minutes": 12
}
```

### 4. Spawn Worker

Create worker spec with augmented RAG context:

```bash
{
  "worker_id": "cicd-worker-A1B2C3D4",
  "worker_type": "deploy-worker",
  "parent_master": "cicd",
  "workforce_stream": "stream-d",
  "task_id": "task-050",
  "context": {
    "deployment_patterns": [/* retrieved from knowledge base */],
    "environment_config": {/* environment-specific settings */}
  },
  "resources": {
    "token_allocation": 18000,
    "time_limit_minutes": 90
  }
}
```

### 5. Monitor Progress

Track worker execution in master state:

```bash
cat coordination/masters/cicd/context/master-state.json | jq '.active_workers'
```

### 6. Record Outcome

Update knowledge base with deployment results:

**deployment-patterns.jsonl**:
```json
{
  "pattern_id": "deploy-002",
  "strategy": "blue_green",
  "target_environment": "production",
  "success_rate": 1.0,
  "avg_duration_minutes": 11,
  "timestamp": "2025-11-04T18:30:00Z",
  "notes": "Zero-downtime deployment with health checks"
}
```

## ASI Learning

The CI/CD Master learns and improves over time by recording outcomes in knowledge bases:

### Deployment Patterns

Track successful deployment strategies:

```jsonl
{"pattern_id": "dp-001", "strategy": "blue_green", "env": "prod", "success_rate": 0.98, "duration": 12}
{"pattern_id": "dp-002", "strategy": "canary", "env": "prod", "success_rate": 0.95, "duration": 25}
{"pattern_id": "dp-003", "strategy": "rolling", "env": "staging", "success_rate": 1.0, "duration": 8}
```

### Pipeline Optimizations

Record pipeline improvements:

```json
{
  "optimization_id": "opt-001",
  "area": "test_execution",
  "technique": "parallel_test_runners",
  "improvement": "4x faster test suite",
  "before_duration": 30,
  "after_duration": 8,
  "applicable_to": ["node.js", "python"]
}
```

### Rollback Procedures

Learn from rollback experiences:

```json
{
  "rollback_id": "rb-001",
  "trigger": "error_rate_spike",
  "strategy": "blue_green_instant_switch",
  "time_to_recovery": 3,
  "lessons_learned": "Health checks prevented bad deployment"
}
```

## Performance Metrics

Track CI/CD Master performance in master state:

```json
{
  "performance_metrics": {
    "pipelines_executed": 0,
    "builds_succeeded": 0,
    "builds_failed": 0,
    "deployments_completed": 0,
    "deployments_failed": 0,
    "avg_pipeline_duration_minutes": 0,
    "success_rate": 0,
    "deployment_success_rate": 0,
    "mean_time_to_deploy_minutes": 0,
    "mean_time_to_recovery_minutes": 0,
    "change_failure_rate": 0
  }
}
```

### Key Metrics

- **Mean Time to Deploy (MTTD)**: Average time from commit to production
- **Mean Time to Recovery (MTTR)**: Average time to rollback on failure
- **Change Failure Rate (CFR)**: Failed deployments / Total deployments
- **Deployment Success Rate**: Successful deployments / Total deployments
- **Pipeline Duration**: Average end-to-end pipeline execution time

## Dashboard Integration

View CI/CD Master metrics in the dashboard:

```
http://localhost:3000/
Navigate to: Masters tab → CI/CD Master
Navigate to: Streams tab → Stream D (CI/CD Pipeline)
```

**Displayed Metrics**:
- Pipelines executed
- Build success rate
- Deployment success rate
- Active workers in Stream D
- Token budget utilization
- Average pipeline duration

## Integration with Other Masters

### Coordinator Master

- **Receives**: CI/CD task assignments via handoffs
- **Reports**: Pipeline completion status and metrics

### Development Master

- **Coordinates**: Feature deployments after implementation
- **Shares**: Build artifacts and test results

### Security Master

- **Coordinates**: Security patch deployments
- **Integrates**: Security scans in CI/CD pipeline

## Best Practices

### Task Assignment

Always route CI/CD tasks through the Coordinator Master:

```bash
# Good: Create task via Coordinator
./scripts/create-task.sh \
  --type deploy \
  --priority critical \
  --stream stream-d \
  --title "Deploy v2.0 to production"

# Bad: Directly invoke CI/CD Master (bypasses coordination)
```

### Parallel Pipeline Stages

Decompose pipelines for parallel execution:

```bash
# Bad: Sequential monolithic pipeline
build → test_all → deploy

# Good: Parallel stages where possible
build_backend + build_frontend →
unit_tests + integration_tests + e2e_tests →
deploy_staging → smoke_tests →
deploy_production → health_checks
```

### Rollback Strategy

Always define rollback strategy in deployment tasks:

```json
{
  "deployment": {
    "strategy": "blue_green",
    "rollback_on_failure": true,
    "health_check_timeout": 300,
    "error_threshold": 0.01
  }
}
```

## Troubleshooting

### Pipeline Failures

**Symptom**: Build or test failures

**Solution**:
1. Check worker logs: `agents/logs/cicd/`
2. Review error messages in task results
3. Verify dependencies and environment configuration
4. Re-run with increased logging

### Deployment Timeouts

**Symptom**: Deployment exceeds time limit

**Solution**:
1. Check health check configuration
2. Verify network connectivity to target environment
3. Review resource constraints (CPU, memory)
4. Consider increasing time_limit_minutes in worker spec

### Token Budget Exhaustion

**Symptom**: CI/CD tasks failing due to insufficient tokens

**Solution**:
1. Review token usage in dashboard
2. Adjust `cicd.worker_pool` in token-budget.json
3. Optimize worker token consumption
4. Stagger non-urgent deployments

## References

- [Workforce Streams Architecture](./WORKFORCE_STREAMS.md)
- [Token Budget Configuration](../coordination/token-budget.json)
- [CI/CD Master Agent Definition](../.claude/agents/cicd-master.md)
- [CI/CD Master Launcher Script](../scripts/run-cicd-master.sh)
