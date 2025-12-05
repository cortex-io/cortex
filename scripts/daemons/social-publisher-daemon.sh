#!/bin/bash

##############################################################################
# Social Publisher Daemon
#
# Monitors blog directory for new posts and automatically publishes them
# to social media via Buffer. Runs continuously in the background.
#
# Usage:
#   ./scripts/daemons/social-publisher-daemon.sh [start|stop|status]
##############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Configuration
CONFIG_FILE="$CORTEX_ROOT/coordination/config/social-publisher-config.json"
PID_FILE="$CORTEX_ROOT/coordination/social/.daemon.pid"
LOG_FILE="$CORTEX_ROOT/coordination/social/logs/daemon.log"
STATE_FILE="$CORTEX_ROOT/coordination/social/.daemon-state.json"

# Watch settings
BLOG_DIR="$CORTEX_ROOT/projects/blog"
CHECK_INTERVAL=300 # 5 minutes in seconds
AUTO_PUBLISH=false # Set to true for fully automatic publishing

# Social publisher script
PUBLISHER="$CORTEX_ROOT/scripts/social-publish.sh"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $*" | tee -a "$LOG_FILE" >&2
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO:${NC} $*" | tee -a "$LOG_FILE"
}

# Initialize state file
init_state() {
    if [[ ! -f "$STATE_FILE" ]]; then
        echo '{"last_check": null, "watched_files": {}, "pending_publishes": []}' > "$STATE_FILE"
    fi
}

# Get file hash
get_file_hash() {
    local file="$1"
    if [[ -f "$file" ]]; then
        if command -v md5 &> /dev/null; then
            md5 -q "$file"
        elif command -v md5sum &> /dev/null; then
            md5sum "$file" | awk '{print $1}'
        else
            stat -f %m "$file" # Fall back to modification time
        fi
    else
        echo "null"
    fi
}

# Check for new or modified blog posts
check_for_changes() {
    log "Checking for blog post changes..."

    local changes_detected=false
    local new_posts=()

    # Get current state
    local watched_files
    watched_files=$(jq -r '.watched_files // {}' "$STATE_FILE")

    # Scan blog directory
    while IFS= read -r -d '' file; do
        local filename
        filename=$(basename "$file")

        # Skip README and images
        if [[ "$filename" == "README.md" ]] || [[ "$file" == *"/images/"* ]]; then
            continue
        fi

        local current_hash
        current_hash=$(get_file_hash "$file")

        local stored_hash
        stored_hash=$(echo "$watched_files" | jq -r ".[\"$filename\"] // \"null\"")

        if [[ "$stored_hash" == "null" ]]; then
            info "New blog post detected: $filename"
            new_posts+=("$file")
            changes_detected=true
        elif [[ "$stored_hash" != "$current_hash" ]]; then
            info "Blog post modified: $filename"
            new_posts+=("$file")
            changes_detected=true
        fi

        # Update hash in state
        watched_files=$(echo "$watched_files" | jq --arg file "$filename" --arg hash "$current_hash" '.[$file] = $hash')

    done < <(find "$BLOG_DIR" -name "*.md" -type f -print0)

    # Update state file
    local updated_state
    updated_state=$(jq \
        --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --argjson watched "$watched_files" \
        '.last_check = $timestamp | .watched_files = $watched' \
        "$STATE_FILE")
    echo "$updated_state" > "$STATE_FILE"

    # Handle detected changes
    if [[ "$changes_detected" == true ]]; then
        for post in "${new_posts[@]}"; do
            handle_new_post "$post"
        done
    else
        info "No changes detected"
    fi
}

# Handle new blog post
handle_new_post() {
    local post_file="$1"
    local filename
    filename=$(basename "$post_file")

    log "Processing new post: $filename"

    if [[ "$AUTO_PUBLISH" == true ]]; then
        info "Auto-publishing enabled, publishing to Buffer..."

        # Publish automatically
        if "$PUBLISHER" "$post_file" thread "" true; then
            log "✓ Successfully auto-published: $filename"
        else
            error "Failed to auto-publish: $filename"
        fi
    else
        # Add to pending queue
        info "Auto-publish disabled, adding to pending queue"

        local pending
        pending=$(jq \
            --arg file "$post_file" \
            --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
            '.pending_publishes += [{file: $file, detected_at: $timestamp}]' \
            "$STATE_FILE")
        echo "$pending" > "$STATE_FILE"

        info "Run './scripts/social-publish.sh $post_file' to publish"
    fi
}

# Show pending publishes
show_pending() {
    init_state

    local pending
    pending=$(jq -r '.pending_publishes // []' "$STATE_FILE")

    local count
    count=$(echo "$pending" | jq 'length')

    if [[ "$count" -eq 0 ]]; then
        info "No pending blog posts to publish"
    else
        echo ""
        echo "========================================"
        echo "Pending Blog Posts ($count)"
        echo "========================================"
        echo "$pending" | jq -r '.[] | "  • \(.file)\n    Detected: \(.detected_at)"'
        echo ""
        echo "To publish, run:"
        echo "  ./scripts/social-publish.sh <file>"
    fi
}

# Daemon main loop
daemon_loop() {
    log "Social publisher daemon started (PID: $$)"
    log "Watching: $BLOG_DIR"
    log "Check interval: ${CHECK_INTERVAL}s"
    log "Auto-publish: $AUTO_PUBLISH"

    init_state

    while true; do
        check_for_changes

        info "Sleeping for ${CHECK_INTERVAL}s..."
        sleep "$CHECK_INTERVAL"
    done
}

# Start daemon
start_daemon() {
    if [[ -f "$PID_FILE" ]]; then
        local pid
        pid=$(cat "$PID_FILE")

        if ps -p "$pid" > /dev/null 2>&1; then
            error "Daemon already running (PID: $pid)"
            exit 1
        else
            warn "Stale PID file found, removing..."
            rm "$PID_FILE"
        fi
    fi

    log "Starting social publisher daemon..."

    # Create log directory
    mkdir -p "$(dirname "$LOG_FILE")"

    # Start daemon in background
    nohup "$0" _loop >> "$LOG_FILE" 2>&1 &
    local pid=$!

    echo "$pid" > "$PID_FILE"

    log "Daemon started (PID: $pid)"
    info "Logs: tail -f $LOG_FILE"
}

# Stop daemon
stop_daemon() {
    if [[ ! -f "$PID_FILE" ]]; then
        error "Daemon not running (no PID file)"
        exit 1
    fi

    local pid
    pid=$(cat "$PID_FILE")

    if ps -p "$pid" > /dev/null 2>&1; then
        log "Stopping daemon (PID: $pid)..."
        kill "$pid"

        # Wait for graceful shutdown
        local count=0
        while ps -p "$pid" > /dev/null 2>&1 && [[ $count -lt 10 ]]; do
            sleep 1
            count=$((count + 1))
        done

        if ps -p "$pid" > /dev/null 2>&1; then
            warn "Daemon did not stop gracefully, forcing..."
            kill -9 "$pid"
        fi

        rm "$PID_FILE"
        log "Daemon stopped"
    else
        warn "Daemon not running (stale PID file)"
        rm "$PID_FILE"
    fi
}

# Check daemon status
status_daemon() {
    if [[ ! -f "$PID_FILE" ]]; then
        echo "Status: Not running"
        exit 1
    fi

    local pid
    pid=$(cat "$PID_FILE")

    if ps -p "$pid" > /dev/null 2>&1; then
        echo "Status: Running (PID: $pid)"

        if [[ -f "$STATE_FILE" ]]; then
            local last_check
            last_check=$(jq -r '.last_check // "Never"' "$STATE_FILE")
            echo "Last check: $last_check"

            local watched_count
            watched_count=$(jq '.watched_files | length' "$STATE_FILE")
            echo "Watching: $watched_count file(s)"

            local pending_count
            pending_count=$(jq '.pending_publishes | length' "$STATE_FILE")
            echo "Pending: $pending_count post(s)"
        fi

        exit 0
    else
        echo "Status: Not running (stale PID file)"
        rm "$PID_FILE"
        exit 1
    fi
}

# Main
case "${1:-}" in
    start)
        start_daemon
        ;;
    stop)
        stop_daemon
        ;;
    restart)
        stop_daemon
        sleep 2
        start_daemon
        ;;
    status)
        status_daemon
        ;;
    pending)
        show_pending
        ;;
    _loop)
        # Internal: daemon loop
        daemon_loop
        ;;
    *)
        cat <<EOF
Cortex Social Publisher Daemon

Usage:
  ./scripts/daemons/social-publisher-daemon.sh [command]

Commands:
  start      Start the daemon
  stop       Stop the daemon
  restart    Restart the daemon
  status     Check daemon status
  pending    Show pending blog posts

The daemon monitors projects/blog/ for new or modified markdown files
and either auto-publishes them (if AUTO_PUBLISH=true) or adds them
to a pending queue for manual review.

Configuration:
  Edit this script to change:
  - CHECK_INTERVAL (default: 300s / 5min)
  - AUTO_PUBLISH (default: false)

EOF
        ;;
esac
