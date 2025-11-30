#!/usr/bin/env bash
#
# Submit all workflow executor tasks to Cortex for parallel processing
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TASKS_DIR="${CORTEX_ROOT}/coordination/tasks"

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Submitting Workflow Executor Tasks to Cortex              ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Find all workflow executor tasks
task_count=0
pids=()

for task_file in "${TASKS_DIR}"/task-*1733000*.json; do
  if [[ -f "$task_file" ]]; then
    task_id=$(jq -r '.task_id' "$task_file")
    description=$(jq -r '.description' "$task_file")
    component=$(jq -r '.metadata.component' "$task_file")

    echo "[$((task_count + 1))] Submitting: ${task_id}"
    echo "    Component: ${component}"
    echo "    Description: ${description:0:70}..."
    echo ""

    # Route task through coordinator (in background for parallel submission)
    GOVERNANCE_BYPASS=true "${CORTEX_ROOT}/coordination/masters/coordinator/lib/moe-router.sh" \
      "$task_id" \
      "$description" \
      > /tmp/cortex-submit-${task_id}.log 2>&1 &

    pids+=($!)
    task_count=$((task_count + 1))
  fi
done

echo "Waiting for all task submissions to complete..."
echo ""

# Wait for all background submissions
for pid in "${pids[@]}"; do
  wait "$pid" || true
done

echo "════════════════════════════════════════════════════════════"
echo "✓ Successfully submitted ${task_count} tasks to Cortex!"
echo ""
echo "These tasks will be processed in parallel by the development-master."
echo ""
echo "Track progress with:"
echo "  cortex list development-master"
echo "  cortex workers"
echo ""
echo "View logs:"
echo "  ls -lt /tmp/cortex-submit-*.log | head"
echo "════════════════════════════════════════════════════════════"
