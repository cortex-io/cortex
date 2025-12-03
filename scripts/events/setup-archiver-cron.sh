#!/usr/bin/env bash
# Setup automated event archival cron job for Cortex

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "======================================="
echo "  Cortex Event Archiver Cron Setup"
echo "======================================="
echo ""

# Check if running on macOS or Linux
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "✓ Detected macOS"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "✓ Detected Linux"
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

# Cron job options
echo ""
echo "Select archival schedule:"
echo "  1. Daily at 2:00 AM (recommended)"
echo "  2. Daily at 3:00 AM"
echo "  3. Every 12 hours (2 AM and 2 PM)"
echo "  4. Every 6 hours"
echo "  5. Custom schedule"
echo ""

read -p "Enter choice (1-5): " -n 1 -r choice
echo ""
echo ""

case $choice in
    1)
        ARCHIVER_CRON="0 2 * * * cd $PROJECT_ROOT && $PROJECT_ROOT/scripts/events/event-archiver.sh >> $LOG_DIR/archiver.log 2>&1"
        SCHEDULE_DESC="daily at 2:00 AM"
        ;;
    2)
        ARCHIVER_CRON="0 3 * * * cd $PROJECT_ROOT && $PROJECT_ROOT/scripts/events/event-archiver.sh >> $LOG_DIR/archiver.log 2>&1"
        SCHEDULE_DESC="daily at 3:00 AM"
        ;;
    3)
        ARCHIVER_CRON="0 2,14 * * * cd $PROJECT_ROOT && $PROJECT_ROOT/scripts/events/event-archiver.sh >> $LOG_DIR/archiver.log 2>&1"
        SCHEDULE_DESC="twice daily (2 AM and 2 PM)"
        ;;
    4)
        ARCHIVER_CRON="0 */6 * * * cd $PROJECT_ROOT && $PROJECT_ROOT/scripts/events/event-archiver.sh >> $LOG_DIR/archiver.log 2>&1"
        SCHEDULE_DESC="every 6 hours"
        ;;
    5)
        echo "Enter custom cron schedule (e.g., '0 2 * * *' for 2 AM daily):"
        read -p "Schedule: " custom_schedule
        ARCHIVER_CRON="$custom_schedule cd $PROJECT_ROOT && $PROJECT_ROOT/scripts/events/event-archiver.sh >> $LOG_DIR/archiver.log 2>&1"
        SCHEDULE_DESC="custom schedule"
        ;;
    *)
        echo "Invalid choice. Exiting."
        exit 1
        ;;
esac

echo "Cron job to be added:"
echo "  $ARCHIVER_CRON"
echo ""
echo "Schedule: $SCHEDULE_DESC"
echo ""

# Ask user to confirm
read -p "Add this cron job? (y/n): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Add to crontab (remove old entries first to avoid duplicates)
    (crontab -l 2>/dev/null | grep -v "event-archiver.sh"; echo "$ARCHIVER_CRON") | crontab -
    echo "✓ Cron job added successfully!"
    echo ""
    echo "Event archival will run $SCHEDULE_DESC"
    echo "Logs will be written to: $LOG_DIR/archiver.log"
    echo ""
    echo "Test the archiver now:"
    echo "  $PROJECT_ROOT/scripts/events/event-archiver.sh --dry-run"
else
    echo "Cron job not added."
    echo ""
    echo "To add manually, run:"
    echo "  crontab -e"
    echo ""
    echo "Then add this line:"
    echo "  $ARCHIVER_CRON"
fi

echo ""
echo "======================================="
echo "  Setup Complete"
echo "======================================="
echo ""
