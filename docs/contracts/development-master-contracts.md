# Development Master Agent Contracts

## Overview

The Development Master orchestrates software development work through specialized workers implementing a Mixture of Experts architecture with RAG-based knowledge retrieval.

**Agent ID**: `development`
**Schema**: `master-state.schema.json`
**Parent**: Coordinator Master

## Core Responsibilities

1. **Feature Implementation**: Build new functionality and capabilities
2. **Bug Fixing**: Diagnose and resolve software defects
3. **Code Refactoring**: Improve code quality and maintainability
4. **Performance Optimization**: Enhance system performance
5. **Worker Management**: Spawn, monitor, and coordinate development workers

## Worker Types (MoE Specialization)

| Worker Type | Token Budget | Schema | Purpose |
|-------------|--------------|--------|---------|
| feature-implementer | 15k | worker-spec.schema.json | New feature development |
| bug-fixer | 10k | worker-spec.schema.json | Bug diagnosis and fixing |
| refactorer | 12k | worker-spec.schema.json | Code quality improvement |
| optimizer | 13k | worker-spec.schema.json | Performance optimization |

## Input Contract

### Handoff from Coordinator
**Schema**: `handoff.schema.json`
**Location**: `coordination/masters/coordinator/handoffs/to-development-*.json`

```json
{
  "handoff_id": "coord-to-development-GUID",
  "from_master": "coordinator",
  "to_master": "development",
  "task_id": "task-1762553459",
  "task_data": {
    "id": "task-1762553459",
    "title": "Feature implementation task",
    "type": "feature",
    "priority": "high",
    "context": {
      "description": "Detailed requirements",
      "requirements": ["req1", "req2"],
      "repository": "org/repo"
    }
  },
  "context": {
    "routing_reason": "Development pattern match",
    "priority": "high",
    "moe_metadata": {
      "confidence": "0.95",
      "strategy": "single_expert"
    }
  },
  "status": "pending_pickup"
}
```

## Output Contracts

### Worker Specification
**Schema**: `worker-spec.schema.json`
**Location**: `coordination/worker-specs/active/{worker-id}.json`

```json
{
  "worker_id": "dev-worker-ABCD1234",
  "worker_type": "feature-implementer",
  "prompt_template": "agents/prompts/workers/implementation-worker.md",
  "parent_master": "development",
  "task_id": "task-1762553459",
  "task_data": { ... },
  "context": {
    "master_session": "SESSION-UUID",
    "expertise_area": "frontend|backend|fullstack|...",
    "skills_required": ["javascript", "react", "node"],
    "knowledge_base_refs": {
      "implementation_patterns": "/path/to/implementation-patterns.jsonl",
      "architecture_docs": "/path/to/codebase-architecture.json"
    },
    "relevant_past_implementations": [
      {
        "pattern_id": "pattern-001",
        "feature": "authentication",
        "approach": "JWT tokens",
        "success_rate": 0.95
      }
    ]
  },
  "resources": {
    "token_allocation": 15000,
    "time_limit_minutes": 60
  },
  "status": "pending",
  "created_at": "2025-11-11T00:00:00Z",
  "created_by": "development"
}
```

### Handoff to CI/CD (Dashboard Update)
**Schema**: `handoff.schema.json`
**Location**: `coordination/masters/development/handoffs/dev-to-cicd-*.json`

```json
{
  "handoff_id": "dev-to-cicd-dashboard-GUID",
  "from_master": "development",
  "to_master": "cicd",
  "task_id": "task-1762553459",
  "handoff_type": "dashboard_deployment",
  "dashboard_update": {
    "required": true,
    "components": ["events", "metrics", "tasks", "workers"],
    "priority": "immediate",
    "validation_required": true,
    "changes_summary": "Task completed, update dashboard"
  },
  "created_at": "2025-11-11T00:00:00Z",
  "status": "pending_pickup"
}
```

## State Contract

**Location**: `coordination/masters/development/context/master-state.json`
**Schema**: `master-state.schema.json`

```json
{
  "master_id": "development",
  "master_name": "Development Master",
  "session_id": "UUID",
  "status": "active|busy|idle",
  "active_workers": [
    {
      "worker_id": "dev-worker-ABCD1234",
      "worker_type": "feature-implementer",
      "task_id": "task-1762553459",
      "started_at": "2025-11-11T00:00:00Z",
      "status": "active"
    }
  ],
  "completed_tasks": 42,
  "performance_metrics": {
    "avg_implementation_time": 3600,
    "success_rate": 0.92,
    "code_quality_score": 0.85
  },
  "token_usage": {
    "total": 150000,
    "daily_limit": 300000,
    "remaining": 150000
  }
}
```

## RAG Knowledge Base

### Implementation Patterns
**Location**: `coordination/masters/development/knowledge-base/implementation-patterns.jsonl`
**Schema**: `implementation-pattern.schema.json`

```json
{
  "pattern_id": "pattern-001",
  "feature": "authentication_system",
  "approach": "JWT with refresh tokens",
  "tech_stack": ["express", "jsonwebtoken"],
  "success_rate": 0.95,
  "timestamp": "2025-11-11T00:00:00Z",
  "notes": "Works well with Alpine.js frontend"
}
```

### Bug Fix Strategies
**Location**: `coordination/masters/development/knowledge-base/bug-fix-strategies.json`
**Schema**: Array of `bug-fix-strategy.schema.json`

## Behavioral Contracts

### Worker Spawning Algorithm

```
1. Receive handoff from coordinator
2. Analyze task requirements:
   a. Determine complexity (SMALL/MEDIUM/LARGE)
   b. Estimate token requirements
   c. Identify required skills
3. Query RAG knowledge base:
   a. Search implementation-patterns.jsonl
   b. Retrieve relevant past solutions
   c. Load architecture context
4. Select worker type:
   - feature → feature-implementer
   - bug → bug-fixer
   - refactor → refactorer
   - performance → optimizer
5. Create worker spec with:
   - RAG-retrieved context
   - Token allocation based on complexity
   - Skills and expertise requirements
6. Spawn worker (write spec to active/)
7. Monitor worker progress
8. Record outcome in knowledge base
```

### Task Completion Flow

```
1. Worker completes task
2. Validate worker result:
   a. Check for git commit
   b. Verify tests passed
   c. Validate code quality
3. Update knowledge base:
   a. Log successful pattern
   b. Update success rates
   c. Record lessons learned
4. Create handoff to CI/CD for dashboard update
5. Create handoff back to coordinator
6. Update master state
7. Move worker spec to completed/
```

### Dashboard Update Triggers

Create handoff to CI/CD Master when:
- Task status changes to completed/failed
- New worker spawned
- Worker completes execution
- Implementation milestone reached

## Performance Contracts

### Latency SLAs
- Handoff pickup: < 30 seconds
- Worker spawning: < 2 minutes
- RAG retrieval: < 5 seconds

### Token Budget
- Daily limit: 30k tokens
- Worker pool: 20k tokens
- Alert threshold: 80% usage

### Success Metrics
- Implementation success rate: > 85%
- Code quality score: > 0.80
- On-time completion: > 90%

## Integration Points

### Inputs
- Handoffs from coordinator
- Worker completion notifications
- Dashboard update requests

### Outputs
- Worker specifications
- Handoffs to CI/CD
- Handoffs to coordinator
- Implementation patterns (knowledge base)
- Dashboard events

### Knowledge Base Updates
- Append to implementation-patterns.jsonl on success
- Update bug-fix-strategies.json with new strategies
- Maintain codebase-architecture.json

## Version History

- **1.0.0** (2025-11-11): Initial contract with MoE and RAG integration
