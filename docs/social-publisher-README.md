# Social Publisher - Quick Start

Automatically publish blog posts to Twitter via Buffer with AI-powered content generation.

## Setup (5 minutes)

### 1. Get API Credentials

**Buffer Token:**
- Go to https://buffer.com/developers/apps
- Create app → Generate access token
- Connect your Twitter account at https://buffer.com

**Anthropic API Key:**
- Already configured for Cortex (uses `ANTHROPIC_API_KEY`)

### 2. Set Environment Variables

Add to `~/.zshrc` or `~/.bashrc`:

```bash
export BUFFER_ACCESS_TOKEN="your_buffer_token_here"
export ANTHROPIC_API_KEY="your_anthropic_key_here"  # Should already exist
```

Then: `source ~/.zshrc`

### 3. Validate Setup

```bash
./scripts/setup-social-publisher.sh
```

## Usage

### Publish Latest Blog Post

```bash
./scripts/social-publish.sh --latest
```

### Preview Without Publishing

```bash
./scripts/social-publish.sh --preview projects/blog/your-post.md
```

### Publish Specific Post

```bash
./scripts/social-publish.sh projects/blog/2025-12-04-my-post.md thread https://blog.example.com/post
```

### Automatic Monitoring

```bash
# Start daemon (watches for new posts)
./scripts/daemons/social-publisher-daemon.sh start

# Check status
./scripts/daemons/social-publisher-daemon.sh status

# Show pending posts
./scripts/daemons/social-publisher-daemon.sh pending

# Stop daemon
./scripts/daemons/social-publisher-daemon.sh stop
```

## Tweet Strategies

1. **single_tweet** - One punchy tweet (≤280 chars)
2. **thread** - Multi-tweet thread (3-10 tweets)
3. **thread_with_summary** - Structured thread with stats

Example:
```bash
./scripts/social-publish.sh --preview your-post.md thread_with_summary
```

## Components

- **Buffer Client** - `lib/social/buffer-client.js`
- **Blog Parser** - `lib/social/blog-parser.js`
- **Tweet Generator** - `lib/social/tweet-generator.js`
- **Publisher** - `scripts/social-publish.sh`
- **Daemon** - `scripts/daemons/social-publisher-daemon.sh`

## Testing

```bash
# Unit tests
./testing/unit/social-publisher.test.sh

# E2E tests (requires API keys)
./testing/integration/social-publisher-e2e.test.sh
```

## Monitoring

- **Status:** `coordination/social/publish-status.json`
- **Logs:** `coordination/social/logs/`
- **Previews:** `coordination/social/preview.txt`

## Help

```bash
./scripts/social-publish.sh --help
```

## Full Documentation

See: [docs/social-publisher-guide.md](./social-publisher-guide.md)

## Features

✅ AI-powered tweet generation (Claude Sonnet 4.5)
✅ Smart content extraction (key points, stats, tags)
✅ Multiple publishing strategies
✅ Automatic monitoring daemon
✅ Duplicate detection
✅ Preview before publish
✅ Publication tracking & logs
✅ Full test coverage

---

**Quick Test:**

```bash
# Test with your latest blog post
./scripts/social-publish.sh --preview --latest

# Check the preview
cat coordination/social/preview.txt
```
