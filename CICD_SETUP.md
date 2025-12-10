# Cortex CI/CD Pipeline Setup Guide

Production-ready CI/CD pipeline for the Cortex automation system with GitHub Actions and ArgoCD GitOps.

## Overview

This guide covers the complete CI/CD setup for Cortex, including:

- **Continuous Integration**: Automated testing, linting, building, and security scanning
- **Continuous Deployment**: GitOps-based deployment to Kubernetes using ArgoCD
- **Release Management**: Semantic versioning and automated changelog generation
- **Security**: Comprehensive security scanning and compliance checks

## Architecture

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   GitHub    │─────▶│   GitHub    │─────▶│    GHCR     │─────▶│   ArgoCD    │
│  Repository │      │   Actions   │      │  Registry   │      │   GitOps    │
└─────────────┘      └─────────────┘      └─────────────┘      └─────────────┘
                             │                                          │
                             │                                          │
                             ▼                                          ▼
                     ┌─────────────┐                          ┌─────────────┐
                     │  Security   │                          │ Kubernetes  │
                     │  Scanning   │                          │   Cluster   │
                     └─────────────┘                          └─────────────┘
```

## Files Created

### GitHub Actions Workflows

| File | Purpose | Trigger |
|------|---------|---------|
| `.github/workflows/ci.yaml` | Main CI pipeline | Push, PR |
| `.github/workflows/cd.yaml` | Deployment pipeline | Main branch, tags |
| `.github/workflows/release.yaml` | Semantic versioning | Main branch |
| `.github/workflows/security-scan.yaml` | Security scanning | Daily, PR |
| `.github/workflows/pr-check.yaml` | PR validation | PR events |

### ArgoCD GitOps Configuration

| File | Purpose |
|------|---------|
| `deploy/argocd/project.yaml` | ArgoCD project with RBAC |
| `deploy/argocd/application.yaml` | Static applications |
| `deploy/argocd/applicationset.yaml` | Dynamic MCP server deployment |
| `deploy/argocd/README.md` | ArgoCD documentation |

### Supporting Files

| File | Purpose |
|------|---------|
| `.github/labeler.yml` | Auto-labeling for PRs |
| `.github/PULL_REQUEST_TEMPLATE.md` | PR template |
| `deploy/README.md` | Deployment guide |

## Quick Start

### 1. GitHub Secrets Setup

Add these secrets in GitHub repository settings:

```bash
# Container Registry
GITHUB_TOKEN                 # Auto-provided by GitHub

# Kubernetes Access
KUBECONFIG_STAGING          # Base64-encoded kubeconfig for staging
KUBECONFIG_PRODUCTION       # Base64-encoded kubeconfig for production

# ArgoCD Access
ARGOCD_SERVER               # ArgoCD server URL (e.g., argocd.example.com)
ARGOCD_USERNAME             # ArgoCD admin username
ARGOCD_PASSWORD             # ArgoCD admin password
ARGOCD_SERVER_PROD          # Production ArgoCD server (if different)

# Optional
SLACK_WEBHOOK_URL           # For notifications
CODECOV_TOKEN               # For code coverage
```

#### Generate kubeconfig secrets:

```bash
# Encode kubeconfig for staging
cat ~/.kube/config-staging | base64 | pbcopy

# Encode kubeconfig for production
cat ~/.kube/config-production | base64 | pbcopy
```

### 2. ArgoCD Installation

```bash
# Create ArgoCD namespace
kubectl create namespace argocd

# Install ArgoCD
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Wait for ArgoCD to be ready
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=argocd-server -n argocd --timeout=300s

# Get admin password
ARGOCD_PASSWORD=$(kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d)
echo "ArgoCD admin password: $ARGOCD_PASSWORD"

# Port forward to access UI
kubectl port-forward svc/argocd-server -n argocd 8080:443

# Access ArgoCD UI
open https://localhost:8080
```

### 3. Deploy Cortex with ArgoCD

```bash
# Login to ArgoCD CLI
argocd login localhost:8080 --username admin --password "$ARGOCD_PASSWORD" --insecure

# Apply Cortex project
kubectl apply -f deploy/argocd/project.yaml

# Deploy applications
kubectl apply -f deploy/argocd/application.yaml

# Deploy ApplicationSet for MCP servers
kubectl apply -f deploy/argocd/applicationset.yaml

# Verify deployment
argocd app list
argocd app get cortex-dashboard
```

### 4. Verify CI/CD Pipeline

```bash
# Create a test branch
git checkout -b feature/test-cicd

# Make a change
echo "# Test CI/CD" >> README.md

# Commit and push
git add README.md
git commit -m "feat: test CI/CD pipeline"
git push origin feature/test-cicd

# Create PR via GitHub CLI
gh pr create --title "feat: test CI/CD pipeline" --body "Testing CI/CD setup"

# Watch workflow execution
gh run watch
```

## CI Pipeline Details

### Workflow: `ci.yaml`

**Triggers**: Push to main/develop/feature/bugfix branches, PRs

**Jobs**:

1. **Lint & Format Check** (10 min)
   - ESLint for TypeScript/JavaScript
   - Prettier formatting validation
   - ShellCheck for bash scripts

2. **TypeScript Type Check** (10 min)
   - Full type validation across workspace
   - Interface compatibility checks

3. **Test Suite** (15 min)
   - Matrix: Node.js 18.x, 20.x
   - Unit + integration tests
   - Coverage reporting to Codecov
   - Threshold: 80% coverage

4. **Build MCP Servers** (15 min)
   - Matrix: 5 MCP packages
   - Parallel builds
   - Artifact upload

5. **Build Docker Images** (20 min)
   - Matrix: 5 MCP packages
   - BuildKit caching
   - Multi-platform support

6. **Validate Coordination Files** (10 min)
   - JSON validation
   - YAML validation
   - Schema compliance

7. **Build Dashboard** (15 min)
   - Astro SSG build
   - Static asset optimization

### Caching Strategy

```yaml
# pnpm store cache
- uses: actions/cache@v4
  with:
    path: ~/.pnpm-store
    key: ${{ runner.os }}-pnpm-${{ hashFiles('**/pnpm-lock.yaml') }}

# Docker BuildKit cache
- uses: docker/build-push-action@v5
  with:
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

## CD Pipeline Details

### Workflow: `cd.yaml`

**Triggers**: Push to main, tags matching `v*.*.*`, manual dispatch

**Jobs**:

1. **Build & Push Images** (30 min)
   - Matrix: All MCP servers
   - Push to ghcr.io
   - Image signing with Cosign
   - Tags: latest, sha, version

2. **Update ArgoCD Manifests** (10 min)
   - Update image tags in Git
   - Automated commit & push

3. **Deploy to Staging** (15 min)
   - ArgoCD sync
   - Health check verification
   - Smoke tests

4. **Deploy to Production** (20 min)
   - Requires: Tag `v*.*.*`
   - Canary rollout strategy
   - Backup before deployment
   - Comprehensive testing
   - Auto-rollback on failure

### Image Tagging

```
ghcr.io/ryandahlberg/cortex/mcp-k8s-orchestrator:
  - latest                    (main branch)
  - main-abc123f              (commit SHA)
  - v1.2.3                    (semantic version)
  - v1.2                      (minor version)
  - v1                        (major version)
```

## Release Pipeline Details

### Workflow: `release.yaml`

**Triggers**: Push to main, manual dispatch

**Conventional Commits**:

| Type | Release | Example |
|------|---------|---------|
| `feat` | Minor (0.1.0) | `feat: add new feature` |
| `fix` | Patch (0.0.1) | `fix: resolve bug` |
| `perf` | Patch (0.0.1) | `perf: optimize query` |
| `feat!` | Major (1.0.0) | `feat!: breaking change` |

**Release Process**:

1. Analyze commits since last release
2. Determine next version
3. Generate changelog
4. Create GitHub release
5. Build release artifacts
6. Upload to release
7. Create announcement issue

## Security Scanning Details

### Workflow: `security-scan.yaml`

**Triggers**: Push, PR, daily at 2 AM UTC

**Scans**:

1. **Dependency Scan**
   - pnpm audit
   - npm audit
   - Threshold: 0 critical, ≤5 high

2. **Container Image Scan**
   - Trivy vulnerability scanning
   - SARIF upload to GitHub Security

3. **SAST with CodeQL**
   - JavaScript analysis
   - Python analysis
   - Security query pack

4. **Secret Scanning**
   - Gitleaks
   - TruffleHog
   - Historical commits

5. **License Compliance**
   - License checker
   - GPL/AGPL detection

6. **IaC Security**
   - Trivy IaC scanner
   - Checkov (Kubernetes, Dockerfile)

7. **SBOM Generation**
   - CycloneDX format
   - SPDX format

## PR Validation Details

### Workflow: `pr-check.yaml`

**Triggers**: PR opened, synchronized, reopened

**Validations**:

1. **PR Metadata**
   - Conventional commit title
   - Description length (≥50 chars)
   - Branch naming convention

2. **Commit Lint**
   - All commits validated
   - Conventional format required

3. **Code Quality**
   - Linting
   - Formatting
   - Type checking
   - console.log detection

4. **Test Coverage**
   - Threshold: 80%
   - PR comment with report

5. **Changed Files Analysis**
   - Impact assessment
   - Component identification

6. **Security Check**
   - Dependency audit
   - Secret scanning

7. **Build Verification**
   - All packages build successfully

8. **PR Size Check**
   - Auto-labeling (XS, S, M, L, XL)
   - Large PR warnings

### PR Title Format

```
type(scope): description

Examples:
✅ feat(mcp-k8s): add pod scaling support
✅ fix(dashboard): resolve memory leak
✅ docs(readme): update installation guide
❌ Add new feature
❌ Fixed bug
```

### Branch Naming

```
type/description

Examples:
✅ feature/add-monitoring
✅ bugfix/fix-memory-leak
✅ hotfix/critical-security-patch
❌ my-feature
❌ fix
```

## ArgoCD GitOps

### Project Structure

```
cortex (AppProject)
├── cortex-dashboard          (Application)
├── cortex-monitoring         (Application)
├── cortex-mcp-orchestrator   (Application)
└── cortex-mcp-servers        (ApplicationSet)
    ├── mcp-k8s-orchestrator  (Generated)
    ├── mcp-n8n-workflow      (Generated)
    ├── mcp-talos-node        (Generated)
    ├── mcp-s3-storage        (Generated)
    └── mcp-postgres-data     (Generated)
```

### Sync Policy

All applications use:

- **Automated sync**: Changes from Git applied automatically
- **Self-heal**: Reverts manual cluster changes
- **Prune**: Removes resources deleted from Git
- **Retry**: Exponential backoff on failures

### Sync Waves

```
Wave 0: Monitoring (Prometheus, Grafana)
Wave 1: Dashboard
Wave 2: MCP Servers
```

### ApplicationSet Generators

#### List Generator
Deploys MCP servers with custom config:

```yaml
elements:
  - name: mcp-k8s-orchestrator
    replicas: 3
    priority: high
```

#### Matrix Generator
Multi-environment deployment:

```yaml
environments × mcp-servers = applications
```

#### Git Directory Generator
Auto-discovery of new MCP servers:

```yaml
directories:
  - path: packages/mcp-*
```

## Monitoring & Observability

### Metrics

All services expose Prometheus metrics at `/metrics`:

```bash
# Port forward and check metrics
kubectl port-forward -n cortex-mcp svc/mcp-k8s-orchestrator 3000:3000
curl http://localhost:3000/metrics
```

### Grafana Dashboards

Pre-configured dashboards:

1. **Cortex Overview**
   - System health
   - Request rates
   - Error rates

2. **MCP Servers Performance**
   - Per-server metrics
   - Resource usage
   - Latency percentiles

3. **Resource Usage**
   - CPU/Memory consumption
   - Pod scaling events
   - HPA metrics

### Alerts

Alert rules configured for:

- High error rates (>1%)
- High latency (p95 >500ms)
- Pod crashes
- Resource saturation
- Health check failures

## Troubleshooting

### CI Pipeline Failures

```bash
# View workflow runs
gh run list --workflow=ci.yaml

# View specific run
gh run view <run-id>

# Download logs
gh run download <run-id>

# Re-run failed jobs
gh run rerun <run-id> --failed
```

### CD Pipeline Issues

```bash
# Check ArgoCD app status
argocd app get cortex-dashboard

# View sync errors
argocd app logs cortex-dashboard

# Force sync
argocd app sync cortex-dashboard --force

# Rollback
argocd app rollback cortex-dashboard
```

### Image Pull Errors

```bash
# Create image pull secret
kubectl create secret docker-registry ghcr-secret \
  --docker-server=ghcr.io \
  --docker-username=<username> \
  --docker-password=<token> \
  -n cortex-mcp

# Verify secret
kubectl get secret ghcr-secret -n cortex-mcp -o yaml
```

### Application Not Syncing

```bash
# Refresh application
argocd app refresh cortex-dashboard

# Hard refresh (ignore cache)
argocd app refresh cortex-dashboard --hard

# View diff
argocd app diff cortex-dashboard

# Check sync status
argocd app sync-status cortex-dashboard
```

## Best Practices

### 1. Commit Messages

Use conventional commits:

```bash
git commit -m "feat(mcp-k8s): add pod scaling"
git commit -m "fix(dashboard): resolve memory leak"
git commit -m "docs: update deployment guide"
```

### 2. Pull Requests

- Keep PRs small (<600 lines changed)
- Include tests for new features
- Update documentation
- Add meaningful description

### 3. Branching Strategy

```
main          ← Production releases
  └─ develop  ← Integration branch
      ├─ feature/xxx
      ├─ bugfix/xxx
      └─ hotfix/xxx
```

### 4. Release Process

```bash
# 1. Merge features to develop
git checkout develop
git merge feature/new-feature

# 2. Test on staging
git push origin develop

# 3. Create release PR to main
gh pr create --base main --head develop

# 4. Tag release
git tag -a v1.2.3 -m "Release v1.2.3"
git push origin v1.2.3

# 5. ArgoCD deploys to production
```

### 5. Rollback Strategy

```bash
# Via ArgoCD
argocd app rollback cortex-dashboard

# Via Git revert
git revert <commit-sha>
git push origin main

# Via kubectl (emergency)
kubectl rollout undo deployment/cortex-dashboard -n cortex-dashboard
```

## Security Checklist

- [ ] All secrets stored in GitHub Secrets
- [ ] Image scanning enabled (Trivy)
- [ ] SAST enabled (CodeQL)
- [ ] Secret scanning enabled (Gitleaks, TruffleHog)
- [ ] Dependency scanning enabled (npm audit)
- [ ] Container images signed (Cosign)
- [ ] RBAC configured in ArgoCD
- [ ] Network policies enforced
- [ ] Pod security standards applied
- [ ] TLS/SSL configured for ingress

## Performance Optimization

### CI/CD Optimization

1. **Caching**
   - pnpm store cached
   - Docker BuildKit cache
   - Test results cached

2. **Parallelization**
   - Matrix builds
   - Concurrent jobs
   - Independent workflows

3. **Artifacts**
   - Shared between jobs
   - Retention: 7-30 days

### Deployment Optimization

1. **Resource Limits**
   - Appropriate CPU/memory
   - HPA configured
   - PDB for availability

2. **Health Checks**
   - Fast startup probes
   - Frequent readiness probes
   - Conservative liveness probes

3. **Image Optimization**
   - Multi-stage builds
   - Alpine base images
   - Layer caching

## Resources

### Documentation

- [GitHub Actions Docs](https://docs.github.com/en/actions)
- [ArgoCD Documentation](https://argo-cd.readthedocs.io/)
- [Semantic Release](https://semantic-release.gitbook.io/)
- [Conventional Commits](https://www.conventionalcommits.org/)

### Cortex Documentation

- [CI/CD Workflows](./.github/workflows/README.md)
- [ArgoCD Setup](./deploy/argocd/README.md)
- [Deployment Guide](./deploy/README.md)

### Support

- **GitHub Issues**: [cortex/issues](https://github.com/ryandahlberg/cortex/issues)
- **Slack**: `#cortex-team`
- **Email**: `platform@example.com`

## Next Steps

1. **Configure GitHub Secrets** (see step 1)
2. **Install ArgoCD** (see step 2)
3. **Deploy Cortex** (see step 3)
4. **Test CI/CD** (see step 4)
5. **Configure monitoring** (Prometheus/Grafana)
6. **Setup notifications** (Slack, email)
7. **Configure backups** (Velero)
8. **Document runbooks** (incident response)

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for version history and release notes.

## License

See [LICENSE](./LICENSE) for licensing information.
