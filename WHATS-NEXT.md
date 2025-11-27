# What's Next for Cortex

**Last Updated**: 2025-11-27
**Status**: Post-Governance & Documentation Overhaul

---

## 🎯 Immediate Priorities (This Week)

### 1. Fix Dashboard Missing Files
**Status**: 🔴 Broken (commented out temporarily)
**Impact**: Medium (core dashboard works, but routes missing)

**Issue**:
- Missing `api-server/server/routes/` directory
- Missing `api-server/server/utils/apm-events.js`
- Currently commented out to allow dashboard to start

**Action**:
```bash
# Option A: Create missing files if needed
mkdir -p api-server/server/routes
# Create stub route files or remove references

# Option B: Clean up commented code permanently
# Remove commented imports and app.use statements if routes not needed
```

**Files to fix**:
- `api-server/server/index.js:63-74` (commented route imports)
- `api-server/server/index.js:139-149` (commented app.use statements)
- `api-server/server/index.js:6815` (commented apm-events import)

---

### 2. Run First ML Validation
**Status**: 🟡 Ready to run
**Impact**: High (data-driven decisions)

**Action**:
```bash
# Run validation to establish baseline
./llm-mesh/validation/ml-validator.sh

# Review results
cat llm-mesh/validation/reports/ab-test-summary-$(date +%Y%m%d).json | jq

# Or via API
curl http://localhost:9000/api/ml-validation
```

**Decision criteria**:
- If semantic routing > keyword by 5%+ → Keep enabled
- If semantic routing < keyword or no difference → Disable
- Track for 2 weeks before making final decision

**Files**:
- Results: `llm-mesh/validation/reports/`
- Config: `llm-mesh/validation/ml-validation-config.json`

---

### 3. Start Daemons (If Not Running)
**Status**: 🟡 Check status
**Impact**: High (core functionality)

**Action**:
```bash
# Check if daemons are running
./scripts/daemon-control.sh status

# Start if needed
./scripts/daemon-control.sh start

# Essential daemons:
# - Coordinator daemon (task routing)
# - Worker daemon (spawning workers)
# - Heartbeat monitor (worker health)
# - Zombie cleanup (stuck process cleanup)
```

---

## 📊 Phase 1: ML Feature Validation (Next 2 Weeks)

**Goal**: Collect data to make evidence-based decisions

### Tasks:
1. ✅ **Set up weekly ML validation reminder** (DONE - see REMINDERS.md)
2. ⏳ **Run validation weekly** (Next run: Monday, Dec 2)
3. ⏳ **Track metrics**:
   - Semantic routing accuracy vs keyword routing
   - RAG usage (if instrumented)
   - Token costs per routing method
4. ⏳ **Make decisions** (After 2 weeks):
   - Keep or disable semantic routing
   - Remove PyTorch routing (unused)
   - Keep or disable RAG

### Success Criteria:
- 2 weeks of validation data collected
- Clear accuracy comparison (semantic vs keyword)
- Decision made on each ML feature

---

## 🧹 Phase 2: Remove Unused Features (1 Week)

**Goal**: Simplify codebase, reduce dependencies

### 1. Remove PyTorch Neural Routing
**Status**: Not started
**Reason**: No training data, never been trained
**Savings**: ~500MB (PyTorch dependency)

**Action**:
```bash
# Remove neural routing code
rm -rf llm-mesh/neural-routing/

# Remove from moe-router.sh
# Edit: coordination/masters/coordinator/lib/moe-router.sh
# Remove neural routing logic

# Update Python dependencies
# Edit: python-sdk/requirements.txt
# Remove: torch, torch-related packages
```

### 2. Investigate & Remove Old Dashboard
**Status**: Not started
**Files**: `dashboard/server/`, `dashboard/public/`

**Action**:
```bash
# Check if old dashboard is used
grep -r "dashboard/server" . --exclude-dir=node_modules

# If not used:
rm -rf dashboard/public
rm -rf dashboard/server
# Keep only api-server/
```

### 3. Check Agentstudio Registry Usage
**Status**: Not started
**Location**: `coordination/agentstudio/`

**Action**:
```bash
# Check if actively used
grep -r "agentstudio" scripts/ coordination/
grep -r "agentstudio" coordination/task-queue.json

# If not used for 30 days:
# Consider removing or archiving
```

### 4. Check PM Daemon Redundancy
**Status**: Not started
**Files**: `scripts/daemons/pm-daemon.sh`

**Action**:
```bash
# Check if PM daemon overlaps with worker-daemon
ps aux | grep pm-daemon
ps aux | grep worker-daemon

# Review functionality overlap
# If redundant: consolidate into worker-daemon
```

---

## 🔧 Phase 3: Consolidate & Simplify (1 Week)

**Goal**: Reduce configuration complexity

### 1. Consolidate Test Frameworks
**Status**: Not started
**Current**: Tests scattered in 4 locations

**Action**:
```bash
# Current locations:
# - testing/unit/
# - testing/integration/
# - api-server/test/
# - python-sdk/tests/

# Recommendation: Consolidate under testing/
mv api-server/test/* testing/unit/
mv python-sdk/tests/* testing/unit/python/
```

### 2. Merge Configuration Files
**Status**: Not started
**Current**: 15+ JSON config files
**Target**: 5-6 essential files

**Keep**:
- `routing-patterns.json`
- `token-budget.json`
- `ml-validation-config.json`
- `governance/` directory

**Merge into `cortex-config.json`**:
- All other scattered configs

### 3. Simplify Environment Variables
**Status**: Not started
**Current**: 27+ environment variables
**Target**: ~10 essential

**Proposal**:
```bash
# Essential
ANTHROPIC_API_KEY=
API_KEY=
API_PORT=9000
NODE_ENV=

# Optional (all default to false)
ML_FEATURES_ENABLED=false  # Master switch for all ML
GOVERNANCE_STRICT=true     # Hard vs soft limits
DEBUG=false
```

---

## 🗑️ Phase 4: Dependency Cleanup (1 Day)

**Goal**: Reduce installation size and complexity

### 1. Remove Unused npm Packages
**Status**: Not started

**Action**:
```bash
# Install npm-check-unused
npm install -g npm-check-unused

# Run check
cd api-server
npm-check-unused

# Remove unused packages
npm uninstall <package-name>
```

### 2. Remove Unused Python Packages
**Status**: Not started
**Target**: ~750MB potential savings

**Heavy dependencies**:
- PyTorch: 500MB (for unused neural routing) → REMOVE
- transformers: 200MB (for semantic routing) → KEEP if validation passes
- FAISS: 50MB (for RAG) → KEEP if validation passes

**Action**:
```bash
cd python-sdk
# Edit requirements.txt
# Remove torch, torch-related packages

# Rebuild venv
rm -rf .venv
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

---

## 🎯 Optional Enhancements

### 1. Create Missing API Routes (If Needed)
**Priority**: Low
**Status**: Not started

**Files to create**:
```bash
api-server/server/routes/
├── users.js           # User management API
├── traces.js          # APM traces API
├── compliance.js      # Compliance reporting API
├── llm-costs.js       # Token usage API
├── workflows.js       # Workflow execution API
├── decisions.js       # Decision explainability API
└── llm-health.js      # LLM health checks API
```

**Question**: Are these routes actually needed, or can we keep them commented out?

### 2. Create APM Events Module (If Needed)
**Priority**: Low
**Status**: Not started

**File to create**:
```bash
api-server/server/utils/apm-events.js
# Captures exceptions and sends to APM (Elastic)
# Currently commented out - dashboard works without it
```

**Question**: Is APM integration needed in production?

### 3. Enhanced Governance Dashboard
**Priority**: Medium
**Status**: Not started

**Features to add**:
- Real-time governance metrics
- Token usage graphs
- Blocked operations timeline
- Approval workflow UI

**API endpoints exist**:
- `GET /api/governance/enforcement` ✅ Working
- Need: Frontend UI to visualize

---

## 📋 Maintenance Tasks

### Weekly (Every Monday)
- ✅ Run ML validation
- ⏳ Review governance stats
- ⏳ Check worker success rate
- ⏳ Verify ports registry accuracy

### Monthly (Last week of month)
- ⏳ Review token budget trends
- ⏳ Check for unused dependencies
- ⏳ Archive old logs
- ⏳ Review simplification progress

**See**: `REMINDERS.md` for complete maintenance checklist

---

## 🚀 Future Enhancements (Not Prioritized)

### Developer Experience
- [ ] Web UI for task submission
- [ ] Real-time worker monitoring dashboard
- [ ] Visual decision tree for routing logic
- [ ] Interactive documentation

### Operations
- [ ] Automated backup/restore
- [ ] Health check alerting (email/Slack)
- [ ] Performance profiling tools
- [ ] Log aggregation system

### AI/ML Features
- [ ] Train PyTorch routing model (if keeping)
- [ ] RAG effectiveness instrumentation
- [ ] Custom embedding models
- [ ] Fine-tuned routing models

### Integration
- [ ] GitHub Actions integration
- [ ] Slack notifications
- [ ] Email alerts for critical tasks
- [ ] Webhook support for external systems

---

## ✅ Completed (Today - 2025-11-27)

1. ✅ **Governance Enforcement Layer**
   - Pre-flight validation
   - Hard token budget limits (95%)
   - Dangerous operation detection (port keywords)
   - Critical task approval system
   - Audit trail (JSONL)

2. ✅ **Documentation Simplification**
   - QUICK-START.md (10-minute guide)
   - ARCHITECTURE.md (technical deep dive)
   - docs/RUNBOOKS.md (operations guide)
   - README.md reduced (1,850 → 100 lines)

3. ✅ **Code Simplification (Phase 1)**
   - Removed 56 empty directories
   - Cleaned old test artifacts
   - Analyzed codebase metrics
   - Documented opportunities

4. ✅ **Port Assignment Policy**
   - Moved dashboard to port 9000
   - Created PORT-POLICY.md
   - Created PORTS-REGISTRY.md
   - Added port governance keywords

5. ✅ **ML Validation Reminders**
   - Created REMINDERS.md
   - Created weekly-ml-validation.sh
   - Set up maintenance schedule

---

## 🎯 Success Metrics

Track progress with these metrics:

```bash
# Codebase size (target: -15-20%)
find . -type f \( -name '*.js' -o -name '*.sh' -o -name '*.py' \) ! -path '*/node_modules/*' ! -path '*/.venv/*' -exec wc -l {} \; | awk '{sum+=$1} END {print sum}'

# File count
find . -type f ! -path '*/node_modules/*' ! -path '*/.git/*' ! -path '*/.venv/*' | wc -l

# Dependency size
du -sh node_modules python-sdk/.venv

# Governance enforcement rate (target: >80%)
curl http://localhost:9000/api/governance/enforcement | jq '.enforcement_rate'
```

**Current Baseline** (2025-11-27):
- Files: 6,865
- Lines of code: 162,148
- Dependencies: ~750MB Python ML packages

**Target** (2025-12-27):
- Files: ~5,500 (20% reduction)
- Lines of code: ~130,000 (20% reduction)
- Dependencies: ~200MB (if ML validation fails)

---

## 📞 Next Steps Summary

**This Week**:
1. Fix dashboard missing files (Option A: create or Option B: clean up)
2. Run first ML validation (baseline)
3. Verify daemons are running

**Next 2 Weeks**:
1. Run weekly ML validation (Mondays)
2. Collect routing accuracy data
3. Make ML feature decisions

**Month 1**:
1. Remove unused features (PyTorch, old dashboard, etc.)
2. Consolidate test frameworks
3. Clean up dependencies
4. Simplify configuration

**Ongoing**:
- Weekly ML validation
- Monthly governance reviews
- Continuous simplification

---

**Question for Next Session**: Should we start with fixing the dashboard routes, or jump straight into ML validation?
