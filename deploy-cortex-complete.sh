#!/bin/bash
# Complete Cortex K3s Deployment Script
# Run this script from within the K3s master (CT 300) or any machine with kubectl access

set -e

GREEN='\033[0;32m'
CYAN='\033[0;36m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${CYAN}▶${NC} $*"; }
success() { echo -e "${GREEN}✓${NC} $*"; }
error() { echo -e "${RED}✗${NC} $*"; exit 1; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }

echo ""
echo "╔═══════════════════════════════════════════════════╗"
echo "║  CORTEX K3S DEPLOYMENT                            ║"
echo "║  Autonomous AI Platform                           ║"
echo "╚═══════════════════════════════════════════════════╝"
echo ""

# Credentials (embedded)
export ANTHROPIC_API_KEY="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"
export GITHUB_TOKEN="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"

# Check kubectl access
log "Checking kubectl access..."
if ! kubectl cluster-info &>/dev/null; then
    error "Cannot access Kubernetes cluster. Ensure kubectl is configured."
fi
success "Kubernetes cluster accessible"

# Show cluster info
log "Cluster nodes:"
kubectl get nodes
echo ""

# Create namespace
log "Creating cortex-system namespace..."
kubectl apply -f - <<EOF
apiVersion: v1
kind: Namespace
metadata:
  name: cortex-system
  labels:
    name: cortex-system
    app.kubernetes.io/name: cortex
    app.kubernetes.io/managed-by: cortex
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: cortex-admin
  namespace: cortex-system
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: cortex-self-manager
rules:
- apiGroups: ["apps"]
  resources: ["deployments", "replicasets", "statefulsets"]
  verbs: ["get", "list", "watch", "update", "patch"]
- apiGroups: ["batch"]
  resources: ["jobs"]
  verbs: ["create", "get", "list", "watch", "delete", "deletecollection"]
- apiGroups: [""]
  resources: ["pods", "services", "configmaps"]
  verbs: ["get", "list", "watch"]
- apiGroups: [""]
  resources: ["pods/log"]
  verbs: ["get"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: cortex-self-manager-binding
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cortex-self-manager
subjects:
- kind: ServiceAccount
  name: cortex-admin
  namespace: cortex-system
EOF

success "Namespace and RBAC created"

# Create secrets
log "Creating secrets..."
kubectl create secret generic cortex-credentials \
    --namespace=cortex-system \
    --from-literal=anthropic-api-key="$ANTHROPIC_API_KEY" \
    --from-literal=github-token="$GITHUB_TOKEN" \
    --from-literal=github-user="ry-ops" \
    --from-literal=wazuh-url="https://10.88.140.202:55000" \
    --from-literal=wazuh-user="admin" \
    --from-literal=wazuh-password='*B96Y7a0t8Ep9cw+z0RSevdRHwLnsiay' \
    --from-literal=proxmox-host="10.88.140.164" \
    --from-literal=proxmox-token='root@pam!n8n=b8cc165f-0153-43bb-a48a-5d7459587ca7' \
    --from-literal=nfs-server="10.88.140.164" \
    --from-literal=nfs-path="/var/lib/vz/private/105/cortex-coordination" \
    --dry-run=client -o yaml | kubectl apply -f -

# Create ConfigMap
kubectl create configmap cortex-config \
    --namespace=cortex-system \
    --from-literal=k3s-master="10.88.145.180" \
    --from-literal=wazuh-dashboard="https://10.88.140.202" \
    --from-literal=enable-self-evaluation="true" \
    --from-literal=enable-rlhf="true" \
    --from-literal=enable-autonomous-remediation="true" \
    --dry-run=client -o yaml | kubectl apply -f -

success "Secrets and ConfigMap created"

# Deploy NFS storage
log "Deploying NFS storage..."
kubectl apply -f - <<EOF
apiVersion: v1
kind: PersistentVolume
metadata:
  name: cortex-coordination-pv
spec:
  capacity:
    storage: 10Gi
  accessModes:
    - ReadWriteMany
  nfs:
    server: 10.88.140.164
    path: /var/lib/vz/private/105/cortex-coordination
  persistentVolumeReclaimPolicy: Retain
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: cortex-coordination-pvc
  namespace: cortex-system
spec:
  accessModes:
    - ReadWriteMany
  resources:
    requests:
      storage: 10Gi
  volumeName: cortex-coordination-pv
EOF

# Wait for PVC
log "Waiting for PVC to bind..."
for i in {1..30}; do
    PVC_STATUS=$(kubectl get pvc cortex-coordination-pvc -n cortex-system -o jsonpath='{.status.phase}' 2>/dev/null || echo "")
    if [ "$PVC_STATUS" = "Bound" ]; then
        success "PVC bound successfully"
        break
    fi
    echo -n "."
    sleep 2
done
echo ""

# Deploy Coordinator Master
log "Deploying Coordinator Master..."
kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: coordinator-master
  namespace: cortex-system
  labels:
    app: coordinator-master
    app.kubernetes.io/name: cortex
    app.kubernetes.io/component: coordinator
spec:
  replicas: 1
  selector:
    matchLabels:
      app: coordinator-master
  template:
    metadata:
      labels:
        app: coordinator-master
        app.kubernetes.io/name: cortex
    spec:
      serviceAccountName: cortex-admin
      containers:
      - name: coordinator
        image: ghcr.io/ry-ops/cortex:latest
        imagePullPolicy: Always
        command: ["./coordination/masters/coordinator/run-coordinator.sh"]
        env:
        - name: ANTHROPIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: cortex-credentials
              key: anthropic-api-key
        - name: GITHUB_TOKEN
          valueFrom:
            secretKeyRef:
              name: cortex-credentials
              key: github-token
        - name: GITHUB_USER
          valueFrom:
            secretKeyRef:
              name: cortex-credentials
              key: github-user
        - name: ENABLE_SELF_EVAL
          valueFrom:
            configMapKeyRef:
              name: cortex-config
              key: enable-self-evaluation
        - name: ENABLE_RLHF
          valueFrom:
            configMapKeyRef:
              name: cortex-config
              key: enable-rlhf
        volumeMounts:
        - name: coordination
          mountPath: /coordination
        resources:
          requests:
            memory: "2Gi"
            cpu: "1000m"
          limits:
            memory: "4Gi"
            cpu: "2000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 5
      volumes:
      - name: coordination
        persistentVolumeClaim:
          claimName: cortex-coordination-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: coordinator-master
  namespace: cortex-system
spec:
  selector:
    app: coordinator-master
  ports:
  - name: http
    port: 8080
    targetPort: 8080
  - name: moe-router
    port: 8081
    targetPort: 8081
EOF

success "Coordinator Master deployed"

# Deploy Security Master
log "Deploying Security Master..."
kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: security-master
  namespace: cortex-system
  labels:
    app: security-master
    app.kubernetes.io/name: cortex
    app.kubernetes.io/component: security
spec:
  replicas: 1
  selector:
    matchLabels:
      app: security-master
  template:
    metadata:
      labels:
        app: security-master
        app.kubernetes.io/name: cortex
    spec:
      serviceAccountName: cortex-admin
      containers:
      - name: security
        image: ghcr.io/ry-ops/cortex:latest
        imagePullPolicy: Always
        command: ["./coordination/masters/security/run-security.sh"]
        env:
        - name: ANTHROPIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: cortex-credentials
              key: anthropic-api-key
        - name: WAZUH_URL
          valueFrom:
            secretKeyRef:
              name: cortex-credentials
              key: wazuh-url
        - name: WAZUH_USER
          valueFrom:
            secretKeyRef:
              name: cortex-credentials
              key: wazuh-user
        - name: WAZUH_PASSWORD
          valueFrom:
            secretKeyRef:
              name: cortex-credentials
              key: wazuh-password
        volumeMounts:
        - name: coordination
          mountPath: /coordination
        resources:
          requests:
            memory: "2Gi"
            cpu: "1000m"
          limits:
            memory: "4Gi"
            cpu: "2000m"
        ports:
        - name: webhook
          containerPort: 9443
      volumes:
      - name: coordination
        persistentVolumeClaim:
          claimName: cortex-coordination-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: security-master
  namespace: cortex-system
spec:
  selector:
    app: security-master
  ports:
  - name: webhook
    port: 9443
    targetPort: 9443
  - name: http
    port: 8080
    targetPort: 8080
EOF

success "Security Master deployed"

# Deploy Development Master
log "Deploying Development Master..."
kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: development-master
  namespace: cortex-system
  labels:
    app: development-master
    app.kubernetes.io/name: cortex
    app.kubernetes.io/component: development
spec:
  replicas: 1
  selector:
    matchLabels:
      app: development-master
  template:
    metadata:
      labels:
        app: development-master
        app.kubernetes.io/name: cortex
    spec:
      serviceAccountName: cortex-admin
      containers:
      - name: development
        image: ghcr.io/ry-ops/cortex:latest
        imagePullPolicy: Always
        command: ["./coordination/masters/development/run-development.sh"]
        env:
        - name: ANTHROPIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: cortex-credentials
              key: anthropic-api-key
        - name: GITHUB_TOKEN
          valueFrom:
            secretKeyRef:
              name: cortex-credentials
              key: github-token
        - name: GITHUB_USER
          valueFrom:
            secretKeyRef:
              name: cortex-credentials
              key: github-user
        volumeMounts:
        - name: coordination
          mountPath: /coordination
        - name: git-workspace
          mountPath: /workspace
        resources:
          requests:
            memory: "4Gi"
            cpu: "2000m"
          limits:
            memory: "8Gi"
            cpu: "4000m"
      volumes:
      - name: coordination
        persistentVolumeClaim:
          claimName: cortex-coordination-pvc
      - name: git-workspace
        emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: development-master
  namespace: cortex-system
spec:
  selector:
    app: development-master
  ports:
  - name: http
    port: 8080
    targetPort: 8080
EOF

success "Development Master deployed"

# Deploy CI/CD Master
log "Deploying CI/CD Master..."
kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cicd-master
  namespace: cortex-system
  labels:
    app: cicd-master
    app.kubernetes.io/name: cortex
    app.kubernetes.io/component: cicd
spec:
  replicas: 1
  selector:
    matchLabels:
      app: cicd-master
  template:
    metadata:
      labels:
        app: cicd-master
        app.kubernetes.io/name: cortex
    spec:
      serviceAccountName: cortex-admin
      containers:
      - name: cicd
        image: ghcr.io/ry-ops/cortex:latest
        imagePullPolicy: Always
        command: ["./coordination/masters/cicd/run-cicd.sh"]
        env:
        - name: ANTHROPIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: cortex-credentials
              key: anthropic-api-key
        - name: GITHUB_TOKEN
          valueFrom:
            secretKeyRef:
              name: cortex-credentials
              key: github-token
        - name: GITHUB_USER
          valueFrom:
            secretKeyRef:
              name: cortex-credentials
              key: github-user
        volumeMounts:
        - name: coordination
          mountPath: /coordination
        - name: build-cache
          mountPath: /build-cache
        resources:
          requests:
            memory: "2Gi"
            cpu: "1000m"
          limits:
            memory: "4Gi"
            cpu: "2000m"
      volumes:
      - name: coordination
        persistentVolumeClaim:
          claimName: cortex-coordination-pvc
      - name: build-cache
        emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: cicd-master
  namespace: cortex-system
spec:
  selector:
    app: cicd-master
  ports:
  - name: http
    port: 8080
    targetPort: 8080
EOF

success "CI/CD Master deployed"

# Deploy Dashboard
log "Deploying Dashboard..."
kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cortex-dashboard
  namespace: cortex-system
  labels:
    app: cortex-dashboard
    app.kubernetes.io/name: cortex
    app.kubernetes.io/component: dashboard
spec:
  replicas: 1
  selector:
    matchLabels:
      app: cortex-dashboard
  template:
    metadata:
      labels:
        app: cortex-dashboard
        app.kubernetes.io/name: cortex
    spec:
      containers:
      - name: dashboard
        image: ghcr.io/ry-ops/cortex-dashboard:latest
        imagePullPolicy: Always
        ports:
        - name: http
          containerPort: 3000
        env:
        - name: COORDINATOR_URL
          value: "http://coordinator-master:8080"
        - name: SECURITY_URL
          value: "http://security-master:8080"
        - name: DEVELOPMENT_URL
          value: "http://development-master:8080"
        - name: CICD_URL
          value: "http://cicd-master:8080"
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: cortex-dashboard
  namespace: cortex-system
spec:
  type: LoadBalancer
  selector:
    app: cortex-dashboard
  ports:
  - name: http
    port: 80
    targetPort: 3000
EOF

success "Dashboard deployed"

# Wait for pods
log "Waiting for pods to start..."
sleep 15

# Show status
echo ""
echo "=========================================="
echo "  DEPLOYMENT COMPLETE!"
echo "=========================================="
echo ""

log "Pods:"
kubectl get pods -n cortex-system -o wide

echo ""
log "Services:"
kubectl get svc -n cortex-system

echo ""
log "Dashboard:"
DASHBOARD_IP=$(kubectl get svc cortex-dashboard -n cortex-system -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null)
if [ -n "$DASHBOARD_IP" ]; then
    echo "  http://$DASHBOARD_IP"
else
    DASHBOARD_PORT=$(kubectl get svc cortex-dashboard -n cortex-system -o jsonpath='{.spec.ports[0].nodePort}' 2>/dev/null)
    echo "  http://10.88.145.180:${DASHBOARD_PORT:-30000} (NodePort)"
fi

echo ""
log "Wazuh:"
echo "  https://10.88.140.202"
echo "  admin / *B96Y7a0t8Ep9cw+z0RSevdRHwLnsiay"

echo ""
log "Next Steps:"
echo "  1. Access dashboard at URL above"
echo "  2. Verify Wazuh agents connect"
echo "  3. Submit a test task"
echo ""
success "Cortex is now running autonomously in K3s!"
