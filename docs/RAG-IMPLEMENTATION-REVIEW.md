# RAG System - Implementation Review

**Status**: ✅ **Implemented, Partially Operational**
**Last Updated**: 2025-11-27
**Priority**: MEDIUM (User confirmed keeping RAG)

---

## Executive Summary

**Good News**: RAG infrastructure is well-implemented with FAISS vector store and semantic search capabilities.

**Partial Implementation**: Code exists, test vector store created, but not actively used in production routing yet.

**What's Needed**:
1. Index the full Cortex codebase
2. Integrate with worker task execution
3. Add instrumentation to track effectiveness
4. Validate that it actually improves task outcomes

---

## Current Implementation Status

### ✅ **What EXISTS and Works**

#### 1. Vector Store (`llm-mesh/lib/rag/vectorstore.py`)

**File**: `llm-mesh/lib/rag/vectorstore.py`

**Components**:
- ✅ `CodebaseVectorStore` class
  - FAISS index for similarity search
  - Sentence-transformers for embeddings (all-MiniLM-L6-v2)
  - Metadata storage (file path, line numbers, code type)
  - Batch processing support
  - Persistence (save/load index)

**Features**:
```python
# Key methods:
- add_code_chunks()      # Index code files
- search()               # Semantic search
- save()                 # Persist to disk
- load()                 # Load from disk
- get_stats()            # Vector store statistics
```

**Quality**: ⭐⭐⭐⭐ Very Good
- Modern vector database approach
- Efficient similarity search
- Good metadata tracking

#### 2. Context Retriever (`llm-mesh/lib/rag/retriever.py`)

**File**: `llm-mesh/lib/rag/retriever.py` (assumed to exist based on imports)

**Purpose**: Retrieves relevant code context for workers during task execution

#### 3. Integration with ML Router

**File**: `llm-mesh/lib/integration/moe_ml_router.py`

**RAG Integration**:
```python
# Lines 73-86:
if self.enable_rag and vectorstore_path and vectorstore_path.exists():
    try:
        self.vectorstore = CodebaseVectorStore(
            persist_directory=vectorstore_path,
            collection_name="codebase"
        )
        self.retriever = ContextRetriever(self.vectorstore)
        print(f"✅ RAG system initialized")
    except Exception as e:
        print(f"⚠️  RAG failed to initialize: {e}")
```

**Method**: `get_enhanced_context(task_description, n_results=5)`

#### 4. Vector Store Creation Script

**File**: `llm-mesh/scripts/rag/create-vectorstore.py`

**Purpose**: Index codebase for semantic search

#### 5. Test Vector Store

**Location**: `llm-mesh/vectors/codebase-test/`

**Status**: ✅ EXISTS
- Test index created
- Demonstrates RAG works

---

### ⚠️ **What's Partially Implemented**

#### 1. **Production Vector Store** (Missing)

**Issue**: Full Cortex codebase not indexed

**What Exists**: Test index only
**What's Needed**: Full production index of:
- All `.js` files (api-server, scripts)
- All `.sh` files (coordination, scripts)
- All `.py` files (python-sdk, llm-mesh)
- Key configuration files

**Size Estimate**:
- ~600 code files
- ~160,000 lines of code
- Index size: ~100-200MB

#### 2. **Worker Integration** (Not Active)

**Issue**: Workers don't currently use RAG context

**Evidence**: No logs showing RAG context being provided to workers

**What's Needed**:
```bash
# When spawning a worker, add:
--rag-context "$CONTEXT"

# Where CONTEXT comes from:
RAG_CONTEXT=$(python llm-mesh/scripts/rag/get-context.py \
  --task-description "$TASK_DESC" \
  --n-results 5)
```

#### 3. **Effectiveness Tracking** (Missing)

**Issue**: No instrumentation to measure if RAG helps

**What's Needed**:
- Track: Tasks with RAG context vs without
- Measure: Success rate improvement
- Measure: Token efficiency
- Measure: Execution time

---

### ❌ **What's MISSING**

#### 1. **Production Indexing Script**

**Missing**: Script to index full Cortex codebase

**Need to Create**:
```python
# llm-mesh/scripts/rag/index-codebase.py

import os
from pathlib import Path
from llm_mesh.rag.vectorstore import CodebaseVectorStore

def index_codebase(
    codebase_path: Path,
    output_path: Path,
    file_extensions: list = ['.js', '.sh', '.py', '.json'],
    chunk_size: int = 500  # lines per chunk
):
    """Index entire codebase for semantic search"""

    store = CodebaseVectorStore(
        persist_directory=output_path,
        collection_name="cortex-codebase"
    )

    chunks = []
    for ext in file_extensions:
        for file_path in codebase_path.rglob(f"*{ext}"):
            # Skip node_modules, .venv, etc.
            if any(skip in str(file_path) for skip in ['node_modules', '.venv', '.git']):
                continue

            # Read file and chunk
            with open(file_path) as f:
                content = f.read()
                file_chunks = chunk_code(content, chunk_size)

                for i, chunk in enumerate(file_chunks):
                    chunks.append({
                        'text': chunk,
                        'file_path': str(file_path),
                        'start_line': i * chunk_size,
                        'end_line': (i + 1) * chunk_size,
                        'type': 'code'
                    })

    # Add chunks to vector store
    store.add_code_chunks(chunks)
    store.save()

    print(f"✅ Indexed {len(chunks)} code chunks")
    return store

if __name__ == "__main__":
    index_codebase(
        codebase_path=Path("/Users/ryandahlberg/Projects/cortex"),
        output_path=Path("llm-mesh/vectors/cortex-production")
    )
```

#### 2. **Context Injection for Workers**

**Missing**: Integration point to pass RAG context to workers

**Need to Create**:
```bash
# In spawn-worker.sh, add:

if [ "$RAG_ENABLED" = "true" ]; then
  # Get relevant context for task
  RAG_CONTEXT=$(python llm-mesh/scripts/rag/get-context.py \
    --task-description "$TASK_DESCRIPTION" \
    --n-results 5 \
    --output-format json)

  # Pass to worker
  export WORKER_RAG_CONTEXT="$RAG_CONTEXT"
fi
```

#### 3. **Effectiveness Instrumentation**

**Missing**: Metrics to validate RAG value

**Need to Track**:
```json
{
  "task_id": "task-001",
  "rag_enabled": true,
  "rag_results_used": 5,
  "rag_retrieval_time_ms": 45,
  "task_success": true,
  "tokens_used": 4500,
  "execution_time_seconds": 120,
  "worker_feedback": "RAG context was helpful for X"
}
```

---

## Implementation Roadmap

### Phase 1: Production Indexing (1 day)

#### Step 1.1: Create Indexing Script
```bash
# Create: llm-mesh/scripts/rag/index-codebase.py
# (See code above)
```

#### Step 1.2: Run Full Indexing
```bash
python llm-mesh/scripts/rag/index-codebase.py \
  --codebase /Users/ryandahlberg/Projects/cortex \
  --output llm-mesh/vectors/cortex-production \
  --extensions .js,.sh,.py,.json,.md

# Expected output:
# Processing: 600 files
# Creating: ~1200 code chunks
# Index size: ~150MB
# ✅ Indexed 1200 code chunks
```

#### Step 1.3: Verify Index
```python
# Test search works
from llm_mesh.rag.vectorstore import CodebaseVectorStore

store = CodebaseVectorStore(
    persist_directory="llm-mesh/vectors/cortex-production"
)

results = store.search("spawn worker", n_results=5)
print(f"Found {len(results)} results")
for r in results:
    print(f"  - {r['file_path']}:{r['start_line']}")
```

---

### Phase 2: Worker Integration (2 days)

#### Step 2.1: Create Context Retrieval Script
```python
# Create: llm-mesh/scripts/rag/get-context.py

import json
import sys
from pathlib import Path
from llm_mesh.rag.vectorstore import CodebaseVectorStore
from llm_mesh.rag.retriever import ContextRetriever

def get_context_for_task(task_description: str, n_results: int = 5):
    """Get relevant code context for a task"""

    store = CodebaseVectorStore(
        persist_directory=Path("llm-mesh/vectors/cortex-production")
    )
    retriever = ContextRetriever(store)

    context = retriever.get_context_for_task(
        task_description=task_description,
        n_results=n_results
    )

    return context

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--task-description", required=True)
    parser.add_argument("--n-results", type=int, default=5)
    parser.add_argument("--output-format", default="json")
    args = parser.parse_args()

    context = get_context_for_task(args.task_description, args.n_results)

    if args.output_format == "json":
        print(json.dumps(context, indent=2))
    else:
        # Format for worker prompt
        for item in context['results']:
            print(f"=== {item['file_path']} ===")
            print(item['text'])
            print()
```

#### Step 2.2: Integrate with spawn-worker.sh
```bash
# File: scripts/spawn-worker.sh
# Add after line where task description is parsed:

if [ "${RAG_ENABLED:-false}" = "true" ]; then
  echo "📚 Retrieving relevant code context..."

  RAG_CONTEXT=$(python llm-mesh/scripts/rag/get-context.py \
    --task-description "$TASK_DESCRIPTION" \
    --n-results 5 \
    --output-format text 2>/dev/null)

  if [ -n "$RAG_CONTEXT" ]; then
    # Write to temp file for worker
    RAG_CONTEXT_FILE="/tmp/worker-${WORKER_ID}-context.txt"
    echo "$RAG_CONTEXT" > "$RAG_CONTEXT_FILE"

    # Pass to worker
    WORKER_CONTEXT_FILE="$RAG_CONTEXT_FILE"
    echo "✅ RAG context provided: $RAG_CONTEXT_FILE"
  else
    echo "⚠️  RAG context retrieval failed, proceeding without context"
  fi
fi

# In worker prompt, include context:
if [ -n "$WORKER_CONTEXT_FILE" ] && [ -f "$WORKER_CONTEXT_FILE" ]; then
  cat >> "$WORKER_PROMPT_FILE" << EOF

## Relevant Code Context

The following code from the Cortex codebase may be relevant to your task:

$(cat "$WORKER_CONTEXT_FILE")

Use this context to inform your implementation, but verify all details.
EOF
fi
```

#### Step 2.3: Enable RAG in .env
```bash
echo "RAG_ENABLED=true" >> .env
echo "RAG_VECTOR_STORE=llm-mesh/vectors/cortex-production" >> .env
```

---

### Phase 3: Effectiveness Tracking (1 day)

#### Step 3.1: Add RAG Metrics to Task Logs
```bash
# File: scripts/lib/task-logger.sh
# Add function:

log_rag_usage() {
  local task_id="$1"
  local rag_enabled="$2"
  local num_results="$3"
  local retrieval_time_ms="$4"

  local log_entry=$(cat <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "task_id": "$task_id",
  "rag_enabled": $rag_enabled,
  "rag_results_used": $num_results,
  "rag_retrieval_time_ms": $retrieval_time_ms
}
EOF
)

  echo "$log_entry" >> coordination/logs/rag-usage.jsonl
}
```

#### Step 3.2: Create RAG Effectiveness Report
```python
# Create: llm-mesh/scripts/rag/analyze-effectiveness.py

import json
from pathlib import Path
from collections import defaultdict

def analyze_rag_effectiveness():
    """Analyze if RAG improves task outcomes"""

    # Load task logs
    with open("coordination/logs/rag-usage.jsonl") as f:
        rag_logs = [json.loads(line) for line in f]

    # Load task queue (outcomes)
    with open("coordination/task-queue.json") as f:
        tasks = json.load(f)['tasks']

    # Match tasks with RAG usage
    rag_tasks = defaultdict(list)
    non_rag_tasks = defaultdict(list)

    for task in tasks:
        task_id = task['id']
        success = task['status'] == 'completed'

        # Check if RAG was used
        rag_log = next((log for log in rag_logs if log['task_id'] == task_id), None)

        if rag_log and rag_log['rag_enabled']:
            rag_tasks['success' if success else 'failed'].append(task)
        else:
            non_rag_tasks['success' if success else 'failed'].append(task)

    # Calculate metrics
    rag_success_rate = len(rag_tasks['success']) / (len(rag_tasks['success']) + len(rag_tasks['failed'])) if rag_tasks['success'] or rag_tasks['failed'] else 0
    non_rag_success_rate = len(non_rag_tasks['success']) / (len(non_rag_tasks['success']) + len(non_rag_tasks['failed'])) if non_rag_tasks['success'] or non_rag_tasks['failed'] else 0

    print(f"RAG Success Rate: {rag_success_rate:.2%}")
    print(f"Non-RAG Success Rate: {non_rag_success_rate:.2%}")
    print(f"Improvement: {(rag_success_rate - non_rag_success_rate):.2%}")

    return {
        'rag_success_rate': rag_success_rate,
        'non_rag_success_rate': non_rag_success_rate,
        'improvement': rag_success_rate - non_rag_success_rate
    }

if __name__ == "__main__":
    results = analyze_rag_effectiveness()
    with open("llm-mesh/validation/reports/rag-effectiveness.json", "w") as f:
        json.dump(results, f, indent=2)
```

---

### Phase 4: Optimization (1 week)

#### Step 4.1: Re-indexing Strategy
```bash
# Create: scripts/cron/reindex-codebase.sh
# Run weekly to keep vector store up-to-date

#!/bin/bash
cd /Users/ryandahlberg/Projects/cortex

# Backup old index
mv llm-mesh/vectors/cortex-production llm-mesh/vectors/cortex-production-backup

# Re-index
python llm-mesh/scripts/rag/index-codebase.py

# Verify new index works
python -c "from llm_mesh.rag.vectorstore import CodebaseVectorStore; store = CodebaseVectorStore(persist_directory='llm-mesh/vectors/cortex-production'); print(f'Index loaded: {store.get_stats()}')"

# If successful, remove backup
rm -rf llm-mesh/vectors/cortex-production-backup
```

#### Step 4.2: Query Optimization
- Fine-tune retrieval parameters (n_results, similarity threshold)
- Add query reformulation
- Cache frequent queries

---

## Integration Points

### 1. MoE Router → RAG
**File**: `coordination/masters/coordinator/lib/moe-router.sh`

```bash
# When routing a task, optionally get context:
if [ "$RAG_ENABLED" = "true" ]; then
  TASK_CONTEXT=$(python llm-mesh/scripts/rag/get-context.py \
    --task-description "$TASK_DESCRIPTION" \
    --n-results 3)  # Fewer results for routing

  # Use context to inform routing decision
  # (e.g., if context shows mostly security files, bias toward security-master)
fi
```

### 2. Worker Spawning → RAG
**File**: `scripts/spawn-worker.sh`

```bash
# Get detailed context for worker (5 results)
RAG_CONTEXT=$(python llm-mesh/scripts/rag/get-context.py \
  --task-description "$TASK_DESCRIPTION" \
  --n-results 5)

# Inject into worker prompt
export WORKER_CONTEXT="$RAG_CONTEXT"
```

### 3. API Endpoint → RAG
**File**: `api-server/server/index.js`

```javascript
// Add endpoint to search codebase
app.get('/api/rag/search', async (req, res) => {
  const { query, n_results = 5 } = req.query;

  // Call Python RAG script
  const { stdout } = await exec(
    `python llm-mesh/scripts/rag/get-context.py --task-description "${query}" --n-results ${n_results}`
  );

  res.json(JSON.parse(stdout));
});
```

---

## Estimated Effort

| Phase | Task | Effort |
|-------|------|--------|
| 1 | Production Indexing | 4-6 hours |
| 2 | Worker Integration | 1-2 days |
| 3 | Effectiveness Tracking | 4-6 hours |
| 4 | Optimization (ongoing) | 1 week |
| **Total** | **Initial Deployment** | **3-4 days** |

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **RAG Success Rate** | 96%+ | Task completion with RAG |
| **Non-RAG Success Rate** | 94% | Task completion without RAG |
| **Improvement** | +2%+ | RAG vs non-RAG |
| **Context Relevance** | 80%+ | Worker feedback |
| **Retrieval Latency** | < 100ms | Timing logs |

**Decision Criteria**:
- If improvement < 2%: Disable RAG (not worth complexity)
- If improvement >= 2%: Keep RAG enabled
- If improvement >= 5%: Expand RAG usage

---

## Current Dependencies

**Installed**: ✅ YES
- `faiss-cpu` - Vector similarity search
- `sentence-transformers` - Embedding model
- `numpy` - Numerical operations

**Size**: ~250MB (FAISS + sentence-transformers + models)

---

## Recommendations

### Immediate Actions (This Week)

1. **Index Production Codebase** (Priority: HIGH)
   ```bash
   python llm-mesh/scripts/rag/index-codebase.py
   ```

2. **Create Context Retrieval Script** (Priority: HIGH)
   ```bash
   # Create llm-mesh/scripts/rag/get-context.py
   ```

3. **Integrate with Worker Spawning** (Priority: MEDIUM)
   ```bash
   # Update scripts/spawn-worker.sh
   ```

### Next Month

1. **Enable RAG for 50% of tasks** (A/B test)
2. **Track effectiveness metrics**
3. **Analyze results after 2 weeks**
4. **Make keep/disable decision**

### Long-Term

1. **Fine-tune retrieval** based on worker feedback
2. **Add query reformulation** for better matches
3. **Cache frequent queries** for speed
4. **Weekly re-indexing** to keep current

---

## Questions for User

1. **Do you want RAG enabled for all workers, or specific master types only?**
   - All workers?
   - Development-master only?
   - Security-master for vulnerability context?

2. **How many context results should we provide to workers?**
   - 3 results (less noise, faster)
   - 5 results (more context, recommended)
   - 10 results (comprehensive, slower)

3. **When should we start RAG integration?**
   - Can begin indexing today
   - Worker integration in 1-2 days

---

**Next Steps**:
1. Review this document
2. Confirm RAG strategy
3. Start Phase 1 (Indexing)

**Owner**: Development Master
**Timeline**: 3-4 days to full integration
