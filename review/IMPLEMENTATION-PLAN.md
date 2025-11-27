# Cortex MLOps Implementation Plan

**Created**: 2025-11-27
**Duration**: 10-12 weeks (5 phases)
**Scope**: Transform Cortex from research prototype to production-grade autonomous agent platform

---

## Executive Summary

This plan implements enterprise MLOps/LLMOps practices adapted from "The Big Book of MLOps - 2nd Edition" for Cortex's multi-agent architecture. The focus is on foundations first (prompts, versioning, observability) before advanced features (RAG, deployment patterns).

### Success Criteria

**By End of Phase 1** (Week 2):
- ✅ All system prompts extracted and versioned
- ✅ Master version aliases enable safe deployments
- ✅ Lineage tracking provides complete observability
- ✅ Monitoring dashboards show per-master metrics

**By End of Phase 3** (Week 8):
- ✅ Dev/staging/prod environments operational
- ✅ RAG system improves decision quality
- ✅ Pre-deployment testing prevents incidents
- ✅ Evaluation framework measures quality

**By End of All Phases** (Week 12):
- ✅ Production-ready MLOps infrastructure
- ✅ Systematic quality improvement process
- ✅ Safe deployment and rollback capabilities
- ✅ Data-driven decision making

---

## Phase 1: MLOps Foundations (Weeks 1-2)

**Goal**: Establish critical infrastructure for prompt engineering, versioning, and observability

### Week 1: Prompts & Versioning

#### Day 1-2: Extract and Version System Prompts

**Objective**: Create foundation for prompt engineering

**Steps**:

1. **Create directory structure**:
```bash
mkdir -p coordination/prompts/masters
mkdir -p coordination/prompts/workers
```

2. **Extract master prompts**:
```bash
# For each master (coordinator, security, development, inventory, cicd)
# Find system prompt in codebase
grep -r "system_prompt\|SYSTEM_PROMPT" scripts/run-*-master.sh

# Create template file
cat > coordination/prompts/masters/coordinator-master.md <<'EOF'
# Coordinator Master System Prompt

## Role
You are the Coordinator Master agent in the Cortex multi-agent system...

## Responsibilities
- Route incoming tasks to appropriate specialist masters
- Manage token budget allocation
- Monitor system health

## Context Variables
- {{task_description}} - The incoming task
- {{available_masters}} - List of available masters
- {{token_budget}} - Current token budget status

## Instructions
[Extract existing prompt text here]
EOF
```

3. **Extract worker prompts** (repeat for all 7 worker types)

4. **Update spawn scripts to use templates**:
```bash
# Modify scripts/spawn-worker.sh
PROMPT_TEMPLATE="coordination/prompts/workers/${WORKER_TYPE}.md"
PROMPT=$(cat "$PROMPT_TEMPLATE" | envsubst)
```

5. **Create README**:
```bash
cat > coordination/prompts/README.md <<'EOF'
# Cortex System Prompts

## Versioning
- All prompts tracked in git
- Changes require PR review
- A/B testing documented in `/testing/prompts/`

## Variables
Use {{variable_name}} syntax for dynamic content

## Testing
Before merging prompt changes:
1. Test on 5-10 sample tasks
2. Compare quality scores
3. Measure token usage
EOF
```

**Deliverables**:
- [ ] coordination/prompts/ directory with all 12 prompt files
- [ ] Spawn scripts updated to use templates
- [ ] Git commit with initial prompt extraction
- [ ] README with versioning guidelines

**Success Metrics**:
- All prompts externalized
- Zero hardcoded prompts in shell scripts
- Can modify prompts without code changes

---

#### Day 3-5: Implement Master Version Aliases

**Objective**: Enable safe deployment and rollback of master versions

**Steps**:

1. **Create version directory structure**:
```bash
mkdir -p coordination/masters/coordinator-master
mkdir -p coordination/masters/security-master
mkdir -p coordination/masters/development-master
mkdir -p coordination/masters/inventory-master
mkdir -p coordination/masters/cicd-master
```

2. **Move current implementations to v1.0.0**:
```bash
# For each master
mkdir -p coordination/masters/coordinator-master/v1.0.0
# Copy current implementation files
```

3. **Create alias system**:
```bash
cat > coordination/masters/coordinator-master/aliases.json <<'EOF'
{
  "champion": "v1.0.0",
  "challenger": null,
  "shadow": null,
  "description": "Champion serves 100% of production traffic",
  "last_updated": "2025-11-27T10:00:00Z",
  "updated_by": "system"
}
EOF
```

4. **Create alias reader function**:
```bash
cat > scripts/lib/read-alias.sh <<'EOF'
#!/bin/bash
# Usage: read_alias "security-master" "champion"

get_master_version() {
    local master_name="$1"
    local alias_name="${2:-champion}"
    local aliases_file="coordination/masters/$master_name/aliases.json"

    jq -r ".$alias_name // \"v1.0.0\"" "$aliases_file"
}
EOF
```

5. **Update spawn scripts**:
```bash
# In scripts/run-coordinator-master.sh
VERSION=$(get_master_version "coordinator-master" "champion")
MASTER_DIR="coordination/masters/coordinator-master/$VERSION"
```

6. **Create promotion script**:
```bash
cat > scripts/promote-master.sh <<'EOF'
#!/bin/bash
# Promote challenger to champion

MASTER="$1"
if [ -z "$MASTER" ]; then
    echo "Usage: $0 <master-name>"
    exit 1
fi

ALIASES_FILE="coordination/masters/$MASTER/aliases.json"
CHALLENGER=$(jq -r '.challenger' "$ALIASES_FILE")

if [ "$CHALLENGER" = "null" ]; then
    echo "No challenger set for $MASTER"
    exit 1
fi

# Backup current champion
OLD_CHAMPION=$(jq -r '.champion' "$ALIASES_FILE")

# Promote
jq ".champion = \"$CHALLENGER\" | .challenger = null" "$ALIASES_FILE" > tmp.json
mv tmp.json "$ALIASES_FILE"

echo "Promoted $CHALLENGER to champion for $MASTER"
echo "Previous champion: $OLD_CHAMPION"
EOF

chmod +x scripts/promote-master.sh
```

**Deliverables**:
- [ ] Version directories for all 5 masters
- [ ] aliases.json for each master
- [ ] read-alias.sh library function
- [ ] promote-master.sh script
- [ ] Updated spawn scripts use aliases

**Success Metrics**:
- Can deploy new version as challenger
- Can promote challenger to champion
- Can rollback by updating alias
- Zero downtime during version changes

---

### Week 2: Lineage & Monitoring

#### Day 6-8: Create Task Lineage Tracking

**Objective**: Track complete task lifecycle for debugging and analysis

**Steps**:

1. **Create lineage directory**:
```bash
mkdir -p coordination/lineage
```

2. **Define lineage schema**:
```bash
cat > coordination/schemas/task-lineage.schema.json <<'EOF'
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["task_id", "created_by", "created_at"],
  "properties": {
    "task_id": {"type": "string"},
    "created_by": {"type": "string"},
    "created_at": {"type": "string", "format": "date-time"},
    "assigned_to": {"type": "string"},
    "worker_spawned": {"type": "string"},
    "worker_start": {"type": "string", "format": "date-time"},
    "worker_end": {"type": "string", "format": "date-time"},
    "input_data": {"type": "array", "items": {"type": "string"}},
    "output_data": {"type": "array", "items": {"type": "string"}},
    "dependencies": {"type": "array", "items": {"type": "string"}},
    "consumed_by": {"type": "array", "items": {"type": "string"}},
    "status": {"enum": ["created", "assigned", "running", "completed", "failed"]},
    "tokens_used": {"type": "number"},
    "outcome": {"enum": ["success", "failure", "timeout", "cancelled"]}
  }
}
EOF
```

3. **Create lineage logging function**:
```bash
cat > scripts/lib/lineage.sh <<'EOF'
#!/bin/bash
# Lineage tracking functions

log_task_created() {
    local task_id="$1"
    local created_by="$2"

    jq -n \
        --arg tid "$task_id" \
        --arg by "$created_by" \
        --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        '{
            task_id: $tid,
            created_by: $by,
            created_at: $ts,
            status: "created"
        }' >> coordination/lineage/task-lineage.jsonl
}

log_task_assigned() {
    local task_id="$1"
    local assigned_to="$2"

    # Append to existing lineage entry
    # (Implementation details...)
}

# Additional functions for worker_spawned, completed, etc.
EOF
```

4. **Integrate lineage logging**:
```bash
# In coordinator-master
source scripts/lib/lineage.sh
log_task_created "$TASK_ID" "coordinator-master"

# In security-master
log_task_assigned "$TASK_ID" "security-master"
log_worker_spawned "$TASK_ID" "$WORKER_ID"

# In worker completion
log_task_completed "$TASK_ID" "success" "$TOKENS_USED"
```

5. **Create lineage query tools**:
```bash
cat > scripts/query-lineage.sh <<'EOF'
#!/bin/bash
# Query lineage for debugging

case "$1" in
    task)
        # Show complete lineage for a task
        jq "select(.task_id == \"$2\")" coordination/lineage/task-lineage.jsonl
        ;;
    worker)
        # Find all tasks handled by worker
        jq "select(.worker_spawned == \"$2\")" coordination/lineage/task-lineage.jsonl
        ;;
    master)
        # Find all tasks assigned to master
        jq "select(.assigned_to == \"$2\")" coordination/lineage/task-lineage.jsonl
        ;;
    impact)
        # Show what consumed output of a task
        jq "select(.task_id == \"$2\") | .consumed_by[]" coordination/lineage/task-lineage.jsonl
        ;;
esac
EOF

chmod +x scripts/query-lineage.sh
```

**Deliverables**:
- [ ] coordination/lineage/ directory
- [ ] task-lineage.schema.json
- [ ] lineage.sh library functions
- [ ] Lineage logging in all masters/workers
- [ ] query-lineage.sh tool

**Success Metrics**:
- Can trace any task from creation to completion
- Can find all tasks that touched a file
- Can identify impact of coordination file changes
- Lineage queries run in <1 second

---

#### Day 9-10: Expand Monitoring Metrics

**Objective**: Comprehensive observability for production operations

**Steps**:

1. **Define metric collection points**:
```bash
mkdir -p coordination/metrics
```

2. **Create per-master metric collectors**:
```bash
cat > scripts/lib/metrics.sh <<'EOF'
#!/bin/bash
# Metric collection functions

emit_master_metric() {
    local master_name="$1"
    local metric_name="$2"
    local metric_value="$3"
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    jq -n \
        --arg master "$master_name" \
        --arg metric "$metric_name" \
        --arg value "$metric_value" \
        --arg ts "$timestamp" \
        '{
            master: $master,
            metric: $metric,
            value: ($value | tonumber),
            timestamp: $ts
        }' >> "coordination/metrics/$master_name-metrics.jsonl"
}

# Specific metrics
emit_task_processing_time() {
    local master="$1"
    local duration="$2"
    emit_master_metric "$master" "task_processing_time_ms" "$duration"
}

emit_token_usage() {
    local master="$1"
    local tokens="$2"
    emit_master_metric "$master" "tokens_used" "$tokens"
}

emit_worker_spawn_result() {
    local master="$1"
    local success="$2"  # 0 or 1
    emit_master_metric "$master" "worker_spawn_success" "$success"
}
EOF
```

3. **Integrate metric collection**:
```bash
# In each master
source scripts/lib/metrics.sh

START_TIME=$(date +%s%3N)
# ... process task ...
END_TIME=$(date +%s%3N)
DURATION=$((END_TIME - START_TIME))

emit_task_processing_time "security-master" "$DURATION"
emit_token_usage "security-master" "$TOKENS_USED"
```

4. **Create metric aggregation script**:
```bash
cat > scripts/aggregate-metrics.sh <<'EOF'
#!/bin/bash
# Aggregate metrics into daily summaries

DATE=${1:-$(date +%Y-%m-%d)}

for master in coordinator security development inventory cicd; do
    METRICS_FILE="coordination/metrics/${master}-master-metrics.jsonl"

    if [ ! -f "$METRICS_FILE" ]; then
        continue
    fi

    # Calculate aggregates
    jq -s --arg date "$DATE" '
        map(select(.timestamp | startswith($date))) |
        group_by(.metric) |
        map({
            metric: .[0].metric,
            count: length,
            sum: (map(.value) | add),
            avg: (map(.value) | add / length),
            min: (map(.value) | min),
            max: (map(.value) | max),
            p50: (map(.value) | sort | .[length/2]),
            p95: (map(.value) | sort | .[length*95/100]),
            p99: (map(.value) | sort | .[length*99/100])
        })
    ' "$METRICS_FILE" > "coordination/metrics/${master}-master-${DATE}.json"
done
EOF

chmod +x scripts/aggregate-metrics.sh
```

5. **Create metric dashboard (file-based)**:
```bash
cat > scripts/show-metrics.sh <<'EOF'
#!/bin/bash
# Display recent metrics

echo "=== CORTEX METRICS DASHBOARD ==="
echo "Date: $(date)"
echo ""

for master in coordinator security development inventory cicd; do
    echo "=== $master-master ==="

    # Last 10 minutes of metrics
    CUTOFF=$(date -u -v-10M +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%SZ)

    # Task processing time (p50, p95)
    echo "Task Processing Time:"
    jq -s --arg cutoff "$CUTOFF" '
        map(select(.timestamp > $cutoff and .metric == "task_processing_time_ms")) |
        if length > 0 then
            {
                count: length,
                p50: (map(.value) | sort | .[length/2]),
                p95: (map(.value) | sort | .[length*95/100])
            }
        else
            "No data"
        end
    ' "coordination/metrics/${master}-master-metrics.jsonl" 2>/dev/null || echo "No metrics file"

    echo ""
done
EOF

chmod +x scripts/show-metrics.sh
```

6. **Set up alerts**:
```bash
cat > scripts/check-alerts.sh <<'EOF'
#!/bin/bash
# Check for alert conditions

# Token budget < 20%
BUDGET=$(jq '.tokens_remaining / .daily_budget' coordination/token-budget.json)
if (( $(echo "$BUDGET < 0.2" | bc -l) )); then
    echo "ALERT: Token budget low: ${BUDGET}%"
fi

# Worker spawn failures > 10%
SPAWN_SUCCESS=$(jq -s '
    map(select(.metric == "worker_spawn_success" and .timestamp > now - 3600)) |
    if length > 0 then
        (map(.value) | add / length)
    else
        1
    end
' coordination/metrics/*-metrics.jsonl)

if (( $(echo "$SPAWN_SUCCESS < 0.9" | bc -l) )); then
    echo "ALERT: Worker spawn success rate low: ${SPAWN_SUCCESS}"
fi

# Queue depth > 50
QUEUE_DEPTH=$(jq 'length' coordination/task-queue.json)
if [ "$QUEUE_DEPTH" -gt 50 ]; then
    echo "ALERT: Task queue depth high: $QUEUE_DEPTH"
fi
EOF

chmod +x scripts/check-alerts.sh

# Add to cron
crontab -l | { cat; echo "*/5 * * * * /path/to/cortex/scripts/check-alerts.sh"; } | crontab -
```

**Deliverables**:
- [ ] coordination/metrics/ directory
- [ ] metrics.sh library functions
- [ ] Metric emission in all masters
- [ ] aggregate-metrics.sh script
- [ ] show-metrics.sh dashboard
- [ ] check-alerts.sh monitoring

**Success Metrics**:
- Per-master metrics collected every task
- Can view p50/p95/p99 latencies
- Alerts fire on threshold violations
- Historical data retained for 30 days

---

## Phase 2: Quality & Observability (Weeks 3-4)

**Goal**: Improve debugging and validate existing systems

### Week 3: Tracing & Validation

#### Day 11-13: Implement Distributed Tracing

**Objective**: Trace multi-step workflows across masters and workers

**Steps**:

1. **Add correlation ID to tasks**:
```bash
# When creating task
CORRELATION_ID="corr-$(date +%s)-$$"

jq --arg cid "$CORRELATION_ID" '. + {correlation_id: $cid}' task.json
```

2. **Propagate correlation ID**:
```bash
# In all log statements
log_with_correlation() {
    local message="$1"
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [$CORRELATION_ID] [$COMPONENT] $message"
}
```

3. **Create trace aggregator**:
```bash
cat > scripts/show-trace.sh <<'EOF'
#!/bin/bash
# Show complete trace for a correlation ID

CORRELATION_ID="$1"

echo "=== TRACE: $CORRELATION_ID ==="

# Collect from all log sources
grep "$CORRELATION_ID" coordination/logs/*.log | sort
grep "$CORRELATION_ID" coordination/lineage/task-lineage.jsonl
grep "$CORRELATION_ID" coordination/metrics/*-metrics.jsonl

echo ""
echo "=== TIMELINE ==="
grep "$CORRELATION_ID" coordination/logs/*.log | \
    awk -F'[][]' '{print $2, $4, $6}' | \
    sort
EOF

chmod +x scripts/show-trace.sh
```

**Deliverables**:
- [ ] Correlation IDs in all tasks
- [ ] Logging with correlation context
- [ ] show-trace.sh tool
- [ ] Trace visualization in dashboard

**Success Metrics**:
- Can trace any task end-to-end
- Average trace has 5-10 log entries
- Traces help debug failures in <5 minutes

---

#### Day 14-15: Validation & Cleanup

**Objective**: Validate hybrid routing and clean up dead code

**Steps**:

1. **Validate routing for 2 weeks** (ongoing from Phase 1)
2. **Remove old dashboard**:
```bash
rm -rf dashboard/public/
rm -rf dashboard/server/
git commit -m "Remove old dashboard implementation"
```

3. **Document findings**:
```bash
cat > docs/ROUTING-VALIDATION-RESULTS.md <<'EOF'
# Hybrid Routing Validation Results

## Period
2025-11-20 to 2025-12-04

## Results
...
EOF
```

**Deliverables**:
- [ ] Old dashboard removed
- [ ] Routing validation report
- [ ] Decision on next routing improvements

---

### Week 4: Consolidation

#### Day 16-20: Code Consolidation

**Objective**: Clean up overlapping systems and decide on Agent Studio

**Tasks**:

1. **Agent Studio Decision**:
   - [ ] Evaluate current usage
   - [ ] Remove if unused OR activate if valuable
   - [ ] Document decision

2. **Consolidate PM Daemon**:
   - [ ] Merge functionality into worker-daemon
   - [ ] Remove pm-daemon.sh
   - [ ] Update daemon-control.sh

3. **Remove Unused Execution Managers**:
   - [ ] Verify not in use
   - [ ] Remove coordination/execution-managers/

**Deliverables**:
- [ ] 2,000+ lines of code removed
- [ ] Simplified daemon architecture
- [ ] Updated documentation

---

## Phase 3: Infrastructure (Weeks 5-8)

**Goal**: Build production-ready infrastructure (environments, RAG, testing)

### Week 5-6: Environments & RAG

#### Week 5: Dev/Staging/Prod Environments

**Steps**:

1. **Create directory structure**:
```bash
mkdir -p coordination/dev coordination/staging coordination/prod

# Copy current files to prod
cp coordination/task-queue.json coordination/prod/
cp coordination/worker-pool.json coordination/prod/
# ... etc
```

2. **Add CORTEX_ENV variable**:
```bash
export CORTEX_ENV=${CORTEX_ENV:-prod}

# In masters
TASK_QUEUE="coordination/$CORTEX_ENV/task-queue.json"
```

3. **Cross-environment access**:
```bash
# Dev can read from prod (read-only)
if [ "$CORTEX_ENV" = "dev" ]; then
    PROD_DATA="coordination/prod/repository-inventory.json"
    # Read but don't write
fi
```

**Deliverables**:
- [ ] Three-environment structure
- [ ] CORTEX_ENV variable support
- [ ] Cross-environment read access
- [ ] Documentation on promotion workflow

---

#### Week 6: Build RAG System

**Objective**: Add organizational memory to improve decisions

**Steps**:

1. **Choose vector database** (FAISS for simplicity):
```bash
pip install faiss-cpu sentence-transformers
```

2. **Create RAG infrastructure**:
```bash
mkdir -p llm-mesh/rag/{vector-store,embeddings}
```

3. **Implement indexer**:
```python
# llm-mesh/rag/indexer.py
from sentence_transformers import SentenceTransformer
import faiss
import json

model = SentenceTransformer('all-MiniLM-L6-v2')

# Index past task outcomes
with open('coordination/lineage/task-lineage.jsonl') as f:
    outcomes = [json.loads(line) for line in f]

# Create embeddings
texts = [f"{o['task_id']}: {o.get('description', '')}" for o in outcomes]
embeddings = model.encode(texts)

# Build FAISS index
index = faiss.IndexFlatL2(embeddings.shape[1])
index.add(embeddings)

# Save
faiss.write_index(index, 'llm-mesh/rag/vector-store/outcomes.index')
```

4. **Implement retriever**:
```python
# llm-mesh/rag/retriever.py
def retrieve_similar(query, k=3):
    model = SentenceTransformer('all-MiniLM-L6-v2')
    index = faiss.read_index('llm-mesh/rag/vector-store/outcomes.index')

    query_embedding = model.encode([query])
    distances, indices = index.search(query_embedding, k)

    # Load corresponding outcomes
    # Return top-k similar past outcomes
```

5. **Integrate with masters**:
```bash
# In security-master
SIMILAR_FIXES=$(python llm-mesh/rag/retriever.py --query "Fix CVE-2024-12345" --k 3)

# Augment prompt
AUGMENTED_PROMPT="Based on these similar past fixes:\n$SIMILAR_FIXES\n\nNow fix CVE-2024-12345..."
```

**Deliverables**:
- [ ] FAISS-based vector store
- [ ] Indexer for task outcomes
- [ ] Retriever integrated with masters
- [ ] Measurable improvement in decision quality

**Success Metrics**:
- RAG retrieval adds <500ms latency
- Retrieved examples are relevant (human eval)
- Task completion rate improves by 5-10%

---

### Week 7-8: Testing & Evaluation

#### Week 7: Pre-Deployment Testing

**Objective**: Prevent production incidents with systematic testing

**Steps**:

1. **Deployment readiness checks**:
```bash
cat > testing/deployment-readiness/test-master-deployment.sh <<'EOF'
#!/bin/bash
# Test that new master can deploy

MASTER="$1"
VERSION="$2"

# Can it parse coordination files?
$MASTER --dry-run || { echo "FAIL: Cannot parse coordination files"; exit 1; }

# Dependencies present?
check_dependencies || { echo "FAIL: Missing dependencies"; exit 1; }

# Workers spawn?
test_worker_spawn || { echo "FAIL: Worker spawn failed"; exit 1; }

echo "PASS: $MASTER $VERSION ready for deployment"
EOF
```

2. **Integration tests**:
```bash
cat > testing/integration/test-task-workflow.sh <<'EOF'
#!/bin/bash
# End-to-end task workflow test

# Submit task
TASK_ID=$(submit_test_task "Scan test-repo for CVEs")

# Wait for completion
wait_for_task "$TASK_ID" 300 || { echo "FAIL: Task timeout"; exit 1; }

# Verify outcome
verify_task_outcome "$TASK_ID" || { echo "FAIL: Bad outcome"; exit 1; }

echo "PASS: Task workflow"
EOF
```

3. **Load testing**:
```bash
cat > testing/load/test-master-load.sh <<'EOF'
#!/bin/bash
# Load test master

MASTER="$1"

# Submit 10 tasks simultaneously
for i in {1..10}; do
    submit_task "Test task $i" &
done
wait

# Check all completed
verify_all_completed || { echo "FAIL: Some tasks failed"; exit 1; }

# Check response times
check_response_times || { echo "FAIL: High latency"; exit 1; }

echo "PASS: Load test"
EOF
```

**Deliverables**:
- [ ] Deployment readiness test suite
- [ ] Integration test suite
- [ ] Load test suite
- [ ] CI integration (run tests on PR)

---

#### Week 8: Formalize Evaluation

**Objective**: Systematic quality measurement

**Steps**:

1. **Create golden dataset**:
```bash
mkdir -p evaluation/golden-dataset

# Collect 20-30 representative tasks
cat > evaluation/golden-dataset/tasks.jsonl <<'EOF'
{"task_id": "golden-001", "description": "Scan cortex for CVE-2024-12345", "expected_master": "security-master"}
{"task_id": "golden-002", "description": "Implement user authentication", "expected_master": "development-master"}
...
EOF
```

2. **Implement LM-as-Judge**:
```python
# evaluation/automated/lm-judge.py
import anthropic

def evaluate_decision(task, actual_master, expected_master):
    """Use Claude to judge if routing was correct"""

    client = anthropic.Client()

    prompt = f"""
    Task: {task['description']}
    Expected master: {expected_master}
    Actual master: {actual_master}

    Is this routing decision correct? Answer YES or NO and explain.
    """

    response = client.messages.create(
        model="claude-3-haiku-20240307",
        max_tokens=100,
        messages=[{"role": "user", "content": prompt}]
    )

    return response.content[0].text
```

3. **Run automated evaluation**:
```bash
cat > evaluation/automated/run-evaluation.sh <<'EOF'
#!/bin/bash
# Run evaluation on golden dataset

python evaluation/automated/lm-judge.py \
    --golden-set evaluation/golden-dataset/tasks.jsonl \
    --output evaluation/results/$(date +%Y-%m-%d).json

# Calculate accuracy
jq -s 'map(select(.correct)) | length' evaluation/results/*.json
EOF
```

**Deliverables**:
- [ ] Golden dataset (20-30 tasks)
- [ ] LM-as-Judge evaluator
- [ ] Automated evaluation script
- [ ] Weekly evaluation reports

**Success Metrics**:
- Routing accuracy > 90% on golden set
- Evaluation runs in <5 minutes
- Results tracked over time

---

## Phase 4: Code Organization (Weeks 9-10)

**Goal**: Clean up technical debt and improve maintainability

### Week 9-10: Consolidation & Cleanup

**Tasks**:

1. **Consolidate test frameworks**:
   - [ ] Move api-server/test/ to testing/integration/
   - [ ] Move python-sdk/tests/ to testing/unit/python/
   - [ ] Update test runners
   - [ ] Update documentation

2. **Clean up unused scripts**:
   - [ ] Find scripts not modified in 30 days
   - [ ] Review and remove
   - [ ] Document remaining scripts

3. **Update documentation**:
   - [ ] Document new MLOps infrastructure
   - [ ] Update architecture diagrams
   - [ ] Create runbooks for common tasks

**Deliverables**:
- [ ] Unified test structure
- [ ] Cleaned up scripts/
- [ ] Comprehensive documentation

---

## Phase 5: Optional/Long-Term (As Needed)

**Goal**: Advanced deployment patterns and optimizations

### Advanced Deployment Patterns (2 weeks)

**Implement when**:
- Frequently deploying new master versions
- Need zero-downtime upgrades
- Want automated promotion decisions

**Features**:
- A/B testing framework
- Canary deployment automation
- Shadow deployment mode
- Automated promotion logic

---

### Medallion Architecture (1 week)

**Implement when**:
- Coordination data becomes complex
- Need clear data quality tiers
- Want better analytics support

**Structure**:
- Bronze: Raw events
- Silver: Processed coordination files
- Gold: Aggregated analytics

---

### Fine-Tuning (4-6 weeks)

**Implement when**:
- Have 1000+ high-quality task outcomes
- RAG system is working well
- Task volume justifies investment
- Tasks are sufficiently repetitive

**Process**:
1. Collect training data
2. Fine-tune small LLM
3. Deploy and measure
4. Compare cost/performance

---

### Asset Catalog (1 week)

**Implement when**:
- Onboarding new developers
- Need schema validation
- Want impact analysis

**Features**:
- Comprehensive file catalog
- Schema definitions
- Ownership documentation
- Automated validation

---

## Success Metrics & Tracking

### Phase 1 Success Criteria

- [ ] All prompts externalized and versioned
- [ ] Master aliases enable safe deployment
- [ ] Complete task lineage tracked
- [ ] Per-master metrics collected

### Phase 2 Success Criteria

- [ ] Distributed tracing operational
- [ ] Routing accuracy measured
- [ ] Dead code removed
- [ ] Daemon architecture simplified

### Phase 3 Success Criteria

- [ ] Dev/staging/prod environments working
- [ ] RAG improves decision quality by 5-10%
- [ ] Pre-deployment tests prevent incidents
- [ ] Evaluation framework measures quality

### Phase 4 Success Criteria

- [ ] Unified test structure
- [ ] Cleaned codebase
- [ ] Comprehensive documentation

### Overall Success

**By End of Implementation** (Week 12):

**Quantitative**:
- Routing accuracy > 90%
- Task completion rate > 95%
- Token efficiency improved by 20%
- Deployment incidents reduced by 80%

**Qualitative**:
- Can safely deploy new masters
- Can trace any task end-to-end
- Can measure quality systematically
- Have production-grade infrastructure

---

## Risk Mitigation

### Risks

1. **Over-engineering** - Adding too much complexity
   - Mitigation: Implement lightest-weight versions, validate value

2. **Disruption to existing work** - Breaking current functionality
   - Mitigation: Incremental changes, maintain backward compatibility

3. **Time overruns** - Tasks take longer than estimated
   - Mitigation: Phased approach, can stop after any phase

4. **Low value** - Features don't provide expected benefit
   - Mitigation: Measure before/after, can skip optional phases

### Contingencies

**If Phase 1 takes too long**:
- Focus on prompts and versioning only
- Defer lineage and monitoring to Phase 2

**If RAG doesn't improve quality**:
- Skip fine-tuning (Phase 5)
- Focus on evaluation and testing instead

**If resources constrained**:
- Complete Phase 1 only (critical foundations)
- Defer Phases 3-5 to later

---

## Appendix: Quick Reference

### Key Scripts Created

- `coordination/prompts/` - All system prompts
- `coordination/masters/*/aliases.json` - Version management
- `scripts/lib/lineage.sh` - Lineage tracking
- `scripts/lib/metrics.sh` - Metric collection
- `scripts/promote-master.sh` - Version promotion
- `scripts/query-lineage.sh` - Lineage queries
- `scripts/show-metrics.sh` - Metrics dashboard
- `scripts/show-trace.sh` - Distributed tracing
- `llm-mesh/rag/` - RAG system
- `evaluation/` - Evaluation framework
- `testing/deployment-readiness/` - Pre-deployment tests

### Commands Reference

```bash
# Promote a master version
./scripts/promote-master.sh security-master

# Query task lineage
./scripts/query-lineage.sh task task-001

# Show metrics dashboard
./scripts/show-metrics.sh

# Show trace for correlation ID
./scripts/show-trace.sh corr-12345

# Run evaluation
./evaluation/automated/run-evaluation.sh

# Check alerts
./scripts/check-alerts.sh

# Switch environments
export CORTEX_ENV=dev
./scripts/run-coordinator-master.sh
```

---

**Next Steps**: Begin Phase 1, Week 1, Day 1 - Extract system prompts
