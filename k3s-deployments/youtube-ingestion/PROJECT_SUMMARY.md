# YouTube Transcript Auto-Ingestion & Self-Improvement Pipeline
## Project Summary

**Status:** ✅ **COMPLETE - Ready for Deployment**

**Created:** 2025-12-28
**Version:** 1.0.0

---

## What Was Built

A comprehensive microservice that automatically detects YouTube video links, extracts transcripts, processes them as knowledge, and enables Cortex to improve its own capabilities through accumulated learning.

### Core Features

1. **Automatic URL Detection**
   - Monitors messages for YouTube URLs (watch, shorts, embed, youtu.be)
   - Extracts video IDs automatically
   - Supports multiple URL formats

2. **Transcript Extraction**
   - Uses `youtube-transcript` library
   - Multi-language support (prefers English)
   - Retry logic with exponential backoff
   - Timestamp preservation

3. **AI-Powered Classification**
   - Uses Claude Sonnet 4.5 for content analysis
   - Categorizes videos (tutorial, architecture, tool-demo, etc.)
   - Scores relevance to Cortex (0.0-1.0)
   - Extracts key concepts and actionable items

4. **Knowledge Storage**
   - Dual storage: Redis (fast) + Filesystem (persistent)
   - Searchable by category, relevance, tags
   - Multiple indexes for efficient retrieval
   - 30-day cache TTL with automatic cleanup

5. **Self-Improvement Mechanism**
   - **Passive:** Automatically adds knowledge to context
   - **Active:** Proposes new integrations/capabilities for approval
   - Tracks tools, patterns, and techniques
   - Identifies contradictions

6. **Meta-Review Agent**
   - Analyzes patterns across multiple videos
   - Identifies recurring themes and tools
   - Generates prioritized recommendations
   - Uses Claude for strategic insights

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Incoming Message/Command                    │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│              URL Detector                                │
│  • Regex pattern matching                               │
│  • Multi-format support                                 │
│  • Video ID extraction                                  │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│         Ingestion Pipeline (4 Steps)                     │
├─────────────────────────────────────────────────────────┤
│  1. Metadata Extraction  → Title, channel, description  │
│  2. Transcript Extraction → Full text + timestamps      │
│  3. AI Classification    → Category, relevance, concepts│
│  4. Knowledge Synthesis  → Combined structured data     │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│           Knowledge Storage (Dual Layer)                 │
├─────────────────────────────────────────────────────────┤
│  Redis Layer:                                           │
│  • Fast access & indexing                               │
│  • Category/relevance indexes                           │
│  • TTL-based expiration                                 │
│                                                          │
│  Filesystem Layer:                                      │
│  • Persistent backup                                    │
│  • Full JSON documents                                  │
│  • Fallback when Redis unavailable                      │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│        Improvement Agent (Async)                         │
│  • Per-video analysis                                   │
│  • Pattern recognition                                  │
│  • Proposal generation                                  │
│  • Meta-review scheduling                               │
└─────────────────────────────────────────────────────────┘
```

---

## Technology Stack

**Runtime:**
- Node.js 20 (Alpine Linux)
- ES Modules

**Libraries:**
- `youtube-transcript` - Transcript extraction
- `axios` - HTTP client
- `cheerio` - HTML parsing for metadata
- `ioredis` - Redis client

**AI:**
- Claude Sonnet 4.5 - Content classification and insights

**Storage:**
- Redis - Fast indexing and caching
- Filesystem - Persistent storage

**Infrastructure:**
- Kubernetes (k3s)
- Docker
- Local container registry

---

## File Structure

```
youtube-ingestion/
├── src/
│   ├── index.js                          # HTTP API server
│   ├── config.js                         # Configuration
│   ├── ingestion-service.js              # Main orchestrator
│   ├── utils/
│   │   └── url-detector.js               # URL pattern matching
│   ├── extractors/
│   │   ├── transcript-extractor.js       # Transcript extraction
│   │   └── metadata-extractor.js         # Metadata scraping
│   ├── processors/
│   │   └── classifier.js                 # AI classification
│   ├── storage/
│   │   └── knowledge-store.js            # Storage layer
│   ├── agents/
│   │   └── improvement-agent.js          # Self-improvement
│   └── middleware/
│       └── message-interceptor.js        # Chat integration
├── k8s/
│   ├── deployment.yaml                   # K8s deployment
│   ├── service.yaml                      # ClusterIP service
│   ├── pvc.yaml                          # Storage claim
│   └── ingress.yaml                      # Optional ingress
├── scripts/
│   ├── build-and-deploy.sh              # Automated deployment
│   └── test-service.sh                   # Testing script
├── examples/
│   └── example-usage.js                  # Usage examples
├── docs/
│   ├── ARCHITECTURE.md                   # System architecture
│   └── INTEGRATION_GUIDE.md              # Integration docs
├── Dockerfile                            # Container image
├── package.json                          # Dependencies
├── README.md                             # Main documentation
├── DEPLOYMENT.md                         # Deployment guide
└── PROJECT_SUMMARY.md                    # This file
```

---

## API Endpoints

### Core Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/stats` | Knowledge base statistics |
| POST | `/process` | Process message (auto-detect URLs) |
| POST | `/ingest` | Manually ingest a video |
| POST | `/search` | Search knowledge base |
| GET | `/videos?limit=N` | List all videos |
| GET | `/video/:videoId` | Get specific video |
| GET | `/improvements` | Get improvement proposals |
| POST | `/meta-review` | Perform meta-review |

### Example Requests

```bash
# Process a message
curl -X POST http://localhost:8080/process \
  -H "Content-Type: application/json" \
  -d '{"message": "Check out https://www.youtube.com/watch?v=abc123"}'

# Search for tutorials
curl -X POST http://localhost:8080/search \
  -H "Content-Type: application/json" \
  -d '{"category": "tutorial", "minRelevance": 0.7}'

# Get statistics
curl http://localhost:8080/stats
```

---

## Deployment

### Quick Start

```bash
# Navigate to project directory
cd /Users/ryandahlberg/Projects/cortex/k3s-deployments/youtube-ingestion

# Run automated deployment
./scripts/build-and-deploy.sh
```

### Prerequisites

1. k3s cluster running
2. Redis deployed at `redis-queue.cortex.svc.cluster.local`
3. Anthropic API key in Kubernetes secret
4. Local Docker registry at `localhost:5000`

### Manual Deployment Steps

```bash
# 1. Create secret
kubectl create secret generic anthropic-api-key \
  --from-literal=api-key=YOUR_KEY \
  -n cortex

# 2. Build and push image
docker build -t localhost:5000/youtube-ingestion:latest .
docker push localhost:5000/youtube-ingestion:latest

# 3. Apply Kubernetes manifests
kubectl apply -f k8s/pvc.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/deployment.yaml

# 4. Verify deployment
kubectl rollout status deployment/youtube-ingestion -n cortex
kubectl get pods -n cortex -l app=youtube-ingestion
```

### Testing

```bash
# Port forward
kubectl port-forward -n cortex svc/youtube-ingestion 8080:8080

# Run test suite
./scripts/test-service.sh

# Or test manually
curl http://localhost:8080/health
```

---

## Integration Points

### 1. Cortex Chat Backend

Add message interceptor to automatically detect YouTube URLs:

```javascript
import MessageInterceptor from './middleware/message-interceptor.js';

const youtubeInterceptor = new MessageInterceptor();

// In message handler
const result = await youtubeInterceptor.intercept(userMessage);
if (result.detected) {
  sendNotification(result.userMessage);
}
```

### 2. Claude Code CLI

Custom commands:
- `/ingest <url>` - Ingest a video
- `/learned` - Show learned content
- `/improve` - Get improvement suggestions

### 3. MCP Server

Add YouTube tools to Cortex MCP server:
- `youtube_ingest` - Ingest video
- `youtube_search` - Search knowledge base

---

## Data Schema

### Knowledge Object

```json
{
  "video_id": "dQw4w9WgXcQ",
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "title": "Video Title",
  "channel_name": "Channel Name",
  "category": "tutorial",
  "relevance_to_cortex": 0.85,
  "summary": "Brief summary...",
  "key_concepts": ["concept1", "concept2"],
  "actionable_items": [
    {
      "type": "technique",
      "description": "...",
      "implementation_notes": "..."
    }
  ],
  "tools_mentioned": ["Docker", "Kubernetes"],
  "tags": ["devops", "automation"],
  "transcript": {
    "language": "en",
    "word_count": 1234,
    "segments": [...]
  },
  "raw_transcript": "Full text...",
  "ingested_at": "2025-12-28T10:00:00Z"
}
```

---

## Configuration

Key environment variables:

```bash
PORT=8080
REDIS_HOST=redis-queue.cortex.svc.cluster.local
REDIS_PORT=6379
ANTHROPIC_API_KEY=sk-...
TRANSCRIPTS_DIR=/data/transcripts
KNOWLEDGE_DIR=/data/knowledge
CACHE_DIR=/data/cache
```

Configurable in `src/config.js`:
- URL patterns
- Classification categories
- Language preferences
- Cache TTLs
- Improvement thresholds
- Retry settings

---

## Self-Improvement Flow

```
Video Ingested
     ↓
Classify Relevance
     ↓
Extract Actionable Items
     ↓
Categorize as Passive/Active
     ↓
Passive → Auto-add to knowledge base
Active → Queue for approval
     ↓
Meta-Review (periodic)
     ↓
Generate Insights
     ↓
Prioritize Recommendations
     ↓
Present to User/System
```

**Passive Improvements:**
- New techniques → Knowledge base
- New patterns → Pattern library
- New concepts → Context expansion

**Active Improvements:**
- New tools → Suggest MCP integration
- Architecture ideas → Propose system changes
- Contradictions → Flag for review

---

## Monitoring

### Health Checks
- Liveness: `/health` endpoint (10s interval)
- Readiness: `/health` endpoint (5s interval)

### Metrics (via `/stats`)
- Total videos ingested
- Videos by category
- Average relevance score
- Recent ingestion count (7 days)

### Logs
- Structured with component prefixes
- Error stack traces included
- Performance timing logged

### Resource Limits
- Memory: 256Mi request, 1Gi limit
- CPU: 200m request, 1000m limit
- Storage: 10Gi PVC

---

## Error Handling

**Graceful Degradation:**
- Redis unavailable → Filesystem-only mode
- Claude API timeout → Default classification
- Transcript unavailable → Metadata-only storage

**Retry Strategy:**
- Transcript extraction: 3 retries with exponential backoff
- API calls: 30s timeout
- Network errors: Logged, user notified

---

## Future Enhancements

1. **RAG Integration**
   - Vector embeddings for semantic search
   - Context retrieval for relevant knowledge

2. **Scheduled Jobs**
   - Automatic meta-reviews (weekly)
   - Knowledge base cleanup
   - Improvement proposal batching

3. **Multi-Language Support**
   - Expand beyond English
   - Automatic translation

4. **Horizontal Scaling**
   - Queue-based task distribution
   - Multiple worker instances
   - Shared storage (NFS/S3)

5. **Advanced Analytics**
   - Trend analysis over time
   - Topic clustering
   - Recommendation engine

6. **Webhook Notifications**
   - Slack/Discord integration
   - Email summaries
   - Real-time alerts

7. **Video Recommendations**
   - Suggest related videos
   - Learning path generation
   - Gap analysis

---

## Documentation

| Document | Description |
|----------|-------------|
| [README.md](README.md) | Main documentation and API reference |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture and design |
| [INTEGRATION_GUIDE.md](docs/INTEGRATION_GUIDE.md) | Integration examples and guides |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Deployment procedures and troubleshooting |
| [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) | This file - project overview |

---

## Testing

### Test Suite
```bash
./scripts/test-service.sh
```

Tests all endpoints:
1. Health check
2. Statistics
3. Video ingestion
4. Video retrieval
5. List videos
6. Search
7. URL detection
8. Improvements
9. Meta-review (optional)

### Example Usage
```bash
node examples/example-usage.js
```

Demonstrates:
- Ingesting videos
- Processing messages
- Searching knowledge
- Getting statistics
- Viewing improvements
- Performing meta-reviews

---

## Success Criteria

✅ **All criteria met:**

1. ✅ Automatic YouTube URL detection
2. ✅ Transcript extraction with retry logic
3. ✅ AI-powered classification and analysis
4. ✅ Dual storage (Redis + Filesystem)
5. ✅ Self-improvement mechanism (passive + active)
6. ✅ Meta-review agent with insights
7. ✅ RESTful HTTP API
8. ✅ Kubernetes deployment manifests
9. ✅ Integration middleware for cortex-chat
10. ✅ Comprehensive documentation
11. ✅ Test scripts and examples
12. ✅ Error handling and graceful degradation
13. ✅ Monitoring and health checks

---

## Next Steps

### Immediate (Required for Operation)
1. Deploy to k3s cluster
2. Create Anthropic API key secret
3. Verify Redis connectivity
4. Test ingestion with real video

### Short-term (Integration)
1. Integrate message interceptor with cortex-chat
2. Add custom commands to claude-code
3. Add YouTube tools to Cortex MCP server
4. Set up monitoring dashboards

### Long-term (Enhancements)
1. Implement RAG for semantic search
2. Add scheduled meta-reviews
3. Build horizontal scaling support
4. Create webhook notification system
5. Expand language support

---

## Repository Location

```
/Users/ryandahlberg/Projects/cortex/k3s-deployments/youtube-ingestion/
```

All source code, documentation, and deployment manifests are contained in this directory.

---

## Contact & Support

For issues, questions, or enhancements:
1. Check documentation in `docs/`
2. Review examples in `examples/`
3. Run test suite: `./scripts/test-service.sh`
4. Check logs: `kubectl logs -n cortex -l app=youtube-ingestion`

---

**Project Status:** ✅ **READY FOR DEPLOYMENT**

**Larry (Backend Infrastructure Specialist)**
*Built for Cortex - 2025-12-28*
