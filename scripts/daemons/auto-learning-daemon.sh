#!/usr/bin/env bash
# scripts/daemons/auto-learning-daemon.sh
#
# ============================================================================
# DEPRECATED: This daemon has been replaced by event-driven architecture
# Status: DEPRECATED as of 2025-12-01
# Replacement: scripts/events/handlers/on-learning-pattern.sh
# Event Type: learning.pattern_detected
# Documentation: scripts/daemons/DEPRECATED.md
# ============================================================================
#
# WARNING: This script is deprecated and should not be used in new code.
# It is maintained for compatibility only and will be removed in a future version.
#
# To migrate to the event-driven replacement:
# 1. Stop this daemon if running
# 2. Start event dispatcher: ./scripts/events/event-dispatcher.sh
# 3. Emit events instead of calling this daemon
# 4. See DEPRECATED.md for migration instructions
#
# ============================================================================
#
# Original script follows below:
#
# Auto-Learning Daemon
# Continuously learns from task outcomes and triggers fine-tuning when ready

set -euo pipefail

DAEMON_NAME="auto-learning-daemon"
LOG_FILE="coordination/logs/${DAEMON_NAME}.log"
PID_FILE="/tmp/${DAEMON_NAME}.pid"

# Ensure log directory exists
mkdir -p coordination/logs

# Check if daemon is already running
if [[ -f "$PID_FILE" ]]; then
    OLD_PID=$(cat "$PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
        echo "Daemon already running with PID $OLD_PID"
        exit 1
    fi
fi

# Write PID
echo $$ > "$PID_FILE"

log() {
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $1" | tee -a "$LOG_FILE"
}

cleanup() {
    log "Shutting down auto-learning daemon"
    rm -f "$PID_FILE"
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

log "Starting auto-learning daemon"

# Configuration
COLLECTION_INTERVAL=3600    # Collect every hour (3600 seconds)
TRAINING_CHECK_INTERVAL=86400  # Check training readiness daily (86400 seconds)

last_collection=0
last_training_check=0

while true; do
    current_time=$(date +%s)

    # ==================================================================
    # STEP 1: Collect high-quality outcomes from medallion silver layer
    # ==================================================================

    if [[ $((current_time - last_collection)) -ge $COLLECTION_INTERVAL ]]; then
        log "=== Collecting high-quality task outcomes ==="

        # Run HQ outcome collector
        python3 llm-mesh/auto-learning/hq-outcome-collector.py >> "$LOG_FILE" 2>&1 || {
            log "ERROR: HQ collection failed"
        }

        last_collection=$current_time
        log "HQ outcome collection complete"
    fi

    # ==================================================================
    # STEP 2: Check if ready for fine-tuning and trigger if needed
    # ==================================================================

    if [[ $((current_time - last_training_check)) -ge $TRAINING_CHECK_INTERVAL ]]; then
        log "=== Checking fine-tuning readiness ==="

        # Get fine-tuning status
        status=$(python3 llm-mesh/auto-learning/auto-fine-tune.py status 2>/dev/null || echo '{}')

        # Extract readiness
        is_ready=$(echo "$status" | jq -r '.data_collection.ready // false')
        training_count=$(echo "$status" | jq -r '.data_collection.training_examples // 0')

        log "Training examples collected: $training_count"

        if [[ "$is_ready" == "true" ]]; then
            # Check if already triggered
            has_triggered=$(echo "$status" | jq -r '.fine_tuning.has_triggered // false')

            if [[ "$has_triggered" == "false" ]]; then
                log "🎯 READY FOR FINE-TUNING! Triggering automated fine-tuning..."

                # Trigger fine-tuning
                python3 llm-mesh/auto-learning/auto-fine-tune.py trigger >> "$LOG_FILE" 2>&1 || {
                    log "ERROR: Fine-tuning trigger failed"
                }

                log "Fine-tuning triggered successfully"

                # TODO: Implement automated deployment
                # Once fine-tuned model is ready:
                # 1. Deploy as challenger
                # 2. Start A/B test (90/10 split)
                # 3. Monitor performance
                # 4. Promote if better than champion

            else
                log "Fine-tuning already triggered, monitoring job..."
            fi
        else
            progress=$(echo "$status" | jq -r '.data_collection.progress_percent // 0')
            log "Fine-tuning not ready yet (${progress}% progress)"
        fi

        last_training_check=$current_time
    fi

    # ==================================================================
    # STEP 3: Process medallion pipeline daily
    # ==================================================================

    # Check if we should run medallion pipeline (once per day at 2 AM)
    current_hour=$(date +%H)

    if [[ "$current_hour" == "02" ]]; then
        # Check if we've already run today
        last_medallion_run=$(cat /tmp/last_medallion_run 2>/dev/null || echo "0")
        current_date=$(date +%Y%m%d)

        if [[ "$last_medallion_run" != "$current_date" ]]; then
            log "=== Running daily medallion pipeline ==="

            source scripts/lib/medallion.sh
            run_medallion_pipeline "$(date +%Y%m%d)" >> "$LOG_FILE" 2>&1 || {
                log "ERROR: Medallion pipeline failed"
            }

            echo "$current_date" > /tmp/last_medallion_run
            log "Medallion pipeline complete"
        fi
    fi

    # ==================================================================
    # STEP 4: Monitor and report
    # ==================================================================

    # Log status every 6 hours
    hours_since_start=$(( (current_time - $(stat -f %B "$PID_FILE" 2>/dev/null || stat -c %W "$PID_FILE")) / 3600 ))

    if [[ $((hours_since_start % 6)) -eq 0 ]] && [[ $hours_since_start -gt 0 ]]; then
        log "=== Auto-Learning Status ==="
        log "Uptime: ${hours_since_start} hours"
        log "Training examples: $training_count"
        log "Next collection: $((COLLECTION_INTERVAL - (current_time - last_collection)))s"
        log "Next training check: $((TRAINING_CHECK_INTERVAL - (current_time - last_training_check)))s"
    fi

    # Sleep for 60 seconds before next iteration
    sleep 60
done
