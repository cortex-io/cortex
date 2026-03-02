# MCP Servers Helm Charts

Production-ready Helm charts for deploying Model Context Protocol (MCP) servers on Kubernetes with KEDA autoscaling support.

## Overview

This repository contains a reusable Helm chart for deploying MCP servers with:

- **KEDA Autoscaling**: Event-driven autoscaling based on Prometheus metrics, CPU, and memory
- **High Availability**: Pod disruption budgets, anti-affinity, and topology spread constraints
- **Security**: Non-root containers, read-only filesystems, network policies, and RBAC
- **Observability**: Prometheus metrics, ServiceMonitor support, and structured logging
- **Production Ready**: Health checks, graceful shutdown, resource limits, and best practices

## Supported MCP Servers

| Server | Purpose | Type | Replicas (default) |
|--------|---------|------|-------------------|
| **n8n-mcp** | Workflow automation | workflow-automation | 2 (scales to 10) |
| **talos-mcp** | Kubernetes management | kubernetes-management | 2 (scales to 5) |
| **proxmox-mcp** | Infrastructure management | infrastructure-management | 2 (scales to 5) |
| **resource-manager** | Resource orchestration | resource-orchestration | 3 (scales to 10) |

## Quick Start

See [QUICKSTART.md](QUICKSTART.md) for fast deployment.

```bash
# Test charts
./test-chart.sh

# Configure secrets in values/*.yaml

# Deploy all servers
./install-mcp-servers.sh

# Verify
kubectl get pods -n cortex-mcp
```

## Documentation

- **[QUICKSTART.md](QUICKSTART.md)** - Fast deployment guide (5 minutes)
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Complete deployment documentation
- **[mcp-server/README.md](mcp-server/README.md)** - Chart reference documentation

## Files

```
deploy/helm/
├── README.md                    # This file
├── QUICKSTART.md                # 5-minute deployment guide
├── DEPLOYMENT.md                # Complete deployment guide
├── install-mcp-servers.sh       # Installation script
├── test-chart.sh                # Validation and testing script
├── mcp-server/                  # Helm chart
│   ├── Chart.yaml               # Chart metadata
│   ├── values.yaml              # Default values
│   ├── README.md                # Chart documentation
│   ├── .helmignore              # Helm ignore patterns
│   └── templates/               # Kubernetes templates
│       ├── _helpers.tpl         # Template helpers
│       ├── deployment.yaml      # Deployment template
│       ├── service.yaml         # Service template
│       ├── configmap.yaml       # ConfigMap template
│       ├── secret.yaml          # Secret template
│       ├── serviceaccount.yaml  # ServiceAccount template
│       ├── hpa.yaml             # HorizontalPodAutoscaler
│       ├── pdb.yaml             # PodDisruptionBudget
│       ├── scaledobject.yaml    # KEDA ScaledObject
│       └── NOTES.txt            # Post-install notes
└── values/                      # Server-specific values
    ├── n8n-mcp.yaml             # n8n MCP configuration
    ├── talos-mcp.yaml           # Talos MCP configuration
    ├── proxmox-mcp.yaml         # Proxmox MCP configuration
    └── resource-manager.yaml    # Resource Manager configuration
```

## Features

### KEDA Autoscaling

All servers use KEDA for event-driven autoscaling with multiple triggers:

- **Prometheus metrics**: Custom application metrics
- **CPU utilization**: Fallback CPU-based scaling
- **Memory utilization**: Memory-based scaling
- **Queue depth**: Queue-based scaling (where applicable)

Example configuration:

```yaml
keda:
  enabled: true
  minReplicaCount: 2
  maxReplicaCount: 10
  triggers:
    - type: prometheus
      metadata:
        serverAddress: http://prometheus:9090
        metricName: http_requests_rate
        threshold: '100'
        query: sum(rate(http_requests_total[2m]))
```

### High Availability

- **Pod Disruption Budgets**: Ensures minimum availability during updates
- **Anti-Affinity**: Spreads pods across nodes
- **Topology Spread**: Distributes pods across zones
- **Multiple Replicas**: 2-3 replicas by default

### Security

- **Security Context**: Non-root user, read-only root filesystem
- **Network Policies**: Controlled ingress/egress traffic
- **RBAC**: Minimal service account permissions
- **Secret Management**: Kubernetes secrets for credentials
- **TLS**: Ingress TLS with cert-manager support

### Observability

- **Prometheus Metrics**: Exposed on `/metrics` endpoint
- **ServiceMonitor**: Prometheus Operator integration
- **Structured Logging**: JSON log format
- **Health Checks**: Liveness, readiness, and startup probes

## Prerequisites

### Required

- Kubernetes 1.23+
- Helm 3.8+
- kubectl with cluster access

### Optional

- KEDA 2.0+ (for autoscaling)
- Prometheus Operator (for ServiceMonitor)
- cert-manager (for TLS certificates)
- Ingress controller (for external access)

## Installation

### 1. Test Charts

```bash
./test-chart.sh
```

### 2. Configure Secrets

Edit values files in `values/` directory:

```bash
# Generate base64 encoded secrets
echo -n "my-secret" | base64

# Update values files
vim values/n8n-mcp.yaml
vim values/talos-mcp.yaml
vim values/proxmox-mcp.yaml
vim values/resource-manager.yaml
```

### 3. Deploy

```bash
# Deploy all servers
./install-mcp-servers.sh

# Or deploy individual servers
helm install n8n-mcp ./mcp-server \
  -f values/n8n-mcp.yaml \
  -n cortex-mcp --create-namespace
```

### 4. Verify

```bash
kubectl get pods -n cortex-mcp
kubectl get scaledobject -n cortex-mcp
kubectl logs -n cortex-mcp -l cortex.ai/mcp-server
```

## Configuration

Each server has its own values file in `values/` directory:

- **n8n-mcp.yaml**: Workflow automation server
- **talos-mcp.yaml**: Kubernetes management server
- **proxmox-mcp.yaml**: Infrastructure management server
- **resource-manager.yaml**: Resource orchestration server

Key configuration options:

```yaml
# Scaling
replicaCount: 2
keda:
  enabled: true
  minReplicaCount: 2
  maxReplicaCount: 10

# Resources
resources:
  limits:
    cpu: 1000m
    memory: 512Mi
  requests:
    cpu: 100m
    memory: 128Mi

# ConfigMap data
configMap:
  enabled: true
  data:
    LOG_LEVEL: "info"

# Secret data (base64 encoded)
secret:
  enabled: true
  data:
    API_KEY: "<base64-encoded>"
```

## Management

### Upgrade

```bash
# Upgrade all servers
./install-mcp-servers.sh

# Upgrade individual server
helm upgrade n8n-mcp ./mcp-server \
  -f values/n8n-mcp.yaml \
  -n cortex-mcp
```

### Scale

```bash
# Manual scaling
kubectl scale deploy n8n-mcp -n cortex-mcp --replicas=5

# Update KEDA limits
helm upgrade n8n-mcp ./mcp-server \
  -f values/n8n-mcp.yaml \
  --set keda.maxReplicaCount=20 \
  -n cortex-mcp
```

### Monitor

```bash
# View pods
kubectl get pods -n cortex-mcp

# View KEDA status
kubectl get scaledobject -n cortex-mcp

# View logs
kubectl logs -n cortex-mcp -l cortex.ai/mcp-server -f

# Port forward for testing
kubectl port-forward -n cortex-mcp svc/n8n-mcp 8080:8080
```

### Uninstall

```bash
# Remove all servers
helm uninstall n8n-mcp talos-mcp proxmox-mcp resource-manager -n cortex-mcp

# Delete namespace
kubectl delete namespace cortex-mcp
```

## Troubleshooting

### Pods Not Starting

```bash
kubectl describe pod <pod-name> -n cortex-mcp
kubectl logs <pod-name> -n cortex-mcp
kubectl get events -n cortex-mcp --sort-by='.lastTimestamp'
```

### KEDA Not Scaling

```bash
kubectl describe scaledobject <name> -n cortex-mcp
kubectl logs -n keda -l app=keda-operator
```

### Service Not Accessible

```bash
kubectl get endpoints -n cortex-mcp
kubectl get networkpolicy -n cortex-mcp
kubectl run -it --rm debug --image=curlimages/curl -n cortex-mcp -- \
  curl http://n8n-mcp:8080/health
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Kubernetes Cluster                        │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │            Namespace: cortex-mcp                       │ │
│  │                                                        │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐            │ │
│  │  │ n8n-mcp  │  │talos-mcp │  │proxmox-  │            │ │
│  │  │  (2-10)  │  │  (1-5)   │  │mcp (1-5) │            │ │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘            │ │
│  │       │             │             │                    │ │
│  │       └─────────────┴─────────────┘                    │ │
│  │                     │                                  │ │
│  │            ┌────────┴─────────┐                        │ │
│  │            │ resource-manager │                        │ │
│  │            │     (2-10)       │                        │ │
│  │            └──────────────────┘                        │ │
│  │                                                        │ │
│  │  ┌─────────────────────────────────────────────────┐  │ │
│  │  │              KEDA ScaledObjects                 │  │ │
│  │  │  • Prometheus metrics triggers                  │  │ │
│  │  │  • CPU/Memory utilization triggers              │  │ │
│  │  │  • Queue depth triggers                         │  │ │
│  │  └─────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  External Integrations:                                      │
│  ┌────────────┐  ┌──────────┐  ┌─────────┐                │
│  │ Prometheus │  │ Ingress  │  │ cert-   │                │
│  │            │  │          │  │ manager │                │
│  └────────────┘  └──────────┘  └─────────┘                │
└─────────────────────────────────────────────────────────────┘
```

## Contributing

Contributions welcome! Please:

1. Test changes with `./test-chart.sh`
2. Update documentation
3. Follow existing patterns
4. Submit pull request

## License

MIT License - See LICENSE file for details.

## Support

- GitHub Issues: https://github.com/ryandahlberg/cortex/issues
- Documentation: See DEPLOYMENT.md and QUICKSTART.md
- Chart Reference: See mcp-server/README.md
