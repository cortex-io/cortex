#!/usr/bin/env bash
# Continuous coordinator - keeps routing tasks until none remain

set -euo pipefail

CORTEX_HOME="${CORTEX_HOME:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
INSTANCE_ID="${CORTEX_INSTANCE_ID:-coord-$$}"

echo "=== Continuous Coordinator ==="
echo "Instance: $INSTANCE_ID"
echo "Started: $(date)"
echo "==========================="
echo ""

while true; do
    PENDING=$(jq '.tasks | map(select(.status == "pending")) | length' "$CORTEX_HOME/coordination/task-queue.json")

    if [ "$PENDING" -eq 0 ]; then
        echo "[$(date +%T)] No pending tasks. Waiting..."
        sleep 10
        continue
    fi

    echo "[$(date +%T)] Found $PENDING pending tasks, routing..."
    bash "$CORTEX_HOME/scripts/run-coordinator-master.sh" 2>&1 | grep -E "SUCCESS|ERROR|routed"

    sleep 5
done
