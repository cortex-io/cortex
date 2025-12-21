# Cortex K3s Deployment - Current Status & Next Steps

**Date**: 2025-12-20
**Time**: 16:15 UTC
**Status**: Core Infrastructure Complete, MCP Servers Ready for Deployment

---

## ✅ Successfully Deployed (Core Infrastructure)

### K3s Cluster - OPERATIONAL
- **7 Nodes**: 3 masters (Larry), 4 workers (Darryl)
- **Version**: K3s v1.33.6+k3s1
- **Status**: All nodes Ready

### Infrastructure Services
1. ✅ **MetalLB** - LoadBalancer (10.88.145.200-220)
2. ✅ **Traefik** - Ingress Controller
3. ✅ **Cert-Manager** - SSL automation
4. ✅ **Longhorn** - Distributed storage

### Dashboard & Monitoring
5. ✅ **Grafana** - http://10.88.145.202 (admin/UkJUjICksbAdWoZ9p37mwkNrwdWoPYyx9E4ucJ9n)
6. ✅ **Prometheus** - http://10.88.145.201:9090
7. ✅ **Portainer CE** - https://10.88.145.203:9443
8. ✅ **Rancher** - Deployed (needs port-forward or ingress)

---

## 🔄 In Progress

### Wazuh Security Platform
**Status**: Deployment blocked by resource constraints
**Issue**: Workers have insufficient CPU for requested resources (2000m per pod)
**Solution**: Need to reduce resource requests to 500m-1000m per pod
**Next**: Redeploy with scaled-down resource requirements

### Cortex MCP Servers
**Status**: Repositories cloned, ready for K8s deployment
**Challenge**: Docker not available locally for building images
**Repositories**:
- ✅ cortex-resource-manager
- ✅ proxmox-mcp-server
- ✅ cloudflare-mcp-server
- ✅ wazuh-mcp-server-docker
- ✅ unifi-mcp-server
- ✅ cortex-k3s

---

## 📋 Next Steps - Two Deployment Approaches

### Option A: Build Images on K3s Nodes (Recommended)
Since Docker isn't available on the desktop, build images directly on the K3s cluster:

1. **Setup Build Environment**:
   ```bash
   # SSH to a K3s node
   ssh k3s@10.88.145.191

   # Install buildah or use containerd's ctr
   sudo apt install -y buildah
   ```

2. **Clone Repos on K3s Node**:
   ```bash
   git clone https://github.com/ry-ops/cortex-resource-manager.git
   git clone https://github.com/ry-ops/proxmox-mcp-server.git
   # etc...
   ```

3. **Build Images**:
   ```bash
   cd cortex-resource-manager
   sudo buildah bud -t cortex-resource-manager:latest .
   sudo buildah push cortex-resource-manager:latest docker-daemon:cortex-resource-manager:latest
   ```

### Option B: Use Pre-built Images or Deploy from Source (Faster)
Deploy MCP servers as Python applications running in pods:

1. **Create Base Python Image Deployment**
2. **Mount source code as ConfigMaps**
3. **Deploy with environment variables**

---

## 🎯 Immediate Action Plan

### Phase 1: Deploy Cortex Resource Manager (30 min)

**Create K8s Manifest**:
```yaml
# cortex-resource-manager-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cortex-resource-manager
  namespace: cortex-system
spec:
  replicas: 2
  selector:
    matchLabels:
      app: cortex-resource-manager
  template:
    metadata:
      labels:
        app: cortex-resource-manager
    spec:
      containers:
      - name: resource-manager
        image: python:3.11-slim
        command: ["/bin/sh", "-c"]
        args:
          - |
            pip install fastapi uvicorn sqlalchemy psycopg2-binary redis aioredis
            cd /app && python -m uvicorn src.main:app --host 0.0.0.0 --port 8080
        ports:
        - containerPort: 8080
        env:
        - name: DATABASE_URL
          value: "postgresql://postgres:postgres@postgres:5432/cortex"
        - name: REDIS_URL
          value: "redis://redis:6379"
        volumeMounts:
        - name: app-source
          mountPath: /app
      volumes:
      - name: app-source
        # Clone from git or use ConfigMap
```

### Phase 2: Deploy Supporting Services
1. **PostgreSQL** - Database for resource-manager
2. **Redis** - Caching layer
3. **MCP Servers** - One by one

### Phase 3: Configure Identity Layer
1. **Register Larry (K3s Cortex)** with resource-manager
2. **Register Desktop Cortex** capabilities
3. **Test cross-instance communication**

---

## 🚀 Quickest Path Forward

### Step 1: Deploy Resource Manager with Helm
```bash
# Create namespace
kubectl create namespace cortex-system

# Deploy PostgreSQL
helm install postgres bitnami/postgresql \
  -n cortex-system \
  --set auth.postgresPassword=cortex123 \
  --set primary.persistence.size=10Gi

# Deploy Redis
helm install redis bitnami/redis \
  -n cortex-system \
  --set auth.password=cortex123

# Wait for databases
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=postgresql -n cortex-system --timeout=300s
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=redis -n cortex-system --timeout=300s
```

### Step 2: Deploy Resource Manager from Source
Since we can't build Docker images locally, use a git-sync sidecar pattern:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cortex-resource-manager
  namespace: cortex-system
spec:
  replicas: 1
  selector:
    matchLabels:
      app: cortex-resource-manager
  template:
    metadata:
      labels:
        app: cortex-resource-manager
    spec:
      initContainers:
      - name: git-clone
        image: alpine/git
        args:
          - clone
          - --single-branch
          - --
          - https://github.com/ry-ops/cortex-resource-manager.git
          - /repo
        volumeMounts:
        - name: repo
          mountPath: /repo
      containers:
      - name: app
        image: python:3.11-slim
        workingDir: /app
        command: ["/bin/bash", "-c"]
        args:
          - |
            pip install -r requirements.txt
            python -m uvicorn src.main:app --host 0.0.0.0 --port 8080
        ports:
        - containerPort: 8080
        env:
        - name: DATABASE_URL
          value: "postgresql://postgres:cortex123@postgres-postgresql:5432/postgres"
        - name: REDIS_URL
          value: "redis://:cortex123@redis-master:6379"
        volumeMounts:
        - name: repo
          mountPath: /app
      volumes:
      - name: repo
        emptyDir: {}
```

---

## 📝 Commands to Execute

### Deploy PostgreSQL & Redis
```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update

kubectl create namespace cortex-system

helm install postgres bitnami/postgresql -n cortex-system \
  --set auth.postgresPassword=cortex123 \
  --set primary.persistence.size=10Gi

helm install redis bitnami/redis -n cortex-system \
  --set auth.password=cortex123 \
  --set master.persistence.size=5Gi
```

### Deploy Resource Manager
```bash
# Save the manifest above to a file
kubectl apply -f cortex-resource-manager-deployment.yaml

# Expose service
kubectl expose deployment cortex-resource-manager \
  -n cortex-system \
  --port=8080 \
  --target-port=8080 \
  --type=LoadBalancer
```

### Verify
```bash
kubectl get pods -n cortex-system
kubectl get svc -n cortex-system
kubectl logs -n cortex-system -l app=cortex-resource-manager
```

---

## 🎭 The Larry & Darryl Configuration

Once resource-manager is deployed, configure the cluster identity:

### Register Larry (K3s Cortex Master)
```bash
# Create agent manifest for Larry
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: larry-identity
  namespace: cortex-system
data:
  agent-id: "cortex-k3s"
  role: "worker"
  location: "k3s-cluster"
  capabilities: |
    - proxmox-api
    - wazuh-management
    - unifi-controller
    - cloudflare-dns
    - k3s-orchestration
    - resource-management
EOF
```

### Desktop Cortex Already Configured
- Identity files in `~/.cortex/`
- Bootstrap script ready
- Just needs resource-manager endpoint

---

## 💡 Key Decisions Needed

1. **Image Building**: Use K3s nodes to build images OR deploy from source?
2. **Wazuh**: Deploy full platform OR skip for now?
3. **MCP Priority**: Which MCP servers are most critical?
   - Resource Manager (required first)
   - Proxmox (infrastructure)
   - Others can wait

---

## ⏱️ Time Estimates

- **Deploy PostgreSQL + Redis**: 5 min
- **Deploy Resource Manager**: 10 min
- **Configure Identity Layer**: 15 min
- **Deploy each MCP server**: 10 min each
- **Total for core Cortex**: ~45 min

---

**Current State**: Ready to deploy, just need to execute the plan above!
**Blocker**: No local Docker, need to use K8s-native deployment approach
**Solution**: Deploy from source using init containers + git-sync pattern
