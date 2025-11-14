#!/bin/bash
WORKER_DIR="$(dirname "$0")"
cd "$WORKER_DIR"

# Redirect all output to log files
exec > >(tee logs/stdout.log) 2> >(tee logs/stderr.log >&2)

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Worker execution starting..."
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Working directory: $WORKER_DIR"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Prompt file: prompt.md"

# Execute Claude Code with prompt file
# Pass prompt content as positional argument
claude "$(cat prompt.md)"

# Capture exit status
EXIT_CODE=$?

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Claude Code exited with code: $EXIT_CODE"

# Check for Ink TTY errors in stderr
if grep -q "Raw mode is not supported" logs/stderr.log 2>/dev/null; then
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ERROR: Ink TTY error detected"
    echo "{\"status\": \"failed\", \"error\": \"ink_tty_error\", \"exit_code\": $EXIT_CODE, \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > status.json
    exit 1
fi

# Update completion status
if [ $EXIT_CODE -eq 0 ]; then
    echo "{\"status\": \"completed\", \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > status.json
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Worker completed successfully"
else
    echo "{\"status\": \"failed\", \"exit_code\": $EXIT_CODE, \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > status.json
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Worker failed with exit code: $EXIT_CODE"
fi

exit $EXIT_CODE
