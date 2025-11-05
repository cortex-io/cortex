#!/bin/bash

###############################################################################
# Execution Manager Spawner
#
# Purpose: Spawned by master agents to handle complex subtasks requiring
#          multiple workers with coordination
#
# Layer: Between Master Agents and Workers
# Type: Ephemeral (spawned per complex subtask)
# Role: Tactical Team Lead
###############################################################################

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COORD_DIR="$PROJECT_ROOT/coordination"
TEMPLATE_PROMPT="$PROJECT_ROOT/agents/prompts/execution-manager/execution-manager-template.md"
LOG_DIR="$PROJECT_ROOT/agents/logs/execution-managers"
EVENTS_FILE="$COORD_DIR/dashboard-events.jsonl"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

###############################################################################
# Usage
###############################################################################

usage() {
    cat <<EOF
Usage: $0 --master MASTER --subtask SUBTASK_ID [OPTIONS]

Spawn an Execution Manager to handle a complex subtask requiring multiple workers.

REQUIRED:
  --master MASTER          Parent master (development, security, inventory, cicd)
  --subtask SUBTASK_ID     Subtask ID to execute

OPTIONAL:
  --orchestration ORCH_ID  Parent orchestration ID
  --interactive            Run in interactive Claude Code session (default: background)
  --help                   Show this help

EXAMPLES:
  # Spawn execution manager for complex implementation subtask
  $0 --master development --subtask auth-002-backend

  # With orchestration context
  $0 --master development \\
     --subtask auth-002-backend \\
     --orchestration orch-task-1762366071

  # Interactive mode (for debugging)
  $0 --master development --subtask auth-002-backend --interactive

EXECUTION MANAGER ROLE:
  - Breaks down master-specific subtask into worker-sized tasks
  - Spawns specialized workers (Explorer, Planner, Implementer, Tester, Committer)
  - Coordinates sequential and parallel execution
  - Monitors worker health (PID, heartbeat, file changes)
  - Implements quality gates and retry logic
  - Reports results back to master

EOF
    exit 1
}

###############################################################################
# Logging
###############################################################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*" | tee -a "$LOG_FILE"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" | tee -a "$LOG_FILE"
}

log_exec_mgr() {
    echo -e "${CYAN}[EXEC-MGR]${NC} $*" | tee -a "$LOG_FILE"
}

log_dashboard_event() {
    local event_type="$1"
    local event_data="$2"

    local event_json=$(cat <<EOF
{"timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","type":"$event_type","data":$event_data}
EOF
)
    echo "$event_json" >> "$EVENTS_FILE"
}

###############################################################################
# Parse Arguments
###############################################################################

MASTER=""
SUBTASK_ID=""
ORCHESTRATION_ID=""
INTERACTIVE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --master)
            MASTER="$2"
            shift 2
            ;;
        --subtask)
            SUBTASK_ID="$2"
            shift 2
            ;;
        --orchestration)
            ORCHESTRATION_ID="$2"
            shift 2
            ;;
        --interactive)
            INTERACTIVE=true
            shift
            ;;
        --help)
            usage
            ;;
        *)
            echo "Unknown option: $1"
            usage
            ;;
    esac
done

# Validate required arguments
if [ -z "$MASTER" ] || [ -z "$SUBTASK_ID" ]; then
    echo "Error: --master and --subtask are required"
    usage
fi

# Validate master
case "$MASTER" in
    development|security|inventory|cicd)
        ;;
    *)
        echo "Error: Invalid master '$MASTER'. Must be: development, security, inventory, or cicd"
        exit 1
        ;;
esac

###############################################################################
# Initialization
###############################################################################

# Generate execution manager ID
EXEC_MGR_ID="exec-mgr-${SUBTASK_ID}-$(date +%s)"
MASTER_DIR="$COORD_DIR/masters/$MASTER"
EXEC_PLAN_DIR="$MASTER_DIR/execution-plans"
EXEC_MGR_FILE="$EXEC_PLAN_DIR/${EXEC_MGR_ID}.json"

# Create directories
mkdir -p "$LOG_DIR"
mkdir -p "$EXEC_PLAN_DIR"

# Setup log file
LOG_FILE="$LOG_DIR/${EXEC_MGR_ID}.log"

log_exec_mgr "Initializing Execution Manager"
log_info "Master: $MASTER"
log_info "Subtask: $SUBTASK_ID"
log_info "Execution Manager ID: $EXEC_MGR_ID"

###############################################################################
# Load Subtask Data
###############################################################################

load_subtask_data() {
    log_info "Loading subtask data..."

    # Check orchestrator subtasks directory first
    local subtask_file="$COORD_DIR/orchestrator/subtasks/${SUBTASK_ID}.json"

    if [ ! -f "$subtask_file" ]; then
        # Fallback: check if it's in master handoffs
        local handoff_file="$MASTER_DIR/handoffs/*${SUBTASK_ID}*.json"
        if ls $handoff_file 1> /dev/null 2>&1; then
            subtask_file=$(ls $handoff_file | head -1)
            log_info "Found subtask in handoff: $subtask_file"
        else
            log_error "Subtask file not found: $SUBTASK_ID"
            exit 1
        fi
    fi

    SUBTASK_DATA=$(cat "$subtask_file")
    log_success "Loaded subtask data"
}

###############################################################################
# Create Execution Plan
###############################################################################

create_execution_plan() {
    log_exec_mgr "Creating execution plan..."

    local subtask_title=$(echo "$SUBTASK_DATA" | jq -r '.title // .task_data.title // "Unknown"')
    local subtask_desc=$(echo "$SUBTASK_DATA" | jq -r '.description // .task_data.description // ""')
    local files_affected=$(echo "$SUBTASK_DATA" | jq -r '.files_affected // [] | join(", ")')
    local estimated_duration=$(echo "$SUBTASK_DATA" | jq -r '.estimated_duration_minutes // 30')

    # Create initial execution plan
    cat > "$EXEC_MGR_FILE" <<EOF
{
  "execution_manager_id": "$EXEC_MGR_ID",
  "parent_master": "$MASTER",
  "parent_subtask": "$SUBTASK_ID",
  "parent_orchestration": "$ORCHESTRATION_ID",
  "status": "analyzing",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",

  "subtask_info": {
    "title": "$subtask_title",
    "description": "$subtask_desc",
    "files_affected": "$files_affected",
    "estimated_duration_minutes": $estimated_duration
  },

  "worker_plan": {
    "total_workers": 0,
    "workers": []
  },

  "progress": {
    "current_phase": "planning",
    "workers_spawned": 0,
    "workers_completed": 0,
    "workers_failed": 0,
    "workers_active": []
  },

  "resources": {
    "token_budget": 50000,
    "tokens_used": 0,
    "time_limit_minutes": $((estimated_duration + 10))
  }
}
EOF

    log_success "Created execution plan: $EXEC_MGR_FILE"
}

###############################################################################
# Build Execution Manager Prompt
###############################################################################

build_execution_manager_prompt() {
    log_exec_mgr "Building execution manager prompt..."

    local subtask_title=$(echo "$SUBTASK_DATA" | jq -r '.title // .task_data.title // "Unknown"')
    local subtask_desc=$(echo "$SUBTASK_DATA" | jq -r '.description // .task_data.description // ""')

    local prompt_file="/tmp/exec-mgr-prompt-${EXEC_MGR_ID}.txt"

    cat > "$prompt_file" <<EOF
You are an Execution Manager for the $MASTER Master.

SUBTASK ASSIGNED TO YOU:
- Subtask ID: $SUBTASK_ID
- Title: $subtask_title
- Description: $subtask_desc

YOUR MISSION:
1. Analyze this subtask's complexity
2. Break it down into worker-sized tasks (10-20 min each, 1-2 files max)
3. Select appropriate worker types for each task:
   - Explorer: Read code, gather context (5-10 min, 5k tokens)
   - Planner: Design approach (5-10 min, 5k tokens)
   - Implementer: Write/edit code (15-30 min, 15k tokens)
   - Tester: Run tests, verify (5-15 min, 8k tokens)
   - Committer: Git operations (2-5 min, 2k tokens)
4. Determine execution order (sequential or parallel)
5. Create worker specs in: coordination/worker-specs/active/
6. Update execution plan in: $EXEC_MGR_FILE
7. Monitor worker health and handle failures
8. Aggregate results and report to master

EXECUTION PATTERNS:

Sequential Pipeline:
  Explorer → Planner → Implementer → Tester → Committer

Parallel Implementation:
  Planner → [Implementer-A, Implementer-B] (parallel) → Tester → Committer

Read the full Execution Manager template at: $TEMPLATE_PROMPT

EXECUTION MANAGER ID: $EXEC_MGR_ID
MASTER: $MASTER
START TIME: $(date -u +%Y-%m-%dT%H:%M:%SZ)

Begin tactical coordination now.
EOF

    echo "$prompt_file"
}

###############################################################################
# Spawn Execution Manager
###############################################################################

spawn_execution_manager() {
    local prompt_file=$(build_execution_manager_prompt)

    log_exec_mgr "Spawning execution manager session..."

    if [ "$INTERACTIVE" = true ]; then
        log_info "Starting INTERACTIVE Claude Code session"
        log_info "Prompt file: $prompt_file"

        # Update status to running
        jq '.status = "running" | .started_at = "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"' "$EXEC_MGR_FILE" > "$EXEC_MGR_FILE.tmp"
        mv "$EXEC_MGR_FILE.tmp" "$EXEC_MGR_FILE"

        # Log event
        log_dashboard_event "execution_manager_started" "{\"exec_mgr_id\":\"$EXEC_MGR_ID\",\"master\":\"$MASTER\",\"subtask\":\"$SUBTASK_ID\"}"

        log_success "Execution manager spawned"
        log_info "Run this command to start the session:"
        echo ""
        echo "  claude < $prompt_file"
        echo ""

    else
        log_info "Starting BACKGROUND execution manager"

        # Update status
        jq '.status = "running" | .started_at = "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"' "$EXEC_MGR_FILE" > "$EXEC_MGR_FILE.tmp"
        mv "$EXEC_MGR_FILE.tmp" "$EXEC_MGR_FILE"

        # For now, just create the marker file
        # In production, this would launch an actual Claude Code session
        log_warn "Background mode not fully implemented yet"
        log_info "Created execution plan and prompt file"
        log_info "To complete execution, run: claude < $prompt_file"

        # Log event
        log_dashboard_event "execution_manager_pending" "{\"exec_mgr_id\":\"$EXEC_MGR_ID\",\"master\":\"$MASTER\",\"subtask\":\"$SUBTASK_ID\",\"prompt_file\":\"$prompt_file\"}"

        log_success "Execution manager initialized (manual start required)"
    fi
}

###############################################################################
# Main
###############################################################################

main() {
    log_exec_mgr "Starting Execution Manager Spawner"

    # Load subtask
    load_subtask_data

    # Create execution plan
    create_execution_plan

    # Spawn execution manager
    spawn_execution_manager

    log_success "Execution Manager spawner completed"
    log_info "Execution Plan: $EXEC_MGR_FILE"
}

main
