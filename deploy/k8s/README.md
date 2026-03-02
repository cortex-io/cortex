# Cortex Kubernetes Deployment

Production-ready Kubernetes deployment for Cortex AI orchestration system.

## Quick Start

```bash
# Build the image
docker build -t ghcr.io/ry-ops/cortex:latest -f deploy/k8s/Dockerfile .

# Deploy to k3s
kubectl apply -f deploy/k8s/namespace.yaml
kubectl apply -f deploy/k8s/rbac.yaml
kubectl apply -f deploy/k8s/secret.yaml
kubectl apply -f deploy/k8s/configmap.yaml
kubectl apply -f deploy/k8s/pvc.yaml
kubectl apply -f deploy/k8s/deployment.yaml
kubectl apply -f deploy/k8s/service.yaml

# Or use Kustomize
kubectl apply -k deploy/k8s/
```

## Components

- **Dockerfile**: Production container image
- **namespace.yaml**: cortex namespace
- **rbac.yaml**: ServiceAccount, Role, RoleBinding
- **secret.yaml**: Credentials (ANTHROPIC_API_KEY)
- **configmap.yaml**: Environment configuration
- **pvc.yaml**: Persistent storage (50Gi)
- **deployment.yaml**: Cortex deployment (3 replicas)
- **service.yaml**: ClusterIP service
- **hpa.yaml**: Horizontal Pod Autoscaler
- **ingress.yaml**: External access (optional)

## Scaling

```bash
# Manual scaling
kubectl scale deployment cortex -n cortex --replicas=10

# Auto-scaling (via HPA)
kubectl apply -f deploy/k8s/hpa.yaml
```

## Monitoring

```bash
# Check pod status
kubectl get pods -n cortex -o wide

# View logs
kubectl logs -n cortex -l app.kubernetes.io/name=cortex --tail=100

# Check metrics
kubectl top pods -n cortex
```

## Architecture

Cortex runs with:
- 3+ replicas for high availability
- 20 workers per pod
- Pod anti-affinity for node distribution
- Health checks and liveness probes
- Resource limits (500m-4000m CPU, 1-8Gi RAM)

See main [deployment README](../README.md) for more details.
