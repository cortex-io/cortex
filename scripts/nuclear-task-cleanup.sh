#!/usr/bin/env bash
#
# Nuclear Task Queue Cleanup
# Keeps only completed tasks, removes everything else
#

set -euo pipefail

TASK_QUEUE_FILE="coordination/task-queue.json"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$CORTEX_ROOT"

echo "=== ☢️  NUCLEAR TASK CLEANUP ☢️  ==="
echo ""

# Count tasks by status
TOTAL=$(jq '.tasks | length' "$TASK_QUEUE_FILE")
COMPLETED=$(jq '[.tasks[] | select(.status == "completed")] | length' "$TASK_QUEUE_FILE")
FAILED=$(jq '[.tasks[] | select(.status == "failed")] | length' "$TASK_QUEUE_FILE")
ASSIGNED=$(jq '[.tasks[] | select(.status == "assigned")] | length' "$TASK_QUEUE_FILE")
SPAWNED=$(jq '[.tasks[] | select(.status == "worker_spawned")] | length' "$TASK_QUEUE_FILE")
TO_REMOVE=$((FAILED + ASSIGNED + SPAWNED))

echo "Current task queue:"
echo "  Total:          $TOTAL"
echo "  ✅ Completed:   $COMPLETED (keeping)"
echo "  ❌ Failed:      $FAILED (removing)"
echo "  🔄 Assigned:    $ASSIGNED (removing)"
echo "  🚀 Spawned:     $SPAWNED (removing)"
echo ""
echo "  💣 To Remove:   $TO_REMOVE tasks"
echo ""

# Show what's being removed
echo "Tasks being nuked:"
jq -r '.tasks[] | select(.status != "completed") | "  ☢️  \(.id) (\(.status))"' "$TASK_QUEUE_FILE" | head -10
if [[ $TO_REMOVE -gt 10 ]]; then
    echo "  ... and $((TO_REMOVE - 10)) more"
fi
echo ""

# Create cleaned task queue (keep only completed)
echo "Launching nuclear cleanup..."

jq '{
  tasks: [.tasks[] | select(.status == "completed")],
  stats: {
    total_tasks: '"$COMPLETED"',
    completed_tasks: '"$COMPLETED"',
    removed_failed: '"$FAILED"',
    removed_assigned: '"$ASSIGNED"',
    removed_spawned: '"$SPAWNED"',
    total_removed: '"$TO_REMOVE"',
    note: "Nuclear cleanup on '"$(date +%Y-%m-%d)"'"
  },
  updated_at: "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"
}' "$TASK_QUEUE_FILE" > "${TASK_QUEUE_FILE}.tmp" && mv "${TASK_QUEUE_FILE}.tmp" "$TASK_QUEUE_FILE"

REMAINING=$(jq '.tasks | length' "$TASK_QUEUE_FILE")

echo ""
echo "=== ✅ Nuclear Cleanup Complete ==="
echo "  Removed:   $TO_REMOVE tasks"
echo "  Remaining: $REMAINING tasks (all completed)"
echo ""
echo "Backup: coordination/task-queue.backup-*.json"
