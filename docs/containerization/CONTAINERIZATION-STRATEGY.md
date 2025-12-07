# Cortex Containerization Strategy

**Version:** 2.0.0
**Date:** 2025-12-07
**Status:** Production Ready

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Deployment Options](#deployment-options)
4. [Configuration Management](#configuration-management)
5. [Secrets Management](#secrets-management)
6. [Storage and Persistence](#storage-and-persistence)
7. [Networking](#networking)
8. [Security](#security)
9. [Monitoring and Observability](#monitoring-and-observability)
10. [Scaling Strategy](#scaling-strategy)
11. [Backup and Disaster Recovery](#backup-and-disaster-recovery)
12. [CI/CD Pipeline](#cicd-pipeline)
13. [Private Fork Management](#private-fork-management)
14. [Operational Procedures](#operational-procedures)
15. [Troubleshooting](#troubleshooting)

---

## Executive Summary

Cortex is now fully containerized, supporting deployment via Docker Compose for development/testing and Kubernetes for production environments. This strategy document outlines the complete approach to containerization, including:

- **Multi-stage Docker builds** optimized for security and size
- **Multi-architecture support** (amd64, arm64)
- **Comprehensive Kubernetes manifests** for production deployment
- **Automated CI/CD pipelines** for builds, testing, and publishing
- **Private fork workflow** with automated upstream synchronization
- **Security-first approach** with vulnerability scanning and hardening

### Key Benefits

- **Portability:** Run anywhere - local, cloud, on-premises
- **Consistency:** Same environment in dev, test, and production
- **Scalability:** Kubernetes-ready for horizontal scaling
- **Security:** Built-in security scanning and hardening
- **Automation:** Fully automated build and deployment pipelines
- **Maintainability:** Easy updates via upstream sync

---

## Architecture Overview

### Container Image Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Cortex Container                    │
├─────────────────────────────────────────────────────┤
│  Runtime Layer (node:20-alpine)                     │
│  - Non-root user (cortex:1000)                      │
│  - Bash, jq, git, curl                              │
│  - Node.js runtime + production dependencies        │
├─────────────────────────────────────────────────────┤
│  Application Layer                                   │
│  - Cortex scripts and libraries                     │
│  - Coordination system                              │
│  - Master orchestrators                             │
│  - Dashboard (optional)                             │
├─────────────────────────────────────────────────────┤
│  Data Layer (Volume Mounts)                         │
│  - /app/coordination (state, tasks, metrics)        │
│  - /app/agents/logs (execution logs)                │
│  - /app/data (persistent data)                      │
└─────────────────────────────────────────────────────┘
```

### Multi-Stage Build Process

1. **Builder Stage:** Install dependencies with npm ci
2. **Runtime Stage:** Copy artifacts, configure security, minimize image size

### Component Dependencies

```
External Services
├── Anthropic API (required)
├── OpenAI API (optional)
├── MCP Servers (optional)
│   ├── n8n-mcp-server
│   └── proxmox-mcp-server
└── Container Registry (GHCR)
```

---

## Deployment Options

### Option 1: Docker Compose (Development/Testing)

**Use Case:** Local development, testing, small deployments

```bash
# Development
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

# Production
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

**Pros:**
- Simple setup
- Quick iteration
- Low resource requirements
- Good for single-node deployments

**Cons:**
- No orchestration
- Manual scaling
- Limited high availability

### Option 2: Kubernetes (Production)

**Use Case:** Production deployments, high availability, scalability

```bash
# Apply all manifests
kubectl apply -f k8s/

# Or use kustomize
kubectl apply -k k8s/
```

**Pros:**
- Automated orchestration
- High availability
- Horizontal scaling
- Service discovery
- Rolling updates
- Self-healing

**Cons:**
- More complex setup
- Higher resource requirements
- Steeper learning curve

### Deployment Decision Matrix

| Factor | Docker Compose | Kubernetes |
|--------|---------------|------------|
| Team Size | 1-5 | 5+ |
| Complexity | Low | High |
| Scalability | Limited | Excellent |
| HA | No | Yes |
| Resources | Minimal | Moderate-High |
| Best For | Dev/Test | Production |

---

## Configuration Management

### Environment Variables

Configuration is managed through environment variables in three layers:

1. **Default values** (in Dockerfile)
2. **ConfigMap** (Kubernetes) or `.env` (Docker Compose)
3. **Secrets** (sensitive data)

#### Core Configuration

```bash
# Application
NODE_ENV=production
LOG_LEVEL=info
PORT=3000
DASHBOARD_PORT=3001

# Cortex
CORTEX_HOME=/app
COORDINATION_DIR=/app/coordination

# Features
ENABLE_MCP_SERVERS=true
ENABLE_LEARNING=true
ENABLE_TRACING=true
```

#### Runtime Configuration

```bash
# Performance
MAX_WORKERS=10
WORKER_TIMEOUT=300
TOKEN_BUDGET=200000

# Dashboard
DASHBOARD_REFRESH_INTERVAL=30
DASHBOARD_MAX_EVENTS=1000
```

### ConfigMap (Kubernetes)

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: cortex-config
data:
  LOG_LEVEL: "info"
  MAX_WORKERS: "10"
  # ... additional config
```

### Docker Compose Environment

```yaml
environment:
  - LOG_LEVEL=${LOG_LEVEL:-info}
  - MAX_WORKERS=${MAX_WORKERS:-10}
```

---

## Secrets Management

### Security Principles

1. **Never commit secrets to git**
2. **Use platform-native secret storage**
3. **Rotate secrets regularly**
4. **Use least-privilege access**
5. **Audit secret access**

### Required Secrets

| Secret | Required | Purpose |
|--------|----------|---------|
| `ANTHROPIC_API_KEY` | Yes | Claude API access |
| `OPENAI_API_KEY` | No | GPT API access |
| `GITHUB_TOKEN` | No | Private repo access |
| `JWT_SECRET` | No | Dashboard auth |

### Docker Compose Secrets

```bash
# Create .env file (DO NOT commit)
cat > .env << 'EOF'
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
EOF

# Use in docker-compose.yml
env_file:
  - .env
```

### Kubernetes Secrets

```bash
# Create secret from literal
kubectl create secret generic cortex-secrets \
  --from-literal=ANTHROPIC_API_KEY='sk-ant-...' \
  --namespace cortex

# Or from file
kubectl create secret generic cortex-secrets \
  --from-env-file=.env \
  --namespace cortex

# Or apply manifest
kubectl apply -f k8s/secret.yaml
```

### External Secret Managers

For enhanced security, integrate with:

- **AWS Secrets Manager**
- **HashiCorp Vault**
- **Azure Key Vault**
- **Google Secret Manager**

See `k8s/secret.yaml.template` for External Secrets Operator configuration.

---

## Storage and Persistence

### Volume Requirements

| Volume | Purpose | Size | Backup |
|--------|---------|------|--------|
| `/app/coordination` | State, tasks, metrics | 10 GB | Critical |
| `/app/agents/logs` | Execution logs | 20 GB | Important |
| `/app/data` | Application data | 5 GB | Important |

### Docker Compose Volumes

```yaml
volumes:
  cortex-coordination:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: ./data/coordination
```

### Kubernetes Persistent Volumes

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: cortex-coordination-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
  storageClassName: standard
```

### Storage Classes

Choose appropriate storage class based on performance needs:

- **standard:** General purpose (HDD)
- **fast:** SSD-backed storage
- **premium:** High-performance NVMe

### Backup Strategy

```bash
# Backup coordination data
kubectl exec cortex-xxx -- tar czf - /app/coordination > backup-$(date +%Y%m%d).tar.gz

# Restore coordination data
kubectl exec -i cortex-xxx -- tar xzf - -C / < backup-20251207.tar.gz
```

---

## Networking

### Port Mappings

| Port | Service | Protocol | Public |
|------|---------|----------|--------|
| 3000 | Main API | HTTP | Optional |
| 3001 | Dashboard | HTTP | Yes |

### Service Discovery (Kubernetes)

```yaml
# ClusterIP for internal access
apiVersion: v1
kind: Service
metadata:
  name: cortex
spec:
  type: ClusterIP
  ports:
    - port: 3000
      targetPort: 3000
```

### Ingress Configuration

```yaml
# Nginx Ingress for external access
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: cortex-ingress
spec:
  rules:
    - host: cortex.example.com
      http:
        paths:
          - path: /
            backend:
              service:
                name: cortex
                port:
                  number: 3001
```

### Network Policies

Restrict network traffic to required services:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: cortex-network-policy
spec:
  podSelector:
    matchLabels:
      app: cortex
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: ingress-nginx
  egress:
    - to:  # Allow HTTPS for API calls
        - namespaceSelector: {}
      ports:
        - port: 443
```

---

## Security

### Container Security Best Practices

1. **Non-root user:** Run as UID 1000 (cortex user)
2. **Read-only root filesystem:** With writable tmpfs mounts
3. **Drop capabilities:** Remove all unnecessary Linux capabilities
4. **Security scanning:** Automated Trivy scans in CI/CD
5. **Minimal base image:** Alpine Linux for small attack surface
6. **No secrets in image:** All secrets via environment/volumes

### Security Context (Kubernetes)

```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  runAsGroup: 1000
  fsGroup: 1000
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities:
    drop:
      - ALL
```

### Vulnerability Scanning

Automated scanning with Trivy in GitHub Actions:

```yaml
- name: Run Trivy vulnerability scanner
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: cortex:latest
    severity: 'CRITICAL,HIGH'
```

### Security Checklist

- [ ] Non-root user configured
- [ ] Read-only root filesystem
- [ ] Secrets in secure storage (not code)
- [ ] Network policies applied
- [ ] Security scanning enabled
- [ ] Regular security updates
- [ ] Audit logging enabled

---

## Monitoring and Observability

### Health Checks

```yaml
# Liveness probe
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 60
  periodSeconds: 30

# Readiness probe
readinessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10
```

### Metrics Collection

Cortex exposes Prometheus-compatible metrics at `/metrics`:

```yaml
annotations:
  prometheus.io/scrape: "true"
  prometheus.io/port: "3000"
  prometheus.io/path: "/metrics"
```

### Logging

Structured JSON logging to stdout/stderr:

```yaml
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

### Distributed Tracing

OpenTelemetry integration for distributed tracing:

```bash
ENABLE_TRACING=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318
```

---

## Scaling Strategy

### Current State: Single Instance

Cortex currently uses file-based coordination, requiring **single instance** deployment:

```yaml
replicas: 1  # Do not increase until shared storage implemented
```

### Future: Horizontal Scaling

To enable horizontal scaling:

1. **Implement distributed coordination** (Redis, etcd, or PostgreSQL)
2. **Migrate from file-based to database-backed state**
3. **Add leader election** for master orchestrators
4. **Implement distributed locking**

### Vertical Scaling

Scale resources per instance:

```yaml
resources:
  requests:
    cpu: 500m
    memory: 1Gi
  limits:
    cpu: 2000m
    memory: 4Gi
```

### HPA (Future)

Once horizontal scaling is supported:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: cortex-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: cortex
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

---

## Backup and Disaster Recovery

### Backup Strategy

**Critical Data:**
- `/app/coordination` - System state, tasks, metrics
- `/app/agents/logs` - Execution history

**Backup Frequency:**
- Coordination data: Hourly
- Logs: Daily

### Backup Script

```bash
#!/bin/bash
# backup-cortex.sh

BACKUP_DIR="/backups/cortex"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Docker Compose
docker exec cortex tar czf - /app/coordination > "$BACKUP_DIR/coordination-$TIMESTAMP.tar.gz"

# Kubernetes
kubectl exec -n cortex cortex-xxx -- tar czf - /app/coordination > "$BACKUP_DIR/coordination-$TIMESTAMP.tar.gz"
```

### Disaster Recovery Procedure

1. **Restore from backup**
   ```bash
   kubectl exec -i -n cortex cortex-xxx -- tar xzf - -C / < coordination-backup.tar.gz
   ```

2. **Verify state**
   ```bash
   kubectl exec -n cortex cortex-xxx -- cat /app/coordination/task-queue.json | jq
   ```

3. **Restart pod**
   ```bash
   kubectl rollout restart deployment/cortex -n cortex
   ```

4. **Monitor recovery**
   ```bash
   kubectl logs -f -n cortex deployment/cortex
   ```

### RTO/RPO Targets

- **Recovery Time Objective (RTO):** < 15 minutes
- **Recovery Point Objective (RPO):** < 1 hour

---

## CI/CD Pipeline

### Build Pipeline

Automated Docker builds on every push:

```yaml
# .github/workflows/docker-build.yml
on:
  push:
    branches: [main, docker-container]
  pull_request:
    branches: [main]

jobs:
  build-test:
    - Build Docker image
    - Run tests
    - Security scan with Trivy
```

### Publish Pipeline

Automated publishing on releases:

```yaml
# .github/workflows/docker-publish.yml
on:
  push:
    tags: ['v*.*.*']
  release:
    types: [published]

jobs:
  build-push:
    - Build multi-arch images (amd64, arm64)
    - Push to GitHub Container Registry
    - Create release notes
```

### Image Tagging Strategy

| Tag | When | Example |
|-----|------|---------|
| `latest` | Every main branch push | `cortex:latest` |
| `vX.Y.Z` | Semantic version releases | `cortex:v2.0.0` |
| `vX.Y` | Major.minor versions | `cortex:v2.0` |
| `sha-XXXXXX` | Every commit | `cortex:main-a1b2c3d` |

---

## Private Fork Management

### Why Private Fork?

- **Protect proprietary customizations**
- **Secure API keys and configurations**
- **Control access to deployment code**
- **Enable custom features**

### Upstream Sync Workflow

Automated weekly synchronization from `ry-ops/cortex`:

```yaml
# .github/workflows/upstream-sync.yml
on:
  schedule:
    - cron: '0 2 * * 1'  # Monday 2 AM UTC
  workflow_dispatch:

jobs:
  sync:
    - Fetch upstream changes
    - Create PR if changes detected
    - Notify on conflicts
```

### Manual Sync

```bash
# Fetch upstream
git fetch upstream main

# Merge upstream changes
git checkout main
git merge upstream/main

# Resolve conflicts (if any)
# ... edit files ...
git add .
git commit -m "Merge upstream changes"

# Push to private fork
git push origin main
```

### Branching Strategy

```
main (production)
  ├── docker-container (containerization work)
  ├── feature/* (feature branches)
  └── upstream-sync-* (automated sync PRs)
```

---

## Operational Procedures

### Deployment Procedures

#### Initial Deployment (Kubernetes)

```bash
# 1. Create namespace
kubectl apply -f k8s/namespace.yaml

# 2. Create secrets
kubectl create secret generic cortex-secrets \
  --from-literal=ANTHROPIC_API_KEY='your-key' \
  --namespace cortex

# 3. Apply configurations
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/serviceaccount.yaml

# 4. Create persistent volumes
kubectl apply -f k8s/pvc.yaml

# 5. Deploy application
kubectl apply -f k8s/deployment.yaml

# 6. Expose service
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml

# 7. Verify deployment
kubectl get pods -n cortex
kubectl logs -f -n cortex deployment/cortex
```

#### Update Deployment

```bash
# Update image to new version
kubectl set image deployment/cortex \
  cortex=ghcr.io/ry-ops/cortex:v2.1.0 \
  -n cortex

# Or apply updated manifest
kubectl apply -f k8s/deployment.yaml

# Watch rollout
kubectl rollout status deployment/cortex -n cortex
```

#### Rollback Deployment

```bash
# Rollback to previous version
kubectl rollout undo deployment/cortex -n cortex

# Rollback to specific revision
kubectl rollout undo deployment/cortex --to-revision=2 -n cortex
```

### Maintenance Procedures

#### View Logs

```bash
# Docker Compose
docker-compose logs -f cortex

# Kubernetes
kubectl logs -f -n cortex deployment/cortex
```

#### Access Shell

```bash
# Docker Compose
docker-compose exec cortex bash

# Kubernetes
kubectl exec -it -n cortex deployment/cortex -- bash
```

#### Update Configuration

```bash
# Update ConfigMap
kubectl edit configmap cortex-config -n cortex

# Restart pods to pick up changes
kubectl rollout restart deployment/cortex -n cortex
```

---

## Troubleshooting

### Common Issues

#### Container won't start

```bash
# Check logs
docker logs cortex-main

# Or Kubernetes
kubectl logs -n cortex deployment/cortex

# Common causes:
# - Missing ANTHROPIC_API_KEY
# - Volume mount permissions
# - Port conflicts
```

#### Health check failing

```bash
# Test health endpoint
curl http://localhost:3000/health

# Check container health
docker inspect cortex-main | jq '.[0].State.Health'

# Kubernetes
kubectl describe pod -n cortex cortex-xxx
```

#### Persistent volume issues

```bash
# Check PVC status
kubectl get pvc -n cortex

# Check PV binding
kubectl describe pvc cortex-coordination-pvc -n cortex

# Fix permissions
kubectl exec -n cortex cortex-xxx -- chown -R 1000:1000 /app/coordination
```

#### Image pull errors

```bash
# Login to registry
docker login ghcr.io

# Or create image pull secret for Kubernetes
kubectl create secret docker-registry ghcr-secret \
  --docker-server=ghcr.io \
  --docker-username=YOUR-USERNAME \
  --docker-password=YOUR-TOKEN \
  --namespace cortex
```

### Debug Checklist

- [ ] Check container logs
- [ ] Verify environment variables
- [ ] Test health endpoint
- [ ] Check volume mounts
- [ ] Verify secrets exist
- [ ] Check network connectivity
- [ ] Review resource limits

---

## Appendix

### File Structure

```
cortex/
├── Dockerfile                          # Multi-stage production image
├── .dockerignore                       # Build context exclusions
├── docker-compose.yml                  # Base compose config
├── docker-compose.dev.yml              # Development overrides
├── docker-compose.prod.yml             # Production overrides
├── k8s/                                # Kubernetes manifests
│   ├── namespace.yaml
│   ├── configmap.yaml
│   ├── secret.yaml.template
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   ├── pvc.yaml
│   ├── serviceaccount.yaml
│   └── network-policy.yaml
├── .github/workflows/                  # CI/CD pipelines
│   ├── docker-build.yml
│   ├── docker-publish.yml
│   └── upstream-sync.yml
├── scripts/containerization/           # Helper scripts
│   ├── build-docker.sh
│   ├── run-docker.sh
│   ├── deploy-k8s.sh
│   └── test-container.sh
└── docs/containerization/              # Documentation
    ├── CONTAINERIZATION-STRATEGY.md    # This document
    ├── PRIVATE-FORK-SETUP.md
    ├── QUICKSTART.md
    └── TROUBLESHOOTING.md
```

### References

- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [OWASP Docker Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html)
- [12-Factor App](https://12factor.net/)

### Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0.0 | 2025-12-07 | Initial containerization release |

---

**Document Maintained By:** Cortex Team
**Last Updated:** 2025-12-07
**Next Review:** 2025-03-07
