# MoE Router Issues Runbook

## Overview

Procedures for diagnosing and resolving issues with the Mixture of Experts (MoE) router in Commit-Relay. The MoE router intelligently routes tasks to the appropriate master agents based on task analysis and historical patterns.

**Severity**: MEDIUM to HIGH
**Estimated Resolution Time**: 15-45 minutes
**Owner**: DevOps/ML Operations Team

---

## What is the MoE Router?

The MoE router (`coordination/masters/coordinator/lib/moe-router.sh`) is responsible for:
- Analyzing incoming task descriptions
- Extracting keywords and intent
- Calculating confidence scores for each master
- Routing tasks to the most appropriate specialist master
- Learning from routing decisions over time

**Master Specialists**:
- **development-master**: Feature implementation, bug fixes, code changes
- **security-master**: Vulnerability scanning, CVE remediation, security audits
- **inventory-master**: Repository cataloging, documentation, dependency tracking
- **cicd-master**: Build automation, deployments, release workflows
- **dashboard-agent**: System monitoring, metrics, observability (read-only)

---

## Symptoms

### Observable Indicators

- Tasks routed to incorrect masters
- Routing confidence scores consistently low (<0.5)
- Master overload (one master gets all tasks)
- Routing failures (no master selected)
- Tasks fail immediately after routing
- Slow routing decisions (>5 seconds)

### Error Messages

```
ERROR: No master matched for task: task-001
WARNING: Low routing confidence (0.3) for task: task-002
ERROR: MoE router failed to determine master
WARNING: All masters rejected task: task-003
Router learning update failed: malformed routing decision
```

### Metrics/Alerts

- Routing confidence < 0.5 for multiple tasks
- Single master handling >80% of tasks
- Routing time > 5 seconds
- Routing decisions file corrupted
- Master handoff failures

---

## Diagnosis

### Step 1: Check Routing Decision Log

```bash
# View recent routing decisions
tail -20 coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl | jq .

# Each decision contains:
# - task_description: Original task text
# - selected_master: Which master was chosen
# - confidence: How confident the router was (0.0-1.0)
# - reasoning: Why this master was selected
# - timestamp: When decision was made

# Check for low confidence decisions
cat coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl | \
    jq 'select(.confidence < 0.5) | {task_description, selected_master, confidence}'

# Check master distribution
cat coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl | \
    jq -r '.selected_master' | sort | uniq -c | sort -rn
```

### Step 2: Test Router Manually

```bash
# Test routing logic with sample tasks
./coordination/masters/coordinator/lib/moe-router.sh test-001 \
    "Fix bug in user authentication causing login failures"

# Expected output:
# - Selected master: development-master
# - Confidence: >0.7
# - Keywords: fix, bug, authentication
# - Reasoning: Development-related task

# Test another sample
./coordination/masters/coordinator/lib/moe-router.sh test-002 \
    "Scan repository for CVE-2024-12345 vulnerability"

# Expected output:
# - Selected master: security-master
# - Confidence: >0.8
# - Keywords: scan, CVE, vulnerability
# - Reasoning: Security task
```

### Step 3: Check Keyword Extraction

```bash
# The router uses keyword extraction to determine master

# View router script keyword logic
cat coordination/masters/coordinator/lib/moe-router.sh | \
    grep -A 5 "extract_keywords"

# Common keywords by master:
# development: implement, build, create, fix, bug, refactor, update, feature
# security: scan, vulnerability, CVE, audit, security, compliance, secrets
# inventory: document, catalog, track, inventory, dependency, analyze
# cicd: deploy, build, release, pipeline, test, integration, workflow
# dashboard: monitor, observe, metrics, dashboard, alert, health

# Test keyword extraction
task_desc="Implement new API endpoint for user authentication"
echo "$task_desc" | tr '[:upper:]' '[:lower:]' | \
    grep -oE 'implement|build|create|fix|feature' || echo "No keywords matched"
```

### Step 4: Check Learning System

```bash
# View routing decisions file structure
head -5 coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl

# Check for malformed JSON
jq empty coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl 2>&1 || \
    echo "ERROR: Routing decisions file contains invalid JSON"

# Count decisions by outcome
cat coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl | \
    jq -s 'group_by(.selected_master) |
    map({master: .[0].selected_master,
         count: length,
         avg_confidence: (map(.confidence) | add / length)})'

# Check recent learning updates
grep "learning" agents/logs/system/coordinator-daemon.log | tail -10
```

### Step 5: Identify Root Cause

Common MoE router issues:

| Symptom | Likely Cause | Next Step |
|---------|--------------|-----------|
| Low confidence across all tasks | Keyword list incomplete | Update keyword extraction |
| One master gets all tasks | Keyword overlap or single dominant pattern | Balance keyword sets |
| Routing takes >5s | Large routing decisions file | Archive old decisions |
| Master rejects routed task | Misrouting or master misconfiguration | Fix router logic |
| No master matched | Task description too vague | Improve task descriptions |
| Router script errors | Syntax error or dependency issue | Check router script |

---

## Resolution

### Fix Low Routing Confidence

#### Update Keyword Lists

```bash
# Edit router script to add missing keywords
vim coordination/masters/coordinator/lib/moe-router.sh

# Find the keyword extraction section
# Example additions:

# Development keywords: "enhance", "optimize", "debug", "develop"
# Security keywords: "penetration", "breach", "exploit", "patch"
# Inventory keywords: "audit", "survey", "index", "list"
# CI/CD keywords: "compile", "package", "stage", "rollback"

# After editing, test with sample tasks
./coordination/masters/coordinator/lib/moe-router.sh test-keywords \
    "Optimize database queries for better performance"

# Should now match "optimize" -> development-master with higher confidence
```

#### Improve Confidence Scoring

```bash
# Current confidence algorithm:
# - Base score from keyword match
# - Bonus for multiple keyword matches
# - Historical success factor

# To improve scoring, edit moe-router.sh:
vim coordination/masters/coordinator/lib/moe-router.sh

# Locate confidence calculation section
# Adjust weights:
# - Increase multi-keyword bonus: 0.1 -> 0.15
# - Add specificity bonus (exact phrase match)
# - Consider task priority in scoring

# Example enhancement:
# if grep -qi "security audit" <<< "$task_description"; then
#     security_score=$((security_score + 20))  # Exact phrase bonus
# fi
```

### Fix Master Distribution Imbalance

```bash
# If one master is overloaded:

# 1. Check current distribution
cat coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl | \
    jq -r '.selected_master' | sort | uniq -c

# 2. Identify why (keyword overlap?)
# Example: "build" might match both development and cicd

# 3. Make keywords more specific
vim coordination/masters/coordinator/lib/moe-router.sh

# Refine keyword matching:
# - Use exact phrases for specificity
# - Add negative keywords (exclude patterns)
# - Implement priority ordering (check security first for CVE)

# 4. Restart coordinator daemon to reload router
kill $(cat /tmp/commit-relay-coordinator-daemon.pid)
./scripts/coordinator-daemon.sh &
```

### Fix Slow Routing Decisions

```bash
# If routing takes >5 seconds:

# 1. Check routing decisions file size
ls -lh coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl

# If >10MB, archive old decisions
cutoff_date=$(date -d '30 days ago' +%Y-%m-%d)

# Backup full history
cp coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl \
   coordination/masters/coordinator/knowledge-base/routing-decisions-archive-$(date +%Y%m%d).jsonl

# Keep only recent decisions (last 30 days)
jq -c "select(.timestamp >= \"$cutoff_date\")" \
   coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl > \
   /tmp/routing-decisions-recent.jsonl

mv /tmp/routing-decisions-recent.jsonl \
   coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl

echo "Archived old routing decisions, kept last 30 days"
```

### Fix Router Script Errors

```bash
# If router script failing:

# 1. Check syntax
bash -n coordination/masters/coordinator/lib/moe-router.sh

# 2. Check dependencies
which jq || echo "ERROR: jq not installed"
which bc || echo "ERROR: bc not installed"

# 3. Test router directly
bash -x coordination/masters/coordinator/lib/moe-router.sh test-001 \
    "Test task description" 2>&1 | tail -50

# 4. Check recent errors
grep -i "error" agents/logs/system/coordinator-daemon.log | grep "moe-router" | tail -20

# 5. Restore from backup if corrupted
if [ -f coordination/masters/coordinator/lib/moe-router.sh.backup ]; then
    cp coordination/masters/coordinator/lib/moe-router.sh.backup \
       coordination/masters/coordinator/lib/moe-router.sh
fi
```

### Fix Misrouting Issues

```bash
# If tasks consistently routed to wrong master:

# 1. Identify pattern
cat coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl | \
    jq 'select(.selected_master == "security-master") | .task_description' | \
    grep -i "implement"
# If finding "implement" tasks routed to security, that's wrong

# 2. Add task type disambiguation
vim coordination/masters/coordinator/lib/moe-router.sh

# Add priority rules (check in order):
# Example:
# # Priority 1: Security (CVE, vulnerability)
# if grep -qiE "cve|vulnerability|security|exploit" <<< "$task_desc"; then
#     selected_master="security-master"
#     confidence=0.9
#     return
# fi
#
# # Priority 2: CI/CD (deploy, build, pipeline)
# if grep -qiE "deploy|build|pipeline|release" <<< "$task_desc"; then
#     selected_master="cicd-master"
#     confidence=0.85
#     return
# fi

# 3. Test updated logic
./coordination/masters/coordinator/lib/moe-router.sh test-disambig \
    "Deploy security patch to production"

# Should route to cicd-master (deploy) not security-master
```

### Reset Learning Data

```bash
# If routing decisions file corrupted or learning causing issues:

# 1. Backup current decisions
cp coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl \
   coordination/masters/coordinator/knowledge-base/routing-decisions.backup

# 2. Start fresh (WARNING: Loses routing history)
echo "" > coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl

# 3. Or keep only high-confidence decisions as seed data
jq -c 'select(.confidence >= 0.8)' \
   coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl > \
   /tmp/high-conf-decisions.jsonl

mv /tmp/high-conf-decisions.jsonl \
   coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl

echo "Reset to high-confidence decisions only"
```

---

## Verification

```bash
# 1. Test routing with sample tasks
./coordination/masters/coordinator/lib/moe-router.sh verify-001 \
    "Fix authentication bug in login service"
# Expect: development-master, confidence > 0.7

./coordination/masters/coordinator/lib/moe-router.sh verify-002 \
    "Scan for SQL injection vulnerabilities"
# Expect: security-master, confidence > 0.8

./coordination/masters/coordinator/lib/moe-router.sh verify-003 \
    "Deploy new release to staging environment"
# Expect: cicd-master, confidence > 0.7

# 2. Check routing decision distribution
cat coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl | \
    jq -r '.selected_master' | tail -20 | sort | uniq -c

# Should show balanced distribution

# 3. Check average confidence
cat coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl | \
    jq -s 'map(.confidence) | add / length'

# Should be > 0.65

# 4. Monitor real-time routing
tail -f coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl | jq .

# Submit a test task and watch routing decision
```

---

## Prevention

### Monitoring

```bash
# 1. Daily routing quality check
cat coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl | \
    tail -100 | jq -s 'map(select(.confidence < 0.5)) | length'

# Alert if >10 low-confidence decisions in last 100

# 2. Master workload balance check
cat coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl | \
    tail -100 | jq -r '.selected_master' | sort | uniq -c

# Alert if any master has >60% of tasks

# 3. Routing time monitoring
# Add timing logs to moe-router.sh
# Alert if routing takes >3 seconds
```

### Best Practices

1. **Clear Task Descriptions** - Provide specific, keyword-rich task descriptions
2. **Regular Router Updates** - Review and update keywords quarterly
3. **Learning Data Maintenance** - Archive old routing decisions monthly
4. **Testing** - Test router with sample tasks before deploying changes
5. **Documentation** - Document new task types and expected routing

---

## Related Runbooks

- [Daily Operations](./daily-operations.md) - Regular monitoring procedures
- [Performance Troubleshooting](./performance-troubleshooting.md) - Slow routing
- [Worker Failure](./worker-failure.md) - If misrouting causes worker failures

---

## Quick Reference

### Common Commands

```bash
# Test router
./coordination/masters/coordinator/lib/moe-router.sh <task-id> "<task-description>"

# View recent routing decisions
tail -20 coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl | jq .

# Check confidence distribution
cat coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl | \
    jq -s 'group_by((.confidence * 10 | floor) / 10) |
    map({confidence_range: "\(.[0].confidence | floor * 10)/10", count: length})'

# Archive old decisions
jq -c 'select(.timestamp >= "'$(date -d '30 days ago' +%Y-%m-%d)'")' \
    routing-decisions.jsonl > routing-decisions-recent.jsonl
```

### Decision Tree

```
Low Routing Confidence
├─ Missing keywords
│  └─ Update keyword lists in router
│
├─ Ambiguous task description
│  └─ Improve task description clarity
│
├─ New task type (no historical data)
│  └─ Add specific keywords for new type
│
└─ Router logic outdated
   └─ Review and update routing algorithm
```

---

## Escalation Path

1. **Tier 1**: Keyword updates, minor tuning (DevOps)
2. **Tier 2**: Router algorithm changes (ML Ops)
3. **Tier 3**: Master architecture changes (Architecture team)

**Escalate to Tier 2 if:**
- Keyword updates don't improve confidence
- Systematic misrouting persists
- Need to redesign confidence scoring

**Escalate to Tier 3 if:**
- Need new master specialist
- Master responsibility overlap issues
- Fundamental router redesign needed

---

## Revision History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2025-11-18 | 1.0 | Phase 5 Team | Initial runbook creation |

---

**Last Updated**: 2025-11-18
**Next Review**: 2025-12-18
