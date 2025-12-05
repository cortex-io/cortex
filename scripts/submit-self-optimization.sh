#!/usr/bin/env bash
# Submit self-optimization tracks to Cortex task queue
# Uses Cortex itself to implement the self-optimization framework

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

# Extract track information
TOTAL_TRACKS=$(jq -r '.tracks | length' "$TRACKS_FILE")
echo "📊 Tracks to submit: $TOTAL_TRACKS"
echo ""

# Create task entries for each track
SUBMITTED_TASKS=0
TRACK_SUMMARY=""

for track_idx in $(seq 0 $((TOTAL_TRACKS - 1))); do
    TRACK_ID=$(jq -r ".tracks[$track_idx].track_id" "$TRACKS_FILE")
    TRACK_NAME=$(jq -r ".tracks[$track_idx].name" "$TRACKS_FILE")
    TRACK_PRIORITY=$(jq -r ".tracks[$track_idx].priority" "$TRACKS_FILE")
    TRACK_COMPLEXITY=$(jq -r ".tracks[$track_idx].complexity" "$TRACKS_FILE")
    TRACK_TASKS=$(jq -r ".tracks[$track_idx].tasks | length" "$TRACKS_FILE")

    echo "📦 Track $((track_idx + 1))/$TOTAL_TRACKS: $TRACK_NAME"
    echo "   - Priority: $TRACK_PRIORITY"
    echo "   - Complexity: $TRACK_COMPLEXITY"
    echo "   - Tasks: $TRACK_TASKS"

    TRACK_SUMMARY="$TRACK_SUMMARY\n   $TRACK_NAME ($TRACK_TASKS tasks)"

    # Submit each task in the track
    for task_idx in $(seq 0 $((TRACK_TASKS - 1))); do
        TASK=$(jq -c ".tracks[$track_idx].tasks[$task_idx]" "$TRACKS_FILE")

        TASK_ID=$(echo "$TASK" | jq -r '.id')
        TASK_TITLE=$(echo "$TASK" | jq -r '.title')
        TASK_TYPE=$(echo "$TASK" | jq -r '.type')
        TASK_DESC=$(echo "$TASK" | jq -r '.description')
        TASK_PRIORITY=$(echo "$TASK" | jq -r '.priority')
        TASK_DEPS=$(echo "$TASK" | jq -c '.dependencies')
        TASK_DELIVERABLES=$(echo "$TASK" | jq -c '.deliverables')
        TASK_TEST_CMD=$(echo "$TASK" | jq -r '.test_command')
        TASK_ACCEPTANCE=$(echo "$TASK" | jq -c '.acceptance_criteria')

        # Create full task object
        FULL_TASK=$(jq -n \
            --arg id "self-opt-$TASK_ID" \
            --arg title "$TASK_TITLE" \
            --arg type "$TASK_TYPE" \
            --arg desc "$TASK_DESC" \
            --arg priority "$TASK_PRIORITY" \
            --arg created_at "$TIMESTAMP" \
            --arg created_by "self-optimization-initiative" \
            --arg track_id "$TRACK_ID" \
            --arg track_name "$TRACK_NAME" \
            --argjson complexity "$TRACK_COMPLEXITY" \
            --argjson dependencies "$TASK_DEPS" \
            --argjson deliverables "$TASK_DELIVERABLES" \
            --arg test_cmd "$TASK_TEST_CMD" \
            --argjson acceptance "$TASK_ACCEPTANCE" \
            '{
                id: $id,
                title: $title,
                type: $type,
                description: $desc,
                priority: $priority,
                status: "pending",
                created_at: $created_at,
                created_by: $created_by,
                context: {
                    track_id: $track_id,
                    track_name: $track_name,
                    complexity: $complexity,
                    dependencies: $dependencies,
                    deliverables: $deliverables,
                    test_command: $test_cmd,
                    acceptance_criteria: $acceptance,
                    self_optimization: true,
                    parallel_track: true
                }
            }')

        # Add to task queue
        TMP_QUEUE=$(mktemp)
        jq --argjson task "$FULL_TASK" '.tasks += [$task]' "$TASK_QUEUE" > "$TMP_QUEUE"
        mv "$TMP_QUEUE" "$TASK_QUEUE"

        echo "      ✅ $TASK_ID: $TASK_TITLE"
        ((SUBMITTED_TASKS++))
    done

    echo ""
done

# Update task queue stats
TMP_QUEUE=$(mktemp)
jq --arg timestamp "$TIMESTAMP" \
   --argjson submitted "$SUBMITTED_TASKS" \
   '.stats.total_tasks += $submitted |
    .updated_at = $timestamp |
    .stats.self_optimization_tasks = $submitted' \
   "$TASK_QUEUE" > "$TMP_QUEUE"
mv "$TMP_QUEUE" "$TASK_QUEUE"

echo "=========================================="
echo "✅ Submission Complete!"
echo "=========================================="
echo ""
echo "📊 Summary:"
echo "   - Total tracks: $TOTAL_TRACKS"
echo "   - Total tasks: $SUBMITTED_TASKS"
echo "   - Priority: High (self-improvement)"
echo "   - Execution: Parallel across tracks"
echo ""
echo "🎯 Tracks submitted:"
echo -e "$TRACK_SUMMARY"
echo ""
echo "=========================================="
echo "🚀 Next Steps:"
echo "=========================================="
echo ""
echo "1. Start Coordinator Master:"
echo "   ./scripts/run-coordinator-master.sh"
echo ""
echo "2. Monitor progress:"
echo "   ./scripts/cortex-ctl.sh status"
echo "   watch -n 5 'cat coordination/task-queue.json | jq .stats'"
echo ""
echo "3. View active workers:"
echo "   ./scripts/worker-status.sh"
echo ""
echo "4. Check MoE routing decisions:"
echo "   tail -f coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl | jq"
echo ""
echo "5. Dashboard (if running):"
echo "   http://localhost:3000"
echo ""
echo "=========================================="
echo "⚡ Cortex is now building Cortex!"
echo "=========================================="
echo ""

# Optional: Auto-start coordinator if not running
if ! pgrep -f "coordinator-master.sh" > /dev/null; then
    echo "💡 Coordinator not running. Start it? (y/n)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        echo "🚀 Starting Coordinator Master..."
        nohup ./scripts/run-coordinator-master.sh > logs/coordinator-auto.log 2>&1 &
        echo "   PID: $!"
        echo "   Logs: logs/coordinator-auto.log"
    fi
fi
