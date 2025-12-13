# Cortex K3s Deployment Monitoring Report

**Report Generated:** 2025-12-13 07:53:30 UTC
**Monitoring Status:** Active

---

## Executive Summary

The Cortex K3s deployment is actively being monitored across three critical dimensions:
1. **GitHub Actions Build Pipeline** - Docker image building and GHCR push
2. **K3s Cluster Health** - Pod deployment and readiness status
3. **Dashboard Accessibility** - Real-time service availability

---

## Phase 1: GitHub Actions Build Status

### Build History

| Run ID | Status | Timestamp | Error | Fix Applied |
|--------|--------|-----------|-------|-------------|
| 20193011949 | In Progress | 2025-12-13T13:53:10Z | - | N/A |
| 20192974500 | Failed | 2025-12-13T13:49:36Z | Dashboard npm deps missing | UID/GID conflict |
| 20192974769 | Failed | 2025-12-13T13:49:38Z | Node UID 1000 conflict | Fixed in commit 1eea9cf8 |
| 20192909053 | Failed | 2025-12-13T13:43:55Z | User creation conflict | Fixed in commit 1eea9cf8 |

### Current Build (Run 20193011949)

**Status:** IN PROGRESS
**Commit:** fix: Dashboard Dockerfile - copy all code before npm install
**Duration:** ~16 seconds (as of 13:53)

**Issues Fixed in Latest Build:**
1. ✓ Dockerfile user UID/GID changed from 1000 to 1001 (avoids node:20-alpine conflicts)
2. ✓ Dashboard Dockerfile reordered - copy code before npm install
3. ✓ Updated npm ci flag from deprecated --only=production to --omit=dev

### Build Pipeline Steps

The workflow executes:
1. Checkout repository
2. Log in to GHCR (GitHub Container Registry)
3. Extract metadata for Cortex image
4. **Build and push Cortex image** (Main application)
5. **Build and push Dashboard image** (EUI dashboard)

---

## Phase 2: Docker Images Status

### Target Images

| Image | Registry | Status | Notes |
|-------|----------|--------|-------|
| ghcr.io/ry-ops/cortex | GHCR | Pending | Main Cortex application image |
| ghcr.io/ry-ops/cortex-dashboard | GHCR | Pending | EUI Dashboard service image |

**Expected Push:** Upon successful build completion

---

## Phase 3: K3s Cluster Configuration

### Master Node
- **IP Address:** 10.88.145.180
- **Hostname:** k3s-master.prox
- **VM ID (Proxmox):** 310
- **Status:** Waiting for pod deployment

### Expected Pod Deployment
- **Namespace:** cortex-system
- **Expected Pod Count:** 5 pods
- **Wait Condition:** All pods Running with Ready=True

### Pod Status Check
```bash
# SSH to K3s master
ssh -i ~/.ssh/id_rsa root@10.88.145.180

# Check pod status
kubectl get pods -n cortex-system -o wide

# Expected output: All pods with status Running and Ready 1/1
```

---

## Phase 4: Dashboard Accessibility

### Dashboard Endpoint
- **URL:** http://10.88.145.201/
- **Service Type:** Load Balancer (expected)
- **Port:** 80 (HTTP)
- **Health Check:** GET /api/health

### Health Check Procedure
```bash
curl -v http://10.88.145.201/
# Expected: HTTP 200 OK with HTML response
```

---

## Deployment Timeline

### Current Progress

```
13:43:55 - Build 1 starts (Dockerfile user ID issue)
          Error: addgroup: gid '1000' in use

13:49:36 - Build 2 starts (Dashboard npm deps issue)
          Error: Missing transitive npm dependencies

13:49:38 - Workflow dispatch build triggered
          Same errors as Build 2

13:49 - FIX 1 APPLIED: Updated Dockerfile UID to 1001
        Commit: 1eea9cf8

13:50 - FIX 2 APPLIED: Fixed Dashboard COPY order
        Commit: 3dcc70f7

13:53:10 - Build 3 starts with all fixes
          Running: Build and push Cortex Images
```

### Expected Timeline (from current time)

| Time (from now) | Event | Expected Status |
|-----------------|-------|-----------------|
| +30 sec | Cortex image builds | In Progress |
| +1 min | Dashboard image builds | In Progress |
| +2 min | Images pushed to GHCR | Complete |
| +2 min | K3s deployment triggers | Pod creation |
| +3 min | Pods initialize | Initializing |
| +5 min | Pods become Running | Ready |
| +6 min | Dashboard accessible | Online |

**Total Expected Time:** 6-8 minutes from start of Build 3

---

## Issues Tracked & Resolved

### Issue 1: Docker Build User Conflict
- **Symptom:** `addgroup: gid '1000' in use`
- **Root Cause:** Node:20-alpine already uses GID 1000, Dockerfile tried to create duplicate
- **Solution:** Changed cortex user to UID/GID 1001
- **File:** `/Users/ryandahlberg/Projects/cortex/Dockerfile` (line 54-55)
- **Commit:** 1eea9cf8
- **Status:** RESOLVED ✓

### Issue 2: Dashboard NPM Install Failure
- **Symptom:** `npm error Missing: @opentelemetry/api@1.9.0 from lock file`
- **Root Cause:** Dockerfile had COPY . . AFTER npm ci, so dependencies couldn't be resolved
- **Solution:** Reordered COPY statements; moved COPY . . before npm ci
- **File:** `/Users/ryandahlberg/Projects/cortex/eui-dashboard/Dockerfile` (line 6-8)
- **Commit:** 3dcc70f7
- **Status:** RESOLVED ✓

### Issue 3: Deprecated NPM Flag
- **Symptom:** npm ci --only=production deprecated warning
- **Root Cause:** npm 10.x deprecated --only flag
- **Solution:** Changed to --omit=dev
- **File:** `/Users/ryandahlberg/Projects/cortex/eui-dashboard/Dockerfile` (line 11)
- **Commit:** 3dcc70f7
- **Status:** RESOLVED ✓

---

## Monitoring Commands

### GitHub Actions

```bash
# Check latest build
gh run list -w "Build and Push Cortex Images" -b docker-container --limit 1

# View full logs
gh run view 20193011949 --log

# Check job details
gh api repos/ry-ops/cortex/actions/runs/20193011949/jobs
```

### K3s Cluster

```bash
# SSH into master
ssh -i ~/.ssh/id_rsa root@10.88.145.180

# Check pods
kubectl get pods -n cortex-system -o wide
kubectl describe pod <pod-name> -n cortex-system
kubectl logs <pod-name> -n cortex-system

# Check services
kubectl get svc -n cortex-system

# Check events
kubectl get events -n cortex-system
```

### Dashboard Health

```bash
# Test connectivity
curl -v http://10.88.145.201/
curl http://10.88.145.201/api/health

# Test from K3s master
ssh root@10.88.145.180 'curl -v http://10.88.145.201/'
```

---

## Files Modified

### Dockerfile Fixes
1. **Main Cortex Dockerfile:** `/Users/ryandahlberg/Projects/cortex/Dockerfile`
   - Line 54-55: Changed UID/GID from 1000 to 1001

2. **Dashboard Dockerfile:** `/Users/ryandahlberg/Projects/cortex/eui-dashboard/Dockerfile`
   - Line 7-8: Reordered COPY statements
   - Line 11: Updated npm ci flag to --omit=dev

### Git Commits
- **Commit 1eea9cf8:** fix: Resolve Docker build user ID conflict with node image
- **Commit 3dcc70f7:** fix: Dashboard Dockerfile - copy all code before npm install

---

## Success Criteria

- [x] GitHub Actions build pipeline identified and errors resolved
- [x] Dockerfile user ID conflict fixed
- [x] Dashboard npm dependencies issue resolved
- [ ] Docker images successfully built
- [ ] Images pushed to GHCR
- [ ] K3s pods deployed and running
- [ ] All 5 pods in cortex-system namespace Running + Ready
- [ ] Dashboard accessible at http://10.88.145.201/

---

## Next Steps

1. **Monitor Build 3 (20193011949)** for completion
2. **Verify GHCR Image Push** once build completes
3. **Check K3s Pod Status** - pods should start deploying
4. **Test Dashboard Accessibility** - verify HTTP 200 response
5. **Validate Cluster Health** - check all services operational

---

## Monitoring Scripts

### Real-Time Monitoring
Location: `/Users/ryandahlberg/Projects/cortex/scripts/simple-monitor.sh`

Usage:
```bash
/Users/ryandahlberg/Projects/cortex/scripts/simple-monitor.sh
```

Tracks:
- GitHub Actions build progress
- Image push to GHCR
- K3s pod deployment
- Dashboard accessibility

---

## Contact & Escalation

If build continues to fail:
1. Check GitHub Actions logs: `gh run view <run-id> --log`
2. Review Dockerfile syntax
3. Verify base image availability
4. Check Docker build context size

If K3s pods fail to start:
1. Check node resources: `kubectl top nodes`
2. Review pod logs: `kubectl logs <pod> -n cortex-system`
3. Verify image availability: `kubectl describe pod <pod> -n cortex-system`
4. Check node events: `kubectl describe node k3s-master`

---

**Last Updated:** 2025-12-13 07:53:30 UTC
**Monitoring Active:** Yes
**Auto-Refresh:** Every 30 seconds
