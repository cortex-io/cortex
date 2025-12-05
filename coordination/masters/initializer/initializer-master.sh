#!/bin/bash

# Initializer Master - Task Decomposition and Feature List Generation
# Handles first-run setup for complex tasks

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Load dependencies
source "$CORTEX_ROOT/config/load-env.sh" 2>/dev/null || true
source "$SCRIPT_DIR/lib/feature-decomposer.sh"
source "$SCRIPT_DIR/lib/init-script-generator.sh"

# Configuration
TASK_QUEUE="$CORTEX_ROOT/coordination/task-queue.json"
FEATURE_LISTS_DIR="$CORTEX_ROOT/coordination/feature-lists"
WORKERS_DIR="$CORTEX_ROOT/coordination/workers"
LOG_FILE="$CORTEX_ROOT/logs/initializer-master.log"

mkdir -p "$(dirname "$LOG_FILE")"
mkdir -p "$FEATURE_LISTS_DIR"

# Logging
log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

# Main processing loop
process_tasks() {
  log "Initializer Master started"

  while true; do
    # Check for tasks assigned to initializer-master
    if [ ! -f "$TASK_QUEUE" ]; then
      sleep 5
      continue
    fi

    # Get next task assigned to us
    local task=$(jq -r '.tasks[] | select(.assigned_to == "initializer-master" and .status == "pending") | @json' "$TASK_QUEUE" 2>/dev/null | head -1)

    if [ -z "$task" ] || [ "$task" = "null" ]; then
      sleep 5
      continue
    fi

    local task_id=$(echo "$task" | jq -r '.task_id')
    local description=$(echo "$task" | jq -r '.description')
    local target_master=$(echo "$task" | jq -r '.target_master // "development-master"')

    log "Processing task: $task_id"
    log "Description: $description"

    # Update task status to in_progress
    update_task_status "$task_id" "in_progress"

    # Step 1: Decompose task into features
    log "Decomposing task into features..."
    local feature_list_file="$FEATURE_LISTS_DIR/${task_id}-features.json"

    if decompose_task "$task_id" "$description" "$feature_list_file"; then
      log "Feature list created: $feature_list_file"

      # Count features
      local feature_count=$(jq '.features | length' "$feature_list_file")
      log "Generated $feature_count atomic features"

      # Step 2: Generate init script for workers
      log "Generating init script for workers..."
      generate_init_script "$task_id" "$feature_list_file"

      # Step 3: Create task specification with file hints
      log "Generating file hints..."
      generate_file_hints "$task_id" "$description" "$feature_list_file"

      # Step 4: Hand off to target master
      log "Handing off to $target_master"
      handoff_to_master "$task_id" "$target_master" "$feature_list_file"

      # Update task status
      update_task_status "$task_id" "decomposed"

      log "Task $task_id successfully decomposed and handed off"
    else
      log "ERROR: Failed to decompose task $task_id"
      update_task_status "$task_id" "failed"
    fi

    sleep 2
  done
}

# Update task status in queue
update_task_status() {
  local task_id=$1
  local status=$2

  if [ -f "$TASK_QUEUE" ]; then
    jq --arg tid "$task_id" --arg status "$status" \
      '.tasks = [.tasks[] | if .task_id == $tid then .status = $status | .updated_at = (now | todate) else . end]' \
      "$TASK_QUEUE" > "${TASK_QUEUE}.tmp" && mv "${TASK_QUEUE}.tmp" "$TASK_QUEUE"
  fi
}

# Hand off to execution master
handoff_to_master() {
  local task_id=$1
  local target_master=$2
  local feature_list_file=$3

  # Create or update task file
  local task_file="$CORTEX_ROOT/coordination/tasks/${task_id}.json"

  if [ -f "$task_file" ]; then
    # Add feature list reference
    jq --arg flist "$feature_list_file" \
      '.feature_list = $flist | .decomposed = true | .decomposed_at = (now | todate)' \
      "$task_file" > "${task_file}.tmp" && mv "${task_file}.tmp" "$task_file"
  fi

  # Update task queue to assign to target master
  if [ -f "$TASK_QUEUE" ]; then
    jq --arg tid "$task_id" --arg master "$target_master" \
      '.tasks = [.tasks[] | if .task_id == $tid then .assigned_to = $master | .status = "pending" else . end]' \
      "$TASK_QUEUE" > "${TASK_QUEUE}.tmp" && mv "${TASK_QUEUE}.tmp" "$TASK_QUEUE"
  fi

  log "Task $task_id reassigned to $target_master"
}

# Signal handler
trap 'log "Initializer Master shutting down"; exit 0' SIGTERM SIGINT

# Start processing
log "Initializer Master ready - monitoring task queue"
process_tasks
