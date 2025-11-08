# CAG Cache Management Guide

## Overview

The v5.0 Hybrid RAG+CAG architecture uses static knowledge caches to achieve 95% latency reduction. This document explains how to manage, validate, and regenerate these caches.

## Cache Locations

### Master Caches
```
coordination/masters/
├── coordinator/cag-cache/static-knowledge.json  (~3,200 tokens)
├── security/cag-cache/static-knowledge.json     (~2,800 tokens)
├── development/cag-cache/static-knowledge.json  (~2,600 tokens)
├── inventory/cag-cache/static-knowledge.json    (~2,400 tokens)
└── cicd/cag-cache/static-knowledge.json         (~2,200 tokens)
```

### Execution Manager Cache
```
coordination/execution-managers/cag-cache/static-knowledge.json (~4,200 tokens)
```

**Total**: ~17,400 tokens across all caches

---

## Cache Versioning

Each cache file includes version metadata:

```json
{
  "cache_id": "security-master-static-v1",
  "cache_type": "static_system_knowledge",
  "cache_version": "1.0.0",
  "last_updated": "2025-11-07T20:00:00-0600",
  "estimated_tokens": 2800,
  "description": "Static knowledge cache for Security Master (v5.0 Hybrid RAG+CAG)"
}
```

### Version Fields

- **cache_version**: Semantic version (MAJOR.MINOR.PATCH)
- **last_updated**: ISO 8601 timestamp with timezone
- **cache_id**: Unique identifier for the cache
- **estimated_tokens**: Approximate token count

---

## When to Invalidate Caches

### Immediate Invalidation Required

Regenerate caches when:

1. **Worker Specifications Change**
   - New worker types added
   - Token budgets updated
   - Timeout values changed
   - Worker success criteria modified

2. **Coordination Protocols Change**
   - New protocols added
   - Protocol parameters updated
   - Wait strategies modified
   - Failure handling rules changed

3. **Quality Gates Change**
   - New quality gates added
   - Check requirements updated
   - Auto-skip conditions changed

4. **Resource Budgets Change**
   - Token allocations adjusted
   - Operation templates updated
   - SLA thresholds modified

### Recommended Invalidation

Consider regenerating caches when:

1. **Periodic Updates**
   - Monthly cache refresh for maintenance
   - After major system upgrades
   - When success rates change significantly

2. **Performance Tuning**
   - Optimization of coordination patterns
   - Adjustment of common DAG templates
   - Fine-tuning of resource budgets

### No Invalidation Needed

Caches remain valid when:

- ✅ Only dynamic data changes (worker outcomes, task history)
- ✅ Repository catalog updates
- ✅ Historical metrics additions
- ✅ RAG knowledge base growth

---

## Cache Validation

### Manual Validation

```bash
# Validate all caches
./scripts/cag/validate-caches.sh
```

**Output**:
- ✓ Valid caches (version matches, JSON valid)
- ⚠ Stale caches (old version or timestamp)
- ✗ Missing or invalid caches

### Automated Validation

Add to CI/CD pipeline:

```yaml
# .github/workflows/validate-caches.yml
name: Validate CAG Caches
on: [push, pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Validate CAG Caches
        run: ./scripts/cag/validate-caches.sh
```

### Pre-commit Hook

```bash
# .git/hooks/pre-commit
#!/bin/bash
# Validate caches before commit

if git diff --cached --name-only | grep -q "coordination/masters/.*/cag-cache\|coordination/execution-managers/cag-cache"; then
    echo "CAG cache modified, running validation..."
    ./scripts/cag/validate-caches.sh
    if [ $? -ne 0 ]; then
        echo "❌ Cache validation failed. Fix caches before committing."
        exit 1
    fi
fi
```

---

## Cache Regeneration

### When to Regenerate

**Automatic triggers**:
- Cache version mismatch
- Missing cache files
- Invalid JSON structure
- Stale timestamp (>30 days + schema changes)

**Manual triggers**:
- Worker specifications updated
- Coordination protocols revised
- System architecture changes

### Regeneration Process

#### Option 1: Manual Update

1. Edit cache file directly:
```bash
vim coordination/masters/security/cag-cache/static-knowledge.json
```

2. Update version and timestamp:
```json
{
  "cache_version": "1.1.0",
  "last_updated": "2025-11-08T10:30:00-0600"
}
```

3. Validate changes:
```bash
./scripts/cag/validate-caches.sh
```

#### Option 2: Regeneration Script (Future)

```bash
# Regenerate all caches
./scripts/cag/regenerate-caches.sh

# Regenerate specific master cache
./scripts/cag/regenerate-caches.sh --master security

# Regenerate EM cache only
./scripts/cag/regenerate-caches.sh --em-only
```

*Note: Regeneration script to be implemented in future release*

---

## Version History

### v1.0.0 (2025-11-07)
- Initial CAG cache implementation
- 5 master caches + 1 EM cache
- Worker specs, protocols, quality gates, resource budgets
- ~17,400 tokens total

### Planned v1.1.0
- Add adaptive caching (frequently-accessed RAG → CAG)
- Enhanced DAG pattern library
- ML-based cache optimization
- Automatic staleness detection

---

## Cache Invalidation Automation

### Future Enhancements

**Phase 1: Detection** (Planned)
- Monitor coordination files for changes
- Detect when worker specs/protocols update
- Automatic version bump on schema changes

**Phase 2: Regeneration** (Planned)
- Automatic cache regeneration on staleness
- Background daemon for cache updates
- Rolling cache updates (no downtime)

**Phase 3: Optimization** (Planned)
- ML-based cache content optimization
- Usage pattern analysis for cache prioritization
- Adaptive caching based on access frequency

---

## Troubleshooting

### Cache Validation Fails

**Problem**: `✗ Invalid JSON`
```bash
# Fix: Validate JSON syntax
jq empty coordination/masters/security/cag-cache/static-knowledge.json
# If error, fix JSON syntax and retry
```

**Problem**: `⚠ Version Mismatch`
```bash
# Fix: Update cache version
jq '.cache_version = "1.0.0" | .last_updated = "'$(date +"%Y-%m-%dT%H:%M:%S%z")'"' \
  coordination/masters/security/cag-cache/static-knowledge.json > /tmp/cache.json
mv /tmp/cache.json coordination/masters/security/cag-cache/static-knowledge.json
```

**Problem**: `✗ Missing` cache file
```bash
# Fix: Copy template from another master and customize
cp coordination/masters/security/cag-cache/static-knowledge.json \
   coordination/masters/NEW_MASTER/cag-cache/static-knowledge.json
# Edit new file with master-specific content
```

### Performance Degradation

If you notice slower decision-making:

1. **Check cache loading**:
   - Verify caches are being loaded at initialization
   - Check master/EM prompts include CAG instructions
   - Validate cache file sizes (<10KB each)

2. **Validate cache content**:
   - Run `./scripts/cag/load-cache.sh` to check all caches
   - Ensure all caches are valid JSON
   - Check estimated tokens match actual size

3. **Monitor usage**:
   - Track decision latency in production
   - Compare v5.0 vs v4.0 performance
   - Run benchmark: `./scripts/cag/benchmark-cag.sh`

---

## Best Practices

### DO

✅ Validate caches after editing
✅ Version bump on schema changes
✅ Update timestamp after modifications
✅ Keep caches under 10KB each
✅ Document changes in cache description
✅ Test caches with load-cache.sh before committing

### DON'T

❌ Commit invalid JSON
❌ Change cache_id (it's immutable)
❌ Remove required fields
❌ Exceed token budget (watch estimated_tokens)
❌ Mix dynamic data into static caches
❌ Forget to update last_updated timestamp

---

## Monitoring

### Cache Health Metrics

Track these KPIs:

- **Cache Hit Rate**: % of decisions using CAG vs RAG
- **Latency Reduction**: Avg decision time with vs without cache
- **Token Efficiency**: Token savings from cached access
- **Staleness**: Days since last cache update

### Monitoring Script (Example)

```bash
#!/bin/bash
# Monitor cache health

TOTAL_CACHES=6
VALID_CACHES=$(./scripts/cag/validate-caches.sh 2>&1 | grep -c "✓ Valid")
CACHE_HEALTH=$((VALID_CACHES * 100 / TOTAL_CACHES))

echo "Cache Health: ${CACHE_HEALTH}%"
if [ $CACHE_HEALTH -lt 100 ]; then
    echo "⚠️ Some caches need attention"
    ./scripts/cag/validate-caches.sh
fi
```

---

## References

- [Hybrid RAG+CAG Architecture Guide](./hybrid-rag-cag-architecture.md)
- [v5.0 Implementation Summary](./v5.0-hybrid-rag-cag-summary.md)
- [Vector Database README](../coordination/vector-db/README.md)
- [Master Prompts](../agents/prompts/)

---

**Status**: Production Ready
**Version**: 1.0.0
**Last Updated**: November 7, 2025
**Maintainer**: commit-relay system
