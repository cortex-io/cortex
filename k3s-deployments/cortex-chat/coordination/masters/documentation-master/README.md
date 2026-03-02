# Documentation Master

## Overview

The Documentation Master is a Cortex master responsible for managing evolving documentation systems across all external integrations. It treats documentation as a first-class, living knowledge system that learns and improves over time through the MoE (Mixture of Experts) learning system.

## Architecture

### Core Components

- **master.sh** - Main orchestration script that coordinates all subsystems
- **lib/crawler.sh** - Web crawling engine with rate limiting and robots.txt support
- **lib/indexer.sh** - Content indexing, storage, and retrieval
- **lib/learner.sh** - MoE learning integration and outcome tracking
- **lib/knowledge-graph.sh** - Cross-domain knowledge management
- **lib/query-handler.sh** - API for other masters to query documentation
- **lib/evolution-tracker.sh** - Track and prioritize documentation updates

### Worker Scripts

- **workers/crawler-worker.sh** - Spawnable worker for parallel crawling
- **workers/indexer-worker.sh** - Spawnable worker for parallel indexing
- **workers/learner-worker.sh** - Spawnable worker for MoE learning tasks

### Configuration

- **config/sources.json** - Documentation source registry (Sandfly, Proxmox, K3s, etc.)
- **config/crawl-policy.json** - Crawl scheduling, version tracking, and update policies
- **config/resource-limits.json** - Storage, rate limiting, and resource management
- **config/learning-policy.json** - MoE integration and priority scoring policies

## Key Features

### 1. Intelligent Crawling
- Respects robots.txt and implements polite crawling
- Rate limiting and concurrent request management
- Incremental crawling (only fetch changed content)
- Version detection and automatic re-crawl on updates

### 2. Smart Indexing
- Content extraction with configurable selectors
- Key term extraction and semantic indexing
- Priority scoring based on usage and success rates
- Automatic pruning of low-value content

### 3. MoE Learning Integration
- Tracks which documentation is used in successful tasks
- Updates priority scores based on usage patterns
- Auto-triggers re-crawl for knowledge gaps
- Feeds outcomes back to MoE learning system

### 4. Knowledge Graph
- Builds entity relationships within domains
- Identifies cross-domain knowledge links
- Provides related topic recommendations
- Enables semantic search across documentation

### 5. Evolution Tracking
- Monitors documentation freshness
- Detects version changes and updates
- Analyzes usage patterns over time
- Adjusts crawl priorities dynamically

## API Interface

### Query Documentation
```bash
./master.sh query \
  --domain "sandfly" \
  --topic "api/alerts" \
  --format "summary" \
  --max-tokens 5000
```

### Trigger Learning
```bash
./master.sh learn sandfly "rootkit_detection" high
```

### Check Status
```bash
./master.sh status
```

### Manual Crawl
```bash
./master.sh crawl sandfly https://docs.sandflysecurity.com
```

## HTTP API

When running as a service, the Documentation Master exposes:

- `GET /health` - Health check endpoint
- `GET /status` - Detailed status for all domains
- `POST /query` - Query documentation (used by other masters)
- `POST /outcome` - Report MoE outcome (used by learning system)

## Deployment

### Kubernetes Deployment

The Documentation Master is deployed in the `cortex` namespace with:

1. **Deployment** - Main service running continuously
2. **PersistentVolumeClaims** - Storage for knowledge base (10Gi) and cache (20Gi)
3. **Service** - ClusterIP service for internal access
4. **ConfigMaps** - Code and configuration
5. **CronJob** - Scheduled daily crawls

### Deploy to K8s
```bash
kubectl apply -f /Users/ryandahlberg/Projects/cortex/k3s-deployments/cortex-governance/documentation-master-pvc.yaml
kubectl apply -f /Users/ryandahlberg/Projects/cortex/k3s-deployments/cortex-governance/documentation-master-configmap.yaml
kubectl apply -f /Users/ryandahlberg/Projects/cortex/k3s-deployments/cortex-governance/documentation-master-deployment.yaml
kubectl apply -f /Users/ryandahlberg/Projects/cortex/k3s-deployments/cortex-governance/documentation-master-service.yaml
kubectl apply -f /Users/ryandahlberg/Projects/cortex/k3s-deployments/cortex-governance/documentation-master-cronjob.yaml
```

### Update ConfigMaps

When you update the code, sync it to the configmaps:

```bash
./sync-to-k8s.sh
kubectl rollout restart deployment/documentation-master -n cortex
```

## Initial Setup

1. **Enable a domain** - Edit `config/sources.json` and set `"enabled": true` for Sandfly
2. **Configure sources** - Add/modify source URLs and selectors
3. **Set priorities** - Adjust crawl priorities (high/medium/low)
4. **Deploy to K8s** - Apply all manifests
5. **Monitor logs** - Watch the initial crawl and indexing

## MoE Learning Flow

```
Task Execution → Documentation Used → MoE Outcome
                                            ↓
                              Documentation Master receives outcome
                                            ↓
                              Updates success metrics & priority scores
                                            ↓
                              Identifies knowledge gaps
                                            ↓
                              Auto-triggers targeted learning
```

## Knowledge Gap Detection

The system automatically detects knowledge gaps when:
- Query returns no results (3+ times for same topic)
- Task failure rate exceeds 50% when using specific docs
- Low confidence scores (< 0.4) for documentation usage
- Coverage analysis shows missing expected entities

## Resource Management

### Storage Limits
- Max cache size: 10GB
- Max per domain: 2GB
- Auto-pruning at 80% threshold
- Prunes content with priority score < 0.3 after 90 days

### Rate Limiting
- 60 requests per minute per source
- 5 concurrent crawls maximum
- 1 second delay between requests
- Respects robots.txt directives

### Token Budget
- 100K tokens per crawl
- 50K tokens per query
- 1M tokens daily limit
- Warnings at 80% threshold

## Metrics and Monitoring

The system tracks:
- Crawl success/failure rates
- Index size and growth
- Query latency and success rates
- Knowledge gap count
- Priority score distributions
- MoE outcome correlations

## Troubleshooting

### No crawl activity
- Check `config/sources.json` - ensure domain is `"enabled": true`
- Check rate limits in `config/resource-limits.json`
- Review logs: `kubectl logs -n cortex deployment/documentation-master`

### Low priority scores
- Check MoE outcome tracking is enabled
- Verify documentation is actually being used in tasks
- Review `learning-policy.json` weight configuration

### Storage full
- Check pruning policy in `config/learning-policy.json`
- Manually trigger pruning: `kubectl exec -it <pod> -- /app/lib/indexer.sh prune`
- Increase PVC size if needed

### Knowledge gaps not filling
- Check `crawl-policy.json` - ensure auto-trigger is enabled
- Verify source URLs are accessible
- Check crawl depth limits

## Development

### Adding a New Domain

1. Edit `config/sources.json`:
```json
{
  "new_domain": {
    "enabled": true,
    "priority": "medium",
    "sources": [...],
    "knowledge_graph": {...}
  }
}
```

2. Update configmap and restart:
```bash
kubectl create configmap documentation-master-config \
  --from-file=config/ \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl rollout restart deployment/documentation-master -n cortex
```

### Testing Locally

```bash
# Set environment variables
export KNOWLEDGE_BASE_PATH="./knowledge-base"
export CACHE_PATH="./cache"
export LOG_LEVEL="debug"

# Run master
./master.sh start
```

## Next Steps for Daryl

1. **Sync scripts to ConfigMaps** - Create a sync script to update K8s configmaps with the actual code
2. **Deploy and test** - Deploy to K8s and verify health endpoints
3. **Initial Sandfly crawl** - Trigger first crawl and monitor progress
4. **MCP Server integration** - Build Sandfly MCP server to use Documentation Master
5. **Monitor and tune** - Watch metrics and adjust policies as needed

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Documentation Master                      │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Crawler    │  │   Indexer    │  │   Learner    │      │
│  │   Engine     │→ │   Engine     │→ │ (MoE Link)   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         ↓                  ↓                  ↓              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Knowledge    │  │    Cache     │  │  Evolution   │      │
│  │    Graph     │  │   Storage    │  │   Tracker    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         ↓                                    ↓               │
│  ┌────────────────────────────────────────────────┐         │
│  │            Query Handler API                    │         │
│  └────────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────────┘
                         ↓
        ┌────────────────────────────────────┐
        │  Other Cortex Masters & MCP Servers │
        └────────────────────────────────────┘
```

## License

Part of the Cortex system - internal use only.
