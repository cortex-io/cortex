# OpenTelemetry Architecture for Cortex

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Cortex Application Layer                          │
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Coordinator  │  │  Masters     │  │  Workers     │  │  Services    │  │
│  │              │  │              │  │              │  │              │  │
│  │ - Routing    │  │ - Development│  │ - Feature    │  │ - n8n        │  │
│  │ - Workflow   │  │ - Security   │  │ - Bug Fix    │  │ - Database   │  │
│  │ - Dashboard  │  │ - Inventory  │  │ - Refactor   │  │ - APIs       │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                  │                  │                  │          │
│         └──────────────────┴──────────────────┴──────────────────┘          │
│                                    │                                        │
│                    ┌───────────────┴───────────────┐                       │
│                    │  OTel SDK Instrumentation     │                       │
│                    │  - Auto (Python/Node.js/Go)   │                       │
│                    │  - Manual (TypeScript SDK)    │                       │
│                    └───────────────┬───────────────┘                       │
└────────────────────────────────────┼────────────────────────────────────────┘
                                     │
                         OTLP Protocol (gRPC/HTTP)
                         - Traces (4317/4318)
                         - Metrics (4317/4318)
                         - Logs (4317/4318)
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      OpenTelemetry Collector (Gateway)                      │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                            Receivers                                  │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │  │
│  │  │   OTLP   │  │Prometheus│  │ Filelog  │  │  K8s Events      │   │  │
│  │  │ gRPC/HTTP│  │ Scraper  │  │ Reader   │  │  Receiver        │   │  │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘   │  │
│  └───────┼─────────────┼─────────────┼─────────────────┼──────────────┘  │
│          │             │             │                 │                  │
│          └─────────────┴─────────────┴─────────────────┘                  │
│                                    │                                       │
│  ┌─────────────────────────────────┼─────────────────────────────────┐   │
│  │                           Processors                                │   │
│  │                                 │                                   │   │
│  │    ┌────────────────────────────▼──────────────────────────────┐   │   │
│  │    │ 1. Memory Limiter (400MiB limit, prevent OOM)            │   │   │
│  │    └────────────────────────────┬──────────────────────────────┘   │   │
│  │                                 ▼                                   │   │
│  │    ┌────────────────────────────────────────────────────────────┐  │   │
│  │    │ 2. Resource (add cluster, environment labels)             │  │   │
│  │    └────────────────────────────┬───────────────────────────────┘  │   │
│  │                                 ▼                                   │   │
│  │    ┌────────────────────────────────────────────────────────────┐  │   │
│  │    │ 3. Resource Detection (auto-detect K8s, Docker)           │  │   │
│  │    └────────────────────────────┬───────────────────────────────┘  │   │
│  │                                 ▼                                   │   │
│  │    ┌────────────────────────────────────────────────────────────┐  │   │
│  │    │ 4. K8s Attributes (enrich with pod/deployment metadata)   │  │   │
│  │    └────────────────────────────┬───────────────────────────────┘  │   │
│  │                                 ▼                                   │   │
│  │    ┌────────────────────────────────────────────────────────────┐  │   │
│  │    │ 5. Filter (drop health checks, low-value metrics)         │  │   │
│  │    └────────────────────────────┬───────────────────────────────┘  │   │
│  │                                 ▼                                   │   │
│  │    ┌────────────────────────────────────────────────────────────┐  │   │
│  │    │ 6. Attributes/Cortex (add cortex.* attributes)            │  │   │
│  │    └────────────────────────────┬───────────────────────────────┘  │   │
│  │                                 ▼                                   │   │
│  │    ┌────────────────────────────────────────────────────────────┐  │   │
│  │    │ 7. Tail Sampling (100% errors, 10% normal)                │  │   │
│  │    │    - Always sample errors                                  │  │   │
│  │    │    - Always sample slow requests (>1s)                     │  │   │
│  │    │    - 100% sample Cortex agents                             │  │   │
│  │    │    - 10% sample normal traffic                             │  │   │
│  │    └────────────────────────────┬───────────────────────────────┘  │   │
│  │                                 ▼                                   │   │
│  │    ┌────────────────────────────────────────────────────────────┐  │   │
│  │    │ 8. Batch (10s timeout, 1000 batch size)                   │  │   │
│  │    └────────────────────────────┬───────────────────────────────┘  │   │
│  └─────────────────────────────────┼─────────────────────────────────┘   │
│                                    │                                       │
│  ┌─────────────────────────────────┼─────────────────────────────────┐   │
│  │                            Exporters                                │   │
│  │         ┌──────────────────────┼──────────────────────┐            │   │
│  │         ▼                      ▼                      ▼            │   │
│  │  ┌──────────┐          ┌─────────────┐        ┌──────────┐        │   │
│  │  │Prometheus│          │ OTLP/Traces │        │   Loki   │        │   │
│  │  │ Exporter │          │  (Jaeger)   │        │ Exporter │        │   │
│  │  └────┬─────┘          └──────┬──────┘        └────┬─────┘        │   │
│  └───────┼──────────────────────┼────────────────────┼───────────────┘   │
└──────────┼──────────────────────┼────────────────────┼────────────────────┘
           │                      │                    │
           ▼                      ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Storage & Visualization Layer                       │
│                                                                             │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐            │
│  │  Prometheus  │      │    Jaeger    │      │     Loki     │            │
│  │              │      │  (Traces)    │      │   (Logs)     │            │
│  │  - Metrics   │      │              │      │              │            │
│  │  - Alerts    │      │  - Trace UI  │      │  - Log Query │            │
│  │  - Recording │      │  - Search    │      │  - Labels    │            │
│  │    Rules     │      │  - Analytics │      │  - Streams   │            │
│  └──────┬───────┘      └──────┬───────┘      └──────┬───────┘            │
│         │                     │                     │                     │
│         └─────────────────────┴─────────────────────┘                     │
│                              │                                            │
│                              ▼                                            │
│                    ┌──────────────────┐                                   │
│                    │     Grafana      │                                   │
│                    │                  │                                   │
│                    │  - Dashboards    │                                   │
│                    │  - Correlate     │                                   │
│                    │  - Visualize     │                                   │
│                    └──────────────────┘                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Telemetry Generation

```
Cortex Agent → OTel SDK → OTLP Protocol
```

**Auto-Instrumentation (Python)**:
```python
# Automatic via Kubernetes annotation
# instrumentation.opentelemetry.io/inject-python: "true"

from flask import Flask
app = Flask(__name__)

@app.route('/api/task')
def process_task():
    # Automatically traced - no code changes needed
    return execute_task()
```

**Manual Instrumentation (TypeScript)**:
```typescript
import { traceAgentOperation } from './cortex-tracing-config';

await traceAgentOperation(
  'agent-001',
  'development-master',
  'spawn-worker',
  'task-123',
  async (span) => {
    // Custom span with Cortex attributes
    const result = await spawnWorker();
    span.setAttribute('cortex.worker.spawned', true);
    return result;
  }
);
```

### 2. Collection & Processing

```
OTLP Receiver → Processors → Exporters
```

**Processor Pipeline**:
1. **Memory Limiter**: Check memory every 1s, limit 400MiB
2. **Resource**: Add `cluster=cortex-talos`, `environment=production`
3. **K8s Attributes**: Enrich with pod name, namespace, deployment
4. **Filter**: Drop spans with `http.route=/health`
5. **Attributes**: Add `cortex.system=true`
6. **Tail Sampling**: Apply sampling rules
7. **Batch**: Batch 1000 items or 10s timeout

### 3. Export & Storage

```
Exporters → Backends → Grafana Visualization
```

**Metrics Path**:
```
Prometheus Exporter (8889) → Prometheus Scrape → Grafana
```

**Traces Path**:
```
OTLP Exporter → Jaeger/Tempo → Grafana (Trace UI)
```

**Logs Path**:
```
Loki Exporter → Loki → Grafana (Logs)
```

## Trace Hierarchy Example

### Coordinator → Master → Worker Chain

```
Trace ID: a1b2c3d4e5f6...

Span 1: coordinator.receive_request (50ms)
  │
  ├─ Span 2: coordinator.parse_workflow (5ms)
  │
  ├─ Span 3: coordinator.create_handoff (10ms)
  │   │
  │   └─ Span 4: db.write (3ms)
  │
  └─ Span 5: master.receive_handoff (120ms)
      │
      ├─ Span 6: rag.retrieve (15ms)
      │   │
      │   └─ Span 7: db.query (8ms)
      │
      ├─ Span 8: master.spawn_worker (20ms)
      │
      └─ Span 9: worker.execute_task (80ms)
          │
          ├─ Span 10: llm.completion (60ms)
          │   │
          │   └─ Span 11: http.request (claude API) (55ms)
          │
          └─ Span 12: fs.write (5ms)
```

### Attributes at Each Level

**Span 1 (coordinator.receive_request)**:
```json
{
  "cortex.system": true,
  "cortex.agent.id": "coordinator-001",
  "cortex.agent.type": "coordinator",
  "cortex.workflow.id": "wf-001",
  "k8s.pod.name": "coordinator-7d8f9-xyz",
  "k8s.namespace.name": "cortex"
}
```

**Span 5 (master.receive_handoff)**:
```json
{
  "cortex.system": true,
  "cortex.agent.id": "dev-master-001",
  "cortex.agent.type": "development-master",
  "cortex.task.id": "task-123",
  "cortex.handoff.from": "coordinator"
}
```

**Span 9 (worker.execute_task)**:
```json
{
  "cortex.system": true,
  "cortex.worker.id": "worker-456",
  "cortex.worker.type": "feature-implementer",
  "cortex.master.id": "dev-master-001",
  "cortex.task.id": "task-123"
}
```

**Span 10 (llm.completion)**:
```json
{
  "cortex.system": true,
  "cortex.model.name": "claude-opus-4-5",
  "cortex.token.count": 1500,
  "cortex.token.input": 500,
  "cortex.token.output": 1000,
  "llm.request.model": "claude-opus-4-5",
  "llm.response.status": "success"
}
```

## Sampling Decision Tree

```
                    Incoming Span
                         │
                         ▼
                  ┌──────────────┐
                  │ Is Error?    │
                  └──────┬───────┘
                         │
          ┌──────────────┴──────────────┐
         Yes                           No
          │                             │
          ▼                             ▼
    ┌──────────┐              ┌──────────────┐
    │ Sample   │              │ Duration > 1s?│
    │ (100%)   │              └──────┬─────────┘
    └──────────┘                     │
                      ┌──────────────┴──────────────┐
                     Yes                           No
                      │                             │
                      ▼                             ▼
                ┌──────────┐              ┌──────────────────┐
                │ Sample   │              │ Cortex Agent?    │
                │ (100%)   │              └──────┬───────────┘
                └──────────┘                     │
                              ┌──────────────────┴──────────────┐
                             Yes                               No
                              │                                 │
                              ▼                                 ▼
                        ┌──────────┐                  ┌──────────────┐
                        │ Sample   │                  │ Probabilistic│
                        │ (100%)   │                  │   (10%)      │
                        └──────────┘                  └──────────────┘
```

## Resource Requirements

### OTel Collector

| Resource | Request | Limit | Notes |
|----------|---------|-------|-------|
| CPU | 200m | 500m | Scales with traffic |
| Memory | 256Mi | 512Mi | Includes 400MiB limiter |
| Storage | - | - | Stateless |
| Network | - | - | Ingress: 10-50 Mbps |

### Scaling Thresholds

| Metric | Threshold | Action |
|--------|-----------|--------|
| CPU | >70% | Add replica (HPA) |
| Memory | >80% | Add replica (HPA) |
| Queue Size | >90% | Increase batch size |
| Drop Rate | >1% | Add replicas |

## Network Topology

```
┌─────────────────────────────────────────────────────────────┐
│ Namespace: cortex                                           │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │   Pod A      │    │   Pod B      │    │   Pod C      │ │
│  │              │    │              │    │              │ │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘ │
│         │                   │                   │          │
└─────────┼───────────────────┼───────────────────┼──────────┘
          │                   │                   │
          │ OTLP/gRPC (4317)  │                   │
          │ OTLP/HTTP (4318)  │                   │
          │                   │                   │
          └───────────────────┴───────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Namespace: monitoring                                       │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Service: otel-collector.monitoring.svc.cluster.local │  │
│  │                                                      │  │
│  │  Port 4317: OTLP gRPC                               │  │
│  │  Port 4318: OTLP HTTP                               │  │
│  │  Port 8889: Prometheus metrics                      │  │
│  │  Port 13133: Health check                           │  │
│  └──────────────────────┬───────────────────────────────┘  │
│                         │                                  │
│         ┌───────────────┼───────────────┐                  │
│         │               │               │                  │
│         ▼               ▼               ▼                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐          │
│  │ Prometheus │  │   Jaeger   │  │    Loki    │          │
│  │            │  │            │  │            │          │
│  │ :9090      │  │ :16686     │  │ :3100      │          │
│  └────────────┘  └────────────┘  └────────────┘          │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

## Attribute Namespace

All Cortex spans use the `cortex.*` namespace:

```
cortex.
├── system (bool)
├── version (string)
├── operation.type (string)
├── agent.
│   ├── id (string)
│   └── type (string)
├── worker.
│   ├── id (string)
│   └── type (string)
├── master.
│   └── id (string)
├── task.
│   ├── id (string)
│   └── complexity (string)
├── model.
│   └── name (string)
├── token.
│   ├── count (int)
│   ├── input (int)
│   └── output (int)
├── workflow.
│   ├── id (string)
│   └── steps (int)
├── handoff.
│   ├── id (string)
│   ├── from (string)
│   └── to (string)
└── rag.
    ├── type (string)
    └── results.count (int)
```

## Performance Characteristics

### Latency Impact

| Operation | Without Tracing | With Tracing | Overhead |
|-----------|----------------|--------------|----------|
| HTTP Request | 10ms | 10.2ms | +2% |
| LLM API Call | 500ms | 501ms | +0.2% |
| Database Query | 5ms | 5.1ms | +2% |
| Agent Operation | 100ms | 101ms | +1% |

### Resource Overhead

| Component | CPU | Memory | Network |
|-----------|-----|--------|---------|
| SDK | 1-5% | 10-50MB | 1-5 Mbps |
| Collector | 200m | 256Mi | 10-50 Mbps |
| Total | <5% | <100MB/pod | <10 Mbps |

## High Availability

### Collector HA

```yaml
# Multiple replicas with HPA
replicas: 3  # via HPA

# Load balancing
service:
  type: ClusterIP
  sessionAffinity: None  # Round-robin

# Health checks
livenessProbe:
  httpGet:
    path: /health
    port: 13133
readinessProbe:
  httpGet:
    path: /health
    port: 13133
```

### Data Durability

- Collector is **stateless** - no data loss on restart
- In-flight data buffered in SDK (max 1000 items)
- Retry logic with exponential backoff
- Circuit breaker prevents cascade failures

## Security Model

```
┌─────────────────────────────────────────────────────────────┐
│ Security Layers                                             │
│                                                             │
│  1. RBAC                                                    │
│     - ServiceAccount: otel-collector                        │
│     - ClusterRole: read-only access to K8s resources        │
│                                                             │
│  2. Network Policies                                        │
│     - Allow: cortex → otel-collector                        │
│     - Allow: otel-collector → prometheus/jaeger/loki        │
│     - Deny: Everything else                                 │
│                                                             │
│  3. TLS (Production)                                        │
│     - OTLP: TLS 1.3                                         │
│     - Exporters: TLS 1.3                                    │
│     - Certificates: cert-manager                            │
│                                                             │
│  4. Authentication (External)                               │
│     - API Keys in Secrets                                   │
│     - OAuth2 for external backends                          │
│                                                             │
│  5. Data Sanitization                                       │
│     - Filter PII in processors                              │
│     - Redact sensitive attributes                           │
│     - Hash user identifiers                                 │
└─────────────────────────────────────────────────────────────┘
```

## Troubleshooting Flow

```
Issue Detected
      │
      ▼
┌──────────────┐
│ Check Logs   │ → kubectl logs -n monitoring -l app=otel-collector
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Check Metrics│ → Prometheus targets, OTel collector metrics
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Test Endpoint│ → curl health check, OTLP endpoints
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Verify Config│ → kubectl get configmap, validate YAML
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Check Network│ → Network policies, service endpoints
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Review Docs  │ → distributed-tracing-guide.md
└──────────────┘
```

## References

- [Deployment Guide](./README.md)
- [Tracing Implementation](./distributed-tracing-guide.md)
- [TypeScript SDK](./cortex-tracing-config.ts)
- [Collector Config](./otel-collector-config.yaml)
- [Prometheus Integration](../../monitoring/prometheus-values.yaml)
