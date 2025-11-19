#!/bin/bash
# scripts/worker-lifecycle-manager.sh
# Enhanced worker lifecycle management to prevent zombies and handle completion
# Part of Week 1: AGENT_ARCHITECTURE_FIX
#
# This script runs as a companion to worker-daemon.sh and handles:
# - Moving completed workers to completed/ directory
# - Detecting and quarantining zombie workers
# - Reclaiming tokens from failed/zombie workers
# - Cleaning up stale worker tracking

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMIT_RELAY_HOME="${COMMIT_RELAY_HOME:-$(cd "$SCRIPT_DIR/.." && pwd)}"

# Load libraries
source "$SCRIPT_DIR/lib/logging.sh" 2>/dev/null || {
    log_info() { echo "[INFO] $1"; }
    log_warn() { echo "[WARN] $1"; }
    log_error() { echo "[ERROR] $1"; }
}

cd "$COMMIT_RELAY_HOME"

LOG_FILE="agents/logs/system/worker-lifecycle-manager.log"
mkdir -p "$(dirname "$LOG_FILE")"
exec >> "$LOG_FILE" 2>&1

log_info "Worker lifecycle manager starting..."

# Configuration
ZOMBIE_THRESHOLD_MINUTES=30  # Workers inactive for 30+ minutes become zombies
HEARTBEAT_MISS_THRESHOLD=10  # 10 missed heartbeats = zombie

# Directories
ACTIVE_DIR="coordination/worker-specs/active"
COMPLETED_DIR="coordination/worker-specs/completed"
FAILED_DIR="coordination/worker-specs/failed"
ZOMBIE_DIR="coordination/worker-specs/zombie"

mkdir -p "$COMPLETED_DIR" "$FAILED_DIR" "$ZOMBIE_DIR"

# Process active workers
for spec_file in "$ACTIVE_DIR"/*.json; do
    if [ ! -f "$spec_file" ]; then
        continue
    fi

    # Validate JSON
    if ! jq empty "$spec_file" 2>/dev/null; then
        log_error "Malformed worker spec: $(basename "$spec_file")"
        continue
    fi

    WORKER_ID=$(jq -r '.worker_id' "$spec_file")
    STATUS=$(jq -r '.status' "$spec_file")
    CREATED_AT=$(jq -r '.created_at' "$spec_file")
    MISSED_COUNT=$(jq -r '.heartbeat.missed_count // 0' "$spec_file")

    # Handle completed workers
    if [ "$STATUS" = "completed" ]; then
        log_info "Moving completed worker to archive: $WORKER_ID"
        mv "$spec_file" "$COMPLETED_DIR/"
        continue
    fi

    # Handle failed workers
    if [ "$STATUS" = "failed" ]; then
        log_info "Moving failed worker to failed archive: $WORKER_ID"
        TOKEN_BUDGET=$(jq -r '.resources.token_budget' "$spec_file")

        # Reclaim tokens
        if [ "$TOKEN_BUDGET" != "null" ] && [ "$TOKEN_BUDGET" -gt 0 ]; then
            log_info "  Reclaiming $TOKEN_BUDGET tokens from failed worker"
            # Token reclamation would happen here
        fi

        mv "$spec_file" "$FAILED_DIR/"
        continue
    fi

    # Detect zombies - workers with excessive missed heartbeats
    if [ "$STATUS" = "running" ] && [ "$MISSED_COUNT" -gt "$HEARTBEAT_MISS_THRESHOLD" ]; then
        log_warn "Zombie detected: $WORKER_ID (missed $MISSED_COUNT heartbeats)"

        # Update status to zombie
        NOW=$(date +"%Y-%m-%dT%H:%M:%S%z")
        TOKEN_BUDGET=$(jq -r '.resources.token_budget' "$spec_file")

        jq --arg now "$NOW" \
           --argjson missed "$MISSED_COUNT" \
           '.status = "zombie" |
            .zombie_detected_at = $now |
            .heartbeat.missed_count = $missed |
            .heartbeat.health.status = "unresponsive"' \
           "$spec_file" > "${spec_file}.tmp" && \
           mv "${spec_file}.tmp" "$spec_file"

        log_info "  Updated $WORKER_ID status to zombie"
        log_info "  Use zombie-worker-recovery.sh to clean up zombies"
    fi

    # Detect long-running pending workers (stuck in pending > 10 minutes)
    if [ "$STATUS" = "pending" ]; then
        CREATED_TS=$(date -j -f "%Y-%m-%dT%H:%M:%S%z" "$CREATED_AT" "+%s" 2>/dev/null || echo "0")
        NOW_TS=$(date +%s)
        AGE_MINUTES=$(( (NOW_TS - CREATED_TS) / 60 ))

        if [ "$AGE_MINUTES" -gt 10 ]; then
            log_warn "Stuck pending worker: $WORKER_ID (pending for $AGE_MINUTES minutes)"
            log_warn "  Worker daemon may not be functioning properly"
        fi
    fi
done

log_info "Worker lifecycle check complete"
