# Cortex Kubernetes Values Reference

Complete reference for all configurable values in the Cortex Kubernetes deployment.

## Table of Contents

- [Container Image](#container-image)
- [Replicas and Scaling](#replicas-and-scaling)
- [Resource Limits](#resource-limits)
- [Environment Variables](#environment-variables)
- [Storage](#storage)
- [Networking](#networking)
- [Security](#security)
- [Health Probes](#health-probes)

## Container Image

**Location**: `deployment.yaml`, `kustomization.yaml`

```yaml
image: ghcr.io/ry-ops/cortex:2.0.0
imagePullPolicy: IfNotPresent
```

**Options**:
- `IfNotPresent` - Pull if not present locally
- `Always` - Always pull latest
- `Never` - Never pull, use local only

## Replicas and Scaling

### Static Replicas

**Location**: `deployment.yaml`

```yaml
spec:
  replicas: 3  # Number of pods
```

**Recommendations**:
- **Development**: 1 replica
- **Staging**: 2 replicas
- **Production**: 3-5 replicas

### Horizontal Pod Autoscaler (HPA)

**Location**: `hpa.yaml`

```yaml
spec:
  minReplicas: 3      # Minimum pods
  maxReplicas: 10     # Maximum pods

  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70  # Scale up at 70% CPU

  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80  # Scale up at 80% memory
```

**Scaling Behavior**:

```yaml
behavior:
  scaleDown:
    stabilizationWindowSeconds: 300  # Wait 5 min before scaling down
    policies:
    - type: Percent
      value: 50        # Scale down max 50% at a time
      periodSeconds: 60
    - type: Pods
      value: 1         # Or 1 pod at a time
      periodSeconds: 60

  scaleUp:
    stabilizationWindowSeconds: 60  # Wait 1 min before scaling up
    policies:
    - type: Percent
      value: 100       # Scale up max 100% at a time
      periodSeconds: 30
    - type: Pods
      value: 2         # Or 2 pods at a time
      periodSeconds: 30
```

### Pod Disruption Budget (PDB)

**Location**: `pdb.yaml`

```yaml
spec:
  minAvailable: 2  # Keep at least 2 pods during disruptions
  # OR
  # maxUnavailable: 1  # Max 1 pod can be unavailable
```

## Resource Limits

**Location**: `deployment.yaml`

```yaml
resources:
  requests:
    cpu: 500m          # 0.5 CPU cores minimum
    memory: 1Gi        # 1GB RAM minimum
    ephemeral-storage: 1Gi
  limits:
    cpu: 2000m         # 2 CPU cores maximum
    memory: 4Gi        # 4GB RAM maximum
    ephemeral-storage: 5Gi
```

### Environment-Specific Recommendations

#### Development
```yaml
requests:
  cpu: 100m
  memory: 256Mi
limits:
  cpu: 500m
  memory: 1Gi
```

#### Staging
```yaml
requests:
  cpu: 250m
  memory: 512Mi
limits:
  cpu: 1000m
  memory: 2Gi
```

#### Production
```yaml
requests:
  cpu: 1000m
  memory: 2Gi
limits:
  cpu: 4000m
  memory: 8Gi
```

## Environment Variables

**Location**: `configmap.yaml`, `secret.yaml`

### ConfigMap (Non-Sensitive)

```yaml
data:
  # Application Environment
  NODE_ENV: "production"           # production, staging, development

  # CORS Configuration
  ALLOWED_ORIGINS: "https://cortex.example.com,https://cortex-dashboard.example.com"

  # Worker Configuration
  MAX_WORKERS: "10000"             # Maximum concurrent workers
  WORKER_TIMEOUT_MINUTES: "45"    # Worker timeout in minutes
  WORKER_TOKEN_BUDGET: "10000"    # Token budget per worker

  # Logging
  DEBUG: "false"                   # Enable debug logging (true/false)

  # Metrics
  METRICS_RETENTION_DAYS: "30"    # How long to keep metrics

  # Git Configuration
  GIT_AUTHOR_NAME: "Cortex Bot"
  GIT_AUTHOR_EMAIL: "cortex@ry-ops.io"

  # Performance
  NODE_OPTIONS: "--max-old-space-size=3072 --max-http-header-size=16384"

  # Timezone
  TZ: "UTC"
```

### Secrets (Sensitive)

**Location**: `secret.yaml`

```yaml
stringData:
  # Anthropic API key for Claude
  anthropic-api-key: "sk-ant-xxxxx"

  # API key for cortex authentication
  api-key: "xxxxx"
```

**Generate secure API key**:
```bash
openssl rand -base64 32
```

### Auto-Injected Variables

These are automatically added by Kubernetes:

```yaml
env:
- name: POD_NAME
  valueFrom:
    fieldRef:
      fieldPath: metadata.name

- name: POD_NAMESPACE
  valueFrom:
    fieldRef:
      fieldPath: metadata.namespace

- name: POD_IP
  valueFrom:
    fieldRef:
      fieldPath: status.podIP

- name: NODE_NAME
  valueFrom:
    fieldRef:
      fieldPath: spec.nodeName
```

## Storage

**Location**: `pvc.yaml`

```yaml
spec:
  accessModes:
  - ReadWriteOnce            # Single node mount

  storageClassName: local-path  # Storage class to use

  resources:
    requests:
      storage: 50Gi          # Storage size

  volumeMode: Filesystem     # Filesystem or Block
```

### Storage Classes

#### Local Path (Default)
```yaml
storageClassName: local-path
```
- Built into Talos
- Local node storage
- Not replicated
- Good for development

#### Longhorn (Recommended for Production)
```yaml
storageClassName: longhorn
```
- Distributed storage
- Replicated across nodes
- Automatic backups
- Better for production

#### NFS
```yaml
storageClassName: nfs-client
```
- Shared storage
- Multiple pods can mount
- Requires NFS server

#### Ceph RBD
```yaml
storageClassName: ceph-rbd
```
- Distributed block storage
- High performance
- Requires Ceph cluster

### Volume Mounts

**Location**: `deployment.yaml`

```yaml
volumeMounts:
- name: data
  mountPath: /data           # Application data
- name: tmp
  mountPath: /tmp            # Temporary files
- name: npm-cache
  mountPath: /home/node/.npm # NPM cache
```

## Networking

### Service

**Location**: `service.yaml`

```yaml
spec:
  type: ClusterIP              # ClusterIP, NodePort, LoadBalancer
  sessionAffinity: ClientIP    # Sticky sessions
  sessionAffinityConfig:
    clientIP:
      timeoutSeconds: 10800    # 3 hours

  ports:
  - name: http
    port: 9500                 # Service port
    targetPort: http           # Container port
    protocol: TCP
```

**Service Types**:
- `ClusterIP` - Internal only (default)
- `NodePort` - Exposed on node ports
- `LoadBalancer` - Cloud load balancer

### Ingress

**Location**: `ingress.yaml`

```yaml
metadata:
  annotations:
    kubernetes.io/ingress.class: "nginx"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/websocket-services: "cortex"

spec:
  tls:
  - hosts:
    - cortex.example.com       # Your domain
    secretName: cortex-tls     # TLS certificate secret

  rules:
  - host: cortex.example.com   # Your domain
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: cortex
            port:
              name: http
```

**Ingress Controllers**:
- NGINX (default)
- Traefik
- HAProxy
- Cloudflare Tunnel

## Security

### Pod Security Context

**Location**: `deployment.yaml`

```yaml
securityContext:
  runAsNonRoot: true           # Never run as root
  runAsUser: 1000              # UID to run as
  runAsGroup: 1000             # GID to run as
  fsGroup: 1000                # Filesystem group
  fsGroupChangePolicy: "OnRootMismatch"
  seccompProfile:
    type: RuntimeDefault       # Seccomp profile
```

### Container Security Context

```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true  # Prevent writes to root FS
  capabilities:
    drop:
    - ALL                       # Drop all capabilities
  seccompProfile:
    type: RuntimeDefault
```

### RBAC

**Location**: `rbac.yaml`

```yaml
# ServiceAccount
apiVersion: v1
kind: ServiceAccount
metadata:
  name: cortex

# Role - namespace permissions
rules:
- apiGroups: [""]
  resources: ["pods"]
  verbs: ["get", "list", "watch"]

# RoleBinding - bind role to SA
subjects:
- kind: ServiceAccount
  name: cortex
```

**Common Permissions**:
- `get`, `list`, `watch` - Read access
- `create`, `update`, `patch` - Write access
- `delete` - Delete access

### Network Policies

Optional: Restrict pod networking

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: cortex
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: cortex
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    ports:
    - protocol: TCP
      port: 9500
  egress:
  - to:
    - namespaceSelector: {}
    ports:
    - protocol: TCP
      port: 443  # HTTPS out
```

## Health Probes

**Location**: `deployment.yaml`

### Startup Probe

Checks if app has started (one-time check).

```yaml
startupProbe:
  httpGet:
    path: /health
    port: http
    scheme: HTTP
  initialDelaySeconds: 10     # Wait 10s before first check
  periodSeconds: 5            # Check every 5s
  timeoutSeconds: 3           # Timeout after 3s
  successThreshold: 1         # Success after 1 success
  failureThreshold: 30        # Fail after 30 failures (150s total)
```

### Liveness Probe

Checks if app is alive (restart if fails).

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: http
    scheme: HTTP
  initialDelaySeconds: 30     # Wait 30s after start
  periodSeconds: 10           # Check every 10s
  timeoutSeconds: 5           # Timeout after 5s
  successThreshold: 1         # Success after 1 success
  failureThreshold: 3         # Fail after 3 failures (30s)
```

### Readiness Probe

Checks if app is ready to serve traffic.

```yaml
readinessProbe:
  httpGet:
    path: /health
    port: http
    scheme: HTTP
  initialDelaySeconds: 5      # Wait 5s
  periodSeconds: 5            # Check every 5s
  timeoutSeconds: 3           # Timeout after 3s
  successThreshold: 1         # Ready after 1 success
  failureThreshold: 3         # Not ready after 3 failures
```

## Affinity and Topology

### Pod Anti-Affinity

Spread pods across nodes.

**Location**: `deployment.yaml`

```yaml
affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
    - weight: 100
      podAffinityTerm:
        labelSelector:
          matchExpressions:
          - key: app.kubernetes.io/name
            operator: In
            values:
            - cortex
        topologyKey: kubernetes.io/hostname  # Spread across nodes
```

**Topology Keys**:
- `kubernetes.io/hostname` - Different nodes
- `topology.kubernetes.io/zone` - Different zones/datacenters
- `topology.kubernetes.io/region` - Different regions

### Topology Spread Constraints

More precise pod distribution.

```yaml
topologySpreadConstraints:
- maxSkew: 1                    # Max difference in pod count
  topologyKey: kubernetes.io/hostname
  whenUnsatisfiable: ScheduleAnyway
  labelSelector:
    matchLabels:
      app.kubernetes.io/name: cortex
```

## Labels and Annotations

### Common Labels

**Location**: All resources

```yaml
labels:
  app.kubernetes.io/name: cortex
  app.kubernetes.io/instance: cortex
  app.kubernetes.io/version: "2.0.0"
  app.kubernetes.io/component: orchestration
  app.kubernetes.io/part-of: cortex-platform
  app.kubernetes.io/managed-by: kubectl
  environment: production
  tier: critical
```

### Common Annotations

```yaml
annotations:
  description: "Resource description"

  # Prometheus
  prometheus.io/scrape: "true"
  prometheus.io/port: "9500"
  prometheus.io/path: "/metrics"

  # Cert-manager
  cert-manager.io/cluster-issuer: "letsencrypt-prod"

  # NGINX Ingress
  nginx.ingress.kubernetes.io/ssl-redirect: "true"
```

## Quick Reference

### Change Domain

1. Edit `ingress.yaml`:
   ```yaml
   spec:
     rules:
     - host: your-domain.com  # Change this
   ```

2. Apply:
   ```bash
   kubectl apply -f ingress.yaml
   ```

### Change Storage Size

1. Edit `pvc.yaml`:
   ```yaml
   resources:
     requests:
       storage: 100Gi  # Change this
   ```

2. Delete and recreate PVC (will lose data!):
   ```bash
   kubectl delete pvc cortex-data -n cortex
   kubectl apply -f pvc.yaml
   ```

### Change Replicas

1. Edit `deployment.yaml`:
   ```yaml
   spec:
     replicas: 5  # Change this
   ```

2. Apply:
   ```bash
   kubectl apply -f deployment.yaml
   ```

### Update Environment Variable

1. Edit `configmap.yaml`:
   ```yaml
   data:
     MAX_WORKERS: "20000"  # Change this
   ```

2. Apply and restart:
   ```bash
   kubectl apply -f configmap.yaml
   kubectl rollout restart deployment cortex -n cortex
   ```

### Change Resource Limits

1. Edit `deployment.yaml`:
   ```yaml
   resources:
     limits:
       cpu: 4000m      # Change this
       memory: 8Gi     # Change this
   ```

2. Apply:
   ```bash
   kubectl apply -f deployment.yaml
   ```

## See Also

- [README.md](README.md) - Full documentation
- [QUICKSTART.md](QUICKSTART.md) - Quick start guide
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Talos Documentation](https://www.talos.dev/)
