# MCP Server Helm Chart

A production-ready Helm chart for deploying Model Context Protocol (MCP) servers on Kubernetes.

## Features

- **KEDA Autoscaling**: Event-driven autoscaling with support for Prometheus metrics, CPU, and memory
- **High Availability**: Pod Disruption Budgets and anti-affinity rules
- **Security**: Security contexts, network policies, and RBAC
- **Observability**: Prometheus metrics, service monitors, and structured logging
- **Flexible Configuration**: ConfigMaps and Secrets for easy configuration management
- **Production Ready**: Health checks, graceful shutdown, and resource limits

## Prerequisites

- Kubernetes 1.23+
- Helm 3.8+
- KEDA 2.0+ (optional, for KEDA-based autoscaling)
- Prometheus Operator (optional, for ServiceMonitor support)
- cert-manager (optional, for automatic TLS certificate management)

## Installation

### Install n8n MCP Server

```bash
helm install n8n-mcp ./mcp-server \
  -f ./values/n8n-mcp.yaml \
  --namespace cortex-mcp \
  --create-namespace
```

### Install Talos MCP Server

```bash
helm install talos-mcp ./mcp-server \
  -f ./values/talos-mcp.yaml \
  --namespace cortex-mcp \
  --create-namespace
```

### Install Proxmox MCP Server

```bash
helm install proxmox-mcp ./mcp-server \
  -f ./values/proxmox-mcp.yaml \
  --namespace cortex-mcp \
  --create-namespace
```

### Install Resource Manager

```bash
helm install resource-manager ./mcp-server \
  -f ./values/resource-manager.yaml \
  --namespace cortex-mcp \
  --create-namespace
```

## Configuration

### Default Values

The chart includes sensible defaults in `values.yaml`. Override these by:

1. Creating a custom values file
2. Using `--set` flags during installation
3. Using the provided server-specific values files

### Server-Specific Values

Server-specific configuration files are provided in the `../values/` directory:

- `n8n-mcp.yaml` - n8n workflow automation server
- `talos-mcp.yaml` - Talos Kubernetes management server
- `proxmox-mcp.yaml` - Proxmox infrastructure management server
- `resource-manager.yaml` - Resource orchestration server

### Key Configuration Options

#### Autoscaling

Choose between HPA (standard) or KEDA (event-driven):

```yaml
# Standard HPA
autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 80

# KEDA (preferred)
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

#### Resources

```yaml
resources:
  limits:
    cpu: 1000m
    memory: 512Mi
  requests:
    cpu: 100m
    memory: 128Mi
```

#### ConfigMap

```yaml
configMap:
  enabled: true
  data:
    LOG_LEVEL: "info"
    API_ENDPOINT: "https://api.example.com"
```

#### Secrets

```yaml
secret:
  enabled: true
  data:
    API_KEY: "base64-encoded-key"
    DB_PASSWORD: "base64-encoded-password"
```

#### Ingress

```yaml
ingress:
  enabled: true
  className: "nginx"
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
  hosts:
    - host: mcp-server.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: mcp-server-tls
      hosts:
        - mcp-server.example.com
```

## Examples

### Deploy with Custom Image

```bash
helm install my-mcp ./mcp-server \
  --set image.repository=ghcr.io/myorg/my-mcp \
  --set image.tag=v1.2.3 \
  --namespace cortex-mcp
```

### Deploy with KEDA and Prometheus Scaling

```bash
helm install my-mcp ./mcp-server \
  --set keda.enabled=true \
  --set keda.minReplicaCount=2 \
  --set keda.maxReplicaCount=20 \
  --set-string 'keda.triggers[0].type=prometheus' \
  --set-string 'keda.triggers[0].metadata.serverAddress=http://prometheus:9090' \
  --namespace cortex-mcp
```

### Deploy with Custom ConfigMap

```bash
helm install my-mcp ./mcp-server \
  --set configMap.enabled=true \
  --set-string configMap.data.LOG_LEVEL=debug \
  --set-string configMap.data.API_ENDPOINT=https://api.example.com \
  --namespace cortex-mcp
```

## Upgrade

```bash
helm upgrade n8n-mcp ./mcp-server \
  -f ./values/n8n-mcp.yaml \
  --namespace cortex-mcp
```

## Uninstall

```bash
helm uninstall n8n-mcp --namespace cortex-mcp
```

## Template Validation

Validate templates before installation:

```bash
helm template n8n-mcp ./mcp-server \
  -f ./values/n8n-mcp.yaml \
  --namespace cortex-mcp \
  --debug
```

Dry run installation:

```bash
helm install n8n-mcp ./mcp-server \
  -f ./values/n8n-mcp.yaml \
  --namespace cortex-mcp \
  --dry-run --debug
```

## Monitoring

### Prometheus Metrics

All MCP servers expose metrics at `/metrics` on port 8080 by default.

### Service Monitor

Enable ServiceMonitor for Prometheus Operator:

```yaml
serviceMonitor:
  enabled: true
  interval: 30s
  scrapeTimeout: 10s
```

### Pod Monitor

Alternative to ServiceMonitor:

```yaml
podMonitor:
  enabled: true
  interval: 30s
  scrapeTimeout: 10s
```

## Security

### Security Context

Containers run as non-root with read-only root filesystem:

```yaml
securityContext:
  allowPrivilegeEscalation: false
  capabilities:
    drop:
    - ALL
  readOnlyRootFilesystem: true
  runAsNonRoot: true
  runAsUser: 65534
```

### Network Policy

Enable network policies to restrict traffic:

```yaml
networkPolicy:
  enabled: true
  policyTypes:
    - Ingress
    - Egress
```

### RBAC

Service accounts are created automatically with minimal permissions:

```yaml
serviceAccount:
  create: true
  annotations: {}
  name: ""
```

## High Availability

### Pod Disruption Budget

```yaml
podDisruptionBudget:
  enabled: true
  minAvailable: 1
```

### Pod Anti-Affinity

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
                  - mcp-server
          topologyKey: kubernetes.io/hostname
```

### Topology Spread

```yaml
topologySpreadConstraints:
  - maxSkew: 1
    topologyKey: kubernetes.io/hostname
    whenUnsatisfiable: DoNotSchedule
    labelSelector:
      matchLabels:
        app.kubernetes.io/name: mcp-server
```

## Troubleshooting

### Check Deployment Status

```bash
kubectl get deployment -n cortex-mcp
kubectl describe deployment n8n-mcp -n cortex-mcp
```

### View Logs

```bash
kubectl logs -n cortex-mcp -l app.kubernetes.io/name=mcp-server
```

### Check KEDA ScaledObject

```bash
kubectl get scaledobject -n cortex-mcp
kubectl describe scaledobject n8n-mcp -n cortex-mcp
```

### Check HPA

```bash
kubectl get hpa -n cortex-mcp
kubectl describe hpa n8n-mcp -n cortex-mcp
```

### Port Forward for Testing

```bash
kubectl port-forward -n cortex-mcp svc/n8n-mcp 8080:8080
```

## Contributing

Contributions are welcome! Please submit pull requests or issues to the main Cortex repository.

## License

MIT License - See LICENSE file for details.

## Support

For support, please open an issue in the [Cortex repository](https://github.com/ryandahlberg/cortex).
