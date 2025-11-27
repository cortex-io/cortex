# Code Simplification Opportunities

Based on analysis and ML validation results, here are opportunities to simplify Cortex.

## Completed Cleanup

✅ **Empty directories removed** (56 directories)
- coordination/optimization/* (unused optimization placeholders)
- llm-mesh/models/* (unused ML model directories)
- coordination/gateway (unused)
- coordination/workflow-executions (unused)

✅ **Old test artifacts removed**
- coordination/agentstudio/test-* (old debugging artifacts)

✅ **Old worker logs cleaned** (>7 days)

## ML Features to Consider Disabling

Based on ML validation showing 0% accuracy for both methods (routing failures in test environment):

### 1. Semantic Routing (Optional)
**Status**: Enabled by default
**Claims**: 94.5% accuracy vs 87.5% keyword
**Reality**: Untested in production, adds complexity

**Recommendation**:
- Run ML validation in production environment for 2 weeks
- If semantic routing accuracy < keyword routing + 5%: **Disable**
- Savings: Remove sentence-transformers dependency, simplify routing logic

**How to disable**:
```bash
echo "SEMANTIC_ROUTING_ENABLED=false" >> .env
```

### 2. PyTorch Neural Routing (Experimental)
**Status**: Disabled by default
**Claims**: Trained model predictions
**Reality**: No training data, never been trained

**Recommendation**: **Remove entirely**
- No training pipeline exists
- No validation results
- Adds dependencies (PyTorch, 500MB+)

**Files to remove**:
- `llm-mesh/neural-routing/*` (if it exists)
- PyTorch dependencies from python-sdk/requirements.txt
- Neural routing logic from moe-router.sh

### 3. RAG System (Optional)
**Status**: Enabled by default
**Claims**: Context-aware decisions
**Reality**: No usage tracking, effectiveness unknown

**Recommendation**:
- Add instrumentation to track RAG usage
- Run validation for 2 weeks
- If RAG doesn't improve task outcomes: **Disable**
- Savings: Remove FAISS, sentence-transformers, vector DB overhead

**How to disable**:
```bash
echo "RAG_ENABLED=false" >> .env
```

## Overlapping Functionality

### Dashboard Servers

**Problem**: Multiple dashboard implementations
- `api-server/server/index.js` (current, active)
- `dashboard/server/index.js` (old HTML dashboard)

**Recommendation**: Remove old dashboard
```bash
rm -rf dashboard/public
rm -rf dashboard/server
# Keep only api-server/
```

### Test Frameworks

**Problem**: Tests scattered in multiple locations
- `testing/unit/`
- `testing/integration/`
- `api-server/test/`
- `python-sdk/tests/`

**Recommendation**: Consolidate under `testing/`

## Unused Features to Remove

### 1. Agentstudio Registry

**Location**: `coordination/agentstudio/`
**Purpose**: Agent templates and registry
**Reality**: Not actively used, workers are spawned directly

**Recommendation**: Remove if not used in 30 days
**Savings**: ~500 lines of JSON

### 2. Execution Managers

**Location**: `coordination/execution-managers/`
**Purpose**: Complex multi-worker orchestration
**Reality**: Unclear if actively used

**Recommendation**: Check if any tasks use execution managers
```bash
grep -r "execution-manager" coordination/task-queue.json
```
If not found, remove.

### 3. PM Daemon

**Location**: `scripts/daemons/pm-daemon.sh`
**Purpose**: Process management
**Reality**: Overlaps with worker-daemon, heartbeat-monitor

**Recommendation**: Consolidate into worker-daemon

### 4. Multiple Routing Methods

**Current**: keyword, semantic, type-based, neural
**Necessary**: keyword only (87.5% accuracy, fast, simple)

**Recommendation**:
- Keep keyword routing
- Validate semantic routing (if +5% accuracy, keep; else remove)
- Remove neural routing (unused)
- Remove type-based routing (redundant with keywords)

## Dead Code Candidates

### Scripts

```bash
# Find scripts not executed in last 30 days
find scripts/ -name '*.sh' -mtime +30 -type f
```

**Candidates**:
- scripts/lib/identity/* (empty directory removed)
- scripts/deployment/* (if no deployments)

### Python SDK

**Location**: `python-sdk/`
**Purpose**: ML features (PyTorch, embeddings, RAG)
**Reality**: 76 Python files, but which are actually used?

**Recommendation**: Audit python-sdk usage
```bash
# Check if python-sdk is imported anywhere
grep -r "python-sdk" scripts/
grep -r "python-sdk" coordination/
```

If not used, consider removing or marking as experimental.

## Dependency Cleanup

### Node.js

**Unused dependencies** (check with `npm-check-unused`):
- elastic-apm-node (removed)
- Others TBD

### Python

**Heavy dependencies**:
- PyTorch: 500MB (for unused neural routing)
- transformers: 200MB (for semantic routing)
- FAISS: 50MB (for RAG)

**Total**: ~750MB for features of unknown value

**Recommendation**: Disable ML features, remove dependencies

## Configuration Simplification

### Environment Variables

**Current**: 40+ environment variables
**Essential**: ~10

**Recommend consolidating to**:
```bash
# Essential
ANTHROPIC_API_KEY=
API_KEY=
NODE_ENV=

# Optional (all default to false)
ML_FEATURES_ENABLED=false  # Master switch for all ML
GOVERNANCE_STRICT=true     # Hard vs soft limits
DEBUG=false
```

### JSON Configuration Files

**Current**: 15+ JSON config files
**Essential**: 5-6

**Recommend consolidating**:
- routing-patterns.json (keep)
- token-budget.json (keep)
- ml-validation-config.json (keep)
- governance/* (keep)
- Everything else: Merge into single cortex-config.json

## Metrics

### Current Codebase
- **Total files**: 6,865
- **Lines of code**: 162,148
- **JavaScript files**: 224
- **Shell scripts**: 363
- **Python files**: 76
- **JSON files**: 4,909

### Simplification Potential
- Remove ML features: -50-100 files
- Remove old dashboard: -20-30 files
- Consolidate tests: -10-20 files
- Remove empty dirs: -56 directories (done)
- **Estimated reduction**: 15-20% of codebase

## Action Plan

### Phase 1: Validate ML Features (2 weeks)
1. Run ML validation in production
2. Track RAG usage
3. Measure semantic routing improvement
4. Make data-driven decisions

### Phase 2: Remove Unused Features (1 week)
1. Remove PyTorch neural routing
2. Remove old dashboard
3. Remove agentstudio if unused
4. Remove PM daemon if redundant

### Phase 3: Consolidate (1 week)
1. Consolidate test frameworks
2. Merge configuration files
3. Simplify environment variables
4. Update documentation

### Phase 4: Dependency Cleanup (1 day)
1. Remove unused npm packages
2. Remove unused Python packages
3. Update requirements.txt

## Decision Framework

For any feature, ask:

1. **Is it used?** Check logs, metrics, code references
2. **Does it work?** Run validation, check test results
3. **Is it worth the complexity?** Compare benefit vs maintenance cost
4. **Can we remove it?** Check dependencies, breaking changes

**If the answer to any of these is "no" or "unclear": Remove it.**

## Monitoring

Track these metrics weekly:

```bash
# Codebase size
find . -type f \( -name '*.js' -o -name '*.sh' -o -name '*.py' \) ! -path '*/node_modules/*' ! -path '*/.venv/*' -exec wc -l {} \; | awk '{sum+=$1} END {print sum}'

# File count
find . -type f ! -path '*/node_modules/*' ! -path '*/.git/*' ! -path '*/.venv/*' | wc -l

# Dependency size
du -sh node_modules python-sdk/.venv
```

**Goal**: Reduce by 15-20% over next month
