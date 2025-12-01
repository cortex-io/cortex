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

# Cron job entry
CRON_ENTRY="* * * * * cd $PROJECT_ROOT && $PROJECT_ROOT/scripts/events/event-dispatcher.sh >> $LOG_DIR/events.log 2>&1"

echo ""
echo "Cron job to be added:"
echo "  $CRON_ENTRY"
echo ""

# Ask user to confirm
read -p "Add this cron job? (y/n): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Add to crontab
    (crontab -l 2>/dev/null | grep -v "event-dispatcher.sh"; echo "$CRON_ENTRY") | crontab -
    echo "✓ Cron job added successfully!"
    echo ""
    echo "Event processing will run every minute."
    echo "Logs will be written to: $LOG_DIR/events.log"
else
    echo "Cron job not added."
    echo ""
    echo "To add manually, run:"
    echo "  crontab -e"
    echo ""
    echo "Then add this line:"
    echo "  $CRON_ENTRY"
fi

echo ""
echo "==================================="
echo "  Setup Complete"
echo "==================================="
echo ""
echo "Next steps:"
echo "1. Monitor event processing: tail -f $LOG_DIR/events.log"
echo "2. Check queue depth: ls $PROJECT_ROOT/coordination/events/queue/ | wc -l"
echo "3. View event logs: cat $PROJECT_ROOT/coordination/events/*.jsonl | jq '.'"
echo ""
