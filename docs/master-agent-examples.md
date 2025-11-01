# Master Agent Usage Examples

**Version**: 2.0
**Date**: 2025-11-01

This document provides real-world examples of how master agents orchestrate workers to complete tasks efficiently in the commit-relay system.

---

## Example 1: Weekly Security Scan

**Scenario**: Security Master runs weekly security scans across all 4 repositories

### Traditional Approach (v1.0)

**Security Agent** executes sequentially:
```
09:00 - Scan mcp-server-unifi (15k tokens, 15 min)
09:15 - Scan n8n-mcp-server (15k tokens, 15 min)
09:30 - Scan aiana (15k tokens, 15 min)
09:45 - Scan commit-relay (15k tokens, 15 min)
10:00 - Generate report (5k tokens, 5 min)
```

**Total**: 65k tokens, 65 minutes
**Problem**: Exceeds Security Agent's 30k token budget ❌

### Master-Worker Approach (v2.0)

**Security Master** orchestrates scan-workers:

```markdown
### 09:00 - Security Master Session Start

**Task**: task-200 (Weekly security scan - all repos)
**Decision**: Parallelize with scan-workers ✅

**Actions**:
# Spawn 4 scan-workers in parallel
./scripts/spawn-worker.sh --type scan-worker --task-id task-200 \
  --master security-master --repo ry-ops/mcp-server-unifi

./scripts/spawn-worker.sh --type scan-worker --task-id task-200 \
  --master security-master --repo ry-ops/n8n-mcp-server

./scripts/spawn-worker.sh --type scan-worker --task-id task-200 \
  --master security-master --repo ry-ops/aiana

./scripts/spawn-worker.sh --type scan-worker --task-id task-200 \
  --master security-master --repo ry-ops/commit-relay

**Tokens used (Security Master)**: 2k (spawning + specs)
**Workers**: 4 running in parallel

### 09:15 - All Workers Complete (15 min elapsed)

**Worker results**:
- worker-scan-301: mcp-server-unifi ✅ (7.2k tokens, 0 issues)
- worker-scan-302: n8n-mcp-server ✅ (8.1k tokens, 5 medium issues)
- worker-scan-303: aiana ✅ (6.8k tokens, 0 issues)
- worker-scan-304: commit-relay ✅ (7.5k tokens, 2 medium issues)

**Aggregation** (Security Master: 3k tokens):
- Total findings: 7 vulnerabilities
- Prioritized remediation plan
- Created task-201: Fix n8n-mcp-server issues
- Created task-202: Fix commit-relay issues
- Updated security dashboard

### 09:25 - Session Complete

**Total time**: 25 minutes (vs 65 min traditional)
**Total tokens**: 34.6k (5k master + 29.6k workers)
  - Within combined budget ✅
  - 47% time savings ✅
  - Fits in single session ✅
```

**Efficiency Gains**:
- ⚡ 62% faster (parallel execution)
- 💰 47% token reduction (focused workers)
- ✅ Within budget (34.6k vs 30k limit for traditional)
- 🎯 Better organization (clear separation of concerns)

---

## Example 2: Critical Vulnerability Response

**Scenario**: Critical CVE discovered in MCP SDK, needs immediate patching

### Traditional Approach

**Security Agent** handles everything:
```
10:00 - Investigate CVE (5k tokens)
10:10 - Apply patch manually (12k tokens)
10:30 - Run tests (3k tokens)
10:40 - Create PR (3k tokens)
10:50 - Verify fix (5k tokens)
```

**Total**: 28k tokens, 50 minutes
**Risk**: If PR needs changes, might exceed budget

### Master-Worker Approach

**Security Master** coordinates, workers execute:

```markdown
### 10:00 - Security Master: Critical CVE Alert

**CVE**: CVE-2025-53365 in @modelcontextprotocol/sdk 1.1.2
**Severity**: CRITICAL (CVSS 9.8)
**Affected**: ry-ops/n8n-mcp-server

**Decision**: Emergency response, spawn fix-worker immediately ⚡

### 10:02 - Spawn Fix Worker

./scripts/spawn-worker.sh --type fix-worker --task-id task-CRIT-01 \
  --master security-master --repo ry-ops/n8n-mcp-server --priority critical \
  --scope '{
    "fix_type": "dependency-update",
    "package": "@modelcontextprotocol/sdk",
    "old_version": "1.1.2",
    "new_version": "1.9.4",
    "cve_ids": ["CVE-2025-53365", "CVE-2025-53366"],
    "urgency": "critical"
  }'

**Tokens used (Security Master)**: 1k
**Worker**: worker-fix-401 running

### 10:20 - Fix Worker Complete (18 min)

**Result**: ✅ Success
- MCP SDK updated: 1.1.2 → 1.9.4
- Tests: 45/45 passing ✅
- Build: successful ✅
- Commit: f8a3d92
- Branch: fix/cve-2025-53365

**Tokens used (worker)**: 4.8k

### 10:22 - Verification Scan

**Security Master spawns verification scan**:

./scripts/spawn-worker.sh --type scan-worker --task-id task-CRIT-01 \
  --master security-master --repo ry-ops/n8n-mcp-server --priority critical

**Tokens used (Security Master)**: 0.5k

### 10:35 - Verification Complete

**Result**: ✅ CVE-2025-53365 confirmed closed
**Tokens used (worker)**: 7.5k

### 10:37 - Create PR

**Security Master spawns PR worker**:

./scripts/spawn-worker.sh --type pr-worker --task-id task-CRIT-01 \
  --master security-master --repo ry-ops/n8n-mcp-server

**Tokens used (Security Master)**: 0.5k
**Worker**: worker-pr-101 running

### 10:42 - PR Created

**PR**: #145 (https://github.com/ry-ops/n8n-mcp-server/pull/145)
**Status**: Ready for merge ✅
**Tokens used (worker)**: 3.2k

### 10:45 - Response Complete

**Total time**: 45 minutes (discovery to PR)
**Total tokens**: 17.5k
  - Security Master: 2k
  - Workers: 15.5k (fix + scan + pr)

**SLA**: ✅ Under 4-hour critical response SLA (completed in 45 min)
**Budget**: ✅ Well within limits
**Quality**: ✅ All tests passing, vulnerability closed
```

**Benefits**:
- 🚀 10% faster despite additional verification step
- 💰 38% token savings (17.5k vs 28k)
- ✅ Better verification (dedicated scan worker)
- 🎯 Clear audit trail (worker logs)
- 🔄 Repeatable process (same workers for next CVE)

---

## Example 3: Feature Development with Parallel Workers

**Scenario**: Development Master implements user authentication feature

### Traditional Approach

**Development Agent** implements everything:
```
- Plan architecture (5k tokens)
- Implement DB models (15k tokens)
- Implement JWT service (15k tokens)
- Implement API endpoints (20k tokens)
- Implement middleware (10k tokens)
- Write tests (15k tokens)
- Create PR (3k tokens)
```

**Total**: 83k tokens
**Problem**: Exceeds 30k budget by 277% ❌❌❌
**Would fail mid-implementation** ❌

### Master-Worker Approach

**Development Master** orchestrates implementation-workers:

```markdown
### 09:00 - Development Master: Feature Planning

**Task**: task-300 (Implement user authentication with JWT)
**Repository**: ry-ops/api-server

**Architectural Analysis** (YOUR tokens: 5k):

**Components identified**:
1. Database models (User, Session) - 8k tokens
2. JWT service (generate/validate tokens) - 9k tokens
3. API endpoints (/login, /logout, /refresh) - 10k tokens
4. Auth middleware (request validation) - 8k tokens
5. Test suite (unit + integration) - 6k tokens

**Dependencies**:
- 1 → 2 → 3 → 4 (sequential)
- 5 can run parallel after 1-4 complete

**Decision**: 4 sequential implementation-workers + 1 parallel test-worker ✅

### 09:15 - Spawn Worker 1: Database Models

./scripts/spawn-worker.sh --type implementation-worker --task-id task-300 \
  --master development-master --repo ry-ops/api-server \
  --scope '{
    "component": "database-models",
    "files": ["src/models/User.ts", "src/models/Session.ts"],
    "acceptance_criteria": [
      "User model: email, password_hash, created_at, updated_at",
      "Session model: user_id, token_hash, expires_at, created_at",
      "Database migrations for both models",
      "Model validation (email format, password requirements)",
      "Basic tests for model creation and validation"
    ],
    "dependencies": [],
    "estimated_tokens": 8000
  }'

**Tokens used**: 1k
**Worker**: worker-impl-501 running

### 09:50 - Worker 1 Complete, Review & Spawn Worker 2

**Result**: worker-impl-501 ✅
- Files: User.ts, Session.ts, migrations
- Tests: 15/15 passing
- Quality: Excellent

**Review** (YOUR tokens: 2k):
- Code quality: ✅
- Follows conventions: ✅
- Tests adequate: ✅
- Ready for next component: ✅

**Spawn Worker 2**: JWT Service

./scripts/spawn-worker.sh --type implementation-worker --task-id task-300 \
  --master development-master --repo ry-ops/api-server \
  --scope '{
    "component": "jwt-service",
    "files": ["src/services/JWTService.ts"],
    "acceptance_criteria": [
      "generateToken(userId): creates JWT with 1h expiry",
      "validateToken(token): verifies and returns userId",
      "refreshToken(token): generates new token if valid",
      "Uses User and Session models from worker-impl-501",
      "Secure secret management (from env vars)",
      "Error handling for invalid/expired tokens",
      "Unit tests for all methods"
    ],
    "dependencies": ["worker-impl-501"],
    "estimated_tokens": 9000
  }'

**Worker**: worker-impl-502 running

### 10:30 - Worker 2 Complete, Spawn Worker 3

**Result**: worker-impl-502 ✅
**Review**: 2k tokens, approved ✅

**Spawn Worker 3**: API Endpoints

./scripts/spawn-worker.sh --type implementation-worker ...

### 11:15 - Worker 3 Complete, Spawn Worker 4

**Result**: worker-impl-503 ✅
**Review**: 2k tokens, approved ✅

**Spawn Worker 4**: Auth Middleware

./scripts/spawn-worker.sh --type implementation-worker ...

### 12:00 - All Implementation Workers Complete

**Workers completed**:
- worker-impl-501: DB models ✅ (7.8k tokens)
- worker-impl-502: JWT service ✅ (8.9k tokens)
- worker-impl-503: API endpoints ✅ (9.7k tokens)
- worker-impl-504: Auth middleware ✅ (7.5k tokens)

**Integration Check** (YOUR tokens: 5k):

**Issue found**: Naming inconsistency
- DB models use snake_case: `user_id`, `token_hash`
- JWT service expects camelCase: `userId`, `tokenHash`

**Resolution** (YOUR tokens: 2k):
- Updated JWT service to use snake_case (project standard)
- Re-ran integration tests
- All tests passing: ✅ 58/58

### 12:15 - Spawn Test Worker (Parallel Final Tests)

./scripts/spawn-worker.sh --type test-worker --task-id task-300 \
  --master development-master --repo ry-ops/api-server \
  --scope '{
    "modules": ["src/auth/*", "src/models/*"],
    "test_types": ["unit", "integration", "e2e"],
    "coverage_target": 80,
    "focus_areas": ["security", "edge-cases", "error-handling"]
  }'

**Worker**: worker-test-201 running

### 12:40 - Test Worker Complete

**Result**: worker-test-201 ✅
- Tests added: 42 (unit: 28, integration: 10, e2e: 4)
- All passing: ✅ 100/100
- Coverage: 84% (above 80% target) ✅

### 12:45 - Final Verification & PR

**Manual end-to-end test** (YOUR tokens: 2k):
- User registration: ✅
- Login: ✅
- Token validation: ✅
- Token refresh: ✅
- Logout: ✅
- All edge cases: ✅

**Spawn PR Worker**:

./scripts/spawn-worker.sh --type pr-worker --task-id task-300 \
  --master development-master --repo ry-ops/api-server

**Worker**: worker-pr-201 running

### 12:55 - Feature Complete!

**PR Created**: #178 (https://github.com/ry-ops/api-server/pull/178)

**Summary**:
- **Total time**: 3h 55min (09:00 - 12:55)
- **Your tokens**: 21k (planning: 5k, reviews: 8k, integration: 7k, verification: 2k)
- **Worker tokens**: 47k
  - impl-501: 7.8k
  - impl-502: 8.9k
  - impl-503: 9.7k
  - impl-504: 7.5k
  - test-201: 6.2k
  - pr-201: 3.9k
- **Total tokens**: 68k

**vs. Traditional**:
- Would have exceeded 30k budget ❌
- Feature would have failed mid-implementation ❌
- No way to complete in one session ❌

**Master-Worker Benefits**:
- ✅ Feature completed successfully
- ✅ Within master budget (21k / 30k)
- ✅ Workers handled heavy lifting (47k)
- ✅ High quality (84% test coverage)
- ✅ All tests passing
- ✅ Clear audit trail
```

**Achievements**:
- 🎯 Completed impossible task (83k work in 68k total)
- ⚡ Organized parallel work where possible
- 💰 Efficient token usage (master focused on strategy)
- ✅ Higher quality (dedicated test worker)
- 📊 Better metrics (tracked per component)

---

## Example 4: Coordinator Orchestrating Multiple Masters

**Scenario**: Coordinator Master manages system-wide weekly workflow

### Coordinator Master Session

```markdown
### Monday 09:00 - Weekly Planning

**System Health Check**:
- Token budget: 168k / 200k used last week (84% utilization ✅)
- Worker success rate: 94% (good)
- All masters active and healthy
- No blocked tasks

**Weekly Priorities** (from human):
1. Security scans (all repos)
2. Dependency updates (based on scan results)
3. Implement new feature (API rate limiting)
4. Technical debt: Improve test coverage

**Task Creation**:

# Task 1: Weekly security scans
{
  "id": "task-400",
  "title": "Weekly security scan - all repositories",
  "type": "security",
  "execution_mode": "workers",
  "assigned_to": "security-master",
  "priority": "high"
}

# Task 2: Implement rate limiting
{
  "id": "task-401",
  "title": "Implement API rate limiting",
  "type": "development",
  "execution_mode": "workers",
  "assigned_to": "development-master",
  "priority": "high"
}

**Tokens used**: 3k (planning + task creation)

### Monday 11:00 - Progress Check

**Task 400 (Security scans)**: ✅ Complete
- Security Master spawned 4 scan-workers
- Results aggregated
- Created task-402: Fix 5 medium vulns in n8n-mcp-server

**Task 401 (Rate limiting)**: In progress
- Development Master spawned 3 implementation-workers
- 1/3 complete, 2/3 running

**Action**: Monitor progress, no intervention needed

### Monday 15:00 - Security Handoff

**Handoff received**: security-master → development-master
- Task-402: Fix security issues
- Priority: HIGH
- Details: 5 medium-severity vulnerabilities

**Coordination** (YOUR tokens: 2k):
- Verified Development Master has capacity (budget: 12k / 30k used)
- Confirmed task priority appropriate
- Logged handoff successful
- No conflicts with task-401

### Tuesday 09:00 - Daily Summary

**Yesterday's Productivity**:
- Tasks completed: 2 (security scans, rate limiting)
- Workers utilized: 11 total
  - Security: 4 scan + 1 verify
  - Development: 3 impl + 2 test + 1 pr
- Handoffs: 1 (security → development)
- Token usage: 89k / 200k (45% - on track)

**Today's Priorities**:
- Monitor task-402 (security fixes)
- Review and merge rate limiting PR
- Plan technical debt work

**Worker Efficiency Metrics**:
- Success rate: 96% (1 retry needed)
- Avg time: 16 minutes per worker
- Token efficiency: 0.87 (excellent)

**Budget Forecast**:
- Current pace: 178k / week (89% of budget)
- Recommendation: Sustainable ✅
- No adjustments needed

### Tuesday 14:00 - Budget Alert

**Alert**: Development Master at 78% of daily budget (23.4k / 30k)

**Analysis** (YOUR tokens: 2k):
- Task-402 using more tokens than expected (complex fixes)
- Still have 6.6k remaining
- Worker pool: 8k / 20k available
- Assessment: Not critical, monitor closely ✅

**Action**: Logged for review, no intervention needed

### End of Week Summary

**Week Performance**:
- Tasks completed: 12
- Workers spawned: 47
- Worker success rate: 94%
- Token usage: 174k / 200k (87% utilization)
- Masters healthy: 3/3 ✅

**Efficiency Metrics**:
- vs. Traditional approach: ~60% token savings
- Features delivered: 3 (vs ~1 traditional)
- Security coverage: 100% (all repos scanned)
- Quality: All PRs passed review

**Recommendations**:
- System operating well, no changes needed
- Consider adding documentation-worker type (pattern emerging)
- Continue current pace
```

**Coordinator Value**:
- 🎯 System-wide visibility
- 💰 Budget optimization across masters
- 🤝 Smooth coordination between masters
- 📊 Data-driven decision making
- ⚡ Proactive issue detection

---

## Key Takeaways

### When to Use Workers

✅ **Use workers for**:
- Parallel, independent tasks (scans, fixes)
- Well-defined, scoped work (implementations, tests)
- Routine, repeatable operations (daily scans, PRs)
- Token-intensive tasks that can be decomposed

❌ **Don't use workers for**:
- Strategic decisions and planning
- Exploratory or research-heavy work
- Complex integration requiring context
- Tasks requiring human judgment

### Token Efficiency

**Traditional (v1.0)**:
- Single agent does everything sequentially
- Often exceeds budget on complex tasks
- Limited parallelization
- Risk of token exhaustion mid-task

**Master-Worker (v2.0)**:
- Masters do strategic work (20-40% of budget)
- Workers do focused execution (60-80%)
- Parallel execution where possible
- Clear separation of concerns
- Sustainable token usage

### Quality Improvements

**With Workers**:
- ✅ Dedicated test workers improve coverage
- ✅ Focused workers produce cleaner code
- ✅ Clear audit trail (worker logs)
- ✅ Repeatable processes
- ✅ Better metrics and tracking

---

*Version: 2.0 | Last Updated: 2025-11-01*
