# Cortex Outstanding Implementation Items

**Last Updated**: 2025-11-27 (Updated with MLOps/LLMOps recommendations)
**Status**: Active - Consolidated from implementation reviews + MLOps fit analysis
**Scope**: Non-dashboard items + production-grade MLOps practices

---

## Executive Summary

This document consolidates outstanding implementation items from all previous implementation reviews. Items are organized by priority and category, excluding any dashboard-related work.

**Key Decisions**:
- ✅ Hybrid routing cascade COMPLETED (Weeks 1-4)
- ✅ PyTorch model TRAINED and operational
- ❌ NOT pursuing gateway/control plane at this time
- ❌ NOT pursuing dashboard implementations

---

## HIGH PRIORITY

### 1. MLOps/LLMOps Foundations (NEW - From Fit Analysis)

#### 1.1 Extract and Version System Prompts
**Status**: Not implemented
**Priority**: CRITICAL
**Effort**: 1-2 days
**Impact**: Foundation for prompt engineering and quality improvement
**Source**: LLMOps Practices

**Action**:
1. Create `coordination/prompts/` directory structure
2. Extract all system prompts from master/worker code
3. Convert to template format with variables
4. Version control in git
5. Track changes and measure impact

**Directory Structure**:
```
coordination/prompts/
├── masters/
│   ├── coordinator-master.md
│   ├── security-master.md
│   ├── development-master.md
│   ├── inventory-master.md
│   └── cicd-master.md
├── workers/
│   ├── implementation-worker.md
│   ├── scan-worker.md
│   ├── fix-worker.md
│   ├── test-worker.md
│   ├── security-fix-worker.md
│   ├── documentation-worker.md
│   └── analysis-worker.md
└── README.md  # Prompt versioning and A/B testing guide
```

**Benefits**:
- Enable A/B testing of prompt variations
- Track prompt quality over time
- Share best practices across agents
- Easier prompt optimization

---

#### 1.2 Implement Master Version Aliases
**Status**: Not implemented
**Priority**: CRITICAL
**Effort**: 2-3 days
**Impact**: Safe deployment of new master versions
**Source**: Model Serving patterns

**Action**:
1. Create version directories for each master
2. Implement alias system (Champion/Challenger/Shadow)
3. Update spawn scripts to read aliases
4. Enable canary deployments

**Directory Structure**:
```
coordination/masters/
├── security-master/
│   ├── v1.0.0/
│   ├── v1.1.0/
│   ├── v2.0.0/
│   └── aliases.json
│       {
│         "champion": "v1.1.0",
│         "challenger": "v2.0.0",
│         "shadow": null
│       }
└── [other masters follow same pattern]
```

**Benefits**:
- Safe rollback capability
- A/B testing of master versions
- Canary deployments
- Clear version history

---

#### 1.3 Create Task Lineage Tracking
**Status**: Not implemented
**Priority**: HIGH
**Effort**: 3-4 days
**Impact**: Observability and debugging
**Source**: Data Governance

**Action**:
1. Create lineage tracking system
2. Log task → worker → outcome relationships
3. Track data dependencies
4. Enable impact analysis

**Implementation**:
```
coordination/lineage/
└── task-lineage.jsonl
    {
      "task_id": "task-security-scan-001",
      "created_by": "coordinator-master",
      "created_at": "2025-11-27T10:00:00Z",
      "assigned_to": "security-master",
      "worker_spawned": "worker-scan-123",
      "worker_start": "2025-11-27T10:01:00Z",
      "worker_end": "2025-11-27T10:05:00Z",
      "input_data": ["coordination/repository-inventory.json"],
      "output_data": ["coordination/security/scan-results.json"],
      "dependencies": ["data/cve-database.json"],
      "consumed_by": ["coordination/dashboard-events.jsonl"],
      "status": "completed",
      "tokens_used": 8500,
      "outcome": "success"
    }
```

**Use Cases**:
- "What tasks touched this repository?"
- "Which workers contributed to this CVE fix?"
- "If I change task-queue format, what breaks?"
- Debug multi-step workflows

---

#### 1.4 Expand Monitoring Metrics
**Status**: Partial (Elastic APM exists)
**Priority**: HIGH
**Effort**: 1 week
**Impact**: Production quality insights
**Source**: Cross-cutting (all documents)

**Action**:
1. Define per-master performance metrics
2. Add token efficiency tracking
3. Implement business outcome metrics
4. Create metric dashboards (Elastic APM or file-based)

**Metrics to Add**:

**Per Master**:
- Task processing time (p50, p95, p99)
- Token usage per task
- Worker spawn success rate
- Task completion rate
- Error types and frequencies

**System-Wide**:
- Total tasks/hour
- Token budget burn rate
- Queue depth over time
- Master utilization %
- Cost per task

**Business Metrics**:
- CVEs fixed per day
- PRs created per day
- Repository coverage %
- Average time to fix

**Alerts**:
- Token budget < 20% remaining
- Worker spawn failures > 10%
- Task queue depth > 50
- Master response time > 5 minutes

---

### 2. Code Simplification & Cleanup

#### 1.1 Remove Old Dashboard Implementation
**Status**: Pending
**Effort**: 1 hour
**Impact**: Reduce confusion, remove ~2,000 lines of dead code

**Action**:
```bash
# Remove old HTML dashboard
rm -rf dashboard/public/
rm -rf dashboard/server/
# Keep only api-server/ for API functionality
```

**Files**:
- `dashboard/public/*` - Old frontend
- `dashboard/server/*` - Old dashboard server

---

#### 1.2 Consolidate or Remove Agent Studio Registry
**Status**: Decision needed
**Effort**: 4-8 hours
**Options**:

**Option A: Remove** (if not using)
```bash
rm -rf coordination/agentstudio/
rm -rf scripts/lib/agentstudio/
rm scripts/daemons/agent-lifecycle-daemon.sh
rm testing/unit/agent-registry.test.sh
rm -rf testing/integration/agentstudio/
```
**Space saved**: ~2,000 lines

**Option B: Activate** (integrate with worker spawning)
- Modify `scripts/spawn-worker.sh` to use registry
- Register existing worker types
- Enable lifecycle daemon
**Benefits**: Standardization, performance tracking, versioning

**Recommendation**: Remove if not actively using within 30 days

---

#### 1.3 Remove Unused Execution Managers
**Status**: Needs verification
**Effort**: 2 hours
**Action**:

```bash
# Check if execution managers are used
grep -r "execution-manager" coordination/task-queue.json

# If not found, remove
rm -rf coordination/execution-managers/
```

---

#### 1.4 Consolidate PM Daemon
**Status**: Pending
**Effort**: 4 hours
**Issue**: PM daemon overlaps with worker-daemon and heartbeat-monitor

**Action**:
- Merge PM daemon functionality into worker-daemon
- Remove `scripts/daemons/pm-daemon.sh`
- Update daemon-control.sh

---

### 2. System Quality & Observability

#### 2.1 Agent Ops Evaluation Framework
**Status**: Not implemented
**Priority**: HIGH
**Effort**: 1-2 weeks
**Impact**: Critical for measuring routing improvements

**Purpose**:
- Systematic evaluation of routing quality
- Regression prevention
- Data-driven routing decisions
- Golden dataset for validation

**Implementation**:
1. Create golden dataset from production logs (20-30 examples)
2. Implement LM-as-Judge evaluation script
3. Add to CI/CD for routing changes
4. Track accuracy over time

**Benefits**:
- Quantify routing accuracy
- Catch degradations before production
- Measure impact of improvements

**Dependencies**:
- ANTHROPIC_API_KEY for LM-as-Judge
- Historical routing decision logs

---

#### 2.2 Basic Distributed Tracing
**Status**: Not implemented
**Priority**: MEDIUM-HIGH
**Effort**: 1 week
**Impact**: Dramatically improves debugging

**Purpose**:
- Trace multi-agent workflows
- Correlate logs across workers
- Identify bottlenecks
- Debug failures

**Implementation**:
1. Add correlation ID to all tasks
2. Propagate ID across worker calls
3. Add ID to all log entries
4. Create trace viewer script (file-based, no Jaeger needed)

**Example**:
```bash
[task-001] [worker-implementation-042] Starting task
[task-001] [worker-implementation-042] Calling security scan
[task-001] [worker-scan-055] Received scan request
[task-001] [worker-scan-055] Scan complete
[task-001] [worker-implementation-042] Task complete
```

**Benefits**:
- 10x faster debugging
- Visualize execution flow
- Identify cascading failures

---

### 3. Validation & Monitoring

#### 3.1 Validate Hybrid Routing in Production
**Status**: Needs validation
**Priority**: HIGH
**Effort**: 2 weeks monitoring

**Action**:
1. Collect routing decisions for 2 weeks
2. Compare accuracy by layer:
   - Keyword vs Semantic vs RAG vs PyTorch
3. Measure latency impact
4. Validate exit early strategy effectiveness
5. Check clarification rate (<5% target)

**Metrics to track**:
- Routing accuracy by layer
- Average latency per layer
- P95/P99 latency
- Clarification rate
- Layer distribution (% of queries per layer)

**Decision points**:
- If semantic routing < keyword + 5% accuracy → Disable semantic
- If PyTorch < RAG + 5% accuracy → Fall back to RAG
- If overall latency > 100ms P95 → Optimize

---

#### 3.2 Add Routing Performance Tracking
**Status**: Partial (telemetry exists)
**Priority**: MEDIUM
**Effort**: 3 days

**Enhance**:
- Track success rate per routing method
- Track task completion vs routing decision
- Learn from failures (incorrect routes)
- Auto-tune confidence thresholds

---

## MEDIUM PRIORITY

### 4. MLOps/LLMOps Infrastructure (NEW - From Fit Analysis)

#### 4.1 Implement Dev/Staging/Prod Environments
**Status**: Not implemented
**Priority**: MEDIUM-HIGH
**Effort**: 1 week
**Impact**: Safe testing and deployment
**Source**: MLOps Architecture, Data Governance

**Action**:
1. Create environment-separated coordination files
2. Set CORTEX_ENV environment variable
3. Update masters to read from appropriate environment
4. Enable cross-environment access (dev can read prod)

**Directory Structure**:
```
coordination/
├── dev/
│   ├── task-queue.json
│   ├── worker-pool.json
│   ├── token-budget.json
│   └── repository-inventory.json
├── staging/
│   └── [same structure]
└── prod/
    └── [same structure]
```

**Workflow**:
1. Develop new masters in `dev` environment
2. Test against dev task queue
3. Promote to `staging` for integration tests
4. Deploy to `prod` after validation

**Benefits**:
- Safe testing of new agent logic
- No risk to production
- Formal promotion workflow
- Production data access from dev (read-only)

---

#### 4.2 Build Basic RAG System
**Status**: Not implemented
**Priority**: MEDIUM-HIGH
**Effort**: 2 weeks
**Impact**: Improved decision quality, reduced tokens
**Source**: LLMOps Practices

**Action**:
1. Choose vector database (FAISS for local, Pinecone for cloud)
2. Index historical task outcomes
3. Implement retrieval mechanism
4. Augment master prompts with retrieved context

**What to Index**:
- Past CVE remediations (security-master)
- Code patterns across repos (development-master)
- Successful task outcomes (all masters)
- Failure patterns and fixes (coordinator)
- Routing decision history (coordinator)

**RAG Workflow**:
```
1. Task arrives: "Fix CVE-2024-12345"
2. Query vector DB: "Similar CVE fixes?"
3. Retrieve top-3 past remediations
4. Augment prompt: "Based on how we fixed CVE-2024-99999..."
5. Master makes better informed decision
```

**Components**:
```
llm-mesh/rag/
├── vector-store/
│   ├── faiss-index/  # Local vector store
│   └── embeddings/   # Cached embeddings
├── indexer.sh        # Index coordination logs
├── retriever.sh      # Retrieve relevant contexts
└── config.json       # RAG configuration
```

**Benefits**:
- Masters learn from past successes
- Reduce token usage (targeted context)
- Better quality decisions
- Organizational memory

---

#### 4.3 Add Pre-Deployment Testing Framework
**Status**: Partial (unit tests exist)
**Priority**: MEDIUM
**Effort**: 1 week
**Impact**: Prevent production incidents
**Source**: Model Serving

**Action**:
1. Create deployment readiness checks
2. Add integration test suite
3. Implement load testing for masters
4. Define validation gates

**Test Categories**:

**Deployment Readiness**:
- Does new master parse coordination files?
- Are dependencies present?
- Do workers spawn successfully?
- Configuration valid?

**Integration Tests**:
- End-to-end: Task submitted → worker spawned → task completed
- Cross-master: Coordinator → Security Master → Worker
- Error handling: Worker failure → task reassignment

**Load Testing**:
- Can master handle 10 tasks in queue?
- Token usage under load?
- Does it recover from worker failures?
- Response time acceptable?

**Implementation**:
```
testing/
├── deployment-readiness/
│   └── test-master-deployment.sh
├── integration/
│   ├── test-task-workflow.sh
│   └── test-cross-master.sh
└── load/
    └── test-master-load.sh
```

---

#### 4.4 Formalize Evaluation Framework
**Status**: Not implemented (overlaps with existing 2.1)
**Priority**: MEDIUM
**Effort**: 1-2 weeks
**Impact**: Measure agent quality systematically
**Source**: LLMOps Practices

**Action**:
1. Create golden dataset of tasks and expected outcomes
2. Implement automated evaluation (LM-as-Judge)
3. Add human evaluation workflow
4. Track quality metrics over time

**Evaluation Types**:

**Offline Evaluation**:
- Golden dataset: 20-30 representative tasks
- Automated scoring: LM-as-Judge evaluates decisions
- Unit test style: Assert expected behavior

**Online Evaluation**:
- Implicit feedback: Task reassignment rate
- Explicit feedback: User accepts PR
- Business metrics: CVEs fixed, PRs merged

**Human Evaluation**:
- Weekly review of master decisions
- Quality score 1-5 for worker outputs
- Track improvement trends

**Metrics**:
- Routing accuracy (% correct master selection)
- Task completion rate
- Token efficiency (tokens per successful task)
- Quality score (1-5 scale)

**Implementation**:
```
evaluation/
├── golden-dataset/
│   ├── tasks.jsonl        # Test tasks
│   └── expected.jsonl     # Expected outcomes
├── automated/
│   ├── lm-judge.sh       # LLM-based evaluation
│   └── metric-tracker.sh # Track metrics
└── human/
    └── review-queue.json # Tasks for human review
```

---

### 5. Optional Enhancements

#### 4.1 Activate Agent Studio for Worker Spawning
**Status**: Optional
**Effort**: 1-2 days
**Benefits**: Standardization, templates, versioning

**Requirements**:
- Modify spawn-worker.sh to query registry
- Register existing worker types
- Enable lifecycle daemon

**Only do if**:
- Want standardized worker templates
- Need performance tracking
- Want worker versioning

---

#### 4.2 Optimize File I/O Performance
**Status**: Optional
**Effort**: 1 week
**Impact**: 2-3x faster file operations

**Actions**:
- Replace jq with compiled parser (ripgrep for reads)
- Add in-memory caching for routing patterns
- Optimize JSONL append operations
- Reduce file reads with caching layer

**Only needed if**:
- Hitting file I/O bottlenecks
- >100 concurrent workers
- File contention issues

---

### 5. Code Organization

#### 5.1 Consolidate Test Frameworks
**Status**: Pending
**Effort**: 4 hours
**Issue**: Tests scattered across multiple locations

**Current**:
- testing/unit/
- testing/integration/
- api-server/test/
- python-sdk/tests/

**Proposed**:
```
testing/
├── unit/           # All unit tests
├── integration/    # All integration tests
└── e2e/            # End-to-end tests
```

**Action**:
- Move api-server/test/* to testing/integration/
- Move python-sdk/tests/* to testing/unit/python/
- Update test runner scripts
- Update documentation

---

#### 5.2 Clean Up Unused Scripts
**Status**: Pending
**Effort**: 2 hours

**Action**:
```bash
# Find scripts not modified in 30 days
find scripts/ -name '*.sh' -mtime +30 -type f

# Review and remove unused scripts
# Document remaining scripts in scripts/README.md
```

---

## LOW PRIORITY

### 6. MLOps/LLMOps Long-Term (NEW - From Fit Analysis)

#### 6.1 Implement Deployment Patterns for Masters
**Status**: Not implemented
**Priority**: LOW (requires foundations first)
**Effort**: 2 weeks
**Impact**: Advanced deployment safety
**Source**: Model Serving

**Action**:
1. Implement A/B testing for master versions
2. Add canary deployment support
3. Implement shadow deployment mode
4. Create automated promotion logic

**Deployment Patterns**:

**A/B Testing**:
- Run two master versions simultaneously
- Split task queue 50/50
- Measure: success rate, token usage, time
- Promote better performer

**Canary Deployment**:
- Deploy new version to 5% of tasks
- Monitor closely
- Gradually increase to 100%
- Rollback if anomalies

**Shadow Deployment**:
- New version receives copy of all tasks
- Makes decisions but doesn't spawn workers
- Compare with production version
- Zero-risk validation

**Implementation**:
```
scripts/deployment/
├── ab-test-master.sh
├── canary-deploy.sh
├── shadow-deploy.sh
└── promote-master.sh
```

**Benefits**:
- Risk-free master upgrades
- Data-driven promotion decisions
- Safe experimentation
- Quick rollback

---

#### 6.2 Adopt Medallion Architecture for Coordination Data
**Status**: Not implemented
**Priority**: LOW
**Effort**: 1 week
**Impact**: Better data organization
**Source**: Data Governance

**Action**:
1. Reorganize coordination files into layers
2. Separate raw events from processed data
3. Create analytics layer for metrics

**Structure**:
```
coordination/
├── raw/              # Bronze - raw events
│   ├── github-events.jsonl
│   ├── worker-logs.jsonl
│   └── api-requests.jsonl
├── processed/        # Silver - structured
│   ├── task-queue.json
│   ├── worker-pool.json
│   └── token-budget.json
└── analytics/        # Gold - aggregated
    ├── daily-metrics.json
    ├── master-performance.json
    └── cost-analysis.json
```

**Benefits**:
- Clear data quality expectations
- Easier to reason about data flows
- Separation of concerns
- Better analytics support

---

#### 6.3 Fine-Tune Specialized Models
**Status**: Future consideration
**Priority**: LOW (after RAG proves value)
**Effort**: 4-6 weeks
**Impact**: Lower costs, better performance
**Source**: LLMOps Practices

**Action**:
1. Collect high-quality task outcome pairs (1000+)
2. Fine-tune small LLM for specific domains
3. Deploy fine-tuned model for routine tasks
4. Measure cost/performance improvement

**Candidates for Fine-Tuning**:
- **Security scanning**: Pattern recognition for CVEs
- **Code review**: Consistent review criteria
- **Documentation**: Standard doc generation

**Trade-offs**:
- Higher upfront cost (data collection, training)
- Lower inference cost (smaller model)
- Less flexible (requires retraining for changes)
- Better for stable, repetitive tasks

**Only pursue if**:
- RAG system is working well
- Have significant task volume
- Can afford training investment
- Tasks are sufficiently repetitive

---

#### 6.4 Build Asset Catalog and Discovery
**Status**: Not implemented
**Priority**: LOW
**Effort**: 1 week
**Impact**: Developer experience
**Source**: Data Governance

**Action**:
1. Create comprehensive catalog of coordination files
2. Add schema definitions
3. Document ownership and consumers
4. Enable automated validation

**Implementation**:
```
coordination/catalog.json
{
  "coordination_files": {
    "task-queue.json": {
      "description": "Pending tasks for master agents",
      "schema": "schemas/task-queue.schema.json",
      "owners": ["coordinator-master"],
      "consumers": ["all-masters"],
      "update_frequency": "real-time",
      "retention": "7 days"
    },
    "worker-pool.json": {
      "description": "Active worker status and health",
      "schema": "schemas/worker-pool.schema.json",
      "owners": ["all-masters"],
      "consumers": ["dashboard", "monitoring"],
      "update_frequency": "real-time",
      "retention": "7 days"
    }
  }
}
```

**Benefits**:
- New developers understand system quickly
- Automated schema validation
- Impact analysis: "What reads this file?"
- Better documentation

---

### 7. Nice to Have

#### 6.1 Improve Error Messages
**Status**: Ongoing
**Effort**: Continuous

**Goals**:
- More descriptive error messages
- Include remediation steps
- Link to documentation

---

#### 6.2 Add Performance Benchmarks
**Status**: Optional
**Effort**: 1 week

**Create**:
- Routing latency benchmarks
- Worker spawn time benchmarks
- End-to-end task completion benchmarks
- Track over time to catch regressions

---

## NOT PURSUING

### Items Explicitly Not Implementing

1. **Gateway/Control Plane** - File-based coordination is sufficient
2. **Agent Identity with SPIFFE** - Not needed for single-user system
3. **Full OpenTelemetry** - Basic tracing is sufficient
4. **Elastic APM Dashboards** - Not pursuing dashboards
5. **Multi-tenancy** - Single-user system
6. **REST API for External Tools** - Not needed currently

---

## Completed Items

### Recently Completed

1. ✅ **Hybrid Routing Cascade** - 5-layer routing system
2. ✅ **PyTorch Model Training** - Trained and operational
3. ✅ **Cold Start Handler** - Zero-shot routing for new agents
4. ✅ **Agent Studio Script** - Dynamic agent registration (for routing)
5. ✅ **Routing Cache** - LRU + similarity cache
6. ✅ **Batch Processing** - Batched embedding generation
7. ✅ **Empty Directory Cleanup** - 56 directories removed
8. ✅ **Old Worker Logs Cleanup** - >7 days removed

---

## Implementation Priority Order

### PHASE 1: MLOps Foundations (Weeks 1-2) - CRITICAL

**Week 1**:
1. ✅ Extract and version system prompts (1-2 days)
2. ✅ Implement master version aliases (2-3 days)
3. ✅ Create task lineage tracking (3-4 days)

**Week 2**:
4. ✅ Expand monitoring metrics (1 week)
5. ✅ Agent Ops evaluation framework (overlaps with formalize evaluation)

### PHASE 2: Quality & Observability (Weeks 3-4) - HIGH PRIORITY

**Week 3**:
6. ✅ Basic distributed tracing (existing item)
7. ✅ Validate hybrid routing in production (existing item)
8. ✅ Remove old dashboard (existing item)

**Week 4**:
9. ✅ Consolidate or remove Agent Studio registry (existing item)
10. ✅ Consolidate PM daemon (existing item)
11. ✅ Remove unused execution managers (existing item)

### PHASE 3: Infrastructure (Weeks 5-8) - MEDIUM PRIORITY

**Week 5-6**:
12. ✅ Implement dev/staging/prod environments (1 week)
13. ✅ Build basic RAG system (2 weeks)

**Week 7-8**:
14. ✅ Add pre-deployment testing framework (1 week)
15. ✅ Formalize evaluation framework (1-2 weeks)
16. ✅ Add routing performance tracking (3 days)

### PHASE 4: Code Organization (Weeks 9-10) - MEDIUM PRIORITY

**Week 9-10**:
17. ✅ Consolidate test frameworks (existing item)
18. ✅ Clean up unused scripts (existing item)

### PHASE 5: Optional/Long-Term (As Needed) - LOW PRIORITY

**Future Sprints**:
19. ⏸ Implement deployment patterns for masters (2 weeks)
20. ⏸ Adopt medallion architecture (1 week)
21. ⏸ Fine-tune specialized models (4-6 weeks)
22. ⏸ Build asset catalog and discovery (1 week)
23. ⏸ Activate Agent Studio for workers (existing item)
24. ⏸ Optimize file I/O (existing item)
25. ⏸ Add performance benchmarks (existing item)

---

## Decision Framework

**Implement if**:
- Improves system quality or debuggability
- Reduces technical debt
- Measurable benefit to routing accuracy
- Simplifies codebase

**Skip if**:
- Dashboard-related
- Adds significant complexity
- Benefit unclear or unproven
- Not actively needed

---

## Next Actions

**PHASE 1: MLOps Foundations (Start Immediately)**

**Week 1** (Days 1-5):
1. Extract all system prompts to coordination/prompts/
2. Implement master version aliases system
3. Begin lineage tracking implementation

**Week 2** (Days 6-10):
4. Complete lineage tracking
5. Expand monitoring metrics (Elastic APM + file-based)
6. Create golden dataset for evaluation

**PHASE 2: Quality & Observability (Weeks 3-4)**

**Week 3**:
7. Implement distributed tracing with correlation IDs
8. Continue validating hybrid routing
9. Remove old dashboard directory

**Week 4**:
10. Agent Studio decision (remove or activate)
11. Consolidate PM daemon
12. Remove unused execution managers

**PHASE 3: Infrastructure (Weeks 5-8)**

**Weeks 5-6**:
13. Implement dev/staging/prod environment separation
14. Build and deploy RAG system (2-week effort)

**Weeks 7-8**:
15. Add pre-deployment testing framework
16. Formalize evaluation with LM-as-Judge
17. Add routing performance tracking

**PHASE 4+: Ongoing**

**As Capacity Allows**:
- Code organization and cleanup
- Long-term enhancements (deployment patterns, fine-tuning)
- Performance optimization

---

## Summary

**Total Outstanding Items**: 26 (12 new from MLOps/LLMOps analysis)
- **CRITICAL (Phase 1)**: 5 items (MLOps foundations)
- **HIGH (Phase 2)**: 6 items (Quality & observability)
- **MEDIUM (Phases 3-4)**: 11 items (Infrastructure & organization)
- **LOW (Phase 5)**: 4 items (Long-term enhancements)
- **NOT PURSUING**: 6 items explicitly excluded

**Estimated Effort**: 10-12 weeks for all phases
- Phase 1 (Critical): 2 weeks
- Phase 2 (High): 2 weeks
- Phase 3 (Medium): 4 weeks
- Phase 4 (Medium): 2 weeks
- Phase 5 (Optional): As needed

**Key Focus**:
1. **NEW**: MLOps/LLMOps foundations (prompts, versioning, lineage, monitoring)
2. Quality, simplification, validation
3. Infrastructure for production-grade operations
4. Long-term: Advanced deployment patterns and optimization

---

**Last Reviewed**: 2025-11-27
**Next Review**: After 2 weeks of production validation
