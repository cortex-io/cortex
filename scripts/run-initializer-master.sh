#!/bin/bash

# Run Initializer Master
# Handles task decomposition and feature list generation

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Starting Initializer Master..."

# Check if already running
if pgrep -f "initializer-master.sh" > /dev/null; then
  echo "Initializer Master is already running"
  exit 1
fi

# Create logs directory
mkdir -p "$CORTEX_ROOT/logs"

# Run the master
"$CORTEX_ROOT/coordination/masters/initializer/initializer-master.sh" &

echo "Initializer Master started (PID: $!)"
echo "Logs: $CORTEX_ROOT/logs/initializer-master.log"
echo "Monitor with: tail -f $CORTEX_ROOT/logs/initializer-master.log"
