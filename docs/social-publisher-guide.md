# Cortex Social Publisher Guide

Automatically publish your blog posts to Twitter via Buffer with AI-powered content optimization.

## Overview

The Cortex Social Publisher is a complete automation system that:

- **Monitors** your blog directory for new posts
- **Parses** markdown blog posts to extract metadata and content
- **Generates** optimized tweet content using Claude AI
- **Publishes** to Twitter via Buffer API
- **Tracks** publication status and provides observability

## Features

### AI-Powered Tweet Generation

- **Single Tweet**: Punchy one-liner that captures the essence
- **Thread**: Multi-tweet thread summarizing key points (3-10 tweets)
- **Thread with Summary**: Executive summary structure with stats

### Smart Content Extraction

- Automatic frontmatter parsing (title, tags, date, author)
- Key points extraction from bullet lists
- Stats and metrics detection (e.g., "80x faster", "95% coverage")
- Summary generation from TL;DR sections

### Publishing Options

- **Manual**: Review and approve before publishing
- **Preview**: Generate tweets without publishing
- **Automatic**: Monitor directory and auto-publish (daemon mode)
- **Latest**: Quickly publish your most recent post

### Governance & Safety

- Duplicate detection (won't republish the same post)
- Rate limiting (configurable per hour/day)
- Publication tracking and audit logs
- Preview before publish

---

## Quick Start

### 1. Get API Credentials

#### Buffer Access Token

1. Go to [Buffer Developers](https://buffer.com/developers/apps)
2. Create a new app or use existing
3. Generate an access token
4. Copy your access token

#### Connect Twitter to Buffer

1. Log in to [Buffer](https://buffer.com)
2. Go to Settings → Channels
3. Connect your Twitter account
4. Note your profile ID (optional, for multi-account)

### 2. Set Environment Variables

Add to your `~/.zshrc`, `~/.bashrc`, or `.env` file:

```bash
# Required
export BUFFER_ACCESS_TOKEN="your_buffer_access_token_here"
export ANTHROPIC_API_KEY="your_anthropic_api_key_here"

# Optional
export BUFFER_PROFILE_ID="your_twitter_profile_id"
```

Then reload:
```bash
source ~/.zshrc  # or ~/.bashrc
```

### 3. Validate Setup

```bash
# Check Buffer connection
node lib/social/buffer-client.js validate

# Should output:
# {
#   "valid": true,
#   "profiles": 1,
#   "twitter_accounts": 1,
#   "profile_ids": ["abc123"]
# }

# Run unit tests
./testing/unit/social-publisher.test.sh

# Run E2E tests (requires API keys)
./testing/integration/social-publisher-e2e.test.sh
```

---

## Usage

### Publish a Specific Blog Post

```bash
# Interactive mode (preview and confirm)
./scripts/social-publish.sh projects/blog/2025-12-04-my-post.md

# With custom strategy
./scripts/social-publish.sh projects/blog/2025-12-04-my-post.md thread

# With blog URL (included in last tweet)
./scripts/social-publish.sh projects/blog/2025-12-04-my-post.md thread https://blog.example.com/my-post
```

### Publish Latest Blog Post

```bash
# Publish the most recent blog post
./scripts/social-publish.sh --latest

# With specific strategy
./scripts/social-publish.sh --latest single_tweet
```

### Preview Without Publishing

```bash
# Generate tweet preview without posting
./scripts/social-publish.sh --preview projects/blog/2025-12-04-my-post.md

# Preview with different strategies
./scripts/social-publish.sh --preview projects/blog/2025-12-04-my-post.md thread_with_summary

# Preview is saved to: coordination/social/preview.txt
```

### Automatic Monitoring (Daemon Mode)

```bash
# Start daemon (monitors projects/blog/ for changes)
./scripts/daemons/social-publisher-daemon.sh start

# Check daemon status
./scripts/daemons/social-publisher-daemon.sh status

# Show pending blog posts
./scripts/daemons/social-publisher-daemon.sh pending

# Stop daemon
./scripts/daemons/social-publisher-daemon.sh stop
```

**Daemon Configuration:**

Edit `scripts/daemons/social-publisher-daemon.sh`:

```bash
CHECK_INTERVAL=300  # Check every 5 minutes
AUTO_PUBLISH=false  # Set true for automatic publishing
```

- When `AUTO_PUBLISH=false`: New posts are added to pending queue
- When `AUTO_PUBLISH=true`: New posts are automatically published

---

## Tweet Generation Strategies

### Strategy: `single_tweet`

One optimized tweet (≤280 chars).

**Best for:**
- Quick announcements
- Short updates
- Link sharing

**Example:**
```
We just shipped a complete observability pipeline in 3 hours using
AI agents—what traditionally takes 6-8 weeks. 80x faster, 95% cheaper.

Read how: https://blog.example.com/post

#AI #DevOps #Automation
```

### Strategy: `thread`

Multi-tweet thread (3-10 tweets) summarizing the post.

**Best for:**
- Technical deep dives
- Feature announcements
- Tutorial content

**Example:**
```
Tweet 1: We built a production observability pipeline in 3 hours using
AI agents. Here's how we achieved 80x faster development 🧵

---

Tweet 2: Traditional approach: 6-8 weeks of engineering work

With AI: ~3 hours

Same result: Production-ready code with full test coverage

---

Tweet 3: What we built:
• Complete data pipeline
• 4 sophisticated processors
• 5 destinations
• REST API + Dashboard
• 94 comprehensive tests

---

Tweet 4: The results speak for themselves:

⚡ 80-100x faster
💰 60-80x cheaper
✅ Same quality
🚀 Production-ready

Full story: https://blog.example.com/post

---
```

### Strategy: `thread_with_summary`

Structured thread with executive summary format.

**Best for:**
- Case studies
- Product launches
- Results-driven content

**Structure:**
1. Hook + one-line summary
2. What was built (features)
3. The results (stats, metrics)
4. Call to action + link

---

## Configuration

### Main Configuration

Edit `coordination/config/social-publisher-config.json`:

```json
{
  "buffer": {
    "api_base_url": "https://api.bufferapp.com/1",
    "access_token_env": "BUFFER_ACCESS_TOKEN"
  },
  "blog": {
    "directory": "projects/blog",
    "base_url": "https://yourdomain.com/blog"
  },
  "content_generation": {
    "default_strategy": "thread",
    "min_thread_length": 3,
    "max_thread_length": 10,
    "emoji_usage": "moderate",
    "tone": "professional_technical"
  },
  "hashtags": {
    "default_tags": ["AI", "DevOps", "Engineering"],
    "max_per_post": 3,
    "auto_generate": true
  }
}
```

### Blog Post Format

Your blog posts should be markdown files with frontmatter:

```markdown
---
title: "Your Post Title"
date: 2025-12-04
author: Your Name
tags: [AI, DevOps, Automation]
category: Engineering
---

# Your Post Title

**Date** | Author

---

## TL;DR

Short summary of the post (used for tweet generation).

## Content

Your blog post content...

### Key Features

- Feature 1: Description
- Feature 2: Description
- Feature 3: Description

### Statistics

- 80x faster development
- 95% test coverage
- 3 hours implementation

## Conclusion

Wrap up...
```

**Important fields for tweet generation:**

- `title`: Used in first tweet
- `tags`: Converted to hashtags
- TL;DR section: Used for summary
- Bullet points: Extracted as key points
- Statistics: Highlighted in tweets

---

## Components

### 1. Buffer API Client

**Location:** `lib/social/buffer-client.js`

Handles all Buffer API interactions:

```bash
# Validate credentials
node lib/social/buffer-client.js validate

# List profiles
node lib/social/buffer-client.js profiles

# Post single tweet
node lib/social/buffer-client.js post "Your tweet text"

# Post thread
node lib/social/buffer-client.js thread "Tweet 1" "Tweet 2" "Tweet 3"
```

### 2. Blog Post Parser

**Location:** `lib/social/blog-parser.js`

Extracts metadata and content from markdown:

```bash
# Parse single post
node lib/social/blog-parser.js parse projects/blog/2025-12-04-post.md

# List all posts
node lib/social/blog-parser.js list projects/blog
```

### 3. Tweet Generator

**Location:** `lib/social/tweet-generator.js`

AI-powered tweet content generation:

```bash
# Generate tweets (specific strategy)
node lib/social/tweet-generator.js generate projects/blog/2025-12-04-post.md thread

# Generate all strategies (comparison)
node lib/social/tweet-generator.js all projects/blog/2025-12-04-post.md https://blog.example.com/post
```

### 4. Main Publisher Script

**Location:** `scripts/social-publish.sh`

Orchestrates the entire publishing workflow.

### 5. Daemon

**Location:** `scripts/daemons/social-publisher-daemon.sh`

Background monitoring for automatic publishing.

---

## Monitoring & Logs

### Publication Status

All published posts are tracked in:

```
coordination/social/publish-status.json
```

Example:
```json
{
  "published": [
    {
      "filename": "2025-12-04-my-post.md",
      "filepath": "projects/blog/2025-12-04-my-post.md",
      "strategy": "thread",
      "published_at": "2025-12-04T15:30:00Z",
      "buffer_response": { ... }
    }
  ]
}
```

### Activity Logs

Located in `coordination/social/logs/`:

- `publish-YYYYMMDD-HHMMSS.log` - Individual publish logs
- `daemon.log` - Daemon monitoring logs

### Daemon State

Daemon tracking in `coordination/social/.daemon-state.json`:

```json
{
  "last_check": "2025-12-04T15:30:00Z",
  "watched_files": {
    "2025-12-04-my-post.md": "abc123hash"
  },
  "pending_publishes": [
    {
      "file": "projects/blog/2025-12-04-new-post.md",
      "detected_at": "2025-12-04T15:35:00Z"
    }
  ]
}
```

---

## Troubleshooting

### Buffer Authentication Failed

**Error:** `Buffer API error: Unauthorized`

**Solution:**
1. Check `BUFFER_ACCESS_TOKEN` is set correctly
2. Verify token is valid: `node lib/social/buffer-client.js validate`
3. Generate new token at https://buffer.com/developers/apps

### No Twitter Account Connected

**Error:** `No Twitter profile found in Buffer`

**Solution:**
1. Log in to Buffer
2. Go to Settings → Channels
3. Connect your Twitter account
4. Run validation again

### Tweet Generation Failed

**Error:** `Failed to generate tweets: API error`

**Solution:**
1. Check `ANTHROPIC_API_KEY` is set
2. Verify API key is valid
3. Check internet connection
4. Review rate limits on Anthropic dashboard

### Blog Post Already Published

**Warning:** `Blog post has already been published`

This is normal duplicate detection. Options:

1. Cancel and don't republish
2. Continue to publish again (when prompted)
3. Edit `coordination/social/publish-status.json` to remove entry

### Daemon Won't Start

**Error:** `Daemon already running`

**Solution:**
```bash
# Check status
./scripts/daemons/social-publisher-daemon.sh status

# Stop if running
./scripts/daemons/social-publisher-daemon.sh stop

# Remove stale PID file if needed
rm coordination/social/.daemon.pid

# Start again
./scripts/daemons/social-publisher-daemon.sh start
```

---

## Best Practices

### 1. Always Preview First

Before publishing to production, generate a preview:

```bash
./scripts/social-publish.sh --preview your-post.md thread
```

Review the generated tweets in `coordination/social/preview.txt`.

### 2. Optimize Blog Posts for Tweets

- Include a clear TL;DR section
- Use bullet points for key features
- Highlight statistics and metrics
- Keep technical terms consistent

### 3. Test Tweet Strategies

Generate all strategies to compare:

```bash
node lib/social/tweet-generator.js all your-post.md
```

Choose the one that works best for your content.

### 4. Use Daemon for Consistency

Start the daemon to automatically detect new posts:

```bash
./scripts/daemons/social-publisher-daemon.sh start
```

With `AUTO_PUBLISH=false`, you maintain manual control while getting notifications.

### 5. Monitor Buffer Dashboard

After publishing, check your Buffer dashboard:

- https://buffer.com/app
- View scheduled posts
- Edit timing if needed
- Monitor engagement

### 6. Track What Works

Review publication logs to understand:

- Which strategies get more engagement
- Optimal posting times
- Hashtag effectiveness

---

## Advanced Usage

### Custom Tweet Template

Edit `lib/social/tweet-generator.js` to customize the AI prompt:

```javascript
buildPrompt(blogPost, options) {
  // Customize tone, structure, hashtag placement, etc.
}
```

### Multi-Platform Support

The system is designed to support multiple platforms. To add LinkedIn or Bluesky:

1. Update `coordination/worker-specs/social-publisher-worker.json`
2. Add platform-specific formatting to `tweet-generator.js`
3. Extend `buffer-client.js` or create new client

### Integration with CI/CD

Trigger automatic publishing on git push:

**.github/workflows/publish-blog.yml:**

```yaml
name: Publish Blog Post

on:
  push:
    paths:
      - 'projects/blog/*.md'

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Publish to social media
        env:
          BUFFER_ACCESS_TOKEN: ${{ secrets.BUFFER_ACCESS_TOKEN }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          ./scripts/social-publish.sh --latest thread
```

---

## Testing

### Run Unit Tests

```bash
./testing/unit/social-publisher.test.sh
```

Tests:
- Blog parser functionality
- Buffer client structure
- Tweet generator structure
- Configuration validity
- Directory structure

### Run E2E Tests

```bash
# Requires API keys
export BUFFER_ACCESS_TOKEN="..."
export ANTHROPIC_API_KEY="..."

./testing/integration/social-publisher-e2e.test.sh
```

Tests:
- Complete workflow
- Blog post parsing
- AI tweet generation
- Buffer API connection
- Preview generation

---

## Support

### Documentation

- This guide: `docs/social-publisher-guide.md`
- Worker spec: `coordination/worker-specs/social-publisher-worker.json`
- Configuration: `coordination/config/social-publisher-config.json`

### Help Commands

```bash
# Publisher help
./scripts/social-publish.sh --help

# Daemon help
./scripts/daemons/social-publisher-daemon.sh

# Buffer client help
node lib/social/buffer-client.js

# Tweet generator help
node lib/social/tweet-generator.js
```

### Logs

Check logs for debugging:

```bash
# Latest publish log
ls -lt coordination/social/logs/ | head -n 2

# Daemon log
tail -f coordination/social/logs/daemon.log
```

---

## Roadmap

Planned enhancements:

- [ ] Multi-platform support (LinkedIn, Bluesky)
- [ ] Image attachment support
- [ ] Engagement tracking and analytics
- [ ] A/B testing for tweet strategies
- [ ] Scheduling optimization (best time to post)
- [ ] Thread visualization
- [ ] Webhook notifications
- [ ] Dashboard UI

---

## License

Part of the Cortex autonomous agent system.

---

**Happy Publishing! 🚀**
