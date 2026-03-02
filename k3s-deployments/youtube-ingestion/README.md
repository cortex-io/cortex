# YouTube Transcript Auto-Ingestion & Self-Improvement Pipeline

A comprehensive system that automatically detects YouTube video links, extracts transcripts, processes them as knowledge, and enables Cortex to improve its own capabilities.

## Features

### 1. Automatic URL Detection
- Monitors all incoming messages for YouTube URL patterns
- Supports multiple URL formats:
  - `youtube.com/watch?v=`
  - `youtu.be/`
  - `youtube.com/embed/`
  - `youtube.com/shorts/`
  - `youtube.com/live/`
- Triggers transcript extraction automatically when detected

### 2. Transcript Extraction
- Uses `youtube-transcript` npm library as primary method
- Fallback to `yt-dlp` for difficult cases
- Handles both manual and auto-generated captions
- Supports multiple languages (prefers English)
- Returns structured output with timestamps
- Retry logic for reliability

### 3. Content Classification
- Uses Claude (Sonnet 4.5) to classify video content
- Categories:
  - tutorial
  - architecture
  - concept
  - tool-demo
  - discussion
  - code-walkthrough
  - conference-talk
  - lecture
  - review
  - other

### 4. Knowledge Synthesis
- Generates 2-3 sentence summaries
- Extracts key concepts
- Identifies actionable items (techniques, tools, patterns, integrations)
- Lists tools mentioned
- Creates searchable tags
- Calculates relevance to Cortex (0.0-1.0 scale)

### 5. Knowledge Storage
- Dual storage: Redis (fast) + Filesystem (persistent)
- Searchable by category, relevance, tags
- Chronological and relevance-based indexing
- Caching with configurable TTL

### 6. Self-Improvement Mechanism

#### Passive Improvements (Automatic)
- Adds new knowledge to retrievable context
- Updates internal examples library
- Recognizes tools/patterns for recommendations

#### Active Improvements (Require Approval)
- Suggests new MCP server integrations
- Proposes routing weight adjustments
- Recommends prompt/system instruction updates
- Flags contradictions with current behavior

### 7. Meta-Review Agent
Periodically reviews accumulated knowledge and identifies:
- Recurring themes worth prioritizing
- New tools/integrations worth implementing
- Techniques that could improve Cortex capabilities
- Contradictions needing resolution

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Cortex Chat / CLI                        │
│                  (Message Interceptor)                       │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           │ Detected YouTube URL
                           ▼
┌─────────────────────────────────────────────────────────────┐
│               YouTube Ingestion Service                      │
├─────────────────────────────────────────────────────────────┤
│  1. URL Detector        ──► Extracts video ID               │
│  2. Metadata Extractor  ──► Gets title, description, etc.   │
│  3. Transcript Extractor ──► Gets full transcript           │
│  4. Content Classifier  ──► Uses Claude for classification  │
│  5. Knowledge Store     ──► Saves to Redis + Filesystem     │
│  6. Improvement Agent   ──► Analyzes for improvements       │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ Stores knowledge
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Knowledge Base (Redis + FS)                     │
│  - Full transcripts with timestamps                         │
│  - Classifications and summaries                            │
│  - Actionable items and tool lists                          │
│  - Searchable by category, relevance, tags                  │
└─────────────────────────────────────────────────────────────┘
```

## API Endpoints

### Health & Status
- `GET /health` - Health check
- `GET /stats` - Knowledge base statistics

### Video Management
- `GET /videos?limit=100` - List all ingested videos
- `GET /video/:videoId` - Get specific video knowledge
- `POST /search` - Search knowledge base

### Ingestion
- `POST /process` - Process a message (auto-detect URLs)
- `POST /ingest` - Manually ingest a video

### Self-Improvement
- `POST /meta-review` - Perform meta-review of accumulated knowledge
- `GET /improvements` - Get pending improvement proposals

## Usage

### Auto-Detection (Recommended)

When integrated with cortex-chat, simply send a message containing a YouTube URL:

```
User: Check out this video on MCP servers https://www.youtube.com/watch?v=dQw4w9WgXcQ
```

The system will automatically:
1. Detect the URL
2. Extract the transcript
3. Classify the content
4. Store in knowledge base
5. Analyze for improvements

### Manual Ingestion

```bash
curl -X POST http://youtube-ingestion.cortex.svc.cluster.local:8080/ingest \
  -H "Content-Type: application/json" \
  -d '{"videoId": "dQw4w9WgXcQ"}'
```

### Search Knowledge Base

```bash
curl -X POST http://youtube-ingestion.cortex.svc.cluster.local:8080/search \
  -H "Content-Type: application/json" \
  -d '{
    "category": "tutorial",
    "minRelevance": 0.7,
    "limit": 10
  }'
```

### Perform Meta-Review

```bash
curl -X POST http://youtube-ingestion.cortex.svc.cluster.local:8080/meta-review \
  -H "Content-Type: application/json" \
  -d '{
    "minVideos": 5,
    "lookbackDays": 30
  }'
```

## Deployment

### Prerequisites
- Kubernetes cluster (k3s)
- Redis instance running
- Anthropic API key

### Deploy

```bash
cd /Users/ryandahlberg/Projects/cortex/k3s-deployments/youtube-ingestion
./scripts/build-and-deploy.sh
```

### Verify Deployment

```bash
kubectl get pods -n cortex -l app=youtube-ingestion
kubectl logs -n cortex -l app=youtube-ingestion -f
```

### Test

```bash
kubectl port-forward -n cortex svc/youtube-ingestion 8080:8080

# Health check
curl http://localhost:8080/health

# Test ingestion
curl -X POST http://localhost:8080/ingest \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```

## Integration with Cortex Chat

Add the message interceptor to your cortex-chat backend:

```javascript
import MessageInterceptor from './middleware/message-interceptor.js';

const youtubeInterceptor = new MessageInterceptor(
  'http://youtube-ingestion.cortex.svc.cluster.local:8080'
);

// In your message handler:
async function handleUserMessage(message) {
  // Check for YouTube URLs
  const result = await youtubeInterceptor.intercept(message);

  if (result.detected) {
    // Notify user
    sendNotification(result.userMessage);
  }

  // Continue with normal message processing
  // ...
}
```

## Commands for Claude Code

Add these custom commands to your claude-code interface:

- `/ingest <url>` - Manually ingest a YouTube video
- `/learned` - Show recently learned content
- `/improve` - Get improvement suggestions

## Configuration

Edit `src/config.js` to customize:

- URL patterns
- Classification categories
- Language preferences
- Cache TTLs
- Improvement thresholds
- Storage paths

## Storage Schema

### Knowledge Object

```json
{
  "video_id": "dQw4w9WgXcQ",
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "title": "Video Title",
  "channel_name": "Channel Name",
  "description": "Video description",
  "category": "tutorial",
  "relevance_to_cortex": 0.85,
  "summary": "2-3 sentence overview",
  "key_concepts": ["concept1", "concept2"],
  "actionable_items": [
    {
      "type": "technique",
      "description": "Description",
      "implementation_notes": "How to implement"
    }
  ],
  "tools_mentioned": ["tool1", "tool2"],
  "tags": ["tag1", "tag2"],
  "transcript": {
    "language": "en",
    "word_count": 1234,
    "has_timestamps": true,
    "segments": [...]
  },
  "raw_transcript": "Full transcript text...",
  "ingested_at": "2025-12-28T10:00:00.000Z"
}
```

## Monitoring

### Metrics
- Total videos ingested
- Videos by category
- Average relevance score
- Recent ingestion count
- Pending improvements

### Logs

```bash
# View logs
kubectl logs -n cortex -l app=youtube-ingestion -f

# Check Redis connection
kubectl exec -n cortex -it deployment/youtube-ingestion -- node -e \
  "const Redis = require('ioredis'); const r = new Redis({host: 'redis-queue.cortex.svc.cluster.local'}); r.ping().then(console.log)"
```

## Troubleshooting

### Transcript Extraction Fails
- Check if video has captions available
- Try different language settings
- Verify yt-dlp is installed in container

### Low Relevance Scores
- Review classification prompt in `src/processors/classifier.js`
- Adjust `minRelevanceScore` in config

### Redis Connection Issues
- Verify Redis is running: `kubectl get pods -n cortex | grep redis`
- Check service DNS: `kubectl get svc -n cortex | grep redis`
- Service will fallback to filesystem-only if Redis unavailable

## Future Enhancements

1. **RAG Integration** - Use transcripts for semantic search and context
2. **Automatic Summarization** - Generate video summaries for quick review
3. **Cross-Video Analysis** - Find patterns across multiple videos
4. **Scheduled Reviews** - Automatic periodic meta-reviews
5. **Webhook Integration** - Notify external systems of new knowledge
6. **Multi-Language Support** - Expand beyond English
7. **Video Recommendations** - Suggest videos based on current tasks

## License

MIT
