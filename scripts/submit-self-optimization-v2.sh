#!/usr/bin/env bash
# Submit self-optimization tracks to Cortex task queue
# Simplified version - single jq operation

set -euo pipefail

CORTEX_HOME="${CORTEX_HOME:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
TRACKS_FILE="$CORTEX_HOME/coordination/tasks/self-optimization-tracks.json"
TASK_QUEUE="$CORTEX_HOME/coordination/task-queue.json"
TIMESTAMP=$(date +"%Y-%m-%dT%H:%M:%S%z")

echo "=========================================="
echo "Cortex Self-Optimization: Task Submission"
echo "=========================================="
echo ""

# Verify tracks file exists
if [ ! -f "$TRACKS_FILE" ]; then
    echo "❌ Error: Tracks file not found: $TRACKS_FILE"
    exit 1
fi

# Backup current task queue
BACKUP_FILE="$CORTEX_HOME/coordination/task-queue.backup-$(date +%Y%m%d-%H%M%S).json"
cp "$TASK_QUEUE" "$BACKUP_FILE"
echo "✅ Backed up task queue to: $BACKUP_FILE"
echo ""

# Build all tasks in single jq operation
echo "🔨 Building task list..."

NEW_TASKS=$(jq -c --arg timestamp "$TIMESTAMP" '
  .tracks[] as $track |
  $track.tasks[] |
  {
    id: ("self-opt-" + .id),
    title: .title,
    type: .type,
    description: .description,
    priority: .priority,
    status: "pending",
    created_at: $timestamp,
    created_by: "self-optimization-initiative",
    context: {
      track_id: $track.track_id,
      track_name: $track.name,
      complexity: $track.complexity,
      dependencies: .dependencies,
      deliverables: .deliverables,
      test_command: .test_command,
      acceptance_criteria: .acceptance_criteria,
      self_optimization: true,
      parallel_track: true
    }
  }
' "$TRACKS_FILE" | jq -s '.')

TASK_COUNT=$(echo "$NEW_TASKS" | jq 'length')
echo "✅ Generated $TASK_COUNT tasks"
echo ""

# Update task queue with all tasks in single operation
echo "📝 Updating task queue..."
TMP_QUEUE=$(mktemp)
jq --argjson new_tasks "$NEW_TASKS" \
   --arg timestamp "$TIMESTAMP" \
   --argjson count "$TASK_COUNT" \
   '.tasks += $new_tasks |
    .stats.total_tasks += $count |
    .stats.self_optimization_tasks = $count |
    .updated_at = $timestamp' \
   "$TASK_QUEUE" > "$TMP_QUEUE"

if jq '.' "$TMP_QUEUE" > /dev/null 2>&1; then
    mv "$TMP_QUEUE" "$TASK_QUEUE"
    echo "✅ Task queue updated successfully"
else
    echo "❌ Error: Generated invalid JSON, restoring backup"
    cp "$BACKUP_FILE" "$TASK_QUEUE"
    rm -f "$TMP_QUEUE"
    exit 1
fi

echo ""
echo "=========================================="
echo "✅ Submission Complete!"
echo "=========================================="
echo ""
echo "📊 Summary:"
echo "   - Total tasks submitted: $TASK_COUNT"
echo "   - Execution: Parallel across 5 tracks"
echo "   - Priority: High (self-improvement)"
echo ""
echo "=========================================="
echo "🚀 System Ready!"
echo "=========================================="
echo ""
echo "Tasks are queued. Start processing:"
echo "  ./scripts/run-coordinator-master.sh"
echo ""
echo "Or multiple instances:"
echo "  CORTEX_INSTANCE_ID=main ./scripts/run-coordinator-master.sh &"
echo "  CORTEX_INSTANCE_ID=worker-1 ./scripts/run-coordinator-master.sh &"
echo ""
echo "Monitor progress:"
echo "  watch -n 5 'cat coordination/task-queue.json | jq .stats'"
echo ""
echo "⚡ Cortex is ready to build Cortex!"
echo ""
