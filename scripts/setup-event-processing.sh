#!/usr/bin/env bash
# Setup automated event processing for Cortex

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==================================="
echo "  Cortex Event Processing Setup"
echo "==================================="
echo ""

# Check if running on macOS or Linux
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "✓ Detected macOS"
    CRON_CMD="crontab"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "✓ Detected Linux"
    CRON_CMD="crontab"
else
    echo "✗ Unsupported operating system: $OSTYPE"
    exit 1
fi

# Create log directory
LOG_DIR="/var/log/cortex"
if [[ ! -d "$LOG_DIR" ]]; then
    echo "Creating log directory: $LOG_DIR"
    sudo mkdir -p "$LOG_DIR"
    sudo chown "$USER" "$LOG_DIR"
fi

# Cron job entries
DISPATCHER_CRON="* * * * * cd $PROJECT_ROOT && $PROJECT_ROOT/scripts/events/event-dispatcher.sh >> $LOG_DIR/events.log 2>&1"
ARCHIVER_CRON="0 2 * * * cd $PROJECT_ROOT && $PROJECT_ROOT/scripts/events/event-archiver.sh >> $LOG_DIR/archiver.log 2>&1"

echo ""
echo "Cron jobs to be added:"
echo "  1. Event Dispatcher (every minute):"
echo "     $DISPATCHER_CRON"
echo ""
echo "  2. Event Archiver (daily at 2 AM):"
echo "     $ARCHIVER_CRON"
echo ""

# Ask user to confirm
read -p "Add these cron jobs? (y/n): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Add to crontab (remove old entries first to avoid duplicates)
    (crontab -l 2>/dev/null | grep -v "event-dispatcher.sh" | grep -v "event-archiver.sh"; echo "$DISPATCHER_CRON"; echo "$ARCHIVER_CRON") | crontab -
    echo "✓ Cron jobs added successfully!"
    echo ""
    echo "Event processing will run every minute."
    echo "Event archival will run daily at 2 AM."
    echo "Logs will be written to:"
    echo "  - Event processing: $LOG_DIR/events.log"
    echo "  - Event archival:   $LOG_DIR/archiver.log"
else
    echo "Cron jobs not added."
    echo ""
    echo "To add manually, run:"
    echo "  crontab -e"
    echo ""
    echo "Then add these lines:"
    echo "  $DISPATCHER_CRON"
    echo "  $ARCHIVER_CRON"
fi

echo ""
echo "==================================="
echo "  Setup Complete"
echo "==================================="
echo ""
echo "Next steps:"
echo "1. Monitor event processing: tail -f $LOG_DIR/events.log"
echo "2. Monitor archival: tail -f $LOG_DIR/archiver.log"
echo "3. Check queue depth: ls $PROJECT_ROOT/coordination/events/queue/ | wc -l"
echo "4. View event logs: cat $PROJECT_ROOT/coordination/events/*.jsonl | jq '.'"
echo "5. Run archiver manually: $PROJECT_ROOT/scripts/events/event-archiver.sh --dry-run"
echo "6. Check disk usage: du -sh $PROJECT_ROOT/coordination/events"
echo ""
