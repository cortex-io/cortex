#!/bin/bash

##############################################################################
# Social Publisher - Main Orchestration Script
#
# Publishes blog posts to social media platforms via Buffer.
# Handles blog parsing, tweet generation, and publishing workflow.
#
# Usage:
#   ./scripts/social-publish.sh <blog-file> [options]
#   ./scripts/social-publish.sh --latest
#   ./scripts/social-publish.sh --preview <blog-file>
##############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load configuration
CONFIG_FILE="$CORTEX_ROOT/coordination/config/social-publisher-config.json"
STATUS_FILE="$CORTEX_ROOT/coordination/social/publish-status.json"
PREVIEW_FILE="$CORTEX_ROOT/coordination/social/preview.txt"
LOG_FILE="$CORTEX_ROOT/coordination/social/logs/publish-$(date +%Y%m%d-%H%M%S).log"

# Node.js modules
BUFFER_CLIENT="$CORTEX_ROOT/lib/social/buffer-client.js"
BLOG_PARSER="$CORTEX_ROOT/lib/social/blog-parser.js"
TWEET_GENERATOR="$CORTEX_ROOT/lib/social/tweet-generator.js"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $*" | tee -a "$LOG_FILE" >&2
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $*" | tee -a "$LOG_FILE"
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO:${NC} $*" | tee -a "$LOG_FILE"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."

    if [[ ! -f "$CONFIG_FILE" ]]; then
        error "Configuration file not found: $CONFIG_FILE"
        exit 1
    fi

    if [[ -z "${BUFFER_ACCESS_TOKEN:-}" ]]; then
        error "BUFFER_ACCESS_TOKEN environment variable not set"
        error "Please set your Buffer API access token"
        exit 1
    fi

    if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
        error "ANTHROPIC_API_KEY environment variable not set"
        error "Please set your Anthropic API key for AI tweet generation"
        exit 1
    fi

    if ! command -v node &> /dev/null; then
        error "Node.js is required but not installed"
        exit 1
    fi

    log "✓ Prerequisites check passed"
}

# Validate Buffer credentials
validate_buffer() {
    log "Validating Buffer credentials..."

    local validation
    validation=$(node "$BUFFER_CLIENT" validate 2>&1)

    if echo "$validation" | grep -q '"valid": true'; then
        local twitter_accounts
        twitter_accounts=$(echo "$validation" | jq -r '.twitter_accounts // 0')
        log "✓ Buffer credentials valid ($twitter_accounts Twitter account(s) connected)"
        return 0
    else
        error "Buffer credentials invalid or no Twitter account connected"
        error "$validation"
        return 1
    fi
}

# Parse blog post
parse_blog_post() {
    local blog_file="$1"

    if [[ ! -f "$blog_file" ]]; then
        error "Blog file not found: $blog_file"
        exit 1
    fi

    log "Parsing blog post: $blog_file"

    local parsed
    parsed=$(node "$BLOG_PARSER" parse "$blog_file" 2>&1)

    if [[ $? -ne 0 ]]; then
        error "Failed to parse blog post"
        error "$parsed"
        exit 1
    fi

    echo "$parsed"
}

# Generate tweets
generate_tweets() {
    local blog_file="$1"
    local strategy="${2:-thread}"
    local blog_url="${3:-}"

    log "Generating tweets using strategy: $strategy"

    local result
    result=$(node "$TWEET_GENERATOR" generate "$blog_file" "$strategy" "$blog_url" 2>&1)

    if [[ $? -ne 0 ]]; then
        error "Failed to generate tweets"
        error "$result"
        exit 1
    fi

    echo "$result"
}

# Preview tweets
preview_tweets() {
    local blog_file="$1"
    local strategy="${2:-thread}"
    local blog_url="${3:-}"

    check_prerequisites

    info "Generating tweet preview..."

    local parsed
    parsed=$(parse_blog_post "$blog_file")

    local title
    title=$(echo "$parsed" | jq -r '.title')

    echo ""
    echo "========================================"
    echo "BLOG POST: $title"
    echo "========================================"
    echo ""

    # Generate and display tweets
    local tweet_output
    tweet_output=$(node "$TWEET_GENERATOR" generate "$blog_file" "$strategy" "$blog_url")

    echo "$tweet_output"

    # Save to preview file
    echo "$tweet_output" > "$PREVIEW_FILE"

    echo ""
    info "Preview saved to: $PREVIEW_FILE"
}

# Check if blog post already published
is_already_published() {
    local blog_file="$1"

    if [[ ! -f "$STATUS_FILE" ]]; then
        echo "false"
        return
    fi

    local filename
    filename=$(basename "$blog_file")

    if jq -e ".published[] | select(.filename == \"$filename\")" "$STATUS_FILE" &> /dev/null; then
        echo "true"
    else
        echo "false"
    fi
}

# Record publication
record_publication() {
    local blog_file="$1"
    local strategy="$2"
    local buffer_response="$3"

    local filename
    filename=$(basename "$blog_file")

    local record
    record=$(jq -n \
        --arg filename "$filename" \
        --arg filepath "$blog_file" \
        --arg strategy "$strategy" \
        --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --argjson buffer_response "$buffer_response" \
        '{
            filename: $filename,
            filepath: $filepath,
            strategy: $strategy,
            published_at: $timestamp,
            buffer_response: $buffer_response
        }')

    # Initialize status file if it doesn't exist
    if [[ ! -f "$STATUS_FILE" ]]; then
        echo '{"published": []}' > "$STATUS_FILE"
    fi

    # Add to status file
    local updated
    updated=$(jq ".published += [$record]" "$STATUS_FILE")
    echo "$updated" > "$STATUS_FILE"

    log "✓ Publication recorded in status file"
}

# Publish to Buffer
publish_to_buffer() {
    local blog_file="$1"
    local strategy="${2:-thread}"
    local blog_url="${3:-}"
    local post_now="${4:-false}"

    log "Starting publication workflow..."

    # Check prerequisites
    check_prerequisites

    # Validate Buffer
    if ! validate_buffer; then
        exit 1
    fi

    # Check if already published
    local already_published
    already_published=$(is_already_published "$blog_file")

    if [[ "$already_published" == "true" ]]; then
        warn "Blog post has already been published"
        read -p "Continue anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            info "Publication cancelled"
            exit 0
        fi
    fi

    # Parse blog post
    local parsed
    parsed=$(parse_blog_post "$blog_file")

    local title
    title=$(echo "$parsed" | jq -r '.title')

    log "Blog post: $title"

    # Generate tweets
    info "Generating optimized tweet content..."

    local temp_output
    temp_output=$(mktemp)

    node "$TWEET_GENERATOR" generate "$blog_file" "$strategy" "$blog_url" > "$temp_output" 2>&1

    if [[ $? -ne 0 ]]; then
        error "Tweet generation failed"
        cat "$temp_output"
        rm "$temp_output"
        exit 1
    fi

    # Display preview
    echo ""
    echo "========================================"
    echo "PREVIEW: Generated Tweets"
    echo "========================================"
    cat "$temp_output"
    echo "========================================"
    echo ""

    # Confirm publication
    if [[ "$post_now" != "true" ]]; then
        read -p "Publish these tweets to Buffer? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            info "Publication cancelled"
            rm "$temp_output"
            exit 0
        fi
    fi

    # Extract tweets from output
    # Look for lines between "=== GENERATED TWEETS ===" and "=== METADATA ==="
    local tweets_section
    tweets_section=$(sed -n '/=== GENERATED TWEETS ===/,/=== METADATA ===/p' "$temp_output" | sed '1d;$d')

    # Split into individual tweets (separated by ---)
    local tweets=()
    while IFS= read -r line; do
        if [[ "$line" == "---" ]]; then
            continue
        fi
        if [[ -n "$line" ]]; then
            tweets+=("$line")
        fi
    done <<< "$tweets_section"

    rm "$temp_output"

    if [[ ${#tweets[@]} -eq 0 ]]; then
        error "No tweets extracted from generation output"
        exit 1
    fi

    log "Publishing ${#tweets[@]} tweet(s) to Buffer..."

    # Publish based on strategy
    if [[ "$strategy" == "single_tweet" ]]; then
        # Single tweet
        local result
        result=$(node "$BUFFER_CLIENT" post "${tweets[0]}")

        if [[ $? -eq 0 ]]; then
            log "✓ Tweet published successfully"
            record_publication "$blog_file" "$strategy" "$result"
        else
            error "Failed to publish tweet"
            error "$result"
            exit 1
        fi
    else
        # Thread
        local thread_args=("${tweets[@]}")
        local result
        result=$(node "$BUFFER_CLIENT" thread "${thread_args[@]}")

        if [[ $? -eq 0 ]]; then
            log "✓ Thread published successfully (${#tweets[@]} tweets)"
            record_publication "$blog_file" "$strategy" "$result"
        else
            error "Failed to publish thread"
            error "$result"
            exit 1
        fi
    fi

    log "Publication complete!"
    log "Check Buffer dashboard: https://buffer.com/app"
}

# Publish latest blog post
publish_latest() {
    local blog_dir="$CORTEX_ROOT/projects/blog"
    local strategy="${1:-thread}"

    log "Finding latest blog post..."

    local latest_file
    latest_file=$(find "$blog_dir" -name "*.md" ! -name "README.md" -type f -print0 | xargs -0 ls -t | head -n 1)

    if [[ -z "$latest_file" ]]; then
        error "No blog posts found in $blog_dir"
        exit 1
    fi

    log "Latest blog post: $latest_file"

    publish_to_buffer "$latest_file" "$strategy"
}

# Show usage
usage() {
    cat <<EOF
Cortex Social Publisher v1.0.0

Usage:
  ./scripts/social-publish.sh <blog-file> [strategy] [blog-url]
  ./scripts/social-publish.sh --latest [strategy]
  ./scripts/social-publish.sh --preview <blog-file> [strategy] [blog-url]
  ./scripts/social-publish.sh --help

Arguments:
  blog-file    Path to markdown blog post file
  strategy     Tweet generation strategy (default: thread)
               - single_tweet: One tweet
               - thread: Multi-tweet thread
               - thread_with_summary: Thread with executive summary
  blog-url     URL to blog post (optional)

Options:
  --latest     Publish the most recent blog post
  --preview    Generate preview without publishing
  --help       Show this help message

Environment Variables:
  BUFFER_ACCESS_TOKEN   Required: Your Buffer API access token
  BUFFER_PROFILE_ID     Optional: Default Buffer profile ID
  ANTHROPIC_API_KEY     Required: Your Anthropic API key

Examples:
  # Publish specific post as thread
  ./scripts/social-publish.sh projects/blog/2025-12-04-my-post.md

  # Publish latest post with URL
  ./scripts/social-publish.sh --latest thread https://blog.example.com/my-post

  # Preview single tweet
  ./scripts/social-publish.sh --preview projects/blog/2025-12-04-my-post.md single_tweet

Setup:
  1. Get Buffer access token: https://buffer.com/developers/apps
  2. Set environment variables in your shell or .env file
  3. Run validation: node lib/social/buffer-client.js validate

EOF
}

# Main execution
main() {
    case "${1:-}" in
        --help|-h)
            usage
            exit 0
            ;;
        --latest)
            publish_latest "${2:-thread}"
            ;;
        --preview)
            if [[ -z "${2:-}" ]]; then
                error "Blog file required for preview"
                usage
                exit 1
            fi
            preview_tweets "$2" "${3:-thread}" "${4:-}"
            ;;
        "")
            error "Blog file required"
            usage
            exit 1
            ;;
        *)
            publish_to_buffer "$1" "${2:-thread}" "${3:-}" "${4:-false}"
            ;;
    esac
}

main "$@"
