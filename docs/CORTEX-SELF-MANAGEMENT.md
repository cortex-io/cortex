# Cortex Self-Management Architecture

**The Ultimate Autonomous Loop:** Cortex managing itself from within K3s

---

## Architecture

```
┌─────────────────────────────────────────────┐
│ K3s Cluster (cortex-system namespace)       │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─────────────────────────────┐           │
│  │  Cortex Masters (running)   │           │
│  │  - coordinator-master       │           │
│  │  - development-master       │           │
│  │  - security-master          │           │
│  │  - cicd-master             │           │
│  └─────────────┬───────────────┘           │
│                ↓                             │
│  ┌─────────────────────────────┐           │
│  │  Self-Update Job            │           │
│  │  1. Clone repo in pod       │           │
│  │  2. Make changes            │           │
│  │  3. Commit to Git           │           │
│  │  4. Push to GitHub          │           │
│  └─────────────┬───────────────┘           │
│                ↓                             │
│  ┌─────────────────────────────┐           │
│  │  GitHub Actions             │           │
│  │  - Build new image          │           │
│  │  - Push to GHCR             │           │
│  └─────────────┬───────────────┘           │
│                ↓                             │
│  ┌─────────────────────────────┐           │
│  │  K3s Rolling Update         │           │
│  │  - Pull new image           │           │
│  │  - Replace pods             │           │
│  │  - Cortex updated!          │           │
│  └─────────────────────────────┘           │
│                                             │
└─────────────────────────────────────────────┘
```

---

## How It Works

### 1. Cortex Lives in K3s

All Cortex masters run as pods in the `cortex-system` namespace:
- coordinator-master
- development-master
- security-master
- cicd-master
- dashboard

### 2. Self-Update Job

When Cortex needs to make changes:

```bash
kubectl apply -f k8s/jobs/cortex-self-update-job.yaml
```

The Job:
1. **Clones** the repository into a pod
2. **Makes changes** to code/config
3. **Commits** with descriptive message
4. **Pushes** to GitHub (using stored credentials)

### 3. GitHub Actions Trigger

Push to `docker-container` branch triggers:
- Docker image build
- Push to GHCR: `ghcr.io/ry-ops/cortex:latest`
- Optional: Tag with commit SHA

### 4. K3s Rolling Update

```bash
kubectl rollout restart deployment -n cortex-system
# OR
kubectl set image deployment/coordinator-master \
  cortex=ghcr.io/ry-ops/cortex:latest -n cortex-system
```

Pods automatically pull new image and restart.

**Cortex has updated itself!** 🤖

---

## Prerequisites

### GitHub Credentials Secret

```bash
kubectl apply -f k8s/config/github-credentials-secret.yaml
```

Contains:
- GitHub Personal Access Token (repo permissions)
- Git username and email
- Repository URL

### RBAC Permissions

Cortex needs:
- **Secrets:** Read GitHub credentials
- **Pods:** Create jobs for self-update
- **Deployments:** Restart itself
- **ConfigMaps:** Read git-config

---

## Usage

### Trigger Self-Update

From local machine:
```bash
kubectl apply -f k8s/jobs/cortex-self-update-job.yaml
```

From within a Cortex pod:
```bash
kubectl apply -f /app/k8s/jobs/cortex-self-update-job.yaml
```

From Cortex coordinator:
```python
# Python code in Cortex
import subprocess
subprocess.run([
    "kubectl", "apply", "-f",
    "/app/k8s/jobs/cortex-self-update-job.yaml"
])
```

### Monitor Progress

```bash
# Watch job
kubectl get job cortex-self-update -n cortex-system -w

# View logs
kubectl logs -f job/cortex-self-update -n cortex-system

# Check commit
cd /Users/ryandahlberg/Projects/cortex
git pull origin docker-container
git log -1
```

### Verify Update

```bash
# Check if new image is running
kubectl get pods -n cortex-system -o yaml | grep "image:"

# Check pod age (should be recent)
kubectl get pods -n cortex-system

# Verify functionality
kubectl logs -l app=coordinator-master -n cortex-system --tail=20
```

---

## Self-Update Scenarios

### 1. Configuration Change

Cortex detects config needs updating:
```python
# In coordinator-master
def update_config():
    # Make changes to config files
    # Commit and push
    trigger_self_update_job()
    wait_for_deployment_rollout()
```

### 2. Bug Fix

Cortex detects a bug in its own code:
```python
# In development-master
def fix_bug():
    # Apply bug fix to code
    # Run tests
    # Commit and push
    trigger_self_update_job()
```

### 3. Feature Addition

User requests new capability:
```python
# In coordinator-master
def add_feature(feature_spec):
    # Generate code for feature
    # Write tests
    # Update documentation
    # Commit and push
    trigger_self_update_job()
```

### 4. Dependency Update

Security scan finds vulnerable dependency:
```python
# In security-master
def update_dependency(package, version):
    # Update requirements.txt or package.json
    # Run security scan
    # Commit and push
    trigger_self_update_job()
```

---

## Security Considerations

### GitHub Token Security

**Storage:** Kubernetes Secret (encrypted at rest)
**Access:** Only Cortex pods with proper RBAC
**Permissions:** Repo scope only (not org-wide)
**Rotation:** Token should be rotated periodically

### Code Review

**Option 1: Auto-merge** (fully autonomous)
- Changes pushed directly to docker-container
- CI/CD runs tests
- Auto-deploy if tests pass

**Option 2: Pull Request** (human oversight)
- Changes pushed to feature branch
- PR created automatically
- Human review before merge
- Deploy after approval

### Audit Trail

All self-updates logged:
- Git commit history (who, what, when)
- Kubernetes Job logs (execution details)
- GitHub Actions logs (build/deploy)
- Dashboard events (user-visible)

---

## Rollback Procedure

If self-update causes issues:

```bash
# Rollback deployment
kubectl rollout undo deployment/coordinator-master -n cortex-system

# OR revert to specific revision
kubectl rollout history deployment/coordinator-master -n cortex-system
kubectl rollout undo deployment/coordinator-master --to-revision=2 -n cortex-system

# OR redeploy previous image
kubectl set image deployment/coordinator-master \
  cortex=ghcr.io/ry-ops/cortex:docker-container-<previous-sha> \
  -n cortex-system
```

---

## Future Enhancements

### Automated Testing Before Push

```yaml
# Add test container to Job
- name: test-runner
  image: ghcr.io/ry-ops/cortex:latest
  command: ["pytest", "/workspace/tests/"]
```

### Canary Deployments

```yaml
# Deploy to single pod first
apiVersion: apps/v1
kind: Deployment
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
```

### Self-Healing

```python
# Monitor for failures and auto-rollback
if deployment_fails():
    kubectl_rollback()
    create_incident_report()
    notify_user()
```

---

## Examples

### Example 1: Update Docker Image Tag

```bash
# Cortex updates its own image tag
kubectl apply -f - <<EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: cortex-update-image-tag
  namespace: cortex-system
spec:
  template:
    spec:
      containers:
      - name: updater
        image: ghcr.io/ry-ops/cortex:latest
        command: ["/bin/bash", "-c"]
        args:
          - |
            cd /workspace
            sed -i 's/image: .*/image: ghcr.io\/ry-ops\/cortex:v2.0.0/' k8s/masters/coordinator/deployment.yaml
            git add -A
            git commit -m "feat: Update to v2.0.0"
            git push
EOF
```

### Example 2: Add New MCP Server Integration

Cortex integrates a new MCP server autonomously:

```python
# Running in development-master pod
def integrate_mcp_server(server_name):
    # 1. Clone MCP server repo
    # 2. Create integration files
    # 3. Generate health check script
    # 4. Create monitoring config
    # 5. Update inventory
    # 6. Commit all changes
    # 7. Push to GitHub
    # 8. Trigger self-update Job
    pass
```

---

## Monitoring

### Dashboard View

Cortex dashboard should show:
- Last self-update timestamp
- Number of autonomous commits
- Success/failure rate
- Current version running
- Pending updates

### Alerts

Alert on:
- Self-update Job failure
- Deployment rollout stuck
- Image pull errors
- Git push failures

---

## Benefits

**Full Autonomy:**
- Cortex manages its own lifecycle
- No human intervention required
- Continuous self-improvement

**Infrastructure-as-Code:**
- All changes version controlled
- Declarative and reproducible
- Audit trail built-in

**Cloud-Native:**
- Leverages K8s primitives
- Fault-tolerant
- Scalable

**Meta-Learning:**
- Cortex learns from its operations
- Optimizes its own code
- Evolves over time

---

## Conclusion

**Cortex Self-Management** represents the pinnacle of autonomous systems:

- **Lives** in K3s cluster
- **Modifies** its own code
- **Commits** to Git
- **Deploys** itself
- **Monitors** results
- **Adapts** and improves

This is **true autonomous operation** - a system that manages, improves, and evolves itself without human intervention.

---

**Status:** Architecture Documented
**Next:** Deploy GitHub credentials and test self-update Job
**Vision:** Fully autonomous, self-evolving infrastructure
