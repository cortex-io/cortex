# OpenTelemetry Integration - File Index

Complete reference for the OpenTelemetry integration for Cortex.

## Quick Start

1. **Deploy**: Run `./deploy-otel.sh`
2. **Validate**: Run `./validate-deployment.sh`
3. **Reference**: See `QUICK-REFERENCE.md`
4. **Learn**: Read `distributed-tracing-guide.md`

## Files Overview

### Core Configuration (Deploy These)

| File | Lines | Purpose | Deploy Priority |
|------|-------|---------|-----------------|
| **otel-collector-config.yaml** | 393 | Main OTel Collector configuration | 1 - Required |
| **otel-collector-deployment.yaml** | 313 | Kubernetes manifests (Deployment, Service, RBAC) | 1 - Required |
| **servicemonitor-otel.yaml** | 262 | Prometheus integration and alerts | 2 - Recommended |
| **otel-instrumentation.yaml** | 233 | Auto-instrumentation for applications | 3 - Optional |

### SDK & Implementation

| File | Lines | Purpose | When to Use |
|------|-------|---------|-------------|
| **cortex-tracing-config.ts** | 348 | TypeScript SDK for manual instrumentation | When adding tracing to TypeScript/Node.js services |
| **package.json** | 59 | NPM dependencies for SDK | With cortex-tracing-config.ts |

### Documentation

| File | Lines | Purpose | Audience |
|------|-------|---------|----------|
| **README.md** | 507 | Complete overview and setup guide | All users - start here |
| **distributed-tracing-guide.md** | 587 | Implementation guide with examples | Developers adding tracing |
| **ARCHITECTURE.md** | 835 | System architecture and design | DevOps/Architects |
| **QUICK-REFERENCE.md** | 355 | Quick reference for common tasks | Daily operations |
| **INDEX.md** | This file | File index and navigation | Finding specific information |

### Automation Scripts

| File | Lines | Purpose | Usage |
|------|-------|---------|-------|
| **deploy-otel.sh** | 138 | Automated deployment script | `./deploy-otel.sh` |
| **validate-deployment.sh** | 307 | Validate deployment health | `./validate-deployment.sh` |

## Total: 12 files, 3,922 lines

## File Relationships

```
deploy-otel.sh
    ├── Creates → otel-collector-config.yaml (ConfigMap)
    ├── Deploys → otel-collector-deployment.yaml
    ├── Deploys → servicemonitor-otel.yaml
    └── Optionally → otel-instrumentation.yaml

validate-deployment.sh
    └── Validates → All deployed resources

README.md
    ├── References → All files
    └── Getting started guide

distributed-tracing-guide.md
    ├── Uses → cortex-tracing-config.ts
    └── Examples for all components

ARCHITECTURE.md
    └── Diagrams for all components

QUICK-REFERENCE.md
    └── Commands for daily operations

cortex-tracing-config.ts
    ├── Requires → package.json dependencies
    └── Used by → Cortex TypeScript services

otel-instrumentation.yaml
    └── Configures → Auto-instrumentation for pods
```

## Usage Paths

### Path 1: Quick Deploy (5 minutes)

```bash
1. ./deploy-otel.sh
2. ./validate-deployment.sh
3. Done!
```

Files used: `deploy-otel.sh`, `validate-deployment.sh`, `otel-collector-config.yaml`, `otel-collector-deployment.yaml`

### Path 2: Add Auto-Instrumentation to Python Service (10 minutes)

```bash
1. kubectl apply -f otel-instrumentation.yaml
2. Add annotation to pod: instrumentation.opentelemetry.io/inject-python: "true"
3. kubectl rollout restart deployment/your-service -n cortex
```

Files used: `otel-instrumentation.yaml`, `distributed-tracing-guide.md`

### Path 3: Add Manual Instrumentation to TypeScript Service (30 minutes)

```bash
1. npm install (from package.json)
2. Import and use cortex-tracing-config.ts
3. Add tracing to your code
4. Deploy service
```

Files used: `package.json`, `cortex-tracing-config.ts`, `distributed-tracing-guide.md`

### Path 4: Integrate with Prometheus (15 minutes)

```bash
1. kubectl apply -f servicemonitor-otel.yaml
2. Verify in Prometheus targets
3. Import Grafana dashboard
```

Files used: `servicemonitor-otel.yaml`, `README.md` (Grafana section)

### Path 5: Troubleshoot Issues (varies)

```bash
1. ./validate-deployment.sh
2. Check QUICK-REFERENCE.md troubleshooting section
3. Review distributed-tracing-guide.md troubleshooting
4. Check collector logs
```

Files used: `validate-deployment.sh`, `QUICK-REFERENCE.md`, `distributed-tracing-guide.md`

## Configuration Details

### otel-collector-config.yaml

**What it contains:**
- 4 receivers (OTLP, Prometheus, Filelog, K8s Events)
- 8 processors (Memory limiter, Batch, Resource, K8s attributes, Filter, Tail sampling, etc.)
- 6 exporters (Prometheus, OTLP/traces, Loki, Logging, etc.)
- 3 pipelines (metrics, traces, logs)

**Key settings:**
- Memory limit: 400 MiB
- Batch timeout: 10s
- Batch size: 1000 items
- Tail sampling: 100% errors, 10% normal

**When to modify:**
- Adjust sampling rates
- Add new exporters (e.g., specific backends)
- Tune performance (batch size, memory)
- Add custom processors

### otel-collector-deployment.yaml

**What it contains:**
- Namespace definition
- ConfigMap placeholder
- Service (6 ports)
- Deployment (1 replica, HPA 1-3)
- ServiceAccount, ClusterRole, ClusterRoleBinding
- HorizontalPodAutoscaler

**Key settings:**
- CPU: 200m request, 500m limit
- Memory: 256Mi request, 512Mi limit
- Image: otel/opentelemetry-collector-contrib:0.95.0

**When to modify:**
- Change resource limits
- Update collector version
- Adjust replica counts
- Modify HPA thresholds

### servicemonitor-otel.yaml

**What it contains:**
- ServiceMonitor for Prometheus
- PodMonitor (alternative)
- PrometheusRule (6 alerts)
- Grafana dashboard ConfigMap

**Alerts included:**
- OtelCollectorDown
- OtelCollectorDroppingData
- OtelCollectorHighMemory
- OtelCollectorHighCPU
- OtelCollectorExporterFailing
- OtelCollectorQueueAlmostFull

**When to modify:**
- Adjust alert thresholds
- Add custom alerts
- Modify dashboard
- Change scrape intervals

### otel-instrumentation.yaml

**What it contains:**
- Instrumentation CRD (standard sampling)
- Instrumentation CRD (critical services, 100% sampling)
- ConfigMap with environment variables
- Examples and annotations

**Languages supported:**
- Python
- Node.js
- Go
- Java

**When to use:**
- Auto-instrument applications without code changes
- Standardize instrumentation across services
- Quick proof-of-concept

### cortex-tracing-config.ts

**What it contains:**
- OpenTelemetry SDK initialization
- OTLP exporter configuration
- HTTP, Express, gRPC instrumentation
- Helper functions:
  - `initializeTracing()`
  - `traceAgentOperation()`
  - `traceWorkerOperation()`
  - `traceLLMCall()`
  - `addCortexContext()`
  - `recordCortexEvent()`
- Example usage

**When to use:**
- Manual instrumentation for TypeScript/Node.js
- Custom span creation
- Fine-grained control over tracing
- LLM call tracking with token counting

## Documentation Guide

### For First-Time Users

Start here:
1. **README.md** - Overview and quick start
2. **deploy-otel.sh** - Run deployment
3. **QUICK-REFERENCE.md** - Daily commands

### For Developers Adding Tracing

Read these:
1. **distributed-tracing-guide.md** - Complete implementation guide
2. **cortex-tracing-config.ts** - TypeScript SDK
3. **otel-instrumentation.yaml** - Auto-instrumentation options

### For DevOps/Platform Engineers

Review these:
1. **ARCHITECTURE.md** - System design
2. **otel-collector-config.yaml** - Collector configuration
3. **servicemonitor-otel.yaml** - Prometheus integration
4. **validate-deployment.sh** - Health checks

### For Troubleshooting

Check these in order:
1. **validate-deployment.sh** - Automated checks
2. **QUICK-REFERENCE.md** - Common issues
3. **distributed-tracing-guide.md** - Troubleshooting section
4. **README.md** - Maintenance section

## Cortex-Specific Features

### Span Attributes

All files reference these Cortex attributes:

```typescript
cortex.system: boolean
cortex.agent.id: string
cortex.agent.type: string
cortex.worker.id: string
cortex.worker.type: string
cortex.master.id: string
cortex.task.id: string
cortex.operation.type: string
cortex.model.name: string
cortex.token.count: number
```

Defined in:
- `cortex-tracing-config.ts` (TypeScript types)
- `distributed-tracing-guide.md` (Complete specification)
- `ARCHITECTURE.md` (Namespace diagram)

### Agent Hierarchy Tracing

Files showing agent traces:
- `ARCHITECTURE.md` - Trace hierarchy diagram
- `distributed-tracing-guide.md` - Implementation examples
- `cortex-tracing-config.ts` - Helper functions

### LLM Call Tracking

Files for LLM tracing:
- `cortex-tracing-config.ts` - `traceLLMCall()` function
- `distributed-tracing-guide.md` - LLM span examples
- `QUICK-REFERENCE.md` - LLM query examples

## Integration Points

### With Existing Prometheus

Referenced in:
- `README.md` - Integration section
- `servicemonitor-otel.yaml` - ServiceMonitor configuration
- `otel-collector-config.yaml` - Prometheus exporter

Integration file: `/Users/ryandahlberg/Projects/cortex/deploy/monitoring/prometheus-values.yaml`

### With Kubernetes

Files with K8s resources:
- `otel-collector-deployment.yaml` - All K8s manifests
- `otel-instrumentation.yaml` - CRDs and annotations
- `servicemonitor-otel.yaml` - Prometheus Operator resources

### With Cortex Agents

Instrumentation methods:
- `otel-instrumentation.yaml` - Auto-instrumentation (annotations)
- `cortex-tracing-config.ts` - Manual instrumentation (code)
- `distributed-tracing-guide.md` - Implementation guide

## Maintenance

### Regular Updates

Files to update periodically:

1. **Collector version** (quarterly):
   - `otel-collector-deployment.yaml` - Update image tag
   - Test with `validate-deployment.sh`

2. **Dependencies** (monthly):
   - `package.json` - Update OTel packages
   - Test instrumentation

3. **Configuration** (as needed):
   - `otel-collector-config.yaml` - Tune performance
   - Monitor with Prometheus/Grafana

### Health Checks

Files for monitoring:
- `validate-deployment.sh` - Automated validation (run weekly)
- `servicemonitor-otel.yaml` - Prometheus alerts (monitor 24/7)
- `QUICK-REFERENCE.md` - Metrics to monitor

## Support Resources

### Internal Documentation

- `README.md` - Sections: Troubleshooting, Maintenance, Support
- `distributed-tracing-guide.md` - Section: Troubleshooting
- `QUICK-REFERENCE.md` - Section: Troubleshooting, Support Checklist

### External Resources

Listed in:
- `README.md` - Resources section
- `distributed-tracing-guide.md` - Additional Resources section
- `QUICK-REFERENCE.md` - Resources section

### Getting Help

1. Run automated checks: `./validate-deployment.sh`
2. Check quick reference: `QUICK-REFERENCE.md`
3. Review troubleshooting: `distributed-tracing-guide.md#troubleshooting`
4. Check logs: `kubectl logs -n monitoring -l app=otel-collector`
5. Review architecture: `ARCHITECTURE.md`

## File Size Summary

| Category | Files | Total Lines | Total Size |
|----------|-------|-------------|------------|
| Configuration | 4 | 1,201 | 35 KB |
| SDK/Code | 2 | 407 | 11 KB |
| Documentation | 5 | 2,284 | 84 KB |
| Scripts | 2 | 445 | 13 KB |
| **Total** | **12** | **3,922** | **~115 KB** |

## Version Information

- Created: 2025-12-12
- OTel Collector: v0.95.0
- OpenTelemetry SDK: v1.23.0+
- Kubernetes: v1.24+
- Prometheus Operator: v0.60+

## Next Steps

After reviewing this index:

1. **New to OTel?** Start with `README.md`
2. **Ready to deploy?** Run `./deploy-otel.sh`
3. **Adding tracing?** Read `distributed-tracing-guide.md`
4. **Need architecture?** See `ARCHITECTURE.md`
5. **Daily operations?** Use `QUICK-REFERENCE.md`
6. **Troubleshooting?** Run `./validate-deployment.sh`

## File Modification Guide

Before modifying any file, understand its impact:

### Low Risk (Safe to modify)

- `QUICK-REFERENCE.md` - Documentation only
- `distributed-tracing-guide.md` - Documentation only
- `ARCHITECTURE.md` - Documentation only
- `README.md` - Documentation only

### Medium Risk (Test after modifying)

- `otel-collector-config.yaml` - Test with validation script
- `servicemonitor-otel.yaml` - Verify Prometheus scraping
- `cortex-tracing-config.ts` - Test instrumentation

### High Risk (Requires full validation)

- `otel-collector-deployment.yaml` - Can break deployment
- `deploy-otel.sh` - Can affect deployment process
- `validate-deployment.sh` - Can give false results

### Critical (Expert only)

- `otel-instrumentation.yaml` - Affects all instrumented services
- `package.json` - Dependency changes can break SDK

## Index Maintenance

This index should be updated when:
- New files are added
- File purposes change
- New integration points are created
- Deployment procedures change

Last updated: 2025-12-12
