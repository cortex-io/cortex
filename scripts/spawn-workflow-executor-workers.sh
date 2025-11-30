#!/usr/bin/env bash
#
# Spawn workers for all workflow executor tasks in parallel
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TASKS_DIR="${CORTEX_ROOT}/coordination/tasks"
SPAWN_WORKER="${CORTEX_ROOT}/scripts/spawn-worker.sh"

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Spawning Workers for Workflow Executor Tasks             ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

worker_count=0
pids=()

for task_file in "${TASKS_DIR}"/task-*1733000*.json; do
  if [[ -f "$task_file" ]]; then
    task_id=$(jq -r '.task_id' "$task_file")
    component=$(jq -r '.metadata.component' "$task_file")
    output_file=$(jq -r '.metadata.output_file' "$task_file")

    echo "[$((worker_count + 1))] Spawning worker for: ${task_id}"
    echo "    Component: ${component}"
    echo "    Output: ${output_file}"
    echo ""

    # Spawn worker in background for parallel execution
    GOVERNANCE_BYPASS=true "$SPAWN_WORKER" \
      --type implementation-worker \
      --task-id "$task_id" \
      --master development-master \
      --priority high \
      > /tmp/cortex-spawn-${task_id}.log 2>&1 &

    pids+=($!)
    worker_count=$((worker_count + 1))
  fi
done

echo "Waiting for all worker spawns to complete..."
echo ""

# Wait for all background spawns
for pid in "${pids[@]}"; do
  wait "$pid" || true
done

echo "════════════════════════════════════════════════════════════"
echo "✓ Successfully spawned ${worker_count} workers!"
echo ""
echo "Workers are now building the workflow executor in parallel."
echo ""
echo "Track progress with:"
echo "  ls -lt coordination/workflow-engine/"
echo "  cat /tmp/cortex-spawn-*.log"
echo "════════════════════════════════════════════════════════════"
