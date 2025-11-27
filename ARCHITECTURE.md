# Cortex Architecture

Deep dive into Cortex's master-worker architecture and internal systems.

## Overview

Cortex is a multi-agent AI system that automates repository management using a distributed master-worker pattern. This document explains how it works under the hood.

## Core Architecture Patterns

### 1. Master-Worker Pattern

**Masters** are domain specialists that route and coordinate work:
- **Coordinator Master**: Routes tasks to appropriate specialists using MoE pattern matching
- **Development Master**: Handles features, bug fixes, refactoring
- **Security Master**: CVE detection, vulnerability scanning, remediation
- **Inventory Master**: Repository cataloging, documentation
- **CI/CD Master**: Build automation, deployment, testing

**Workers** are ephemeral agents that execute specific tasks:
- Implementation Worker: Code implementation
- Fix Worker: Bug fixes
- Test Worker: Test creation and execution
- Scan Worker: Security scanning
- Security Fix Worker: CVE remediation
- Documentation Worker: Documentation generation
- Analysis Worker: Code analysis

### 2. File-Based Coordination

All inter-agent communication happens through JSON files in `coordination/`:

```
coordination/
├── task-queue.json          # Pending/in-progress/completed tasks
├── worker-pool.json         # Active workers and their status
├── token-budget.json        # Token usage tracking
├── repository-inventory.json # Managed repositories
├── dashboard-events.jsonl   # Event stream for dashboard
└── governance/
    └── overrides.jsonl      # Governance enforcement audit trail
```

**Why file-based?**
- Simple: No message broker needed
- Observable: Can inspect state with `cat` and `jq`
- Debuggable: Full history in version control
- Resilient: Survives restarts

### 3. Mixture of Experts (MoE) Routing

The Coordinator uses MoE pattern matching to route tasks:

1. **Keyword Analysis**: Extract domain keywords from task description
2. **Confidence Scoring**: Calculate confidence for each master (0.0-1.0)
3. **Sparse Activation**: Only activate masters above threshold
4. **Strategy Selection**:
   - Single expert (confidence >= 0.70)
   - Multi-expert parallel (multiple above 0.25)
   - Single expert low confidence (best available)

**Routing Methods**:
- **Keyword** (87.5% accuracy): Pattern matching on task description
- **Semantic** (94.5% accuracy): Embedding-based similarity
- **PyTorch Neural** (optional): Trained model predictions

### 4. Self-Healing Systems

**9 Autonomous Daemons**:
- **Coordinator Daemon**: Routes tasks continuously
- **Worker Daemon**: Spawns and manages workers
- **PM Daemon**: Process management
- **Heartbeat Monitor**: Detects stuck workers
- **Zombie Cleanup**: Kills hung processes
- **Worker Restart**: Auto-restarts failed workers
- **Failure Pattern Detection**: Identifies systemic issues
- **Auto-Fix**: Automatic remediation
- **Dashboard Server**: Real-time metrics

**Health Monitoring**:
```bash
# Check daemon status
./scripts/daemon-control.sh status

# View health metrics
curl http://localhost:3000/api/health
```

## Data Flow

### Task Execution Flow

```
1. User/API → task-queue.json
2. Coordinator reads task-queue.json
3. MoE router determines best master
4. Master spawns worker(s)
5. Worker executes task
6. Worker updates worker-pool.json
7. Worker writes result
8. Coordinator marks task complete
9. Dashboard shows progress
```

### Token Budget Flow

```
1. Task starts → Estimate tokens needed
2. Check token-budget.json
3. If budget available → Allow task
4. Execute task → Track actual usage
5. Update token-budget.json
6. Daily reset at midnight
```

### Governance Enforcement Flow

```
1. Task submitted
2. Pre-flight validation:
   - Check token budget (hard limit at 95%)
   - Detect dangerous operations
   - Verify critical task approval
   - Check master-specific rules
3. If violations → Block and log to overrides.jsonl
4. If approved → Allow worker spawn
5. Audit trail maintained
```

## ML/AI Integration

### Semantic Routing (Optional)

Uses sentence transformers for embedding-based routing:

```
Task description → Embedding model →
  Cosine similarity with master embeddings →
    Highest similarity = Best master
```

**Configuration**:
```bash
SEMANTIC_ROUTING_ENABLED=true
SEMANTIC_CONFIDENCE_THRESHOLD=0.6
```

### PyTorch Routing (Experimental)

Trained neural network for task-to-master prediction:

```
Task features → PyTorch model →
  Softmax output → Master probabilities
```

**Status**: Requires training data from routing decisions

### RAG System (Optional)

Retrieval Augmented Generation for context-aware decisions:

```
Task → Query vector DB →
  Retrieve relevant code/docs →
    Augment LLM prompt → Better decisions
```

**Components**:
- FAISS vector store
- Sentence-transformers (all-MiniLM-L6-v2)
- Code chunking and indexing

## Observability

### Decision Explainability

Every routing decision is logged with full reasoning:

```json
{
  "task_id": "task-001",
  "decision": {
    "expert": "development",
    "confidence": 0.89,
    "keywords_matched": ["bug", "fix"],
    "reasoning_trail": [
      "Step 1: Keyword Analysis",
      "Step 2: Found 2 development keywords",
      "Step 3: Confidence scoring",
      "Step 4: Routed to development"
    ]
  }
}
```

**API**: `GET /api/decisions/:taskId/explain`

### ML Validation

A/B testing framework validates ML features:

```bash
# Run validation
./llm-mesh/validation/ml-validator.sh

# View results
curl http://localhost:3000/api/ml-validation
```

**Validates**:
- Semantic routing vs keyword routing accuracy
- RAG effectiveness (when instrumented)
- PyTorch prediction accuracy (when enabled)

## Performance Characteristics

### Token Efficiency

**Decomposition Savings**: 60-80% token reduction
- Instead of one large prompt, break into smaller worker tasks
- Workers only see relevant context
- Parallel execution reduces total time

### Worker Success Rate

**94% success rate** (from production metrics)
- Self-healing recovers from transient failures
- Retry logic with exponential backoff
- Zombie cleanup prevents hung processes

### Scaling Limits

**Current Scale**: ~20 repositories
- File-based coordination works well
- No performance issues at this scale

**Future Scale** (100+ repos):
- May need message queue (RabbitMQ, Redis)
- May need worker pooling
- May need distributed coordination

## Security

### API Authentication

Dashboard requires API key:
```bash
curl -H "x-api-key: your-key" http://localhost:3000/api/tasks
```

### Governance Controls

- Token budget limits prevent runaway costs
- Dangerous operation detection blocks risky commands
- Critical task approval requires human sign-off
- Full audit trail in overrides.jsonl

### Secrets Management

API keys stored in `.env` (gitignored):
```bash
ANTHROPIC_API_KEY=sk-ant-...
```

**Never** commit API keys to version control.

## Extensibility

### Adding a New Master

1. Create master script: `coordination/masters/your-master/main.sh`
2. Add routing patterns to `routing-patterns.json`
3. Update MoE router to include new master
4. Create worker types as needed

### Adding a New Worker Type

1. Create worker template: `scripts/lib/worker-templates/your-worker.sh`
2. Add spawn logic to `spawn-worker.sh`
3. Define worker capabilities
4. Test with sample task

### Adding ML Features

1. Enable in `.env`: `YOUR_FEATURE_ENABLED=true`
2. Implement feature logic
3. Add to ML validation config
4. Run A/B tests to validate
5. If validation passes, keep enabled
6. If validation fails, disable and simplify

## Debugging

### Common Issues

**Workers becoming zombies**:
- Check `coordination/worker-pool.json`
- Review worker logs in `agents/logs/workers/`
- Run zombie cleanup: `./scripts/lib/zombie-cleanup.sh`

**Routing decisions incorrect**:
- View decision reasoning: `GET /api/decisions/:taskId/explain`
- Check routing patterns: `coordination/masters/coordinator/knowledge-base/routing-patterns.json`
- Run ML validation to compare methods

**Token budget exceeded**:
- Check usage: `cat coordination/token-budget.json | jq`
- Review governance blocks: `cat coordination/governance/overrides.jsonl | jq`
- Adjust daily limit if needed

### Diagnostic Commands

```bash
# System health
./scripts/status-check.sh

# Worker status
./scripts/worker-status.sh

# Live monitoring
./scripts/system-live.sh

# Daemon logs
./scripts/daemon-control.sh logs

# Debug helper
./scripts/debug-helper.sh
```

## Design Decisions

### Why File-Based Instead of Database?

**Pros**:
- Simplicity: No DB to manage
- Observability: Can inspect with standard tools
- Version control: Full history in git
- Portability: Works anywhere with filesystem

**Cons**:
- Concurrent writes need locking
- Not suitable for 1000+ req/sec
- No complex queries

**Verdict**: Right choice for current scale (<100 repos)

### Why Bash + Node.js + Python?

**Bash**: System integration, process management, file operations
**Node.js**: Dashboard, API server, real-time updates
**Python**: ML features (PyTorch, transformers, FAISS)

Each language used for its strengths.

### Why LLM-Based Instead of Traditional Automation?

**Traditional automation** (CI/CD, scripts):
- Requires exact instructions
- Breaks on edge cases
- No learning or adaptation

**LLM-based automation** (Cortex):
- Handles ambiguity
- Adapts to new situations
- Learns from history
- Natural language interface

**Trade-off**: Higher cost (API tokens) vs higher capability

## References

- [MoE Pattern](https://arxiv.org/abs/1701.06538)
- [RAG Systems](https://arxiv.org/abs/2005.11401)
- [Semantic Routing](https://github.com/aurelio-labs/semantic-router)
