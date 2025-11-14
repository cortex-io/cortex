#!/bin/bash
WORKER_DIR="$(dirname "$0")"
cd "$WORKER_DIR"

# Start execution - Claude Code will read prompt.md from working directory
# No special flags needed, just execute with the prompt file
claude < prompt.md

# Capture exit status
EXIT_CODE=$?

# Update completion status
if [ $EXIT_CODE -eq 0 ]; then
    echo "{\"status\": \"completed\", \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > status.json
else
    echo "{\"status\": \"failed\", \"exit_code\": $EXIT_CODE, \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > status.json
fi

exit $EXIT_CODE
