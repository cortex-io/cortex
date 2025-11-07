#!/bin/bash

# Rotate Dashboard Events
# Archives old events and keeps only recent ones in the main file

set -euo pipefail

# Configuration
EVENTS_FILE="/Users/ryandahlberg/commit-relay/coordination/dashboard-events.jsonl"
ARCHIVE_DIR="/Users/ryandahlberg/commit-relay/coordination/dashboard-events-archive"
KEEP_DAYS=2  # Keep events from last 2 days in main file

# Create archive directory if it doesn't exist
mkdir -p "$ARCHIVE_DIR"

# Calculate cutoff timestamp (2 days ago)
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    CUTOFF_TIMESTAMP=$(date -v-${KEEP_DAYS}d -u +"%Y-%m-%dT%H:%M:%SZ")
else
    # Linux
    CUTOFF_TIMESTAMP=$(date -u -d "${KEEP_DAYS} days ago" +"%Y-%m-%dT%H:%M:%SZ")
fi

echo "Rotating dashboard events..."
echo "Cutoff: $CUTOFF_TIMESTAMP"
echo "Archive directory: $ARCHIVE_DIR"

if [ ! -f "$EVENTS_FILE" ]; then
    echo "No events file found at $EVENTS_FILE"
    exit 0
fi

# Create archive filename with date
ARCHIVE_DATE=$(date -u +"%Y-%m-%d")
ARCHIVE_FILE="${ARCHIVE_DIR}/events-${ARCHIVE_DATE}.jsonl"

# Count events before rotation
TOTAL_EVENTS=$(wc -l < "$EVENTS_FILE" | tr -d ' ')
echo "Total events before rotation: $TOTAL_EVENTS"

# Split events into old and recent
TEMP_OLD=$(mktemp)
TEMP_RECENT=$(mktemp)

while IFS= read -r line; do
    EVENT_TIMESTAMP=$(echo "$line" | jq -r '.timestamp')

    # Compare timestamps
    if [[ "$EVENT_TIMESTAMP" < "$CUTOFF_TIMESTAMP" ]]; then
        echo "$line" >> "$TEMP_OLD"
    else
        echo "$line" >> "$TEMP_RECENT"
    fi
done < "$EVENTS_FILE"

# Count split
OLD_COUNT=$(wc -l < "$TEMP_OLD" | tr -d ' ')
RECENT_COUNT=$(wc -l < "$TEMP_RECENT" | tr -d ' ')

echo "Events older than $KEEP_DAYS days: $OLD_COUNT"
echo "Recent events (keeping): $RECENT_COUNT"

# Archive old events if any exist
if [ "$OLD_COUNT" -gt 0 ]; then
    # Append to archive file (or create new one)
    cat "$TEMP_OLD" >> "$ARCHIVE_FILE"
    echo "Archived $OLD_COUNT events to $ARCHIVE_FILE"
fi

# Replace main file with recent events
if [ "$RECENT_COUNT" -gt 0 ]; then
    mv "$TEMP_RECENT" "$EVENTS_FILE"
    echo "Kept $RECENT_COUNT recent events in $EVENTS_FILE"
else
    # If no recent events, create empty file
    echo -n "" > "$EVENTS_FILE"
    echo "No recent events - created empty file"
fi

# Clean up temp files
rm -f "$TEMP_OLD" "$TEMP_RECENT"

echo "Dashboard events rotation complete!"
echo ""
echo "Summary:"
echo "  - Total events processed: $TOTAL_EVENTS"
echo "  - Events archived: $OLD_COUNT"
echo "  - Events retained: $RECENT_COUNT"
echo "  - Archive location: $ARCHIVE_FILE"
