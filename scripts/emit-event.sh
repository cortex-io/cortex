#!/bin/bash
# Universal Event Emission Script
# Single Source of Truth: coordination/dashboard-events.jsonl
#
# Usage: ./scripts/emit-event.sh <event_type> <data_json> [source]
#
# Examples:
#   ./scripts/emit-event.sh task_created '{"task_id":"task-001","title":"Test Task"}' "coordinator"
#   ./scripts/emit-event.sh worker_spawned '{"worker_id":"worker-001"}' "development-master"

set -euo pipefail

# Configuration
EVENTS_FILE="/Users/ryandahlberg/commit-relay/coordination/dashboard-events.jsonl"

# Parse arguments
EVENT_TYPE="${1:-}"
EVENT_DATA="${2:-{}}"
EVENT_SOURCE="${3:-system}"

if [ -z "$EVENT_TYPE" ]; then
    echo "Error: Event type is required"
    echo "Usage: $0 <event_type> <data_json> [source]"
    exit 1
fi

# Generate event ID and timestamp
EVENT_ID="evt-$(date +%s)-$$"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Create event JSON
EVENT_JSON=$(cat <<EOF
{
  "id": "$EVENT_ID",
  "timestamp": "$TIMESTAMP",
  "type": "$EVENT_TYPE",
  "data": $EVENT_DATA,
  "source": "$EVENT_SOURCE"
}
EOF
)

# Append to events file (atomic operation)
echo "$EVENT_JSON" >> "$EVENTS_FILE"

# Optional: Log to stderr for debugging
>&2 echo "Event emitted: $EVENT_TYPE ($EVENT_ID)"
