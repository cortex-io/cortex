# YouTube Ingestion Service - Architecture

## Overview

The YouTube Ingestion Service is a microservice designed to automatically detect, extract, process, and store knowledge from YouTube videos. It integrates with the Cortex infrastructure to enable self-improvement through accumulated knowledge.

## System Components

### 1. URL Detector (`src/utils/url-detector.js`)

**Purpose:** Detect YouTube URLs in arbitrary text messages

**Features:**
- Pattern matching for multiple YouTube URL formats
- Video ID extraction
- URL normalization
- Validation

**Patterns Supported:**
- Standard watch URLs: `youtube.com/watch?v=VIDEO_ID`
- Short URLs: `youtu.be/VIDEO_ID`
- Embed URLs: `youtube.com/embed/VIDEO_ID`
- Shorts: `youtube.com/shorts/VIDEO_ID`
- Live streams: `youtube.com/live/VIDEO_ID`

### 2. Transcript Extractor (`src/extractors/transcript-extractor.js`)

**Purpose:** Extract video transcripts with retry logic

**Features:**
- Primary: `youtube-transcript` npm library
- Fallback: Auto-generated captions
- Multi-language support (prefers English)
- Timestamp preservation
- Word count calculation
- Retry mechanism with exponential backoff

**Data Structure:**
```javascript
{
  videoId: string,
  language: string,
  segments: [
    {
      text: string,
      offset: number,      // milliseconds
      duration: number,    // milliseconds
      timestamp: string    // "MM:SS" or "HH:MM:SS"
    }
  ],
  rawText: string,        // concatenated text
  wordCount: number,
  hasTimestamps: boolean,
  extractedAt: ISO8601
}
```

### 3. Metadata Extractor (`src/extractors/metadata-extractor.js`)

**Purpose:** Extract video metadata from YouTube

**Features:**
- Web scraping with cheerio
- Open Graph tag parsing
- JSON-LD structured data extraction
- Fallback to default values

**Extracted Data:**
- Title
- Description
- Channel name
- Duration
- Upload date
- Thumbnail URL

### 4. Content Classifier (`src/processors/classifier.js`)

**Purpose:** Use Claude to classify and analyze video content

**Features:**
- LLM-based classification using Claude Sonnet 4.5
- Relevance scoring (0.0-1.0)
- Concept extraction
- Actionable item identification
- Tool/technology detection

**Classification Schema:**
```javascript
{
  category: string,                    // tutorial, architecture, etc.
  relevance_to_cortex: float,          // 0.0-1.0
  summary: string,                      // 2-3 sentences
  key_concepts: [string],
  actionable_items: [
    {
      type: "technique|tool|pattern|integration",
      description: string,
      implementation_notes: string
    }
  ],
  tools_mentioned: [string],
  tags: [string]
}
```

### 5. Knowledge Store (`src/storage/knowledge-store.js`)

**Purpose:** Persistent and fast storage of processed knowledge

**Features:**
- Dual storage strategy:
  - Redis: Fast access, indexing, searching
  - Filesystem: Persistent backup
- Multiple indexes:
  - By video ID
  - By category
  - By relevance score
  - By ingestion date
- Search capabilities
- Statistics aggregation

**Redis Schema:**
```
youtube:knowledge:{videoId}           → JSON blob (TTL: 30 days)
youtube:category:{category}           → Set of video IDs
youtube:by-relevance                  → Sorted set (score: relevance)
youtube:by-date                       → Sorted set (score: timestamp)
youtube:meta:{videoId}                → Hash (title, category, relevance)
```

**Filesystem Schema:**
```
/data/knowledge/{videoId}.json        → Full knowledge object
/data/transcripts/{videoId}.json      → Raw transcript
/data/cache/                          → Temporary data
```

### 6. Improvement Agent (`src/agents/improvement-agent.js`)

**Purpose:** Analyze knowledge for self-improvement opportunities

**Features:**
- Per-video analysis
- Pattern recognition across multiple videos
- Meta-review generation
- Improvement categorization

**Improvement Types:**

**Passive (Auto-Approved):**
- New techniques → Add to knowledge base
- New patterns → Update pattern library
- New concepts → Enhance understanding

**Active (Require Approval):**
- New tool integrations → Suggest MCP servers
- Architecture changes → Propose system updates
- Prompt updates → Recommend instruction improvements

**Meta-Review Process:**
1. Aggregate data from recent videos (configurable lookback)
2. Identify recurring themes
3. Count tool/concept mentions
4. Use Claude to generate insights
5. Prioritize recommendations

### 7. Ingestion Service (`src/ingestion-service.js`)

**Purpose:** Orchestrate the complete ingestion pipeline

**Pipeline Flow:**
```
Message → URL Detection → Metadata Extraction
                        ↓
                  Transcript Extraction
                        ↓
                  Content Classification
                        ↓
                  Knowledge Synthesis
                        ↓
                  Storage (Redis + FS)
                        ↓
             Improvement Analysis (async)
```

**Features:**
- Deduplication (skip already-ingested videos)
- Error handling at each step
- Progress tracking
- Async improvement analysis

### 8. Message Interceptor (`src/middleware/message-interceptor.js`)

**Purpose:** Integration hook for cortex-chat

**Features:**
- Detects YouTube URLs in user messages
- Triggers ingestion pipeline
- Returns user-facing notifications
- Service availability checking

## Data Flow

### Ingestion Flow

```
┌──────────────┐
│ User Message │
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│  URL Detector    │ ──► No URLs found → Return
└──────┬───────────┘
       │ URLs detected
       ▼
┌──────────────────┐
│ Check if exists  │ ──► Exists → Return cached
└──────┬───────────┘
       │ New video
       ▼
┌──────────────────┐
│ Extract Metadata │ ──► Title, description, channel
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│Extract Transcript│ ──► Full text + timestamps
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Classify Content │ ──► Category, relevance, concepts
└──────┬───────────┘     (Uses Claude)
       │
       ▼
┌──────────────────┐
│Synthesize Knowledge│──► Combine all data
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│  Store to DB     │ ──► Redis + Filesystem
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│Analyze for Improve│──► Async improvement analysis
└──────────────────┘
```

### Search Flow

```
┌──────────────┐
│Search Query  │ ──► {category, minRelevance, tags, limit}
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│  Redis Index     │ ──► Fast lookup by category/relevance
└──────┬───────────┘
       │ Video IDs
       ▼
┌──────────────────┐
│Retrieve Knowledge│ ──► Get full objects from Redis/FS
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│  Filter & Sort   │ ──► Apply additional filters
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Return Results   │
└──────────────────┘
```

## Integration Points

### 1. Cortex Chat Backend

**Integration Type:** HTTP API calls

**Hook Points:**
- Message received → Call `/process` endpoint
- User command `/ingest` → Call `/ingest` endpoint
- User command `/learned` → Call `/videos` endpoint
- User command `/improve` → Call `/improvements` endpoint

**Example:**
```javascript
// In cortex-chat message handler
import MessageInterceptor from './middleware/message-interceptor.js';

const interceptor = new MessageInterceptor();

async function handleMessage(msg) {
  const result = await interceptor.intercept(msg);
  if (result.detected) {
    await sendNotification(result.userMessage);
  }
}
```

### 2. Claude Code CLI

**Integration Type:** Custom commands

**Commands:**
- `/ingest <url>` - Manually ingest a video
- `/learned` - Show recent learnings
- `/improve` - Get improvement suggestions

### 3. Knowledge Retrieval (Future)

**Integration Type:** RAG / Semantic Search

**Use Cases:**
- "What have we learned about MCP servers?"
- "Find videos about observability"
- "Show me tutorials on Docker"

## Scalability Considerations

### Current Design (Single Instance)

**Suitable For:**
- Small to medium workloads
- Occasional ingestions
- Testing and development

**Limitations:**
- Single point of failure
- Limited throughput
- No parallel processing

### Future Scaling Options

**Horizontal Scaling:**
1. Add queue-based task distribution
2. Multiple worker instances
3. Shared Redis for coordination

**Optimization:**
1. Cache frequently accessed knowledge
2. Background job processing
3. Rate limiting for API calls
4. Batch processing for meta-reviews

## Error Handling

### Retry Strategy

**Transcript Extraction:**
- Max retries: 3
- Backoff: Exponential (2s, 4s, 8s)
- Fallback: Try auto-generated captions

**API Calls (Claude):**
- Timeout: 30s
- Fallback: Default classification

**Storage:**
- Redis failure → Fallback to filesystem
- Filesystem failure → Log error, return to user

### Graceful Degradation

1. Redis unavailable → Filesystem-only mode
2. Claude API unavailable → Skip classification
3. Transcript unavailable → Store metadata only

## Security Considerations

### API Key Management
- Anthropic API key stored in Kubernetes Secret
- Never logged or exposed in responses

### Input Validation
- Video ID format validation
- URL pattern matching
- JSON parsing with error handling

### Resource Limits
- Container memory limit: 1Gi
- CPU limit: 1000m
- Storage PVC: 10Gi

### Network Policies
- Internal cluster communication only
- No external ingress (except through Traefik)

## Monitoring and Observability

### Health Checks
- Liveness probe: `/health` endpoint
- Readiness probe: `/health` endpoint
- Startup delay: 10s

### Metrics (Exposed via `/stats`)
- Total videos ingested
- Videos by category
- Average relevance score
- Recent ingestion count (7 days)
- Storage usage

### Logs
- Structured logging with component prefixes
- Error stack traces
- Performance timing (ingestion duration)

## Configuration

### Environment Variables

```bash
PORT=8080                              # HTTP server port
REDIS_HOST=redis-queue.cortex.svc...  # Redis hostname
REDIS_PORT=6379                        # Redis port
REDIS_ENABLED=true                     # Enable Redis
ANTHROPIC_API_KEY=sk-...              # API key
ANTHROPIC_MODEL=claude-sonnet-4.5...  # Model ID
TRANSCRIPTS_DIR=/data/transcripts      # Storage paths
KNOWLEDGE_DIR=/data/knowledge
CACHE_DIR=/data/cache
```

### Tunable Parameters

See `src/config.js`:
- URL patterns
- Classification categories
- Language preferences
- Cache TTLs
- Improvement thresholds
- Retry settings

## Future Architecture Enhancements

### 1. Queue-Based Processing

```
Message → Queue → Worker Pool → Storage
                    ↓
              Improvement Queue
```

### 2. RAG Integration

```
Knowledge Base → Vector Embeddings → Semantic Search
                       ↓
                  Context Retrieval
```

### 3. Scheduled Jobs

```
Cron → Meta-Review → Improvement Proposals → Notification
```

### 4. Webhook Integration

```
New Knowledge → Webhook → External Systems
                  ↓
            Slack, Discord, Email
```

## Deployment Architecture

```
┌─────────────────────────────────────────────────┐
│              Kubernetes Cluster (k3s)            │
├─────────────────────────────────────────────────┤
│                                                  │
│  ┌────────────────────────────────┐             │
│  │  youtube-ingestion             │             │
│  │  - Deployment (1 replica)      │             │
│  │  - Service (ClusterIP)         │             │
│  │  - PVC (10Gi local-path)       │             │
│  │  - Ingress (optional)          │             │
│  └────────────┬───────────────────┘             │
│               │                                  │
│               │ Uses Redis                       │
│               ▼                                  │
│  ┌────────────────────────────────┐             │
│  │  redis-queue.cortex            │             │
│  │  (Shared with cortex-queue)    │             │
│  └────────────────────────────────┘             │
│                                                  │
└─────────────────────────────────────────────────┘
```

## API Design

RESTful HTTP API with JSON responses

**Base URL:** `http://youtube-ingestion.cortex.svc.cluster.local:8080`

**Response Format:**
```json
{
  "status": "success|error",
  "data": {...},
  "error": "error message (if applicable)"
}
```

**Error Codes:**
- 400: Bad request (invalid input)
- 404: Resource not found
- 500: Internal server error
- 200: Success

See README.md for complete API documentation.
