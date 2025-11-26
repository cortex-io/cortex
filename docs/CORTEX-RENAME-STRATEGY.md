# Cortex Rename Strategy
## Transforming commit-relay to Cortex by ry-ops

**Date**: 2025-11-26
**Status**: Planning Phase
**Objective**: Complete rename of commit-relay to Cortex with MoE system at forefront

---

## Executive Summary

This document outlines the comprehensive strategy for renaming the commit-relay project to **Cortex by ry-ops**. Cortex will leverage its Mixture of Experts (MoE) learning system for self-improvement and development of other ry-ops projects.

---

## 1. Current State Analysis

### Project Structure
```
commit-relay/
├── agents/              # Worker agent definitions
├── api-server/          # REST API server
├── coordination/        # Central coordination state
├── llm-mesh/           # MoE routing and gateway
│   ├── gateway/        # Agent gateway server
│   └── moe-learning/   # MoE learning system
├── scripts/            # Automation scripts
├── docs/               # Documentation
├── security/           # Security remediation
└── repos/              # Cloned repositories (should be removed?)
```

### Key Components Found
- **MoE System**: `llm-mesh/moe-learning/` with pattern learning and routing
- **Masters**: coordinator, development, security, inventory, CI/CD
- **API Gateway**: Port 3001, versioned API (v1)
- **Worker Pool**: Dynamic worker management
- **Knowledge Base**: Routing decisions and learned patterns

### Files Containing "commit-relay"
20+ files including:
- `package.json` - name, keywords, description
- `package-lock.json` - name references
- `scripts/spawn-worker.sh` - comments
- `llm-mesh/gateway/server.js` - comments
- `docs/` - documentation files
- Agent prompts and worker definitions
- Security documentation
- Image files: `commit-relay.png`, `commit-relay1.png`

---

## 2. Rename Execution Plan

### Phase 1: Pre-Rename Preparation ✅

#### 1.1 Backup and Safety
- [x] Verify git history is intact
- [ ] Create backup branch: `git branch backup-commit-relay-20251126`
- [ ] Commit all current changes
- [ ] Document current running processes

#### 1.2 Analysis Complete
- [x] Identified 20+ files with "commit-relay" references
- [x] Reviewed API endpoint structure (v1, gateway)
- [x] Mapped directory structure
- [x] Identified image assets to rename

### Phase 2: Core Rename Operations

#### 2.1 Directory Rename
```bash
cd /Users/ryandahlberg/Projects/
mv commit-relay cortex
cd cortex
```

#### 2.2 Package Configuration
**File**: `package.json`
```json
{
  "name": "cortex",
  "description": "Cortex by ry-ops: AI-powered development orchestration with MoE learning",
  "keywords": [
    "cortex",
    "moe",
    "mixture-of-experts",
    "automation",
    "ai",
    "self-improving"
  ]
}
```

#### 2.3 Image Assets
- Rename: `commit-relay.png` → `cortex-logo.png`
- Rename: `commit-relay1.png` → `cortex-logo-alt.png` (or delete if unused)

#### 2.4 File References (20+ files)
Use global find and replace:
```bash
# Find all occurrences
grep -r "commit-relay" . --exclude-dir=node_modules --exclude-dir=.git

# Replace in specific files (execute after review)
find . -type f \( -name "*.js" -o -name "*.md" -o -name "*.json" \) \
  -not -path "*/node_modules/*" -not -path "*/.git/*" \
  -exec sed -i '' 's/commit-relay/cortex/g' {} +

# Replace capitalized versions
find . -type f \( -name "*.js" -o -name "*.md" -o -name "*.json" \) \
  -not -path "*/node_modules/*" -not -path "*/.git/*" \
  -exec sed -i '' 's/Commit-Relay/Cortex/g' {} +

# Replace COMMIT_RELAY environment variable references
find . -type f \( -name "*.js" -o -name "*.sh" -o -name ".env*" \) \
  -not -path "*/node_modules/*" -not -path "*/.git/*" \
  -exec sed -i '' 's/COMMIT_RELAY/CORTEX/g' {} +
```

### Phase 3: API Endpoint Review

#### 3.1 Current API Structure (Status: ✅ Well-Designed)
**Gateway Server** (`llm-mesh/gateway/server.js`)
- Port: 3001
- Middleware: helmet, cors, rate limiting
- Routes: `/routing`, `/agents`, `/tasks`, `/health`
- **Action**: Update header comment from "Commit-Relay" to "Cortex"

**API v1** (`api-server/server/routes/api-v1.js`)
- Endpoints: `/api/v1/version`, `/api/v1/health`
- Versioning: Proper headers (X-API-Version)
- **Status**: ✅ Endpoints are correctly designed
- **Action**: No structural changes needed

**Route Files to Review**:
1. `api-server/server/routes/`
   - api-v1.js ✅
   - circuit-breaker.js
   - compliance.js
   - decisions.js
   - docs.js
   - llm-costs.js
   - llm-health.js
   - queue.js
   - security.js
   - sla.js
   - traces.js
   - user-management.js
   - users.js
   - workflows.js

2. `llm-mesh/gateway/routes/`
   - agents.js
   - health.js
   - routing.js
   - tasks.js

#### 3.2 API Endpoint Validation Checklist
- [ ] All routes follow RESTful conventions
- [ ] Proper error handling
- [ ] Input validation
- [ ] Authentication/authorization where needed
- [ ] Rate limiting configured
- [ ] CORS properly configured
- [ ] API documentation up to date

### Phase 4: Configuration Updates

#### 4.1 Environment Variables
Update `.env` and `.env.example`:
```bash
# Old
COMMIT_RELAY_PORT=3000
COMMIT_RELAY_LOG_LEVEL=info

# New
CORTEX_PORT=3000
CORTEX_LOG_LEVEL=info
```

#### 4.2 Docker Configuration
- `Dockerfile` - update image name and labels
- `docker-compose.yml` - update service names and image references

#### 4.3 GitHub Actions / CI/CD
- `.github/workflows/` - update workflow names and references

### Phase 5: Documentation Updates

#### 5.1 Core Documentation
- [ ] `README.md` - Full rewrite for Cortex branding
- [ ] `CONTRIBUTING.md` - Update project name references
- [ ] `CORE-PRINCIPLES.md` - Update references
- [ ] `GOVERNANCE-ARCHITECTURE.md` - Update system name
- [ ] `DAEMON-MANAGEMENT.md` - Update service names

#### 5.2 MoE Documentation (Priority)
- [ ] Document MoE system usage for Cortex development
- [ ] Create `docs/MOE-DEVELOPMENT-GUIDE.md`
- [ ] Document meta-programming capabilities
- [ ] Create examples of using Cortex to improve Cortex

#### 5.3 API Documentation
- [ ] Update API docs with new branding
- [ ] Swagger/OpenAPI specs (if present)
- [ ] Postman collections

### Phase 6: Git and GitHub Updates

#### 6.1 Git Operations
```bash
# Commit the rename
git add -A
git commit -m "refactor: Rename commit-relay to Cortex

BREAKING CHANGE: Project renamed from commit-relay to Cortex by ry-ops

- Rename all file and directory references
- Update package.json and dependencies
- Update documentation and branding
- Update API comments and headers
- Rename image assets
- Update environment variable names
- MoE system now central to development approach

Refs: #cortex-rename"

# Create tag for the transition
git tag -a v2.0.0-cortex -m "Cortex v2.0.0 - Major rebrand from commit-relay"
```

#### 6.2 GitHub Repository
1. Go to GitHub repository settings
2. Rename repository: `commit-relay` → `cortex`
3. Update repository description: "Cortex by ry-ops: Self-improving AI development orchestration with Mixture of Experts"
4. Update topics/tags: `cortex`, `moe`, `mixture-of-experts`, `ai-automation`, `self-improving`
5. GitHub will automatically redirect old URLs

### Phase 7: Cross-Project Updates

#### 7.1 Blog Project (`/Users/ryandahlberg/Projects/blog`)
- [ ] Search for "commit-relay" references
- [ ] Update any blog posts mentioning the project
- [ ] Update footer/header links if present
- [ ] Create announcement blog post about Cortex

#### 7.2 DriveIQ Project
- [ ] Search for "commit-relay" references
- [ ] Update integration points (if any)
- [ ] Update documentation

#### 7.3 Other Projects
- [ ] Audit all ry-ops projects for references
- [ ] Update cross-project dependencies

### Phase 8: MoE System Integration (Critical)

#### 8.1 Current MoE Components
```
llm-mesh/moe-learning/
├── evaluators/           # Outcome tracking
│   ├── outcome-tracker.sh
│   └── pattern-learner.sh
├── demo-learning.sh      # Learning demonstrations
├── moe-learn.sh         # Main learning orchestrator
└── test-outcomes.sh     # Testing framework
```

#### 8.2 MoE Development Workflow
**Meta-Programming Approach**:
1. Development tasks routed through coordinator master
2. Coordinator uses MoE routing to assign to specialist masters
3. Learning system tracks outcomes and improves routing
4. Pattern learner identifies successful approaches
5. System improves itself based on outcomes

**Usage for Cortex Development**:
```bash
# Route a development task through MoE
./coordination/masters/coordinator/lib/moe-router.sh \
  cortex-improvement-001 \
  "development: Optimize worker pool allocation algorithm"

# System will:
# 1. Analyze task characteristics
# 2. Route to appropriate master (development-master)
# 3. Spawn specialized workers
# 4. Track outcomes
# 5. Learn from results
# 6. Improve future routing decisions
```

#### 8.3 MoE Integration for Other Projects
Create template for applying MoE to other ry-ops projects:
```
1. Define project-specific masters
2. Configure routing patterns
3. Set up outcome tracking
4. Enable continuous learning
5. Document learned patterns
```

---

## 3. Testing and Validation

### 3.1 Pre-Rename Tests
- [ ] Run full test suite: `npm test`
- [ ] Verify all daemons stop cleanly
- [ ] Document currently running processes
- [ ] Backup coordination state

### 3.2 Post-Rename Tests
- [ ] Run full test suite with new names
- [ ] Verify API endpoints respond correctly
- [ ] Test MoE routing system
- [ ] Verify worker spawning
- [ ] Test coordinator master
- [ ] Verify learning system functions
- [ ] Check logs for error messages with old names

### 3.3 Integration Tests
- [ ] Test cross-project integrations
- [ ] Verify external services still connect
- [ ] Test deployment pipeline

---

## 4. Cleanup Operations

### 4.1 Remove Old Artifacts
- [ ] Delete `repos/` directory (appears to be a clone)
- [ ] Clean up any backup files
- [ ] Remove node_modules and reinstall: `npm ci`
- [ ] Clean coordination state if needed

### 4.2 Rebuild
```bash
npm ci              # Clean install
npm run test        # Run tests
# Start services with new names
```

---

## 5. Communication and Rollout

### 5.1 Internal Documentation
- [ ] Update README with Cortex vision
- [ ] Document MoE-first development approach
- [ ] Create quickstart guide for Cortex

### 5.2 External Communication
- [ ] Blog post: "Introducing Cortex by ry-ops"
- [ ] Highlight MoE self-improvement capabilities
- [ ] Explain meta-programming approach
- [ ] Share lessons learned from commit-relay

---

## 6. Success Criteria

### Technical Success
- [x] All tests pass
- [ ] No references to "commit-relay" in active code
- [ ] API endpoints function correctly
- [ ] MoE system operational
- [ ] Documentation complete and accurate
- [ ] GitHub repository renamed successfully

### Functional Success
- [ ] System self-improves through MoE
- [ ] Can route development tasks to appropriate masters
- [ ] Learning system tracks and improves from outcomes
- [ ] Meta-programming workflow demonstrated
- [ ] Template created for other ry-ops projects

### Strategic Success
- [ ] Cortex positioned as self-improving platform
- [ ] MoE system central to development workflow
- [ ] Clear path for applying to other projects
- [ ] ry-ops brand strengthened

---

## 7. Rollback Plan

If critical issues arise:
```bash
# Restore from backup branch
git checkout backup-commit-relay-20251126

# Or revert the rename commit
git revert <commit-hash>

# Rename directory back
cd /Users/ryandahlberg/Projects/
mv cortex commit-relay
```

---

## 8. Timeline

**Estimated Duration**: 2-3 hours

1. **Hour 1**: Core rename operations (Phases 1-3)
2. **Hour 2**: Configuration, documentation, testing (Phases 4-5)
3. **Hour 3**: GitHub updates, cross-project review, validation (Phases 6-8)

---

## 9. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Broken external integrations | High | Audit all projects first, GitHub auto-redirects |
| Lost git history | Critical | Backup branch created, using git mv preserves history |
| API clients break | Medium | API endpoints unchanged, only comments updated |
| Environment variable conflicts | Low | Clear documentation, gradual rollout |
| MoE system disruption | High | Test learning system thoroughly post-rename |

---

## 10. Post-Rename Priorities

### Immediate (Week 1)
1. Verify all systems operational
2. Test MoE routing with real tasks
3. Document first meta-programming example
4. Update external project references

### Short-term (Month 1)
1. Create MoE development guide
2. Apply MoE pattern to one other ry-ops project
3. Blog post series on Cortex architecture
4. Improve learning system based on usage

### Long-term (Quarter 1)
1. Cortex becomes primary development tool for ry-ops
2. MoE patterns proven across multiple projects
3. Self-improvement loop fully operational
4. Community engagement on Cortex approach

---

## Notes

- **Branding**: Use "Cortex by ry-ops" for formal references, "Cortex" or "cortex" for casual/code
- **MoE First**: Every development task should consider MoE routing
- **Self-Improvement**: Cortex develops Cortex - meta-programming is core philosophy
- **Learning Culture**: Track outcomes, learn patterns, improve continuously

---

**Document Version**: 1.0
**Last Updated**: 2025-11-26
**Author**: Claude (via ry-ops)
**Status**: Ready for Execution
