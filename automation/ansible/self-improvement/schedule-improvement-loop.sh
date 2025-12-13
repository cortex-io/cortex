#!/usr/bin/env bash
# schedule-improvement-loop.sh
# Sets up automated monitoring of automation opportunities
# Runs daily to continuously identify new playbook candidates

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FEEDBACK_LOOP="${SCRIPT_DIR}/automation-feedback-loop.sh"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Schedule Automation Improvement Loop${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if running on macOS or Linux
if [[ "$(uname)" == "Darwin" ]]; then
    # macOS - use launchd
    echo -e "${BLUE}Detected macOS - configuring launchd...${NC}"

    PLIST_FILE="${HOME}/Library/LaunchAgents/com.cortex.automation-loop.plist"

    cat > "${PLIST_FILE}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.cortex.automation-loop</string>
    <key>ProgramArguments</key>
    <array>
        <string>${FEEDBACK_LOOP}</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>8</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>${SCRIPT_DIR}/loop-output.log</string>
    <key>StandardErrorPath</key>
    <string>${SCRIPT_DIR}/loop-error.log</string>
</dict>
</plist>
EOF

    # Load the launch agent
    launchctl unload "${PLIST_FILE}" 2>/dev/null || true
    launchctl load "${PLIST_FILE}"

    echo -e "${GREEN}✓ Automation loop scheduled via launchd${NC}"
    echo -e "  Runs daily at 8:00 AM"
    echo -e "  Config: ${PLIST_FILE}"
    echo -e "  Logs: ${SCRIPT_DIR}/loop-output.log"

else
    # Linux - use cron
    echo -e "${BLUE}Detected Linux - configuring cron...${NC}"

    # Add cron job (runs daily at 8 AM)
    CRON_JOB="0 8 * * * ${FEEDBACK_LOOP} >> ${SCRIPT_DIR}/loop-output.log 2>&1"

    # Check if cron job already exists
    if crontab -l 2>/dev/null | grep -q "automation-feedback-loop.sh"; then
        echo -e "${YELLOW}Cron job already exists${NC}"
    else
        (crontab -l 2>/dev/null; echo "${CRON_JOB}") | crontab -
        echo -e "${GREEN}✓ Automation loop scheduled via cron${NC}"
        echo -e "  Runs daily at 8:00 AM"
        echo -e "  Logs: ${SCRIPT_DIR}/loop-output.log"
    fi
fi

echo ""
echo -e "${BLUE}Manual Execution:${NC}"
echo "Run immediately: ${FEEDBACK_LOOP}"
echo ""
echo -e "${BLUE}Disable Scheduled Execution:${NC}"
if [[ "$(uname)" == "Darwin" ]]; then
    echo "launchctl unload ${PLIST_FILE}"
else
    echo "crontab -e  # Remove the automation-feedback-loop line"
fi

echo ""
echo -e "${GREEN}Setup complete!${NC}"

exit 0
