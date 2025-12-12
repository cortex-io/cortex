# Cortex Deployment Runbook

## Quick Reference

| Action | Command |
|--------|---------|
| Deploy to production | Merge to `main` or create tag `vX.Y.Z` |
| Deploy to staging | Create PR to `main` |
| Manual deployment | GitHub Actions → k8s-deploy.yml → Run workflow |
| Rollback | GitHub Actions → Manual Rollback → Run workflow |
| Check status | `kubectl get pods -n cortex` |
| View logs | `kubectl logs -n cortex deployment/cortex-coordinator` |
| Emergency rollback | `./scripts/deploy/rollback.sh` |

## Table of Contents

1. [Normal Deployment](#normal-deployment)
2. [Emergency Rollback](#emergency-rollback)
3. [Disaster Recovery](#disaster-recovery)
4. [Scaling Operations](#scaling-operations)
5. [Troubleshooting](#troubleshooting)

---

## Normal Deployment

### Pre-Deployment Checklist

- [ ] All tests passing in CI
- [ ] PR approved and reviewed
- [ ] Staging deployment successful
- [ ] Change log prepared
- [ ] Backup verified (last 24 hours)
- [ ] Monitoring dashboards accessible
- [ ] Team notified (if major release)

### Standard Deployment (Automated)

**For regular updates:**

1. **Merge PR to main**
   ```bash
   git checkout main
   git pull origin main
   git merge --no-ff feature/your-feature
   git push origin main
   ```

2. **Automatic workflow triggers**
   - GitHub Actions detects push to main
   - Builds Docker image
   - Runs security scan
   - Deploys to production
   - Runs smoke tests

3. **Monitor deployment**
   - Go to: https://github.com/ryandahlberg/cortex/actions
   - Watch workflow progress
   - Check for any failures

4. **Verify deployment**
   ```bash
   kubectl get deployments -n cortex
   kubectl get pods -n cortex
   kubectl logs -n cortex deployment/cortex-coordinator --tail=50
   ```

5. **Smoke tests**
   ```bash
   # Check coordinator health
   kubectl exec -n cortex deployment/cortex-coordinator -- \
     ls /app/coordination/status.json

   # Verify metrics endpoint
   kubectl exec -n cortex deployment/cortex-coordinator -- \
     curl -s http://localhost:8080/metrics
   ```

### Release Deployment (Versioned)

**For major releases with version tags:**

1. **Create release using helper script**
   ```bash
   ./scripts/release/create-release.sh \
     --version v1.3.0 \
     --changelog "feat: Auto-scaling workers, fix: Memory leak"
   ```

2. **Script automatically:**
   - Creates git tag
   - Pushes to origin
   - Triggers release workflow

3. **GitHub Actions:**
   - Builds multi-arch image
   - Creates GitHub release
   - Awaits production approval

4. **Approve production deployment**
   - Go to: https://github.com/ryandahlberg/cortex/actions
   - Find release workflow
   - Click "Review deployments"
   - Approve "production" environment

5. **Monitor deployment** (same as standard)

### Blue/Green Deployment (Zero Downtime)

**For critical updates requiring instant rollback capability:**

1. **Prepare new version**
   ```bash
   NEW_IMAGE="ghcr.io/ryandahlberg/cortex:v1.3.0"
   ```

2. **Execute blue/green deployment**
   ```bash
   ./scripts/deploy/blue-green-deploy.sh \
     --image $NEW_IMAGE \
     --namespace cortex
   ```

3. **Script automatically:**
   - Deploys green environment
   - Runs validation tests
   - Switches traffic to green
   - Keeps blue for 1 hour

4. **Monitor green environment**
   ```bash
   kubectl get pods -n cortex -l version=green
   kubectl logs -n cortex -l version=green --tail=100
   ```

5. **Verify traffic switch**
   ```bash
   kubectl get service cortex-coordinator -n cortex -o yaml | grep version
   ```

6. **Quick rollback (if needed)**
   ```bash
   # Within 1-hour window
   kubectl patch service cortex-coordinator -n cortex \
     -p '{"spec":{"selector":{"version":"blue"}}}'
   ```

### Canary Deployment (Gradual Rollout)

**For risky changes requiring gradual validation:**

1. **Execute canary deployment**
   ```bash
   ./scripts/deploy/canary-deploy.sh \
     --image ghcr.io/ryandahlberg/cortex:v1.3.0 \
     --namespace cortex
   ```

2. **Script automatically:**
   - Deploys canary at 10%
   - Monitors for 5 minutes
   - Increases to 25%, 50%, 100%
   - Auto-rolls back on errors

3. **Monitor canary pods**
   ```bash
   watch -n 5 'kubectl get pods -n cortex -l version=canary'
   ```

4. **Check error rates**
   ```bash
   kubectl logs -n cortex -l version=canary --tail=100 | grep -i error
   ```

### Post-Deployment Verification

**Always verify after deployment:**

1. **Pod health**
   ```bash
   kubectl get pods -n cortex
   # All pods should be Running and Ready 1/1
   ```

2. **Coordinator logs**
   ```bash
   kubectl logs -n cortex deployment/cortex-coordinator --tail=100
   # Look for startup messages, no errors
   ```

3. **Task queue accessible**
   ```bash
   kubectl exec -n cortex deployment/cortex-coordinator -- \
     cat /app/coordination/task-queue.json | jq '.'
   ```

4. **Metrics available**
   ```bash
   kubectl exec -n cortex deployment/cortex-coordinator -- \
     curl -s http://localhost:8080/metrics | grep cortex_
   ```

5. **Check Grafana dashboard**
   - Go to: Grafana dashboard
   - Verify no spike in errors
   - Check deployment annotation created

---

## Emergency Rollback

### Immediate Rollback (Critical Issues)

**When to use:** Application down, critical bugs, data corruption

1. **Via GitHub Actions (Recommended)**

   a. Go to: https://github.com/ryandahlberg/cortex/actions

   b. Click "Manual Rollback" workflow

   c. Click "Run workflow"

   d. Select:
      - Environment: `production`
      - Target version: (leave empty for previous) or specific version
      - Restore state: `false` (unless needed)
      - Reason: "Critical bug - application down"

   e. Click "Run workflow"

   f. Monitor progress in Actions tab

2. **Via Command Line (Faster)**

   ```bash
   # Rollback to previous version
   ./scripts/deploy/rollback.sh --namespace cortex

   # Rollback to specific version
   ./scripts/deploy/rollback.sh \
     --to-version v1.2.3 \
     --namespace cortex
   ```

3. **Verify rollback**
   ```bash
   kubectl get deployments -n cortex
   kubectl get pods -n cortex
   kubectl logs -n cortex deployment/cortex-coordinator --tail=50
   ```

### Rollback with State Restoration

**When to use:** Data corruption, state issues

1. **Find latest backup**
   ```bash
   ls -lth /tmp/cortex-backups/
   # Or check GitHub Actions artifacts
   ```

2. **Execute rollback with restore**
   ```bash
   ./scripts/deploy/rollback.sh \
     --restore-state \
     --namespace cortex
   ```

3. **Or via GitHub Actions**
   - Run "Manual Rollback" workflow
   - Check "Restore state" option
   - Requires backup in `/tmp/cortex-state-backup.tar.gz`

4. **Verify state restoration**
   ```bash
   kubectl exec -n cortex deployment/cortex-coordinator -- \
     ls -la /app/coordination/
   ```

### Partial Rollback (Single Component)

**Rollback only coordinator:**
```bash
kubectl rollout undo deployment/cortex-coordinator -n cortex
kubectl rollout status deployment/cortex-coordinator -n cortex
```

**Rollback only development master:**
```bash
kubectl rollout undo deployment/cortex-development-master -n cortex
```

### Rollback Verification Checklist

After rollback:

- [ ] All pods running and ready
- [ ] No crash loops (check restart count)
- [ ] Logs show no errors
- [ ] Coordination files accessible
- [ ] Metrics endpoint responding
- [ ] Grafana showing normal metrics
- [ ] Create incident post-mortem issue

---

## Disaster Recovery

### Complete Cluster Failure

**Scenario:** K3s cluster is down or corrupted

1. **Verify cluster status**
   ```bash
   kubectl cluster-info
   kubectl get nodes
   ```

2. **If cluster is accessible but corrupted:**

   a. Delete namespace
   ```bash
   kubectl delete namespace cortex --grace-period=0 --force
   ```

   b. Recreate from backups
   ```bash
   kubectl create namespace cortex
   kubectl apply -f k8s/
   ```

   c. Restore state
   ```bash
   ./scripts/backup/restore-cortex-state.sh \
     --backup /path/to/latest-backup.tar.gz \
     --namespace cortex
   ```

3. **If cluster is completely down:**

   a. Rebuild K3s cluster (see K3s setup docs)

   b. Deploy Cortex from scratch
   ```bash
   kubectl apply -f k8s/
   ```

   c. Restore coordination state
   ```bash
   ./scripts/backup/restore-cortex-state.sh \
     --backup /path/to/latest-backup.tar.gz \
     --namespace cortex
   ```

### PVC Data Loss

**Scenario:** Persistent volume corrupted or deleted

1. **Stop all deployments**
   ```bash
   kubectl scale deployment --all --replicas=0 -n cortex
   ```

2. **Delete and recreate PVC**
   ```bash
   kubectl delete pvc cortex-coordination-pvc -n cortex
   kubectl apply -f k8s/pvc.yaml
   ```

3. **Restore from backup**
   ```bash
   # Scale coordinator back up
   kubectl scale deployment cortex-coordinator --replicas=1 -n cortex

   # Wait for pod
   kubectl wait --for=condition=ready pod -l component=coordinator -n cortex --timeout=2m

   # Restore state
   ./scripts/backup/restore-cortex-state.sh \
     --backup /path/to/backup.tar.gz \
     --namespace cortex
   ```

4. **Scale other masters back up**
   ```bash
   kubectl scale deployment --all --replicas=1 -n cortex
   ```

### Backup Restoration Procedure

1. **Download backup**
   ```bash
   # From GitHub Actions
   gh run download <run-id> -n cortex-backup-<run-id>

   # From S3 (if configured)
   aws s3 cp s3://bucket/cortex-backups/cortex-backup-20250101.tar.gz ./
   ```

2. **Extract and inspect**
   ```bash
   tar xzf cortex-backup-20250101.tar.gz
   cd cortex-backup-20250101/
   cat metadata.json | jq '.'
   ```

3. **Restore**
   ```bash
   ../scripts/backup/restore-cortex-state.sh \
     --backup ../cortex-backup-20250101.tar.gz \
     --namespace cortex
   ```

---

## Scaling Operations

### Scale Coordinator

```bash
# Scale up
kubectl scale deployment cortex-coordinator --replicas=2 -n cortex

# Scale down
kubectl scale deployment cortex-coordinator --replicas=1 -n cortex
```

### Scale Masters

```bash
# Scale all masters
kubectl scale deployment \
  cortex-development-master \
  cortex-cicd-master \
  cortex-security-master \
  --replicas=2 -n cortex
```

### Scale Worker Pool (via HPA)

```bash
# Update HPA
kubectl patch hpa cortex-worker-hpa -n cortex \
  -p '{"spec":{"maxReplicas":100}}'

# Check HPA status
kubectl get hpa -n cortex
```

### Add Cluster Nodes

**For K3s:**

1. **On new node:**
   ```bash
   curl -sfL https://get.k3s.io | \
     K3S_URL=https://k3s-server:6443 \
     K3S_TOKEN=<token> \
     sh -
   ```

2. **Verify node joined:**
   ```bash
   kubectl get nodes
   ```

3. **Cortex will auto-scale to new nodes**

---

## Troubleshooting

### Pod Won't Start

**Symptoms:** Pod stuck in Pending or ImagePullBackOff

**Diagnosis:**
```bash
kubectl describe pod <pod-name> -n cortex
kubectl get events -n cortex --sort-by='.lastTimestamp' | tail -20
```

**Common fixes:**

1. **Image pull error:**
   ```bash
   # Verify image exists
   docker pull ghcr.io/ryandahlberg/cortex:latest

   # Check image pull secrets
   kubectl get secrets -n cortex
   ```

2. **Resource constraints:**
   ```bash
   # Check node resources
   kubectl top nodes

   # Reduce resource requests
   kubectl edit deployment cortex-coordinator -n cortex
   ```

3. **PVC not bound:**
   ```bash
   kubectl get pvc -n cortex
   kubectl describe pvc cortex-coordination-pvc -n cortex
   ```

### High Memory Usage

**Symptoms:** Pods being OOMKilled, restarts

**Diagnosis:**
```bash
kubectl top pods -n cortex
kubectl logs -n cortex <pod-name> --previous
```

**Fixes:**

1. **Increase memory limits:**
   ```bash
   kubectl edit deployment cortex-coordinator -n cortex
   # Change: memory: "4Gi"
   ```

2. **Check for memory leaks:**
   ```bash
   kubectl logs -n cortex deployment/cortex-coordinator --tail=500 | grep -i memory
   ```

3. **Restart pod:**
   ```bash
   kubectl rollout restart deployment/cortex-coordinator -n cortex
   ```

### Coordinator Not Processing Tasks

**Diagnosis:**
```bash
# Check coordinator logs
kubectl logs -n cortex deployment/cortex-coordinator --tail=100

# Check task queue
kubectl exec -n cortex deployment/cortex-coordinator -- \
  cat /app/coordination/task-queue.json | jq '.tasks | length'

# Check worker status
kubectl exec -n cortex deployment/cortex-coordinator -- \
  cat /app/coordination/worker-pool.json | jq '.'
```

**Fixes:**

1. **Restart coordinator:**
   ```bash
   kubectl rollout restart deployment/cortex-coordinator -n cortex
   ```

2. **Clear stuck tasks:**
   ```bash
   kubectl exec -n cortex deployment/cortex-coordinator -- \
     bash -c 'echo "{\"tasks\":[]}" > /app/coordination/task-queue.json'
   ```

3. **Check API key:**
   ```bash
   kubectl get secret cortex-secrets -n cortex -o jsonpath='{.data.anthropic-api-key}' | base64 -d
   ```

### Workers Not Scaling

**Diagnosis:**
```bash
# Check HPA
kubectl get hpa -n cortex
kubectl describe hpa cortex-worker-hpa -n cortex

# Check metrics
kubectl top pods -n cortex
```

**Fixes:**

1. **Verify metrics server:**
   ```bash
   kubectl get apiservice v1beta1.metrics.k8s.io -o yaml
   ```

2. **Manually scale:**
   ```bash
   kubectl scale deployment cortex-workers --replicas=5 -n cortex
   ```

3. **Check HPA configuration:**
   ```bash
   kubectl edit hpa cortex-worker-hpa -n cortex
   ```

### Network Issues

**Symptoms:** Pods can't reach API endpoints

**Diagnosis:**
```bash
# Test from pod
kubectl exec -n cortex deployment/cortex-coordinator -- \
  curl -I https://api.anthropic.com

# Check network policy
kubectl get networkpolicy -n cortex
kubectl describe networkpolicy cortex-network-policy -n cortex
```

**Fixes:**

1. **Update network policy:**
   ```bash
   kubectl edit networkpolicy cortex-network-policy -n cortex
   ```

2. **Temporarily disable network policy:**
   ```bash
   kubectl delete networkpolicy cortex-network-policy -n cortex
   ```

---

## Contacts & Escalation

### On-Call Rotation
- Primary: DevOps Team
- Secondary: Engineering Lead
- Escalation: CTO

### Communication Channels
- Slack: #cortex-alerts
- PagerDuty: Cortex Production
- Email: devops@example.com

### Emergency Procedures
1. Assess impact and severity
2. Notify team in #cortex-alerts
3. Execute rollback if needed
4. Create incident issue
5. Post-mortem within 48 hours

---

## Appendix: Useful Commands

```bash
# Get all resources
kubectl get all -n cortex

# Watch pods
watch -n 2 'kubectl get pods -n cortex'

# Follow logs
kubectl logs -n cortex -f deployment/cortex-coordinator

# Port forward for debugging
kubectl port-forward -n cortex deployment/cortex-coordinator 8080:8080

# Execute command in pod
kubectl exec -it -n cortex deployment/cortex-coordinator -- bash

# Copy files from pod
kubectl cp cortex/<pod-name>:/app/coordination/status.json ./status.json

# Describe all pods
kubectl describe pods -n cortex

# Get events
kubectl get events -n cortex --watch

# Check resource usage
kubectl top pods -n cortex
kubectl top nodes
```
