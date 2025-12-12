# CI/CD Pipeline Architecture

## Overview

The Cortex CI/CD pipeline provides fully automated deployment, testing, and rollback capabilities for Kubernetes deployments. It supports multiple deployment strategies, automated testing, and comprehensive monitoring.

## Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Source Control                            │
│                         (GitHub)                                 │
└─────────────────┬────────────────────────────────────┬──────────┘
                  │                                     │
         Push to main                           Create tag vX.Y.Z
                  │                                     │
                  ▼                                     ▼
    ┌─────────────────────────┐          ┌─────────────────────────┐
    │  k8s-deploy.yml         │          │  release.yml            │
    │  - Build image          │          │  - Build multi-arch     │
    │  - Security scan        │          │  - Create GitHub release│
    │  - Deploy to prod       │          │  - Deploy to production │
    │  - Smoke tests          │          │  - Create annotation    │
    └─────────────────────────┘          └─────────────────────────┘
                  │                                     │
                  └──────────────┬──────────────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────┐
                  │  deployment-tracking.yml │
                  │  - Monitor metrics       │
                  │  - Auto-rollback         │
                  │  - Send notifications    │
                  └──────────────────────────┘
```

## Workflows

### 1. Main Deployment (`k8s-deploy.yml`)

**Triggers:**
- Push to `main` branch → Deploy to production
- Workflow dispatch → Deploy to selected environment

**Jobs:**
1. **build-and-push**: Build Docker image, scan for vulnerabilities, push to GHCR
2. **deploy-to-k3s**: Update K8s manifests, apply to cluster, run smoke tests
3. **rollback-on-failure**: Auto-rollback if deployment fails

**Environment Variables:**
```yaml
KUBE_CONFIG_DATA: Base64 kubeconfig
ANTHROPIC_API_KEY: Claude API key
PROXMOX_TOKEN_VALUE: Proxmox API token
```

### 2. Staging Deployment (`k8s-staging.yml`)

**Triggers:**
- Pull request to `main` → Deploy to staging namespace

**Features:**
- Ephemeral staging environment
- Reduced resource limits
- Automated integration tests
- PR comment with deployment status

### 3. Integration Tests (`integration-tests.yml`)

**Triggers:**
- Pull request creation

**Test Suite:**
- Pod health checks
- Coordination file validation
- Task submission tests
- Auto-scaling verification
- Performance benchmarks

### 4. Release Automation (`release.yml`)

**Triggers:**
- Git tag push (vX.Y.Z)
- Manual workflow dispatch

**Steps:**
1. Generate changelog from git history
2. Build multi-arch image (amd64, arm64)
3. Create GitHub release
4. Deploy to production (with approval gate)
5. Create Grafana annotation

### 5. Manual Rollback (`manual-rollback.yml`)

**Triggers:**
- Manual workflow dispatch only

**Capabilities:**
- Rollback to specific version
- Rollback to previous revision
- Restore coordination state from backup
- Create incident issue

### 6. Daily Backup (`daily-backup.yml`)

**Schedule:** Daily at 2 AM UTC

**Backs up:**
- Coordination state from PVC
- ConfigMaps
- Secrets (encrypted)
- K8s manifests

**Retention:** 30 days

### 7. Deployment Tracking (`deployment-tracking.yml`)

**Triggers:**
- Deployment status changes

**Monitoring:**
- Error rate tracking
- Pod restart monitoring
- Auto-rollback on high errors
- Grafana annotations
- Slack/Discord notifications

## Deployment Strategies

### Rolling Update (Default)

Standard Kubernetes rolling update for StatefulSets and Deployments.

```bash
kubectl set image deployment/cortex-coordinator \
  coordinator=ghcr.io/ryandahlberg/cortex:v1.2.3
```

### Blue/Green Deployment

Zero-downtime deployment with instant rollback capability.

```bash
./scripts/deploy/blue-green-deploy.sh \
  --image ghcr.io/ryandahlberg/cortex:v1.3.0 \
  --namespace cortex
```

**Process:**
1. Deploy new version (green) alongside current (blue)
2. Run validation tests on green
3. Switch service selector to green
4. Monitor for 5 minutes
5. Keep blue for 1 hour (quick rollback)
6. Delete blue deployment

### Canary Deployment

Gradual rollout with automated rollback on errors.

```bash
./scripts/deploy/canary-deploy.sh \
  --image ghcr.io/ryandahlberg/cortex:v1.3.0 \
  --namespace cortex
```

**Traffic Progression:**
- 10% canary → Monitor 5 min
- 25% canary → Monitor 5 min
- 50% canary → Monitor 5 min
- 100% canary → Complete

**Auto-rollback triggers:**
- Error rate > 5%
- Pod restarts > 2
- Health check failures

## Environment Management

### Kustomize Overlays

Three environments with different configurations:

#### Development (`k8s/environments/dev/`)
```yaml
replicas: 1
resources:
  memory: 1Gi
  cpu: 500m
workers: 1
cooldown: 60s
log_level: debug
```

#### Staging (`k8s/environments/staging/`)
```yaml
replicas: 1
resources:
  memory: 1.5Gi
  cpu: 750m
workers: 10
cooldown: 120s
log_level: info
```

#### Production (`k8s/environments/production/`)
```yaml
replicas: 1
resources:
  memory: 2Gi
  cpu: 1000m
workers: 50
cooldown: 300s
log_level: info
monitoring: enabled
```

### Environment Promotion Flow

```
Feature Branch → PR → Staging → Merge → Production
                  ↓               ↓          ↓
              Integration     Main Workflow  Release Tag
                Tests         Deploy         Full Deploy
```

## Rollback Procedures

### Automated Rollback

Triggered automatically on:
- Deployment failure
- High error rates (>10%)
- Pod crash loops
- Health check failures

### Manual Rollback

#### Via GitHub Actions

1. Go to Actions → Manual Rollback
2. Select environment
3. Choose target version or "previous"
4. Optionally restore state from backup
5. Provide reason for rollback

#### Via Command Line

```bash
# Rollback to previous revision
./scripts/deploy/rollback.sh --namespace cortex

# Rollback to specific version
./scripts/deploy/rollback.sh \
  --to-version v1.2.3 \
  --namespace cortex

# Rollback with state restoration
./scripts/deploy/rollback.sh \
  --restore-state \
  --namespace cortex
```

## Backup & Restore

### Automated Backups

- **Schedule:** Daily at 2 AM UTC
- **Retention:** 30 days
- **Storage:** GitHub Artifacts + Optional S3/Proxmox

### Manual Backup

```bash
./scripts/backup/backup-cortex-state.sh
```

### Restore from Backup

```bash
./scripts/backup/restore-cortex-state.sh \
  --backup /tmp/cortex-backups/cortex-backup-20250101-020000.tar.gz \
  --namespace cortex
```

## Monitoring & Alerting

### Grafana Integration

Deployments create annotations in Grafana:

```json
{
  "text": "Cortex deployed: v1.3.0",
  "tags": ["deployment", "kubernetes", "cortex"],
  "time": 1704067200000
}
```

### Metrics Tracked

- Deployment success rate
- Time to deploy (MTTD)
- Time to recovery (MTTR)
- Change failure rate (CFR)
- Rollback frequency

### Notifications

Configure webhooks for deployment notifications:

```yaml
secrets:
  SLACK_WEBHOOK: https://hooks.slack.com/...
  DISCORD_WEBHOOK: https://discord.com/api/webhooks/...
  GRAFANA_URL: https://grafana.example.com
  GRAFANA_TOKEN: glsa_...
```

## Security

### Secrets Management

All secrets stored in GitHub Secrets and Kubernetes Secrets:

- `KUBE_CONFIG_DATA`: Kubeconfig (base64)
- `ANTHROPIC_API_KEY`: Claude API key
- `PROXMOX_TOKEN_VALUE`: Proxmox API token
- `GHCR_TOKEN`: GitHub Container Registry PAT

### Image Scanning

All images scanned with Trivy:
- Critical vulnerabilities block deployment
- Results uploaded to GitHub Security
- SARIF format for integration

### Network Policies

Production deployments include network policies:
- Egress to API endpoints only
- Ingress from Prometheus/Grafana
- Deny all other traffic

## Performance

### Pipeline Times

| Workflow | Typical Duration |
|----------|------------------|
| Build & Push | 3-5 minutes |
| Deploy to K3s | 2-3 minutes |
| Integration Tests | 5-7 minutes |
| Blue/Green Deploy | 8-10 minutes |
| Canary Deploy | 20-25 minutes |
| Rollback | 2-3 minutes |

### Optimization Strategies

1. **Docker layer caching** via GitHub Actions cache
2. **Parallel test execution** across test suites
3. **Resource pre-warming** in staging
4. **Image reuse** for identical builds

## Troubleshooting

### Common Issues

**1. Deployment timeout**
```bash
# Check pod status
kubectl get pods -n cortex

# Check events
kubectl get events -n cortex --sort-by='.lastTimestamp'

# Check logs
kubectl logs -n cortex deployment/cortex-coordinator --tail=100
```

**2. Rollback failed**
```bash
# Manual rollout undo
kubectl rollout undo deployment/cortex-coordinator -n cortex

# Check rollout history
kubectl rollout history deployment/cortex-coordinator -n cortex
```

**3. Image pull errors**
```bash
# Verify image exists
docker pull ghcr.io/ryandahlberg/cortex:latest

# Check image pull secrets
kubectl get secrets -n cortex
```

## Best Practices

1. **Always test in staging first** before production deployments
2. **Use semantic versioning** for releases (vX.Y.Z)
3. **Write descriptive changelog messages** for releases
4. **Monitor deployments for 30 minutes** after completion
5. **Keep rollback window open** (1 hour for blue/green)
6. **Verify backups regularly** by testing restoration
7. **Use feature flags** for risky changes
8. **Tag releases** for traceability

## Resources

- Deployment Scripts: `/scripts/deploy/`
- Test Scripts: `/scripts/testing/`
- Backup Scripts: `/scripts/backup/`
- Kustomize Overlays: `/k8s/environments/`
- GitHub Workflows: `/.github/workflows/`

## Support

For issues or questions:
- Check deployment runbook: `docs/deployment/DEPLOYMENT-RUNBOOK.md`
- Review workflow logs: GitHub Actions
- Contact: DevOps team
