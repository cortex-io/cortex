# Master Version Aliases System

## Overview

The Master Version Aliases system enables safe, progressive deployments of master agents using Champion/Challenger/Shadow patterns. This allows testing new versions before full production rollout with easy rollback capabilities.

## Architecture

### Directory Structure

```
coordination/masters/<master_id>/
├── versions/
│   ├── v1.0.0/              # Version directories
│   ├── v1.1.0/
│   ├── v2.0.0/
│   └── aliases.json         # Alias configuration
├── context/
├── knowledge-base/
└── workers/
```

### Alias Types

| Alias | Purpose | Traffic | Impact |
|-------|---------|---------|--------|
| **Champion** | Production version | 100% (or 90% with challenger) | Full production impact |
| **Challenger** | Canary version | 10% of traffic | Limited testing in production |
| **Shadow** | Monitoring version | Copy of traffic, responses discarded | No production impact |

## Deployment Flow

### Standard Progressive Deployment

```
New Version (v1.1.0)
    ↓
1. Deploy to Shadow
    - Receives traffic copy
    - Responses discarded
    - Monitor for errors
    ↓
2. Promote to Challenger
    - Receives 10% traffic
    - Responses used
    - Compare metrics with champion
    ↓
3. Promote to Champion
    - Becomes production version
    - Receives 100% traffic
    - Previous champion retired
```

## Usage

### View Current Aliases

```bash
./scripts/promote-master.sh coordinator show
```

**Output:**
```
=== Master Version Aliases: coordinator ===

Champion (Production):    v1.0.0
Challenger (Canary):      v1.1.0
Shadow (Monitoring):

Available Versions:
  - v1.0.0
  - v1.1.0
  - v1.2.0

Version History (last 5):
  2025-11-27T21:50:54Z: v1.1.0 (champion)
  2025-11-27T21:50:50Z: v1.1.0 (challenger)
  2025-11-27T21:50:45Z: v1.1.0 (shadow)
  2025-11-27T00:00:00Z: v1.0.0 (champion)
```

### Deploy New Version

```bash
# Step 1: Deploy to shadow for monitoring
./scripts/promote-master.sh coordinator deploy-shadow v1.1.0

# Step 2: After validation, promote to challenger
./scripts/promote-master.sh coordinator promote-to-challenger

# Step 3: After successful canary testing, promote to champion
./scripts/promote-master.sh coordinator promote-to-champion
```

### Rollback

```bash
# Rollback champion to previous version
./scripts/promote-master.sh coordinator rollback
```

### Direct Champion Assignment (Emergency)

```bash
# WARNING: Bypasses safety checks
./scripts/promote-master.sh coordinator set-champion v1.0.0
```

## Library Functions

### scripts/lib/read-alias.sh

Core functions for version alias management:

```bash
# Source the library
source scripts/lib/read-alias.sh

# Get champion version
version=$(get_champion_version "coordinator")
# Returns: "v1.0.0"

# Get version path
path=$(get_master_version_path "security" "champion")
# Returns: "/path/to/coordination/masters/security/versions/v1.0.0"

# Validate champion exists
validate_champion "development"
# Returns: 0 if valid, 1 if invalid

# Get all available versions
get_available_versions "inventory"
# Returns: List of versions (one per line)

# Get alias information
get_alias_info "cicd" "challenger"
# Returns: JSON object with alias details
```

## Integration with Run Scripts

All `run-*-master.sh` scripts now include:

1. **Library Source**: Loads version alias functions
2. **Validation**: Checks champion version exists
3. **Version Logging**: Reports active version

Example from run-coordinator-master.sh:

```bash
# Source libraries
source "$SCRIPT_DIR/lib/logging.sh"
source "$SCRIPT_DIR/lib/coordination.sh"
source "$SCRIPT_DIR/lib/read-alias.sh"

# Main execution
main() {
    log_section "Starting $MASTER_NAME"

    # Validate master version
    if ! validate_champion "coordinator"; then
        log_error "Champion version validation failed"
        exit 1
    fi
    MASTER_VERSION=$(get_champion_version "coordinator")
    log_info "Running champion version: $MASTER_VERSION"

    # ... rest of execution
}
```

## Version Creation Workflow

### 1. Create Version Directory

```bash
mkdir -p coordination/masters/coordinator/versions/v1.1.0
```

### 2. Add Version Files

Place version-specific files in the version directory:
- Configuration changes
- Updated prompts
- Modified logic files
- Version documentation

### 3. Deploy to Shadow

```bash
./scripts/promote-master.sh coordinator deploy-shadow v1.1.0
```

### 4. Monitor Shadow Deployment

- Check logs for errors
- Verify behavior matches expectations
- Compare metrics with champion

### 5. Progressive Promotion

```bash
# If shadow looks good
./scripts/promote-master.sh coordinator promote-to-challenger

# Monitor challenger metrics (10% traffic)

# If challenger succeeds
./scripts/promote-master.sh coordinator promote-to-champion
```

## Rollback Scenarios

### Automatic Rollback Triggers

Consider implementing automatic rollback if:
- Error rate > 5% higher than champion
- Response time > 2x champion average
- Critical functionality broken

### Manual Rollback

```bash
./scripts/promote-master.sh coordinator rollback
```

This immediately reverts champion to the previous version.

### Rollback History

Version history maintains full audit trail:

```json
{
  "version_history": [
    {
      "version": "v1.0.0",
      "created_at": "2025-11-27T21:50:58Z",
      "description": "Rollback from v1.1.0",
      "status": "champion"
    },
    {
      "version": "v1.1.0",
      "created_at": "2025-11-27T21:50:54Z",
      "description": "Promoted from challenger to champion",
      "status": "champion"
    }
  ]
}
```

## Files Created

### Core System Files

```
/Users/ryandahlberg/Projects/cortex/
├── scripts/
│   ├── lib/
│   │   └── read-alias.sh                    # Version alias library
│   ├── promote-master.sh                     # Promotion script
│   └── update-masters-for-versioning.sh      # One-time migration
├── coordination/masters/
│   ├── coordinator/versions/
│   │   ├── v1.0.0/
│   │   └── aliases.json
│   ├── security/versions/
│   │   ├── v1.0.0/
│   │   └── aliases.json
│   ├── development/versions/
│   │   ├── v1.0.0/
│   │   └── aliases.json
│   ├── inventory/versions/
│   │   ├── v1.0.0/
│   │   └── aliases.json
│   └── cicd/versions/
│       ├── v1.0.0/
│       └── aliases.json
└── docs/
    └── MASTER-VERSION-ALIASES.md             # This document
```

## Best Practices

### 1. Always Use Progressive Deployment

Don't skip steps. The flow exists to catch issues early:
- Shadow catches obvious errors
- Challenger validates production behavior
- Champion is fully vetted

### 2. Maintain Version Documentation

Each version directory should include:
- `README.md` - What changed
- `CHANGELOG.md` - Detailed changes
- Configuration files
- Migration notes if needed

### 3. Monitor Metrics

Track these metrics for each stage:
- Error rates
- Response times
- Resource usage
- Task completion rates

### 4. Keep Rollback-Ready

- Always have previous version available
- Test rollback in staging
- Document rollback procedures
- Monitor post-rollback behavior

### 5. Version Naming

Use semantic versioning:
- `v1.0.0` - Major.Minor.Patch
- Major: Breaking changes
- Minor: New features
- Patch: Bug fixes

## Example Workflow

### Scenario: Deploying New MoE Router

```bash
# 1. Create new version
mkdir -p coordination/masters/coordinator/versions/v1.2.0

# 2. Copy champion as base
cp -r coordination/masters/coordinator/versions/v1.0.0/* \
      coordination/masters/coordinator/versions/v1.2.0/

# 3. Make changes in v1.2.0
# ... edit files ...

# 4. Deploy to shadow
./scripts/promote-master.sh coordinator deploy-shadow v1.2.0

# 5. Monitor for 1 hour
# ... check logs, metrics ...

# 6. Promote to challenger
./scripts/promote-master.sh coordinator promote-to-challenger

# 7. Monitor for 24 hours (10% traffic)
# ... compare metrics with champion ...

# 8. Promote to champion
./scripts/promote-master.sh coordinator promote-to-champion

# 9. Monitor production
# ... ensure smooth transition ...

# If issues arise:
./scripts/promote-master.sh coordinator rollback
```

## Success Criteria

- ✅ All 5 masters have version directories and aliases
- ✅ Champion validation works in all run scripts
- ✅ Can deploy new version to shadow
- ✅ Can promote through challenger to champion
- ✅ Rollback works and reverts to previous champion
- ✅ Version history tracks all changes
- ✅ Library functions provide clean API

## Future Enhancements

### Planned Features

1. **Automated Traffic Splitting**: Gradual rollout (10% → 50% → 100%)
2. **Metrics Dashboard**: Real-time comparison of versions
3. **Auto-Rollback**: Automatic rollback on error threshold
4. **Version Tagging**: Labels like "stable", "beta", "experimental"
5. **Diff Tool**: Compare versions before promotion
6. **Deployment Hooks**: Pre/post deployment scripts

### Integration Points

- **CI/CD**: Automated version deployment on merge
- **Monitoring**: Prometheus/Grafana for metrics
- **Alerting**: Notifications on version issues
- **Testing**: Automated tests before promotion

## Troubleshooting

### Issue: Champion validation fails

```bash
# Check aliases file
cat coordination/masters/coordinator/versions/aliases.json | jq .

# Verify version exists
ls coordination/masters/coordinator/versions/

# Manually set champion
./scripts/promote-master.sh coordinator set-champion v1.0.0
```

### Issue: Version not appearing in list

```bash
# Check directory name format (must be vX.Y.Z)
ls coordination/masters/coordinator/versions/

# Verify read-alias.sh pattern
grep "v\*\.\*\.\*" scripts/lib/read-alias.sh
```

### Issue: Rollback fails

```bash
# Check version history
cat coordination/masters/coordinator/versions/aliases.json | jq .version_history

# If no history, manually set champion
./scripts/promote-master.sh coordinator set-champion v1.0.0
```

## Conclusion

The Master Version Aliases system provides safe, production-ready deployment patterns for master agents. By following progressive deployment and maintaining rollback capabilities, we can iterate rapidly while maintaining system stability.
