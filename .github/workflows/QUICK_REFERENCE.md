# GitHub Actions Quick Reference

Fast reference for Cortex CI/CD workflows.

## Workflows Overview

| Workflow | File | Trigger | Duration |
|----------|------|---------|----------|
| CI | `ci.yaml` | Push, PR | ~15 min |
| CD | `cd.yaml` | Main, tags | ~30 min |
| Release | `release.yaml` | Main | ~20 min |
| Security | `security-scan.yaml` | Daily, PR | ~25 min |
| PR Check | `pr-check.yaml` | PR events | ~10 min |

## Common Commands

### View Workflows

```bash
# List workflow runs
gh run list

# List runs for specific workflow
gh run list --workflow=ci.yaml

# Watch latest run
gh run watch

# View run details
gh run view <run-id>
```

### Trigger Workflows

```bash
# Manually trigger CD workflow
gh workflow run cd.yaml

# Trigger with inputs
gh workflow run cd.yaml -f environment=staging -f package=mcp-k8s-orchestrator

# Trigger release
gh workflow run release.yaml -f release-type=minor
```

### Debug Workflows

```bash
# Download logs
gh run download <run-id>

# View logs
gh run view <run-id> --log

# Re-run failed jobs
gh run rerun <run-id> --failed

# Cancel run
gh run cancel <run-id>
```

## Commit Message Format

```
type(scope): subject

body (optional)

footer (optional)
```

### Types

| Type | Description | Release |
|------|-------------|---------|
| `feat` | New feature | Minor |
| `fix` | Bug fix | Patch |
| `docs` | Documentation | - |
| `style` | Code style | - |
| `refactor` | Code refactor | - |
| `perf` | Performance | Patch |
| `test` | Tests | - |
| `build` | Build system | - |
| `ci` | CI/CD | - |
| `chore` | Maintenance | - |
| `revert` | Revert commit | Patch |

### Examples

```bash
# Feature (minor version bump)
git commit -m "feat(mcp-k8s): add pod scaling support"

# Bug fix (patch version bump)
git commit -m "fix(dashboard): resolve memory leak in worker manager"

# Breaking change (major version bump)
git commit -m "feat(api)!: change authentication to JWT

BREAKING CHANGE: OAuth2 is no longer supported"

# Documentation
git commit -m "docs(readme): update installation instructions"

# Performance
git commit -m "perf(query): optimize database query for large datasets"
```

## Branch Naming

```
type/description

Examples:
- feature/add-monitoring
- bugfix/fix-memory-leak
- hotfix/critical-security-patch
- release/v1.2.3
```

## PR Requirements

### Title Format
```
type(scope): description

✓ feat(mcp-k8s): add pod scaling
✗ Add pod scaling
```

### Description Sections
- Summary
- Changes
- Testing
- Related Issues

### Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] All tests passing

## CI/CD Status Badges

Add to README.md:

```markdown
![CI](https://github.com/ryandahlberg/cortex/workflows/CI%20Pipeline/badge.svg)
![CD](https://github.com/ryandahlberg/cortex/workflows/CD%20Pipeline/badge.svg)
![Security](https://github.com/ryandahlberg/cortex/workflows/Security%20Scanning/badge.svg)
```

## Secrets Required

GitHub Repository Secrets:

```
GITHUB_TOKEN              # Auto-provided
KUBECONFIG_STAGING        # Base64 kubeconfig
KUBECONFIG_PRODUCTION     # Base64 kubeconfig
ARGOCD_SERVER            # argocd.example.com
ARGOCD_USERNAME          # admin
ARGOCD_PASSWORD          # <password>
ARGOCD_SERVER_PROD       # argocd-prod.example.com
SLACK_WEBHOOK_URL        # (optional)
CODECOV_TOKEN            # (optional)
```

### Generate kubeconfig secret:
```bash
cat ~/.kube/config | base64 | pbcopy
# Paste into GitHub Secrets
```

## Workflow Failures

### CI Failed

```bash
# View failure
gh run view <run-id> --log-failed

# Common causes:
# - Linting errors → run `pnpm run lint --fix`
# - Test failures → run `pnpm test`
# - Type errors → run `pnpm run typecheck`
# - Coverage low → add tests
```

### CD Failed

```bash
# Check ArgoCD
argocd app get cortex-dashboard

# Check logs
kubectl logs -n cortex-dashboard -l app=cortex-dashboard

# Force sync
argocd app sync cortex-dashboard --force

# Rollback
argocd app rollback cortex-dashboard
```

### Security Scan Failed

```bash
# View vulnerabilities
gh run view <run-id> --log | grep -i critical

# Fix dependencies
pnpm update
pnpm audit fix

# Re-run security scan
gh run rerun <run-id>
```

## Quick Fixes

### Lint Errors
```bash
pnpm run lint --fix
git add .
git commit -m "style: fix linting errors"
```

### Test Failures
```bash
pnpm test
# Fix failing tests
git add .
git commit -m "test: fix failing tests"
```

### Type Errors
```bash
pnpm run typecheck
# Fix type errors
git add .
git commit -m "fix: resolve type errors"
```

### Coverage Too Low
```bash
pnpm test -- --coverage
# Add tests for uncovered code
git add .
git commit -m "test: increase coverage to 80%"
```

## Local Testing

### Run Tests Locally
```bash
# All tests
pnpm test

# With coverage
pnpm test -- --coverage

# Specific file
pnpm test src/server.test.ts

# Watch mode
pnpm test -- --watch
```

### Build Locally
```bash
# Build all packages
pnpm run build

# Build specific package
pnpm --filter mcp-k8s-orchestrator run build

# Build Docker image
docker build -t mcp-k8s-orchestrator:test -f packages/mcp-k8s-orchestrator/Dockerfile .
```

### Lint Locally
```bash
# Lint all
pnpm run lint

# Fix automatically
pnpm run lint --fix

# Format check
pnpm run format:check

# Format fix
pnpm run format
```

## Environment-Specific Deployment

### Deploy to Staging
```bash
# Merge to main (auto-deploys)
git checkout main
git merge develop
git push

# Manual trigger
gh workflow run cd.yaml -f environment=staging
```

### Deploy to Production
```bash
# Create tag (triggers production deploy)
git tag -a v1.2.3 -m "Release v1.2.3"
git push origin v1.2.3

# Manual trigger
gh workflow run cd.yaml -f environment=production
```

## Monitoring

### Check Workflow Status
```bash
# All runs
gh run list --limit 10

# Specific workflow
gh run list --workflow=ci.yaml --limit 5

# Failed runs only
gh run list --status=failure
```

### View Metrics
```bash
# Workflow execution time
gh run list --json name,conclusion,createdAt,updatedAt

# Success rate
gh run list --json conclusion | jq '.[] | .conclusion' | sort | uniq -c
```

## Troubleshooting

### Workflow Stuck

```bash
# Cancel stuck run
gh run cancel <run-id>

# Re-run from start
gh run rerun <run-id>
```

### Permission Issues

```bash
# Check workflow permissions
# Settings → Actions → General → Workflow permissions

# Should be: Read and write permissions
```

### Cache Issues

```bash
# Clear pnpm cache
pnpm store prune

# Clear Docker cache
docker builder prune -af

# Re-run without cache
gh run rerun <run-id>
```

## Best Practices

1. Always use conventional commits
2. Keep PRs small (<600 lines)
3. Write descriptive commit messages
4. Add tests for new features
5. Update documentation
6. Review security scan results
7. Monitor workflow failures
8. Use draft PRs for WIP
9. Request reviews before merging
10. Verify deployment in staging first

## Resources

- [GitHub Actions Docs](https://docs.github.com/en/actions)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Workflow Syntax](https://docs.github.com/en/actions/reference/workflow-syntax-for-github-actions)
- [ArgoCD CLI](https://argo-cd.readthedocs.io/en/stable/user-guide/commands/argocd/)
