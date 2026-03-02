# Cortex CI/CD Architecture

Complete architecture and data flow for the Cortex automation system's CI/CD pipeline.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Developer Workflow                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ git push
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            GitHub Repository                                 │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐           │
│  │   Source   │  │   Tests    │  │  Workflows │  │   Deploy   │           │
│  │    Code    │  │            │  │   (.github)│  │  Manifests │           │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘           │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ Triggers workflows
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          GitHub Actions CI/CD                                │
│                                                                               │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         CI Pipeline (ci.yaml)                         │  │
│  │  ┌──────┐  ┌──────┐  ┌──────┐  ┌───────┐  ┌────────┐  ┌──────────┐  │  │
│  │  │ Lint │→│ Test │→│ Type │→│ Build │→│ Docker │→│ Validate │  │  │
│  │  │      │  │      │  │Check │  │       │  │  Image │  │  Config  │  │  │
│  │  └──────┘  └──────┘  └──────┘  └───────┘  └────────┘  └──────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                   Security Pipeline (security-scan.yaml)              │  │
│  │  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐         │  │
│  │  │  Deps  │  │ Trivy  │  │CodeQL  │  │Secrets │  │ License│         │  │
│  │  │ Audit  │  │  Scan  │  │  SAST  │  │  Scan  │  │  Check │         │  │
│  │  └────────┘  └────────┘  └────────┘  └────────┘  └────────┘         │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                   Release Pipeline (release.yaml)                     │  │
│  │  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐         │  │
│  │  │Analyze │→│Generate│→│ Create │→│  Build │→│ Publish│         │  │
│  │  │Commits │  │Version │  │Release │  │Artifacts│ │ Release│         │  │
│  │  └────────┘  └────────┘  └────────┘  └────────┘  └────────┘         │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                     CD Pipeline (cd.yaml)                             │  │
│  │  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐         │  │
│  │  │ Build  │→│  Push  │→│ Update │→│ Deploy │→│ Verify │         │  │
│  │  │ Images │  │  GHCR  │  │Manifests│ │ K8s   │  │ Health │         │  │
│  │  └────────┘  └────────┘  └────────┘  └────────┘  └────────┘         │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ Push images
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              GitHub Container Registry (ghcr.io)                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │ mcp-k8s-orch:    │  │ mcp-n8n-work:    │  │ mcp-talos-node:  │          │
│  │  - latest        │  │  - latest        │  │  - latest        │          │
│  │  - v1.2.3        │  │  - v1.2.3        │  │  - v1.2.3        │          │
│  │  - main-abc123   │  │  - main-abc123   │  │  - main-abc123   │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ GitOps pull
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          ArgoCD GitOps Controller                            │
│                                                                               │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                        Sync Policy                                    │  │
│  │  • Automated sync: true                                               │  │
│  │  • Self-heal: true (revert manual changes)                            │  │
│  │  • Prune: true (remove deleted resources)                             │  │
│  │  • Retry: exponential backoff                                         │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                               │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                     Application Structure                             │  │
│  │                                                                         │  │
│  │  cortex (AppProject)                                                  │  │
│  │    ├── cortex-monitoring (App)      ← Wave 0                         │  │
│  │    ├── cortex-dashboard (App)        ← Wave 1                        │  │
│  │    ├── cortex-mcp-orch (App)        ← Wave 2                         │  │
│  │    └── cortex-mcp-servers (AppSet)   ← Wave 2                        │  │
│  │          ├── mcp-k8s-orchestrator                                    │  │
│  │          ├── mcp-n8n-workflow                                        │  │
│  │          ├── mcp-talos-node                                          │  │
│  │          ├── mcp-s3-storage                                          │  │
│  │          └── mcp-postgres-data                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ Deploy
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Talos Kubernetes Cluster                                │
│                                                                               │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  Namespace: cortex-monitoring (Wave 0)                                │  │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐          │  │
│  │  │  Prometheus    │  │    Grafana     │  │  Alertmanager  │          │  │
│  │  │  (metrics)     │  │  (dashboards)  │  │   (alerts)     │          │  │
│  │  └────────────────┘  └────────────────┘  └────────────────┘          │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  Namespace: cortex-dashboard (Wave 1)                                 │  │
│  │  ┌────────────────────────────────────────────────────────┐           │  │
│  │  │  Cortex Dashboard (Astro SSG)                          │           │  │
│  │  │  • HPA: 2-10 replicas                                  │           │  │
│  │  │  • Ingress: dashboard.cortex.local                     │           │  │
│  │  │  • Health checks: /health, /ready                      │           │  │
│  │  └────────────────────────────────────────────────────────┘           │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  Namespace: cortex-mcp (Wave 2)                                       │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐      │  │
│  │  │ k8s-orch   │  │ n8n-work   │  │ talos-node │  │ s3-storage │      │  │
│  │  │ 3-20 rep   │  │ 2-10 rep   │  │ 2-8 rep    │  │ 2-10 rep   │      │  │
│  │  │ :3000      │  │ :3001      │  │ :3002      │  │ :3003      │      │  │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘      │  │
│  │  ┌────────────┐                                                        │  │
│  │  │postgres-db │                                                        │  │
│  │  │ 2-12 rep   │                                                        │  │
│  │  │ :3004      │                                                        │  │
│  │  └────────────┘                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Data Flow Diagrams

### 1. Pull Request Flow

```
Developer
   │
   │ Creates branch
   │ feature/new-feature
   │
   ▼
Code Changes
   │
   │ git push
   │
   ▼
GitHub PR
   │
   ├─────────────────────────┬─────────────────────────┬──────────────────┐
   │                         │                         │                  │
   ▼                         ▼                         ▼                  ▼
PR Metadata              Code Quality           Test Coverage      Security
Validation               Checks                 Analysis           Scanning
   │                         │                         │                  │
   │ • Title format          │ • Linting               │ • Run tests      │ • Dep audit
   │ • Description           │ • Formatting            │ • Generate       │ • Secret scan
   │ • Branch name           │ • Type check            │   coverage       │ • License check
   │                         │ • console.log           │ • Check 80%      │
   │                         │                         │   threshold      │
   ▼                         ▼                         ▼                  ▼
   │                         │                         │                  │
   └─────────────────────────┴─────────────────────────┴──────────────────┘
                                      │
                                      │ All checks pass
                                      ▼
                              Auto-label applied
                              (size, components)
                                      │
                                      │
                                      ▼
                            PR Summary Comment
                            (coverage, changes, status)
                                      │
                                      │ Review + Approve
                                      ▼
                                Merge to main
                                      │
                                      ▼
                            Trigger CD Pipeline
```

### 2. Release Flow

```
Commits on main
   │
   │ Conventional commits:
   │ • feat: → minor version
   │ • fix: → patch version
   │ • feat!: → major version
   │
   ▼
Check Release Required
   │
   │ Analyze commits since last tag
   │ Determine next version
   │
   ▼
Semantic Release
   │
   ├─────────────────┬─────────────────┬─────────────────┐
   │                 │                 │                 │
   ▼                 ▼                 ▼                 ▼
Generate          Update           Create           Build
Changelog         Version          Tag              Artifacts
   │                 │                 │                 │
   │ • Features      │ package.json    │ v1.2.3          │ • Tarballs
   │ • Fixes         │ CHANGELOG.md    │                 │ • Checksums
   │ • Breaking      │                 │                 │ • Multi-arch
   │                 │                 │                 │
   └─────────────────┴─────────────────┴─────────────────┘
                          │
                          ▼
                  GitHub Release Created
                          │
                          ├───────────────────────┐
                          │                       │
                          ▼                       ▼
                  Upload Artifacts      Create Announcement
                          │                       │
                          │                       │ Issue created
                          │                       │ Notifications sent
                          │                       │
                          └───────────────────────┘
                                      │
                                      ▼
                          Trigger Production Deploy
```

### 3. Deployment Flow

```
Git Tag v1.2.3
   │
   │ Triggers CD pipeline
   │
   ▼
Build Docker Images
   │
   ├────────────────┬────────────────┬────────────────┬────────────────┐
   │                │                │                │                │
   ▼                ▼                ▼                ▼                ▼
k8s-orch         n8n-work       talos-node       s3-storage      postgres-db
   │                │                │                │                │
   │ Multi-stage    │ BuildKit       │ Layer          │ Cache          │ Optimization
   │ build          │ cache          │ optimization   │ strategy       │
   │                │                │                │                │
   └────────────────┴────────────────┴────────────────┴────────────────┘
                          │
                          │ Push to GHCR
                          ▼
              GitHub Container Registry
                          │
                          │ Tagged:
                          │ • latest
                          │ • v1.2.3
                          │ • v1.2
                          │ • v1
                          │ • main-abc123
                          │
                          ▼
              Sign with Cosign
                          │
                          ▼
              Update Git Manifests
                          │
                          │ applicationset.yaml
                          │ image: ghcr.io/.../mcp-*:v1.2.3
                          │
                          ▼
              ArgoCD Detects Change
                          │
                          ├─────────────────────┬──────────────────┐
                          │                     │                  │
                          ▼                     ▼                  ▼
                    Staging                Production        Monitoring
                          │                     │                  │
                          │ • Auto sync         │ • Manual sync    │ • Auto sync
                          │ • Health check      │ • Canary         │ • Wave 0
                          │ • Smoke test        │ • Backup         │
                          │                     │ • Health check   │
                          │                     │ • Full rollout   │
                          │                     │                  │
                          └─────────────────────┴──────────────────┘
                                      │
                                      │ All healthy
                                      ▼
                          Deployment Complete
                                      │
                                      ▼
                          Metrics → Prometheus
                          Logs → Loki
                          Traces → Tempo
```

### 4. GitOps Sync Flow

```
ArgoCD Controller
   │
   │ Poll interval: 3 minutes
   │ Webhook enabled
   │
   ▼
Check Git Repository
   │
   │ Compare:
   │ • Git state (desired)
   │ • Cluster state (actual)
   │
   ▼
Detect Drift?
   │
   ├─── NO ───┐
   │          │
   │          ▼
   │     No action
   │     (in sync)
   │
   ├─── YES ──┐
              │
              ▼
        Sync Policy
              │
              ├─────────────┬─────────────┐
              │             │             │
              ▼             ▼             ▼
         Automated      Self-Heal      Prune
              │             │             │
              │ Sync        │ Revert      │ Delete
              │ changes     │ manual      │ removed
              │ from Git    │ changes     │ resources
              │             │             │
              └─────────────┴─────────────┘
                          │
                          ▼
                  Apply Changes
                          │
                          ├───────────────┬───────────────┐
                          │               │               │
                          ▼               ▼               ▼
                    Create          Update          Delete
                    Resources       Resources       Resources
                          │               │               │
                          └───────────────┴───────────────┘
                                      │
                                      ▼
                          Health Assessment
                                      │
                                      ├────────────┬────────────┐
                                      │            │            │
                                      ▼            ▼            ▼
                                 Deployment   Service      Ingress
                                 ready?       endpoints    healthy?
                                                ready?
                                      │            │            │
                                      └────────────┴────────────┘
                                                  │
                                                  ▼
                                            All Healthy?
                                                  │
                                    ┌─────────────┴─────────────┐
                                    │                           │
                                    ▼                           ▼
                                  YES                         NO
                                    │                           │
                                    │                           ▼
                                    │                      Retry Logic
                                    │                           │
                                    │                           │ Exponential
                                    │                           │ backoff:
                                    │                           │ 5s, 10s, 20s
                                    │                           │ Max: 3 min
                                    │                           │
                                    │                           ▼
                                    │                      Fail after
                                    │                      5 attempts
                                    │                           │
                                    └───────────────────────────┘
                                                  │
                                                  ▼
                                        Update App Status
                                                  │
                                                  ▼
                                        Send Notifications
                                        (Slack, email)
```

## Component Interactions

### MCP Server Deployment

```
ApplicationSet Controller
         │
         │ List Generator
         │
         ▼
   ┌──────────────────────────────────────────────┐
   │  For each MCP server:                        │
   │  • mcp-k8s-orchestrator                      │
   │  • mcp-n8n-workflow                          │
   │  • mcp-talos-node                            │
   │  • mcp-s3-storage                            │
   │  • mcp-postgres-data                         │
   └──────────────────────────────────────────────┘
         │
         │ Generate Application per server
         │
         ▼
   ┌──────────────────────────────────────────────┐
   │  Application Template:                       │
   │  • Name: {{name}}                            │
   │  • Namespace: {{namespace}}                  │
   │  • Replicas: {{replicas}}                    │
   │  • Resources: {{cpu}}, {{memory}}            │
   │  • HPA: {{min}}-{{max}}                      │
   │  • RBAC: {{rbac_enabled}}                    │
   └──────────────────────────────────────────────┘
         │
         │ Apply to cluster
         │
         ▼
   ┌──────────────────────────────────────────────┐
   │  Kubernetes Resources Created:               │
   │  • Deployment                                │
   │  • Service                                   │
   │  • ServiceAccount (if RBAC)                  │
   │  • Role/RoleBinding (if RBAC)                │
   │  • HorizontalPodAutoscaler                   │
   │  • PodDisruptionBudget                       │
   │  • ServiceMonitor                            │
   │  • NetworkPolicy                             │
   └──────────────────────────────────────────────┘
         │
         │ Pods start
         │
         ▼
   ┌──────────────────────────────────────────────┐
   │  Health Checks:                              │
   │  • Startup probe (0-150s)                    │
   │  • Liveness probe (every 10s)                │
   │  • Readiness probe (every 5s)                │
   └──────────────────────────────────────────────┘
         │
         │ All probes passing
         │
         ▼
   ┌──────────────────────────────────────────────┐
   │  Service Ready:                              │
   │  • Endpoints registered                      │
   │  • Metrics exposed (:port/metrics)           │
   │  • Logs streaming                            │
   │  • HPA monitoring                            │
   └──────────────────────────────────────────────┘
```

## Security Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Security Layers                        │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Code Level   │    │ Build Level  │    │Runtime Level │
└──────────────┘    └──────────────┘    └──────────────┘
        │                   │                   │
        │                   │                   │
        ▼                   ▼                   ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ • SAST       │    │ • Image scan │    │ • RBAC       │
│ • Secret scan│    │ • SBOM       │    │ • NetPol     │
│ • Dep audit  │    │ • Signing    │    │ • PodSec     │
│ • License    │    │ • Vulnerability│  │ • Secrets    │
│   check      │    │   scanning   │    │   management │
└──────────────┘    └──────────────┘    └──────────────┘
```

## Monitoring Flow

```
MCP Servers
   │
   │ /metrics endpoint
   │
   ▼
Prometheus
   │
   │ Scrape every 30s
   │
   ├─── Store metrics ───┐
   │                     │
   │                     ▼
   │              Prometheus TSDB
   │                     │
   │                     ▼
   │              Alert Evaluation
   │                     │
   │                     ├── Alert? ──▶ Alertmanager ──▶ Slack
   │                     │
   │                     └── No alert
   │
   ▼
Grafana
   │
   │ Query Prometheus
   │
   ├── Dashboards ────▶ Cortex Overview
   │                   MCP Performance
   │                   Resource Usage
   │
   └── Alerts ────────▶ High Error Rate
                       High Latency
                       Pod Crashes
```

## Scaling Strategy

```
Load Increase
   │
   ▼
HPA Monitors
   │
   ├── CPU > 80% ──────┐
   ├── Memory > 80% ───┤
   │                   │
   │                   ▼
   │            Scale Up Decision
   │                   │
   │                   ├── Calculate desired replicas
   │                   │   (current * usage / target)
   │                   │
   │                   ▼
   │            Check Limits
   │                   │
   │                   ├── minReplicas ≤ desired ≤ maxReplicas
   │                   │
   │                   ▼
   │            Create Pods
   │                   │
   │                   ├── Scheduler assigns nodes
   │                   ├── Image pull
   │                   ├── Container start
   │                   ├── Health checks
   │                   │
   │                   ▼
   │            Pods Ready
   │                   │
   └───────────────────┤
                       │
Load Decrease          │
   │                   │
   ▼                   │
Wait 5 min             │
(stabilization)        │
   │                   │
   ▼                   │
Scale Down Decision    │
   │                   │
   └───────────────────┘
```

This architecture provides:

1. **Comprehensive CI/CD**: From code commit to production deployment
2. **Security at Every Layer**: Multiple scanning and validation points
3. **GitOps Automation**: Self-healing, automated sync from Git
4. **Scalability**: HPA-based autoscaling for all services
5. **Observability**: Full metrics, logs, and tracing
6. **Reliability**: Health checks, rollback capabilities, PDBs
