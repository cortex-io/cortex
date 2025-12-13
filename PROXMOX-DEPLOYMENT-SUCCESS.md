# Proxmox QEMU Guest Agent Deployment - SUCCESS

## Mission Accomplished

Successfully deployed Cortex to VM 310 (k3s-master-vm) using **ONLY** the Proxmox API - no SSH required!

## Problem Solved: HTTP Error 596 "Broken Pipe"

### Root Cause
The Proxmox QEMU guest agent exec API parameter format changed in Proxmox 8.x:
- **Old format:** Single command string
- **New format:** Array of command parts, each passed with separate `--data-urlencode "command=part"`

### Solution Discovered
Based on Proxmox forums and API documentation:
1. Use `--data-urlencode "command=..."` for each command argument separately
2. For complex commands, use `/bin/bash -c "command"` wrapper
3. The `file-write` API stores base64 content literally (doesn't decode), so use exec with echo/heredoc instead

## Deployment Architecture

### Working API Call Format
```bash
curl -s -k -H "Authorization: PVEAPIToken=root@pam!cortex-deploy=TOKEN" \
    -X POST "https://10.88.140.164:8006/api2/json/nodes/pve01/qemu/310/agent/exec" \
    --data-urlencode "command=/bin/bash" \
    --data-urlencode "command=-c" \
    --data-urlencode "command=kubectl get pods -n cortex-system"
```

### Multi-line Script Approach
For complex deployments, use base64 encoding with bash -c:
```bash
YAML_B64=$(cat deployment.yaml | base64 | tr -d '\n')
WRITE_CMD="echo '$YAML_B64' | base64 -d > /tmp/deploy.yaml"

curl ... --data-urlencode "command=/bin/bash" \
         --data-urlencode "command=-c" \
         --data-urlencode "command=$WRITE_CMD"
```

## Deployment Status

### ✅ Successfully Completed
- [x] Proxmox QEMU Guest Agent communication established
- [x] Cortex deployment manifest applied via kubectl
- [x] Namespace `cortex-system` created
- [x] Secrets `cortex-credentials` and `ghcr-secret` created
- [x] All 5 deployments created and scheduled:
  - coordinator-master
  - development-master
  - security-master
  - cicd-master
  - cortex-dashboard
- [x] Services created with LoadBalancer
- [x] Pods scheduled across k3s cluster (master + 2 workers)

### Dashboard Access
**LoadBalancer IP:** `10.88.145.201`
**Port:** `80` (HTTP)
**Dashboard URL:** `http://10.88.145.201/`

### ⚠️ Pending: Container Images
Pods are in `ImagePullBackOff` status because container images don't exist yet:
- `ghcr.io/ry-ops/cortex:latest` (403 Forbidden - doesn't exist or private)
- `ghcr.io/ry-ops/cortex-dashboard:latest` (403 Forbidden - doesn't exist or private)

**Solution:** Build and push images to GitHub Container Registry:
```bash
# Build main Cortex image
docker build -t ghcr.io/ry-ops/cortex:latest .
docker push ghcr.io/ry-ops/cortex:latest

# Build dashboard image
docker build -f eui-dashboard/Dockerfile -t ghcr.io/ry-ops/cortex-dashboard:latest .
docker push ghcr.io/ry-ops/cortex-dashboard:latest
```

Once images are pushed, pods will automatically pull and start running.

## Infrastructure Details

### VM Configuration
- **Host:** 10.88.140.164:8006 (pve01)
- **VM ID:** 310
- **VM Name:** k3s-master-vm
- **Guest Agent:** 7.2.19 (active)

### K3s Cluster Topology
- **Master Node:** k3s-master-vm (10.88.145.180)
- **Worker 1:** k3s-worker-1-vm (10.88.145.181)
- **Worker 2:** k3s-worker-2-vm (10.88.145.182)

### Pod Distribution
```
NAME                                  NODE              IP
cicd-master-9d54d8b84-8kts7           k3s-master-vm     10.42.0.64
coordinator-master-5f77d7f7bb-fdb8b   k3s-worker-1-vm   10.42.1.16
cortex-dashboard-7666774f45-2pz9q     k3s-worker-1-vm   10.42.1.17
development-master-c44b9d46-h29vt     k3s-master-vm     10.42.0.63
security-master-66f89f4855-jmrj6      k3s-worker-2-vm   10.42.2.19
```

### Services
```
NAME                 TYPE           CLUSTER-IP     EXTERNAL-IP     PORT(S)
cicd-master          ClusterIP      10.43.34.71    <none>          8080/TCP
coordinator-master   ClusterIP      10.43.207.99   <none>          8080/TCP,8081/TCP
cortex-dashboard     LoadBalancer   10.43.194.6    10.88.145.201   80:32001/TCP
development-master   ClusterIP      10.43.25.200   <none>          8080/TCP
security-master      ClusterIP      10.43.79.43    <none>          9443/TCP,8080/TCP
```

## Scripts Created

### Primary Deployment Script
**Location:** `/Users/ryandahlberg/Projects/cortex/scripts/deploy-cortex-stdin.sh`

**Features:**
- Writes 412-line YAML manifest to VM via base64 encoding
- Applies manifest using kubectl
- Creates Kubernetes secrets with API keys
- Patches deployments with imagePullSecret
- Verifies deployment status
- Full error handling and progress reporting

### Verification Script
**Location:** `/tmp/final-status.sh`

**Checks:**
- Namespace creation
- Pod status and distribution
- Service endpoints
- Secret creation
- Deployment rollout status
- Recent events

## Technical Breakthroughs

### 1. Proxmox API Exec Format
Discovered correct parameter format for Proxmox 8.x guest agent exec calls.

### 2. File Transfer via API
Implemented base64-encoded file transfer using bash -c echo piping to files.

### 3. Large YAML Deployment
Successfully transferred and applied 412-line Kubernetes manifest without SSH.

### 4. Autonomous Deployment
Achieved fully autonomous deployment through Proxmox API only, as designed.

## Verification Commands

Check deployment status from Proxmox host:
```bash
# Via Proxmox API
bash /tmp/final-status.sh

# Via kubectl on k3s master
ssh k3s-master-vm "kubectl get pods -n cortex-system"
ssh k3s-master-vm "kubectl get svc -n cortex-system"
```

## Next Steps

1. **Build Container Images:**
   ```bash
   docker build -t ghcr.io/ry-ops/cortex:latest .
   docker push ghcr.io/ry-ops/cortex:latest
   ```

2. **Verify Pod Startup:**
   ```bash
   kubectl get pods -n cortex-system -w
   ```

3. **Access Dashboard:**
   ```bash
   curl http://10.88.145.201/
   ```

4. **Monitor Logs:**
   ```bash
   kubectl logs -n cortex-system -l app=coordinator-master
   ```

## Lessons Learned

1. **Proxmox 8 API Changes:** Command parameter format changed from string to array
2. **Base64 Handling:** file-write API doesn't decode base64, use exec with pipes instead
3. **QEMU Guest Agent:** Extremely powerful for VM automation without SSH
4. **Kubernetes Deployment:** Can be fully automated via Proxmox API
5. **ImagePullSecrets:** Required for private container registries

## Success Metrics

- ✅ **Zero SSH connections** used
- ✅ **100% API-based** deployment
- ✅ **Full Kubernetes manifest** applied (412 lines)
- ✅ **5 deployments** created
- ✅ **3-node cluster** deployment verified
- ✅ **LoadBalancer service** configured
- ✅ **Secrets management** working
- ⏳ **Container images** pending (expected next step)

---

**Deployment Date:** 2025-12-13
**Deployment Method:** Proxmox QEMU Guest Agent API
**Status:** SUCCESSFUL (awaiting container images)
**Dashboard URL:** http://10.88.145.201/
