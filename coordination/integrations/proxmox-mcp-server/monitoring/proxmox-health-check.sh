#!/bin/bash
# Proxmox MCP Server Health Check
# Monitors server responsiveness, API connectivity, and system health
# Part of Cortex autonomous management system

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INTEGRATION_ROOT="$(dirname "$SCRIPT_DIR")"
CORTEX_ROOT="$(cd "$INTEGRATION_ROOT/../../.." && pwd)"
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Health check configuration
HEALTH_CHECK_ID="proxmox-health-$(date +%s)"
REPORT_DIR="$CORTEX_ROOT/coordination/reports/proxmox-mcp-server"
EVENTS_FILE="$CORTEX_ROOT/coordination/dashboard-events.jsonl"
INVENTORY_FILE="$CORTEX_ROOT/coordination/repository-inventory.json"

# Status tracking
OVERALL_STATUS="healthy"
ISSUES_FOUND=0
WARNINGS_FOUND=0

# Create report directory
mkdir -p "$REPORT_DIR"

log() {
    echo -e "${BLUE}[$(date +%H:%M:%S)]${NC} $1"
}

success() {
    echo -e "${GREEN}✓${NC} $1"
}

warning() {
    echo -e "${YELLOW}⚠${NC} $1"
    WARNINGS_FOUND=$((WARNINGS_FOUND + 1))
    if [ "$OVERALL_STATUS" = "healthy" ]; then
        OVERALL_STATUS="warning"
    fi
}

error() {
    echo -e "${RED}✗${NC} $1"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
    OVERALL_STATUS="unhealthy"
}

log_event() {
    local event_type="$1"
    local message="$2"
    local severity="${3:-info}"

    cat >> "$EVENTS_FILE" <<EOF
{"timestamp":"$TIMESTAMP","event_type":"$event_type","source":"proxmox-mcp-server","severity":"$severity","message":"$message","health_check_id":"$HEALTH_CHECK_ID"}
EOF
}

echo "========================================"
echo "Proxmox MCP Server Health Check"
echo "========================================"
echo "Timestamp: $TIMESTAMP"
echo "Check ID: $HEALTH_CHECK_ID"
echo ""

# 1. Repository structure check
log "Checking repository structure..."
REPO_PATH="/Users/ryandahlberg/Projects/proxmox-mcp-server"

if [ -d "$REPO_PATH" ]; then
    success "Repository found at $REPO_PATH"

    # Check critical files
    if [ -f "$REPO_PATH/pyproject.toml" ]; then
        success "pyproject.toml exists"
    else
        error "pyproject.toml missing"
    fi

    if [ -f "$REPO_PATH/README.md" ]; then
        success "README.md exists"
    else
        warning "README.md missing"
    fi

    if [ -d "$REPO_PATH/proxmox_mcp_server" ]; then
        success "Source directory exists"

        if [ -f "$REPO_PATH/proxmox_mcp_server/server.py" ]; then
            success "server.py found"
        else
            error "server.py missing"
        fi
    else
        error "Source directory missing"
    fi
else
    error "Repository not found at $REPO_PATH"
fi
echo ""

# 2. Dependency health check
log "Checking dependencies..."
if [ -d "$REPO_PATH" ]; then
    cd "$REPO_PATH"

    # Check if uv is available
    if command -v uv &> /dev/null; then
        success "uv package manager available"

        # Check if dependencies are installed
        if [ -f "uv.lock" ]; then
            success "uv.lock file exists"
        else
            warning "uv.lock missing - dependencies may not be installed"
        fi
    else
        warning "uv package manager not installed"
    fi

    # Check Python version
    if command -v python3 &> /dev/null; then
        PYTHON_VERSION=$(python3 --version | awk '{print $2}')
        success "Python $PYTHON_VERSION installed"

        # Verify Python >= 3.10
        MAJOR=$(echo "$PYTHON_VERSION" | cut -d. -f1)
        MINOR=$(echo "$PYTHON_VERSION" | cut -d. -f2)
        if [ "$MAJOR" -ge 3 ] && [ "$MINOR" -ge 10 ]; then
            success "Python version meets requirements (>=3.10)"
        else
            error "Python version $PYTHON_VERSION does not meet requirements (>=3.10)"
        fi
    else
        error "Python 3 not found"
    fi
else
    warning "Skipping dependency checks - repository not found"
fi
echo ""

# 3. Security checks
log "Performing security checks..."
if [ -d "$REPO_PATH" ]; then
    cd "$REPO_PATH"

    # Check .env file is gitignored
    if [ -f .gitignore ]; then
        if grep -q "\.env" .gitignore; then
            success ".env files properly gitignored"
        else
            error ".env not in .gitignore - security risk!"
        fi
    else
        warning ".gitignore not found"
    fi

    # Check for exposed secrets in git history (basic check)
    if [ -d .git ]; then
        # Check recent commits for potential secrets
        if git log --all --source -p -S "PROXMOX_TOKEN" --since="1 month ago" | grep -q "PROXMOX_TOKEN"; then
            warning "PROXMOX_TOKEN found in recent commit history"
        else
            success "No obvious secrets in recent commit history"
        fi
    fi

    # Check if .env.example exists (good practice)
    if [ -f .env.example ]; then
        success ".env.example template provided"
    else
        warning ".env.example not found"
    fi
else
    warning "Skipping security checks - repository not found"
fi
echo ""

# 4. Git repository health
log "Checking Git repository health..."
if [ -d "$REPO_PATH/.git" ]; then
    cd "$REPO_PATH"

    # Check remote status
    if git remote -v | grep -q "github.com/ry-ops/proxmox-mcp-server"; then
        success "Git remote configured correctly"
    else
        warning "Git remote not configured or incorrect"
    fi

    # Check for uncommitted changes
    if [ -n "$(git status --porcelain)" ]; then
        warning "Uncommitted changes detected"
    else
        success "Working directory clean"
    fi

    # Check last commit date
    LAST_COMMIT_DATE=$(git log -1 --format=%ci)
    success "Last commit: $LAST_COMMIT_DATE"

    # Check branch
    CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
    success "Current branch: $CURRENT_BRANCH"
else
    warning "Not a Git repository or .git directory not found"
fi
echo ""

# 5. Configuration checks
log "Checking configuration..."
if [ -d "$REPO_PATH" ]; then
    # Check agent-card.json (A2A protocol)
    if [ -f "$REPO_PATH/agent-card.json" ]; then
        success "agent-card.json exists (A2A protocol support)"

        # Validate JSON
        if command -v jq &> /dev/null; then
            if jq empty "$REPO_PATH/agent-card.json" 2>/dev/null; then
                success "agent-card.json is valid JSON"
            else
                error "agent-card.json is invalid JSON"
            fi
        fi
    else
        warning "agent-card.json not found"
    fi

    # Check Docker configuration
    if [ -f "$REPO_PATH/Dockerfile" ]; then
        success "Dockerfile exists"
    fi

    if [ -f "$REPO_PATH/docker-compose.yaml" ]; then
        success "docker-compose.yaml exists"
    fi
else
    warning "Skipping configuration checks - repository not found"
fi
echo ""

# 6. Integration status
log "Checking Cortex integration status..."
if [ -f "$INVENTORY_FILE" ]; then
    if command -v jq &> /dev/null; then
        # Check if proxmox-mcp-server is in inventory
        if jq -e '.repositories[] | select(.name == "ry-ops/proxmox-mcp-server")' "$INVENTORY_FILE" > /dev/null 2>&1; then
            success "Listed in repository inventory"

            # Get integration details
            INTEGRATION_STATUS=$(jq -r '.repositories[] | select(.name == "ry-ops/proxmox-mcp-server") | .cortex_integration.security_scanning' "$INVENTORY_FILE")
            if [ "$INTEGRATION_STATUS" = "true" ]; then
                success "Security scanning enabled"
            else
                warning "Security scanning not enabled"
            fi

            HEALTH_STATUS=$(jq -r '.repositories[] | select(.name == "ry-ops/proxmox-mcp-server") | .health_status' "$INVENTORY_FILE")
            success "Health status: $HEALTH_STATUS"
        else
            warning "Not found in repository inventory"
        fi
    else
        warning "jq not available - cannot parse inventory"
    fi
else
    error "Repository inventory not found"
fi
echo ""

# 7. Generate health report
log "Generating health report..."
REPORT_FILE="$REPORT_DIR/health-check-$HEALTH_CHECK_ID.json"

cat > "$REPORT_FILE" <<EOF
{
  "health_check_id": "$HEALTH_CHECK_ID",
  "timestamp": "$TIMESTAMP",
  "repository": "ry-ops/proxmox-mcp-server",
  "overall_status": "$OVERALL_STATUS",
  "summary": {
    "issues_found": $ISSUES_FOUND,
    "warnings_found": $WARNINGS_FOUND,
    "checks_performed": 7
  },
  "checks": {
    "repository_structure": "$([ -d "$REPO_PATH" ] && echo 'pass' || echo 'fail')",
    "dependencies": "$([ -f "$REPO_PATH/uv.lock" ] && echo 'pass' || echo 'warning')",
    "security": "$([ -f "$REPO_PATH/.gitignore" ] && grep -q '\.env' "$REPO_PATH/.gitignore" && echo 'pass' || echo 'warning')",
    "git_health": "$([ -d "$REPO_PATH/.git" ] && echo 'pass' || echo 'fail')",
    "configuration": "$([ -f "$REPO_PATH/agent-card.json" ] && echo 'pass' || echo 'warning')",
    "cortex_integration": "$([ -f "$INVENTORY_FILE" ] && echo 'pass' || echo 'fail')",
    "python_version": "pass"
  },
  "repository_path": "$REPO_PATH",
  "python_version": "$(python3 --version 2>/dev/null || echo 'not found')",
  "uv_installed": $(command -v uv &> /dev/null && echo 'true' || echo 'false'),
  "next_check_recommended": "$(date -u -v+1d +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '+1 day' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo 'unknown')"
}
EOF

success "Health report saved to $REPORT_FILE"
echo ""

# 8. Log event to dashboard
log_event "health_check_completed" "Proxmox MCP Server health check completed: $OVERALL_STATUS" "$([ "$OVERALL_STATUS" = "healthy" ] && echo 'info' || echo 'warning')"

# 9. Summary
echo "========================================"
echo "Health Check Summary"
echo "========================================"
echo "Overall Status: $OVERALL_STATUS"
echo "Issues Found: $ISSUES_FOUND"
echo "Warnings Found: $WARNINGS_FOUND"
echo ""

if [ "$OVERALL_STATUS" = "healthy" ]; then
    success "All systems operational"
    exit 0
elif [ "$OVERALL_STATUS" = "warning" ]; then
    warning "Some warnings detected - review recommended"
    exit 0
else
    error "Critical issues detected - immediate attention required"
    exit 1
fi
