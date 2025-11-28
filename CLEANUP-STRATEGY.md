# Cleanup Strategy: Unused Testing Infrastructure

**Created:** 2025-11-28
**Status:** Ready for execution

## Summary

Identified **555 DDQD-related files** and multiple unused testing frameworks consuming **~2.6MB** of disk space. These are legacy testing artifacts from Cortex v4.0 development that are no longer actively used.

## Identified Unused Infrastructure

### 1. DDQD Testing Suite (Distributed Daemon Queue Dispatcher)

**Purpose:** "God mode" stress test from Cortex v4.0 development
**Status:** Legacy, no longer actively used
**Size:** ~970KB across 555 files

**Files to Remove:**
- `coordination/stress-test/` directory (944KB)
  - 73 report files (`ddqd-v5-*-report.txt`)
  - Metrics and MoE metrics JSON files
  - All test run artifacts from Nov 26-27

- `coordination/tasks/` DDQD artifacts (291 files)
  - Pending tasks: `ddqd-v5-*-task-*.json`
  - Completed tasks: `moe-test-ddqd-v5-*-completed.json`

- Scripts:
  - `scripts/ddqd` - Interactive launcher
  - `scripts/stress-test-ddqd.sh` - Main test script (24KB)
  - `scripts/STRESS-TEST.md` - Documentation

- Referenced in codebase:
  - Legacy patterns scan found 3,722 references
  - Many are historical logs/metrics (can be archived)

### 2. Other Test Infrastructure to Evaluate

**Keep (Active):**
- `testing/unit/` - Unit tests (20 files, 672KB total)
- `testing/integration/` - Integration tests
- `testing/pre-deployment/` - Pre-deployment checks
- `scripts/lib/ab-testing.sh` - A/B testing framework (in use)

**Potentially Remove:**
- `scripts/load-test-workers.sh` - If superseded by newer tests
- `scripts/test-autonomous-execution.sh` - If no longer used
- `scripts/test-core-foundation.sh` - If superseded
- `scripts/test-environment-isolation.sh` - If no longer used
- `scripts/test-metrics-framework.sh` - If metrics framework is stable
- `scripts/test-routing-cascade.sh` - If routing is stable
- `scripts/test-tracing.sh` - If tracing is stable
- `scripts/test-version-aliases.sh` - If version system is stable

## Removal Strategy

### Phase 1: Archive DDQD Artifacts (Safe)

Archive stress test results before deletion:

```bash
# Create archive
mkdir -p archives/ddqd-stress-tests
tar -czf archives/ddqd-stress-tests/ddqd-artifacts-$(date +%Y%m%d).tar.gz \
    coordination/stress-test/ \
    coordination/tasks/*ddqd* \
    scripts/ddqd \
    scripts/stress-test-ddqd.sh \
    scripts/STRESS-TEST.md

# Verify archive
tar -tzf archives/ddqd-stress-tests/ddqd-artifacts-$(date +%Y%m%d).tar.gz | head -20
```

### Phase 2: Remove DDQD Infrastructure

```bash
# Remove stress test directory
rm -rf coordination/stress-test/

# Remove DDQD task files
rm -f coordination/tasks/pending/ddqd*.json
rm -f coordination/tasks/pending/*ddqd*.json
rm -f coordination/tasks/completed/moe-test-ddqd*.json

# Remove DDQD scripts
rm -f scripts/ddqd
rm -f scripts/stress-test-ddqd.sh
rm -f scripts/STRESS-TEST.md
```

**Expected savings:** ~970KB disk space, 555 fewer files

### Phase 3: Evaluate and Remove Inactive Test Scripts

For each test script, check:
1. Last modification date
2. References in active code
3. Purpose still relevant

```bash
# Check last use
for script in scripts/test-*.sh scripts/load-test-*.sh; do
    echo "=== $script ==="
    echo "Last modified: $(stat -f%Sm "$script")"
    echo "References: $(grep -r "$(basename $script)" . --include="*.sh" --exclude-dir=.git 2>/dev/null | wc -l)"
    echo ""
done
```

### Phase 4: Clean Task Queue

DDQD tests created 291 task files (mostly pending, never executed):

```bash
# Count pending DDQD tasks
find coordination/tasks/pending -name "*ddqd*" | wc -l

# Remove if confirmed unused
find coordination/tasks/pending -name "*ddqd*" -delete
```

### Phase 5: Update Documentation

After removal:
1. Update README to remove DDQD references
2. Update testing documentation
3. Note that stress test artifacts are archived

## Risk Assessment

**Low Risk:**
- DDQD stress tests: Archive exists, test framework is legacy
- Task queue cleanup: Tasks are stale (Nov 26-27), never executed
- Stress test results: Historical data, can be archived

**Medium Risk:**
- Test scripts removal: Verify no active usage first
- Check if any CI/CD pipelines reference these

**Mitigation:**
- Create archive before deletion
- Git tracks all changes (can restore if needed)
- Verify no active references with grep before removal

## Execution Checklist

- [ ] Phase 1: Create DDQD archive
- [ ] Verify archive integrity
- [ ] Phase 2: Remove DDQD infrastructure
- [ ] Verify system still functions
- [ ] Phase 3: Evaluate test scripts (one by one)
- [ ] Phase 4: Clean task queue
- [ ] Phase 5: Update documentation
- [ ] Run cleanup master scan to verify
- [ ] Commit changes with descriptive message

## Expected Outcomes

**Disk Space:** Recover ~1-2MB
**File Count:** Remove ~550+ files
**Maintenance:** Reduce confusion about active vs legacy tests
**Clarity:** Cleaner codebase structure

## Notes

- DDQD was valuable during v4.0 development but is now superseded by:
  - Standard unit/integration tests in `testing/`
  - Pre-deployment checks
  - Real production monitoring

- Stress test results from Nov 26-27 show system was working correctly at that time

- All data will be preserved in git history and in the archive

## Next Steps

1. Review this strategy
2. Execute Phase 1 (archive creation)
3. Test that archive is valid
4. Execute removals phase by phase
5. Run cleanup master scan to verify no broken references
