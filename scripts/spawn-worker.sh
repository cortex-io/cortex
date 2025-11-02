#!/bin/bash
# scripts/spawn-worker.sh
# Spawn individual worker agents for commit-relay
# Part of Phase 1: Script-Triggered Automation

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMIT_RELAY_HOME="${COMMIT_RELAY_HOME:-$(cd "$SCRIPT_DIR/.." && pwd)}"

# Load libraries
source "$SCRIPT_DIR/lib/logging.sh"
source "$SCRIPT_DIR/lib/coordination.sh"

# Color definitions for output formatting
GREEN="\033[0;32m"
BLUE="\033[0;34m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
NC="\033[0m"  # No Color

# Backward compatibility functions
print_info() { log_info "$1"; }
print_success() { log_info "✅ $1"; }
print_error() { log_error "$1"; }
print_warning() { log_warn "$1"; }

# Usage information
usage() {
    cat <<EOF
Usage: $0 [OPTIONS]

Spawn a worker agent with specified configuration.

OPTIONS:
    -t, --type TYPE           Worker type (scan-worker, fix-worker, analysis-worker, etc.)
    -i, --task-id ID          Related task ID (required)
    -m, --master MASTER       Master agent spawning this worker (required)
    -r, --repo REPO           Repository (format: owner/repo)
    -b, --budget TOKENS       Token budget (default: auto-determined by type)
    -d, --deadline TIMESTAMP  ISO-8601 deadline (optional)
    -p, --priority PRIORITY   Priority: critical|high|medium|low (default: medium)
    -s, --scope JSON          JSON scope object (optional)
    -c, --context JSON        JSON context object (optional)
    -h, --help                Show this help message

EXAMPLES:
    # Spawn scan worker for security scan
    $0 --type scan-worker --task-id task-010 --master security-master \\
       --repo ry-ops/n8n-mcp-server

    # Spawn fix worker with custom budget
    $0 --type fix-worker --task-id task-011 --master development-master \\
       --repo ry-ops/n8n-mcp-server --budget 6000 --priority high

    # Spawn analysis worker
    $0 --type analysis-worker --task-id task-012 --master coordinator-master \\
       --scope '{"question": "How does auth work?"}'

WORKER TYPES:
    scan-worker          Security scanning (8k tokens, 15min)
    fix-worker           Apply fixes (5k tokens, 20min)
    analysis-worker      Research/investigation (5k tokens, 15min)
    implementation-worker Feature development (10k tokens, 45min)
    test-worker          Add tests (6k tokens, 20min)
    review-worker        Code review (5k tokens, 15min)
    pr-worker            Create PRs (4k tokens, 10min)
    documentation-worker Write docs (6k tokens, 20min)

EOF
    exit 1
}

# Parse command line arguments
WORKER_TYPE=""
TASK_ID=""
MASTER_AGENT=""
REPOSITORY=""
TOKEN_BUDGET=""
DEADLINE=""
PRIORITY="medium"
SCOPE_JSON=""
CONTEXT_JSON=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -t|--type)
            WORKER_TYPE="$2"
            shift 2
            ;;
        -i|--task-id)
            TASK_ID="$2"
            shift 2
            ;;
        -m|--master)
            MASTER_AGENT="$2"
            shift 2
            ;;
        -r|--repo)
            REPOSITORY="$2"
            shift 2
            ;;
        -b|--budget)
            TOKEN_BUDGET="$2"
            shift 2
            ;;
        -d|--deadline)
            DEADLINE="$2"
            shift 2
            ;;
        -p|--priority)
            PRIORITY="$2"
            shift 2
            ;;
        -s|--scope)
            SCOPE_JSON="$2"
            shift 2
            ;;
        -c|--context)
            CONTEXT_JSON="$2"
            shift 2
            ;;
        -h|--help)
            usage
            ;;
        *)
            print_error "Unknown option: $1"
            usage
            ;;
    esac
done

# Validate required arguments
if [ -z "$WORKER_TYPE" ] || [ -z "$TASK_ID" ] || [ -z "$MASTER_AGENT" ]; then
    print_error "Missing required arguments"
    usage
fi

# Validate worker type
VALID_TYPES=("scan-worker" "fix-worker" "analysis-worker" "implementation-worker" "test-worker" "review-worker" "pr-worker" "documentation-worker")
if [[ ! " ${VALID_TYPES[@]} " =~ " ${WORKER_TYPE} " ]]; then
    print_error "Invalid worker type: $WORKER_TYPE"
    print_info "Valid types: ${VALID_TYPES[*]}"
    exit 1
fi

# Set default token budget based on worker type
if [ -z "$TOKEN_BUDGET" ]; then
    case $WORKER_TYPE in
        scan-worker)
            TOKEN_BUDGET=8000
            TIMEOUT_MINUTES=15
            ;;
        fix-worker)
            TOKEN_BUDGET=5000
            TIMEOUT_MINUTES=20
            ;;
        analysis-worker)
            TOKEN_BUDGET=5000
            TIMEOUT_MINUTES=15
            ;;
        implementation-worker)
            TOKEN_BUDGET=10000
            TIMEOUT_MINUTES=45
            ;;
        test-worker)
            TOKEN_BUDGET=6000
            TIMEOUT_MINUTES=20
            ;;
        review-worker)
            TOKEN_BUDGET=5000
            TIMEOUT_MINUTES=15
            ;;
        pr-worker)
            TOKEN_BUDGET=4000
            TIMEOUT_MINUTES=10
            ;;
        documentation-worker)
            TOKEN_BUDGET=6000
            TIMEOUT_MINUTES=20
            ;;
    esac
fi

# Navigate to project root
cd "$COMMIT_RELAY_HOME"

# Pull latest state
print_info "Pulling latest coordination state..."
git pull origin main --quiet

# Generate worker ID
WORKER_COUNT=$(jq '.active_workers | length' coordination/worker-pool.json)
WORKER_NUM=$(printf "%03d" $((WORKER_COUNT + 1)))
WORKER_ID="worker-${WORKER_TYPE%-worker}-${WORKER_NUM}"

print_info "Generating worker: $WORKER_ID"

# Generate timestamps
CREATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
if [ -z "$DEADLINE" ]; then
    DEADLINE="null"
else
    DEADLINE="\"$DEADLINE\""
fi

# Build scope JSON
if [ -z "$SCOPE_JSON" ]; then
    if [ -n "$REPOSITORY" ]; then
        SCOPE_JSON=$(cat <<EOF
{
  "repository": "$REPOSITORY",
  "branch": "main",
  "description": "Worker task for $TASK_ID"
}
EOF
)
    else
        SCOPE_JSON="{}"
    fi
fi

# Build context JSON
if [ -z "$CONTEXT_JSON" ]; then
    CONTEXT_JSON=$(cat <<EOF
{
  "parent_task": "$TASK_ID",
  "priority": "$PRIORITY",
  "deadline": $DEADLINE
}
EOF
)
fi

# Create worker specification
WORKER_SPEC_FILE="coordination/worker-specs/active/${WORKER_ID}.json"

print_info "Creating worker specification: $WORKER_SPEC_FILE"

cat > "$WORKER_SPEC_FILE" <<EOF
{
  "worker_id": "$WORKER_ID",
  "worker_type": "$WORKER_TYPE",
  "created_by": "$MASTER_AGENT",
  "created_at": "$CREATED_AT",
  "task_id": "$TASK_ID",
  "status": "pending",
  "scope": $SCOPE_JSON,
  "context": $CONTEXT_JSON,
  "resources": {
    "token_budget": $TOKEN_BUDGET,
    "timeout_minutes": $TIMEOUT_MINUTES,
    "max_retries": 1
  },
  "deliverables": [],
  "prompt_template": "agents/prompts/workers/${WORKER_TYPE}.md",
  "execution": {
    "started_at": null,
    "completed_at": null,
    "tokens_used": 0,
    "duration_minutes": 0,
    "session_id": null
  },
  "results": {
    "status": null,
    "output_location": null,
    "summary": null,
    "artifacts": []
  }
}
EOF

# Validate JSON
if ! jq empty "$WORKER_SPEC_FILE" 2>/dev/null; then
    print_error "Generated invalid JSON in worker specification"
    exit 1
fi

print_success "Worker specification created"

# Update worker-pool.json
print_info "Updating worker pool..."

# Add to active workers
TMP_FILE=$(mktemp)
jq --arg worker_id "$WORKER_ID" \
   --arg worker_type "$WORKER_TYPE" \
   --arg spawned_by "$MASTER_AGENT" \
   --arg spawned_at "$CREATED_AT" \
   --arg task_id "$TASK_ID" \
   --argjson token_budget "$TOKEN_BUDGET" \
   '.active_workers += [{
     "worker_id": $worker_id,
     "worker_type": $worker_type,
     "spawned_by": $spawned_by,
     "spawned_at": $spawned_at,
     "status": "pending",
     "task_id": $task_id,
     "token_budget": $token_budget,
     "tokens_used": 0,
     "timeout_at": null,
     "last_heartbeat": null,
     "session_id": null
   }] | .updated_at = $spawned_at | .stats.total_spawned_today += 1' \
   coordination/worker-pool.json > "$TMP_FILE"

mv "$TMP_FILE" coordination/worker-pool.json

print_success "Worker pool updated"

# Update token budget
print_info "Allocating token budget..."

TMP_FILE=$(mktemp)
jq --arg master "$MASTER_AGENT" \
   --argjson tokens "$TOKEN_BUDGET" \
   '.worker_pool.allocated_to_workers += $tokens |
    .worker_pool.available -= $tokens |
    .updated_at = "'$CREATED_AT'"' \
   coordination/token-budget.json > "$TMP_FILE"

mv "$TMP_FILE" coordination/token-budget.json

print_success "Token budget allocated: $TOKEN_BUDGET tokens"

# Create worker log directory
WORKER_LOG_DIR="agents/logs/workers/$(date +%Y-%m-%d)/${WORKER_ID}"
mkdir -p "$WORKER_LOG_DIR"

print_success "Worker log directory created: $WORKER_LOG_DIR"

# Display summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}Worker Spawned Successfully${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}Worker ID:${NC}       $WORKER_ID"
echo -e "${BLUE}Type:${NC}            $WORKER_TYPE"
echo -e "${BLUE}Master:${NC}          $MASTER_AGENT"
echo -e "${BLUE}Task:${NC}            $TASK_ID"
echo -e "${BLUE}Token Budget:${NC}    $TOKEN_BUDGET"
echo -e "${BLUE}Timeout:${NC}         ${TIMEOUT_MINUTES} minutes"
echo -e "${BLUE}Priority:${NC}        $PRIORITY"
if [ -n "$REPOSITORY" ]; then
    echo -e "${BLUE}Repository:${NC}      $REPOSITORY"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Display next steps
print_info "Next Steps:"
echo "1. Start Claude Code session with worker prompt:"
echo "   claude-code --prompt-file agents/prompts/workers/${WORKER_TYPE}.md"
echo ""
echo "2. Worker will read its specification from:"
echo "   $WORKER_SPEC_FILE"
echo ""
echo "3. Worker logs will be written to:"
echo "   $WORKER_LOG_DIR"
echo ""

print_warning "Remember to commit these changes to the coordination repository!"
echo "   cd ~/commit-relay"
echo "   git add ."
echo "   git commit -m \"feat(\$MASTER_AGENT): spawned $WORKER_ID for $TASK_ID\""
echo "   git push origin main"

exit 0
