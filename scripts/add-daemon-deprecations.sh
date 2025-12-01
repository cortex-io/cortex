#!/usr/bin/env bash
# Temporary script to add deprecation notices to all daemon files

set -euo pipefail

CORTEX_HOME="/Users/ryandahlberg/Projects/cortex"
DAEMONS_DIR="$CORTEX_HOME/scripts/daemons"

add_deprecation_notice() {
    local daemon="$1"
    local replacement="$2"
    local event_type="$3"
    local daemon_name="$(basename "$daemon")"

    echo "Adding deprecation notice to $daemon_name..."

    # Create temp file with deprecation notice
    cat > "${daemon}.tmp" <<EOF
#!/usr/bin/env bash
# scripts/daemons/$daemon_name
#
# ============================================================================
# DEPRECATED: This daemon has been replaced by event-driven architecture
# Status: DEPRECATED as of 2025-12-01
# Replacement: scripts/events/handlers/$replacement
# Event Type: $event_type
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
EOF

    # Append original file content (skip shebang line)
    tail -n +2 "$daemon" >> "${daemon}.tmp"

    # Replace original
    mv "${daemon}.tmp" "$daemon"
    chmod +x "$daemon"

    echo "  ✓ Updated $daemon_name"
}

echo "Adding deprecation notices to daemon files..."
echo

# Skip heartbeat-monitor-daemon.sh (already updated manually)

# Process each daemon
add_deprecation_notice "$DAEMONS_DIR/cleanup-daemon.sh" "on-cleanup-needed.sh" "system.cleanup_needed"
add_deprecation_notice "$DAEMONS_DIR/workflow-daemon.sh" "on-worker-complete.sh" "task.completed, task.failed"
add_deprecation_notice "$DAEMONS_DIR/failure-pattern-daemon.sh" "on-task-failure.sh" "task.failed"
add_deprecation_notice "$DAEMONS_DIR/auto-fix-daemon.sh" "on-task-failure.sh (includes auto-fix)" "task.failed"
add_deprecation_notice "$DAEMONS_DIR/auto-learning-daemon.sh" "on-learning-pattern.sh" "learning.pattern_detected"
add_deprecation_notice "$DAEMONS_DIR/moe-learning-daemon.sh" "on-routing-decision.sh" "routing.decision_made"
add_deprecation_notice "$DAEMONS_DIR/anomaly-detector-daemon.sh" "on-worker-heartbeat.sh + on-task-failure.sh" "worker.heartbeat, task.failed"
add_deprecation_notice "$DAEMONS_DIR/security-scan-daemon.sh" "on-security-alert.sh" "security.scan_completed"
add_deprecation_notice "$DAEMONS_DIR/threat-intel-daemon.sh" "on-security-alert.sh" "security.vulnerability_found"
add_deprecation_notice "$DAEMONS_DIR/backup-daemon.sh" "on-backup-scheduled.sh (create this handler)" "system.backup_scheduled"
add_deprecation_notice "$DAEMONS_DIR/freshness-daemon.sh" "on-cleanup-needed.sh" "system.freshness_check"
add_deprecation_notice "$DAEMONS_DIR/metrics-aggregator-daemon.sh" "Multiple handlers (real-time aggregation)" "All event types"
add_deprecation_notice "$DAEMONS_DIR/observability-hub-daemon.sh" "Event logs + AI notebooks" "All event types"
add_deprecation_notice "$DAEMONS_DIR/ingestion-daemon.sh" "event-dispatcher.sh" "All event types"
add_deprecation_notice "$DAEMONS_DIR/worker-restart-daemon.sh" "on-worker-heartbeat.sh (includes restart)" "worker.failed, worker.heartbeat"

echo
echo "✓ Deprecation notices added to all daemon files!"
echo "See scripts/daemons/DEPRECATED.md for full documentation."
