# OpenTelemetry Configuration for Cortex

Phase 3 advanced observability setup with OpenTelemetry for distributed tracing, metrics, and logs.

## Overview

This directory contains the complete OpenTelemetry (OTel) configuration for the Cortex automation system, enabling:

- **Distributed Tracing**: Track requests across masters, workers, and services
- **Metrics Collection**: Gather performance metrics from all components
- **Log Aggregation**: Centralize logs with context correlation
- **Service Performance**: RED metrics (Rate, Errors, Duration)

## Architecture

```
Cortex Agents → OTel Agent (DaemonSet) → OTel Collector → Backends
                     ↓                          ↓
                Host Metrics              Prometheus
                Container Logs            Tempo
                                         Loki
```

### Components

1. **OTel Collector** (Deployment)
   - Central telemetry processor
   - Metrics, traces, and logs pipelines
   - Exports to Prometheus, Tempo, Loki
   - HA deployment with 2+ replicas

2. **OTel Agent** (DaemonSet)
   - Node-level collection
   - Host and container metrics
   - Log file collection
   - Lightweight resource usage

3. **Instrumentation**
   - Auto-instrumentation for Node.js and Python
   - Manual instrumentation helpers
   - Cortex-specific span attributes
   - Sampling configuration

## Files

| File | Description |
|------|-------------|
| `otel-collector-config.yaml` | Collector configuration with receivers, processors, exporters |
| `otel-collector-deployment.yaml` | Kubernetes Deployment, Services, RBAC |
| `otel-agent-daemonset.yaml` | DaemonSet for node-level collection |
| `cortex-instrumentation.yaml` | Application instrumentation configs |
| `tracing-config.md` | Developer guide for adding tracing |
| `deploy-otel.sh` | Automated deployment script |
| `README.md` | This file |

## Quick Start

### Prerequisites

- Kubernetes cluster (1.24+)
- kubectl configured
- Prometheus Operator (recommended)
- 2GB+ available memory per node

### Installation

1. **Deploy OpenTelemetry infrastructure:**

   ```bash
   ./deploy-otel.sh
   ```

   This script will:
   - Create `cortex-observability` namespace
   - Deploy OTel Collector (2 replicas)
   - Deploy OTel Agent (DaemonSet)
   - Configure RBAC and services
   - Verify deployment

2. **Verify installation:**

   ```bash
   # Check OTel Collector
   kubectl get deployment -n cortex-observability otel-collector

   # Check OTel Agent
   kubectl get daemonset -n cortex-observability otel-agent

   # View services
   kubectl get svc -n cortex-observability
   ```

3. **View metrics:**

   ```bash
   # Port-forward to Collector metrics
   kubectl port-forward -n cortex-observability svc/otel-collector 8888:8888

   # Open http://localhost:8888/metrics
   ```

### Manual Deployment

If you prefer manual deployment:

```bash
# Create namespace
kubectl create namespace cortex-observability

# Create ConfigMap for Collector
kubectl create configmap otel-collector-config \
  --from-file=otel-collector-config.yaml \
  -n cortex-observability

# Deploy Collector
kubectl apply -f otel-collector-deployment.yaml

# Deploy Agent
kubectl apply -f otel-agent-daemonset.yaml

# Deploy instrumentation
kubectl apply -f cortex-instrumentation.yaml
```

## Configuration

### OTLP Endpoints

Applications should send telemetry to:

- **gRPC**: `otel-collector.cortex-observability.svc.cluster.local:4317`
- **HTTP**: `otel-collector.cortex-observability.svc.cluster.local:4318`

### Environment Variables

Cortex agents should set:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT="http://otel-agent.cortex-observability.svc.cluster.local:4318"
export OTEL_SERVICE_NAME="cortex-${CORTEX_AGENT_TYPE}"
export OTEL_TRACES_SAMPLER="parentbased_traceidratio"
export OTEL_TRACES_SAMPLER_ARG="0.1"  # 10% sampling
```

### Kubernetes Annotations

Enable auto-instrumentation in pods:

```yaml
annotations:
  instrumentation.opentelemetry.io/inject-nodejs: "true"
  instrumentation.opentelemetry.io/inject-python: "true"
  cortex.task.id: "task-123"
  cortex.session.id: "session-456"
```

## Integration with Cortex

### Master Agents

Master agents should:

1. Initialize OpenTelemetry SDK at startup
2. Create spans for task handling
3. Add Cortex-specific attributes (master type, task ID, session ID)
4. Propagate trace context to workers

Example:
```javascript
const { trace } = require('@opentelemetry/api');

async function handleHandoff(handoff) {
  const tracer = trace.getTracer('cortex-master');
  return tracer.startActiveSpan('cortex.master.handle_handoff', async (span) => {
    span.setAttribute('cortex.master.type', 'development');
    span.setAttribute('cortex.task.id', handoff.task_id);
    // ... handle task
    span.end();
  });
}
```

### Worker Agents

Workers receive trace context from masters and continue the trace:

```python
from opentelemetry import trace

def execute_task(task_spec):
    tracer = trace.get_tracer(__name__)
    with tracer.start_as_current_span("cortex.worker.execute_task") as span:
        span.set_attribute("cortex.worker.id", self.worker_id)
        span.set_attribute("cortex.task.id", task_spec['task_id'])
        # ... execute task
```

See [`tracing-config.md`](./tracing-config.md) for complete examples.

## Backends

### Prometheus (Metrics)

The OTel Collector exports metrics to Prometheus:

- **Endpoint**: `otel-collector:8889/metrics`
- **ServiceMonitor**: Auto-configured for Prometheus Operator
- **Namespace**: `cortex` (all metrics prefixed)

### Tempo (Traces)

Deploy Tempo for trace storage:

```bash
# Deploy Tempo (see monitoring directory)
kubectl apply -f ../monitoring/tempo-deployment.yaml

# Configure in otel-collector-config.yaml
exporters:
  otlp:
    endpoint: tempo.cortex-system.svc.cluster.local:4317
```

### Loki (Logs)

Deploy Loki for log aggregation:

```bash
# Deploy Loki
kubectl apply -f ../monitoring/loki-deployment.yaml

# Configure in otel-collector-config.yaml
exporters:
  otlphttp/loki:
    endpoint: http://loki.cortex-system.svc.cluster.local:3100/otlp
```

## Monitoring

### OTel Collector Metrics

Key metrics to monitor:

- `otelcol_receiver_accepted_spans`: Spans received
- `otelcol_receiver_refused_spans`: Spans rejected
- `otelcol_exporter_sent_spans`: Spans exported
- `otelcol_processor_batch_batch_send_size`: Batch sizes
- `otelcol_process_runtime_heap_alloc_bytes`: Memory usage

### Dashboards

Grafana dashboards are available in `/deploy/monitoring/dashboards/`:

- `otel-collector-dashboard.json`: Collector health and performance
- `cortex-traces-dashboard.json`: Cortex trace analysis
- `cortex-service-performance.json`: Service RED metrics

### Alerts

PrometheusRules in `/deploy/monitoring/alerts/`:

- `otel-collector-down`: Collector unavailable
- `otel-high-span-drop-rate`: Spans being dropped
- `otel-high-memory`: Memory usage high

## Troubleshooting

### Collector Not Receiving Spans

```bash
# Check collector logs
kubectl logs -n cortex-observability -l app.kubernetes.io/name=otel-collector -f

# Verify service endpoints
kubectl get endpoints -n cortex-observability otel-collector

# Test connectivity
kubectl run test-otel --image=curlimages/curl --rm -it -- \
  curl -v http://otel-collector.cortex-observability.svc.cluster.local:4318/v1/traces
```

### High Memory Usage

Adjust processor configurations in `otel-collector-config.yaml`:

```yaml
processors:
  memory_limiter:
    limit_percentage: 75  # Lower if needed
    spike_limit_percentage: 25

  batch:
    send_batch_size: 512  # Reduce batch size
    timeout: 5s           # Reduce timeout
```

### Spans Being Dropped

```bash
# Check drop metrics
kubectl port-forward -n cortex-observability svc/otel-collector 8888:8888
curl http://localhost:8888/metrics | grep refused

# Increase resources
kubectl edit deployment -n cortex-observability otel-collector
# Update resources.limits.memory
```

### Agent Not Collecting Logs

```bash
# Check agent logs
kubectl logs -n cortex-observability -l app.kubernetes.io/name=otel-agent -f

# Verify file paths
kubectl exec -n cortex-observability -it <agent-pod> -- ls -la /var/log/pods/

# Check permissions
kubectl exec -n cortex-observability -it <agent-pod> -- id
```

## Performance Tuning

### Resource Allocation

Default resources per component:

**OTel Collector:**
- CPU: 200m request, 1000m limit
- Memory: 512Mi request, 1Gi limit

**OTel Agent:**
- CPU: 100m request, 500m limit
- Memory: 256Mi request, 512Mi limit

### Scaling

Scale the Collector for high-traffic environments:

```bash
# Manual scaling
kubectl scale deployment otel-collector -n cortex-observability --replicas=5

# Enable HPA (already configured)
kubectl get hpa -n cortex-observability otel-collector
```

### Sampling

Adjust sampling rates in `cortex-instrumentation.yaml`:

```yaml
sampler:
  type: parentbased_traceidratio
  argument: "0.1"  # 10% sampling - adjust as needed
```

Sampling strategies:
- Development: 1.0 (100%)
- Staging: 0.5 (50%)
- Production: 0.1 (10%)
- High-volume: 0.01 (1%)

## Security

### Network Policies

NetworkPolicy restricts access to the Collector:

- Ingress from `cortex-system` namespace only
- Egress to Kubernetes API, Prometheus, Tempo, Loki
- DNS allowed

### RBAC

Minimal RBAC permissions:

- **Collector**: Read cluster metrics (nodes, pods, etc.)
- **Agent**: Read kubelet stats, pod metadata

### Data Privacy

Sensitive data is filtered by the `attributes` processor:

```yaml
processors:
  attributes:
    actions:
      - key: http.request.header.authorization
        action: delete
      - key: http.request.header.cookie
        action: delete
```

Add additional filters as needed.

## Migration Guide

### From Existing Monitoring

If migrating from existing monitoring:

1. **Keep existing Prometheus**
   - OTel exports to Prometheus (no disruption)
   - Gradually migrate scrapers to OTel receivers

2. **Add tracing incrementally**
   - Start with one master type
   - Validate trace quality
   - Roll out to other components

3. **Consolidate logs**
   - Configure Loki integration
   - Migrate log queries to Grafana
   - Deprecate old log aggregation

### From Manual Instrumentation

If you have manual instrumentation:

1. Keep manual spans for now
2. Add auto-instrumentation
3. Verify no duplicate spans
4. Gradually remove manual code

## Development

### Local Testing

Test configuration locally with Docker:

```bash
# Run Collector locally
docker run -p 4317:4317 -p 4318:4318 -p 8888:8888 \
  -v $(pwd)/otel-collector-config.yaml:/etc/otel/config.yaml \
  otel/opentelemetry-collector-contrib:0.91.0 \
  --config=/etc/otel/config.yaml

# Send test span
curl -X POST http://localhost:4318/v1/traces \
  -H "Content-Type: application/json" \
  -d @test-span.json
```

### Validation

Before deploying changes:

```bash
# Validate configuration
docker run --rm \
  -v $(pwd)/otel-collector-config.yaml:/config.yaml \
  otel/opentelemetry-collector-contrib:0.91.0 \
  validate --config=/config.yaml

# Dry run Kubernetes manifests
kubectl apply -f otel-collector-deployment.yaml --dry-run=client
```

## Resources

### Documentation

- [OpenTelemetry](https://opentelemetry.io/docs/)
- [OTel Collector](https://opentelemetry.io/docs/collector/)
- [Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/)
- [Cortex Tracing Guide](./tracing-config.md)

### Support

- GitHub: [Cortex Issues](https://github.com/cortex/cortex/issues)
- Slack: `#cortex-observability`
- Email: cortex-team@example.com

### Contributing

1. Test changes locally
2. Validate configurations
3. Update documentation
4. Submit PR with examples

---

**Version**: 1.0.0
**Last Updated**: 2025-12-11
**Maintainer**: Cortex Observability Team
