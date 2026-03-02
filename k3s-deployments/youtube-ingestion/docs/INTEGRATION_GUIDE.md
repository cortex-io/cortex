# Integration Guide - YouTube Ingestion Service

This guide shows how to integrate the YouTube Ingestion Service with different components of the Cortex system.

## Table of Contents

1. [Cortex Chat Backend Integration](#cortex-chat-backend-integration)
2. [Claude Code CLI Integration](#claude-code-cli-integration)
3. [MCP Server Integration](#mcp-server-integration)
4. [Direct API Usage](#direct-api-usage)
5. [Webhook Integration](#webhook-integration)

---

## Cortex Chat Backend Integration

### Step 1: Add Message Interceptor

Copy the message interceptor to your cortex-chat backend:

```bash
cp src/middleware/message-interceptor.js \
   /path/to/cortex-chat/backend/middleware/
```

### Step 2: Import and Initialize

In your main server file (e.g., `server.js`):

```javascript
import MessageInterceptor from './middleware/message-interceptor.js';

// Initialize interceptor
const youtubeInterceptor = new MessageInterceptor(
  process.env.YOUTUBE_SERVICE_URL || 'http://youtube-ingestion.cortex.svc.cluster.local:8080'
);

// Optional: Check if service is available at startup
const isAvailable = await youtubeInterceptor.isAvailable();
console.log('[YouTube] Service available:', isAvailable);
```

### Step 3: Add Message Handler Hook

In your message processing function:

```javascript
async function handleUserMessage(userId, message) {
  // 1. Check for YouTube URLs
  const youtubeResult = await youtubeInterceptor.intercept(message);

  if (youtubeResult.detected) {
    // Send progress notification to user
    await sendProgressNotification(userId, {
      type: 'youtube_ingestion',
      message: youtubeResult.userMessage
    });

    // Log ingestion details
    console.log('[YouTube] Ingested:', youtubeResult.videos);
  }

  // 2. Continue with normal message processing
  // ... rest of your handler
}
```

### Step 4: Add User Notification

Create a notification function to inform users:

```javascript
async function sendProgressNotification(userId, data) {
  // Send via WebSocket, SSE, or polling mechanism
  websocket.send(userId, {
    type: 'notification',
    category: 'youtube',
    message: data.message,
    timestamp: new Date().toISOString()
  });
}
```

### Step 5: Add Custom Commands

Add YouTube-specific commands to your command handler:

```javascript
async function handleCommand(userId, command, args) {
  switch (command) {
    case '/ingest':
      if (!args[0]) {
        return 'Usage: /ingest <youtube-url>';
      }
      return await handleIngestCommand(args[0]);

    case '/learned':
      return await handleLearnedCommand(args);

    case '/improve':
      return await handleImproveCommand();

    // ... other commands
  }
}

async function handleIngestCommand(url) {
  const response = await fetch('http://youtube-ingestion.cortex.svc.cluster.local:8080/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });

  const data = await response.json();

  if (data.status === 'success') {
    return `Ingested: ${data.knowledge.title}\n` +
           `Category: ${data.knowledge.category}\n` +
           `Relevance: ${(data.knowledge.relevance_to_cortex * 100).toFixed(0)}%`;
  } else {
    return `Failed to ingest video: ${data.error}`;
  }
}

async function handleLearnedCommand(args) {
  const limit = parseInt(args[0]) || 10;

  const response = await fetch(
    `http://youtube-ingestion.cortex.svc.cluster.local:8080/videos?limit=${limit}`
  );

  const data = await response.json();

  let message = `Recently learned from ${data.count} videos:\n\n`;

  for (const video of data.videos) {
    message += `- ${video.title} (${video.category}, ${(video.relevance_to_cortex * 100).toFixed(0)}%)\n`;
  }

  return message;
}

async function handleImproveCommand() {
  const response = await fetch('http://youtube-ingestion.cortex.svc.cluster.local:8080/improvements');
  const data = await response.json();

  if (data.count === 0) {
    return 'No pending improvement proposals.';
  }

  let message = `${data.count} improvement proposals:\n\n`;

  for (const improvement of data.improvements.slice(0, 5)) {
    message += `From: ${improvement.title}\n`;

    if (improvement.improvements.active.length > 0) {
      message += `Active:\n`;
      for (const item of improvement.improvements.active) {
        message += `  - ${item.description}\n`;
      }
    }

    message += '\n';
  }

  return message;
}
```

### Step 6: Environment Variables

Add to your `.env` or Kubernetes ConfigMap:

```bash
YOUTUBE_SERVICE_URL=http://youtube-ingestion.cortex.svc.cluster.local:8080
YOUTUBE_AUTO_DETECT=true
```

---

## Claude Code CLI Integration

### Custom Commands

Create a plugin file for Claude Code that adds YouTube commands:

```javascript
// ~/.claude-code/plugins/youtube.js

export const commands = [
  {
    name: 'ingest',
    description: 'Ingest a YouTube video transcript',
    usage: '/ingest <url>',
    handler: async (args) => {
      const url = args[0];
      if (!url) {
        return 'Usage: /ingest <youtube-url>';
      }

      const response = await fetch('http://youtube-ingestion.cortex.svc.cluster.local:8080/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      const data = await response.json();

      if (data.status === 'success') {
        return {
          message: 'Video ingested successfully',
          details: {
            title: data.knowledge.title,
            category: data.knowledge.category,
            relevance: data.knowledge.relevance_to_cortex,
            summary: data.knowledge.summary
          }
        };
      } else {
        return `Failed: ${data.error}`;
      }
    }
  },

  {
    name: 'learned',
    description: 'Show recently learned content',
    usage: '/learned [limit]',
    handler: async (args) => {
      const limit = parseInt(args[0]) || 10;

      const response = await fetch(
        `http://youtube-ingestion.cortex.svc.cluster.local:8080/videos?limit=${limit}`
      );

      const data = await response.json();

      return {
        message: `Recently learned from ${data.count} videos`,
        videos: data.videos.map(v => ({
          title: v.title,
          category: v.category,
          relevance: v.relevance_to_cortex,
          url: v.url
        }))
      };
    }
  },

  {
    name: 'improve',
    description: 'Get improvement suggestions',
    usage: '/improve',
    handler: async () => {
      const response = await fetch('http://youtube-ingestion.cortex.svc.cluster.local:8080/improvements');
      const data = await response.json();

      if (data.count === 0) {
        return 'No pending improvement proposals.';
      }

      return {
        message: `${data.count} improvement proposals`,
        improvements: data.improvements.map(imp => ({
          video: imp.title,
          passive: imp.improvements.passive.length,
          active: imp.improvements.active.length,
          suggestions: imp.improvements.active.slice(0, 3)
        }))
      };
    }
  },

  {
    name: 'meta-review',
    description: 'Perform meta-review of learned content',
    usage: '/meta-review [days]',
    handler: async (args) => {
      const days = parseInt(args[0]) || 30;

      const response = await fetch('http://youtube-ingestion.cortex.svc.cluster.local:8080/meta-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lookbackDays: days,
          minVideos: 3
        })
      });

      const data = await response.json();

      if (data.status === 'insufficient_data') {
        return `Need at least ${data.min_required} videos (found ${data.videos_analyzed})`;
      }

      return {
        message: `Meta-review of ${data.videos_analyzed} videos`,
        insights: data.analysis.insights,
        recurring_tools: data.analysis.recurring_tools,
        recurring_concepts: data.analysis.recurring_concepts
      };
    }
  }
];
```

---

## MCP Server Integration

### Add YouTube Tools to Cortex MCP Server

Edit `/Users/ryandahlberg/Projects/cortex/mcp-servers/cortex/src/tools/youtube.js`:

```javascript
/**
 * YouTube Knowledge Tools for Cortex MCP Server
 */

import axios from 'axios';

const YOUTUBE_SERVICE_URL = process.env.YOUTUBE_SERVICE_URL ||
  'http://youtube-ingestion.cortex.svc.cluster.local:8080';

export const youtubeIngestTool = {
  name: 'youtube_ingest',
  description: 'Ingest a YouTube video transcript and add to knowledge base',
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'YouTube video URL'
      }
    },
    required: ['url']
  }
};

export async function executeYoutubeIngest(args) {
  const { url } = args;

  try {
    const response = await axios.post(`${YOUTUBE_SERVICE_URL}/ingest`, { url });

    const { knowledge } = response.data;

    return {
      success: true,
      video_id: knowledge.video_id,
      title: knowledge.title,
      category: knowledge.category,
      relevance: knowledge.relevance_to_cortex,
      summary: knowledge.summary,
      key_concepts: knowledge.key_concepts,
      tools_mentioned: knowledge.tools_mentioned
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

export const youtubeSearchTool = {
  name: 'youtube_search',
  description: 'Search ingested YouTube videos by category, relevance, or tags',
  inputSchema: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        description: 'Filter by category (tutorial, architecture, etc.)'
      },
      minRelevance: {
        type: 'number',
        description: 'Minimum relevance score (0.0-1.0)'
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by tags'
      },
      limit: {
        type: 'number',
        description: 'Maximum results to return'
      }
    }
  }
};

export async function executeYoutubeSearch(args) {
  try {
    const response = await axios.post(`${YOUTUBE_SERVICE_URL}/search`, args);

    return {
      success: true,
      count: response.data.count,
      results: response.data.results.map(v => ({
        video_id: v.video_id,
        title: v.title,
        category: v.category,
        relevance: v.relevance_to_cortex,
        summary: v.summary,
        url: v.url
      }))
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
```

Then add to `src/index.js`:

```javascript
import { youtubeIngestTool, executeYoutubeIngest, youtubeSearchTool, executeYoutubeSearch } from './tools/youtube.js';

const TOOLS = [
  cortexQueryTool,
  cortexGetStatusTool,
  youtubeIngestTool,
  youtubeSearchTool
];

// In handleToolsCall:
case 'youtube_ingest':
  result = await executeYoutubeIngest(args);
  break;

case 'youtube_search':
  result = await executeYoutubeSearch(args);
  break;
```

---

## Direct API Usage

### Python Example

```python
import requests
import json

YOUTUBE_API = "http://youtube-ingestion.cortex.svc.cluster.local:8080"

def ingest_video(url):
    """Ingest a YouTube video"""
    response = requests.post(
        f"{YOUTUBE_API}/ingest",
        json={"url": url}
    )
    return response.json()

def search_videos(category=None, min_relevance=0.0, limit=10):
    """Search ingested videos"""
    query = {
        "limit": limit
    }
    if category:
        query["category"] = category
    if min_relevance > 0:
        query["minRelevance"] = min_relevance

    response = requests.post(
        f"{YOUTUBE_API}/search",
        json=query
    )
    return response.json()

def get_stats():
    """Get knowledge base statistics"""
    response = requests.get(f"{YOUTUBE_API}/stats")
    return response.json()

def meta_review(lookback_days=30):
    """Perform meta-review"""
    response = requests.post(
        f"{YOUTUBE_API}/meta-review",
        json={"lookbackDays": lookback_days}
    )
    return response.json()

# Usage
if __name__ == "__main__":
    # Ingest a video
    result = ingest_video("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    print(f"Ingested: {result['knowledge']['title']}")

    # Search for tutorials
    tutorials = search_videos(category="tutorial", min_relevance=0.7)
    print(f"Found {tutorials['count']} tutorials")

    # Get stats
    stats = get_stats()
    print(f"Total videos: {stats['total']}")

    # Perform meta-review
    review = meta_review(lookback_days=7)
    print(f"Reviewed {review['videos_analyzed']} videos")
```

### cURL Examples

```bash
# Ingest a video
curl -X POST http://youtube-ingestion.cortex.svc.cluster.local:8080/ingest \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'

# Search by category
curl -X POST http://youtube-ingestion.cortex.svc.cluster.local:8080/search \
  -H "Content-Type: application/json" \
  -d '{"category": "tutorial", "minRelevance": 0.7, "limit": 10}'

# Get stats
curl http://youtube-ingestion.cortex.svc.cluster.local:8080/stats

# List recent videos
curl http://youtube-ingestion.cortex.svc.cluster.local:8080/videos?limit=20

# Get specific video
curl http://youtube-ingestion.cortex.svc.cluster.local:8080/video/dQw4w9WgXcQ

# Meta-review
curl -X POST http://youtube-ingestion.cortex.svc.cluster.local:8080/meta-review \
  -H "Content-Type: application/json" \
  -d '{"lookbackDays": 30, "minVideos": 5}'

# Get improvements
curl http://youtube-ingestion.cortex.svc.cluster.local:8080/improvements
```

---

## Webhook Integration

### Setup Webhook Notifications

Create a webhook handler to notify external systems when videos are ingested:

```javascript
// src/webhooks/notifier.js

import axios from 'axios';

export class WebhookNotifier {
  constructor(webhookUrl) {
    this.webhookUrl = webhookUrl;
  }

  async notifyIngestion(knowledge) {
    try {
      await axios.post(this.webhookUrl, {
        event: 'youtube_ingested',
        timestamp: new Date().toISOString(),
        data: {
          video_id: knowledge.video_id,
          title: knowledge.title,
          category: knowledge.category,
          relevance: knowledge.relevance_to_cortex,
          url: knowledge.url
        }
      });
    } catch (error) {
      console.error('[Webhook] Failed to send notification:', error.message);
    }
  }

  async notifyImprovement(improvement) {
    try {
      await axios.post(this.webhookUrl, {
        event: 'improvement_proposed',
        timestamp: new Date().toISOString(),
        data: {
          video: improvement.title,
          active_count: improvement.improvements.active.length,
          passive_count: improvement.improvements.passive.length
        }
      });
    } catch (error) {
      console.error('[Webhook] Failed to send notification:', error.message);
    }
  }
}
```

Add to `src/ingestion-service.js`:

```javascript
import { WebhookNotifier } from './webhooks/notifier.js';

// In constructor
if (process.env.WEBHOOK_URL) {
  this.webhook = new WebhookNotifier(process.env.WEBHOOK_URL);
}

// In ingestVideo method, after storing
if (this.webhook) {
  await this.webhook.notifyIngestion(knowledge);
}
```

### Slack Integration Example

```javascript
// Slack webhook format
async function notifySlack(knowledge) {
  const slackWebhook = process.env.SLACK_WEBHOOK_URL;

  await axios.post(slackWebhook, {
    text: `New YouTube video ingested!`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${knowledge.title}*\n${knowledge.summary}`
        }
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Category:*\n${knowledge.category}` },
          { type: 'mrkdwn', text: `*Relevance:*\n${(knowledge.relevance_to_cortex * 100).toFixed(0)}%` }
        ]
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'View Video' },
            url: knowledge.url
          }
        ]
      }
    ]
  });
}
```

---

## Testing Integration

### Integration Test Script

```bash
#!/bin/bash

# integration-test.sh

API_URL="http://youtube-ingestion.cortex.svc.cluster.local:8080"

echo "=== YouTube Ingestion Service Integration Test ==="

# 1. Health check
echo -e "\n1. Health check..."
curl -s $API_URL/health | jq

# 2. Ingest a video
echo -e "\n2. Ingesting test video..."
VIDEO_URL="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
curl -s -X POST $API_URL/ingest \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"$VIDEO_URL\"}" | jq '.knowledge | {title, category, relevance_to_cortex}'

# 3. Search for video
echo -e "\n3. Searching for ingested video..."
curl -s -X POST $API_URL/search \
  -H "Content-Type: application/json" \
  -d '{"limit": 5}' | jq '.results | length'

# 4. Get stats
echo -e "\n4. Getting stats..."
curl -s $API_URL/stats | jq

echo -e "\n=== Integration Test Complete ==="
```

---

## Monitoring Integration

### Prometheus Metrics (Future Enhancement)

```javascript
// src/metrics/prometheus.js

import promClient from 'prom-client';

const register = new promClient.Registry();

const ingestCounter = new promClient.Counter({
  name: 'youtube_videos_ingested_total',
  help: 'Total number of videos ingested',
  registers: [register]
});

const relevanceHistogram = new promClient.Histogram({
  name: 'youtube_relevance_score',
  help: 'Distribution of relevance scores',
  buckets: [0.1, 0.3, 0.5, 0.7, 0.9, 1.0],
  registers: [register]
});

// Expose metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

---

## Summary

This integration guide covers:
- ✅ Cortex Chat backend integration
- ✅ Claude Code CLI commands
- ✅ MCP server tools
- ✅ Direct API usage (Python, cURL)
- ✅ Webhook notifications
- ✅ Testing and monitoring

For more details, see:
- [README.md](../README.md) - Main documentation
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture
- [API Reference](../README.md#api-endpoints) - Complete API docs
