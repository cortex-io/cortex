#!/bin/bash
# Pre-Deployment Readiness Checks
# Validates deployment gates before promoting to production

set -euo pipefail

CORTEX_HOME="${CORTEX_HOME:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
PYTHON="${PYTHON:-python3}"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Tracking
CHECKS_PASSED=0
CHECKS_FAILED=0
WARNINGS=0

##############################################################################
# Helper Functions
##############################################################################

check_pass() {
  echo -e "${GREEN}✓${NC} $1"
  ((CHECKS_PASSED++))
}

check_fail() {
  echo -e "${RED}✗${NC} $1"
  ((CHECKS_FAILED++))
}

check_warn() {
  echo -e "${YELLOW}⚠${NC} $1"
  ((WARNINGS++))
}

section_header() {
  echo ""
  echo "========================================="
  echo "$1"
  echo "========================================="
}

##############################################################################
# Check 1: Configuration Files
##############################################################################
check_configuration_files() {
  section_header "1. Configuration Files"

  local required_dirs=(
    "coordination/masters/coordinator"
    "coordination/masters/development"
    "coordination/masters/security"
    "coordination/masters/inventory"
    "coordination/masters/cicd"
    "coordination/masters/achievement"
    "coordination/lineage"
    "coordination/governance"
  )

  for dir in "${required_dirs[@]}"; do
    if [ -d "$CORTEX_HOME/$dir" ]; then
      check_pass "Directory exists: $dir"
    else
      check_fail "Missing directory: $dir"
    fi
  done

  # Check for essential scripts
  local required_scripts=(
    "coordination/masters/coordinator/lib/routing-cascade.sh"
    "coordination/masters/coordinator/lib/keyword-router.sh"
    "coordination/lineage/log-to-lineage.sh"
  )

  for script in "${required_scripts[@]}"; do
    if [ -f "$CORTEX_HOME/$script" ]; then
      check_pass "Script exists: $script"
    else
      check_fail "Missing script: $script"
    fi
  done
}

##############################################################################
# Check 2: Dependencies
##############################################################################
check_dependencies() {
  section_header "2. Dependencies"

  # Required commands
  local required_commands=(
    "jq"
    "python3"
    "git"
    "bc"
  )

  for cmd in "${required_commands[@]}"; do
    if command -v "$cmd" &> /dev/null; then
      check_pass "Command available: $cmd"
    else
      check_fail "Missing command: $cmd"
    fi
  done

  # Python packages
  if $PYTHON -c "import anthropic" 2>/dev/null; then
    check_pass "Python package: anthropic"
  else
    check_fail "Missing Python package: anthropic"
  fi

  if $PYTHON -c "import numpy" 2>/dev/null; then
    check_pass "Python package: numpy"
  else
    check_warn "Missing Python package: numpy (needed for ML routing)"
  fi

  if $PYTHON -c "import torch" 2>/dev/null; then
    check_pass "Python package: torch"
  else
    check_warn "Missing Python package: torch (needed for PyTorch routing)"
  fi

  # Node.js packages (if applicable)
  if [ -d "$CORTEX_HOME/node_modules" ]; then
    check_pass "Node modules installed"
  else
    check_warn "Node modules not found (run npm install if using Node.js components)"
  fi
}

##############################################################################
# Check 3: Resource Availability
##############################################################################
check_resources() {
  section_header "3. Resource Availability"

  # Disk space (require at least 1GB free)
  local available_space=$(df -k "$CORTEX_HOME" | awk 'NR==2 {print $4}')
  local available_mb=$((available_space / 1024))

  if [ "$available_mb" -gt 1024 ]; then
    check_pass "Disk space: ${available_mb}MB available"
  else
    check_fail "Insufficient disk space: ${available_mb}MB (need >1GB)"
  fi

  # API key presence
  if [ -f "$CORTEX_HOME/.env" ]; then
    if grep -q "ANTHROPIC_API_KEY=" "$CORTEX_HOME/.env" 2>/dev/null; then
      local key_value=$(grep "ANTHROPIC_API_KEY=" "$CORTEX_HOME/.env" | cut -d'=' -f2 | tr -d '"' | tr -d "'")
      if [ -n "$key_value" ] && [ "$key_value" != "your-api-key-here" ]; then
        check_pass "Anthropic API key configured"
      else
        check_fail "Anthropic API key not set in .env"
      fi
    else
      check_fail "ANTHROPIC_API_KEY not found in .env"
    fi
  else
    check_fail ".env file not found"
  fi

  # Check for logs directory
  if [ -d "$CORTEX_HOME/logs" ]; then
    check_pass "Logs directory exists"
  else
    check_warn "Logs directory missing (will be created automatically)"
    mkdir -p "$CORTEX_HOME/logs"
  fi

  # Check coordination logs directory
  if [ -d "$CORTEX_HOME/coordination/logs" ]; then
    check_pass "Coordination logs directory exists"
  else
    check_warn "Coordination logs directory missing (will be created automatically)"
    mkdir -p "$CORTEX_HOME/coordination/logs"
  fi
}

##############################################################################
# Check 4: JSON Schema Validation
##############################################################################
check_json_schemas() {
  section_header "4. JSON Schema Validation"

  local json_files=$(find "$CORTEX_HOME/coordination" -name "*.json" -type f 2>/dev/null || true)

  if [ -z "$json_files" ]; then
    check_warn "No JSON files found to validate"
    return
  fi

  local valid_count=0
  local invalid_count=0

  while IFS= read -r file; do
    if jq empty "$file" 2>/dev/null; then
      ((valid_count++))
    else
      check_fail "Invalid JSON: $file"
      ((invalid_count++))
    fi
  done <<< "$json_files"

  if [ "$invalid_count" -eq 0 ]; then
    check_pass "All $valid_count JSON files valid"
  else
    check_fail "$invalid_count JSON files invalid, $valid_count valid"
  fi
}

##############################################################################
# Check 5: Master Prompt Availability
##############################################################################
check_master_prompts() {
  section_header "5. Master Prompts Availability"

  local masters=(
    "coordinator"
    "development"
    "security"
    "inventory"
    "cicd"
    "achievement"
  )

  for master in "${masters[@]}"; do
    local master_dir="$CORTEX_HOME/coordination/masters/$master"

    if [ -d "$master_dir" ]; then
      # Check for at least one prompt file
      if ls "$master_dir"/prompts/*.md &>/dev/null || ls "$master_dir"/*.md &>/dev/null; then
        check_pass "Master $master has prompt files"
      else
        check_warn "Master $master missing prompt files"
      fi
    else
      check_warn "Master directory not found: $master"
    fi
  done
}

##############################################################################
# Check 6: Worker Type Registry
##############################################################################
check_worker_types() {
  section_header "6. Worker Type Registry"

  # Check if worker types are documented
  if [ -f "$CORTEX_HOME/coordination/masters/WORKER_SPEC_BEST_PRACTICES.md" ]; then
    check_pass "Worker spec best practices documented"
  else
    check_warn "Worker spec documentation missing"
  fi

  # Check for worker test files
  local worker_tests=$(find "$CORTEX_HOME/testing/workers" -name "*.test.js" -o -name "*.sh" 2>/dev/null | wc -l)

  if [ "$worker_tests" -gt 0 ]; then
    check_pass "Worker tests found: $worker_tests files"
  else
    check_warn "No worker tests found"
  fi
}

##############################################################################
# Check 7: Routing System
##############################################################################
check_routing_system() {
  section_header "7. Routing System"

  # Check routing components
  local routing_components=(
    "coordination/masters/coordinator/lib/keyword-router.sh"
    "llm-mesh/lib/routing/run_semantic.py"
    "llm-mesh/lib/routing/run_rag_enhanced.py"
    "llm-mesh/lib/routing/run_pytorch.py"
    "llm-mesh/lib/routing/cold_start_handler.py"
  )

  local available_layers=0

  for component in "${routing_components[@]}"; do
    if [ -f "$CORTEX_HOME/$component" ]; then
      ((available_layers++))
      check_pass "Routing layer available: $(basename "$component")"
    else
      check_warn "Routing layer missing: $(basename "$component")"
    fi
  done

  if [ "$available_layers" -ge 2 ]; then
    check_pass "Sufficient routing layers: $available_layers/5"
  else
    check_fail "Insufficient routing layers: $available_layers/5 (need at least 2)"
  fi
}

##############################################################################
# Check 8: Lineage and Tracing
##############################################################################
check_lineage_tracing() {
  section_header "8. Lineage and Tracing"

  # Check lineage system
  if [ -f "$CORTEX_HOME/coordination/lineage/log-to-lineage.sh" ]; then
    check_pass "Lineage logging script available"
  else
    check_fail "Lineage logging script missing"
  fi

  # Check lineage directory
  if [ -d "$CORTEX_HOME/coordination/lineage" ]; then
    check_pass "Lineage directory exists"
  else
    check_fail "Lineage directory missing"
  fi

  # Check for distributed tracing support
  if grep -rq "correlation_id" "$CORTEX_HOME/coordination" 2>/dev/null; then
    check_pass "Distributed tracing (correlation_id) implemented"
  else
    check_warn "Distributed tracing not fully implemented"
  fi
}

##############################################################################
# Check 9: Governance and Security
##############################################################################
check_governance() {
  section_header "9. Governance and Security"

  local governance_components=(
    "coordination/governance/lib/pii-scanner.sh"
    "coordination/governance/lib/quality-monitor.sh"
  )

  for component in "${governance_components[@]}"; do
    if [ -f "$CORTEX_HOME/$component" ]; then
      check_pass "Governance component: $(basename "$component")"
    else
      check_warn "Governance component missing: $(basename "$component")"
    fi
  done

  # Check for security master
  if [ -d "$CORTEX_HOME/coordination/masters/security" ]; then
    check_pass "Security master exists"
  else
    check_warn "Security master missing"
  fi
}

##############################################################################
# Check 10: Version Consistency
##############################################################################
check_version_consistency() {
  section_header "10. Version Consistency"

  # Check git status
  if [ -d "$CORTEX_HOME/.git" ]; then
    check_pass "Git repository initialized"

    # Check for uncommitted changes
    if git -C "$CORTEX_HOME" diff-index --quiet HEAD -- 2>/dev/null; then
      check_pass "No uncommitted changes"
    else
      check_warn "Uncommitted changes detected (consider committing before deployment)"
    fi

    # Check current branch
    local current_branch=$(git -C "$CORTEX_HOME" rev-parse --abbrev-ref HEAD 2>/dev/null)
    if [ "$current_branch" = "main" ] || [ "$current_branch" = "master" ]; then
      check_pass "On main branch: $current_branch"
    else
      check_warn "Not on main branch (current: $current_branch)"
    fi
  else
    check_warn "Not a git repository"
  fi
}

##############################################################################
# Main Execution
##############################################################################
main() {
  echo "╔════════════════════════════════════════╗"
  echo "║  Cortex Pre-Deployment Readiness Check ║"
  echo "╔════════════════════════════════════════╗"
  echo ""
  echo "Cortex Home: $CORTEX_HOME"
  echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

  # Run all checks
  check_configuration_files
  check_dependencies
  check_resources
  check_json_schemas
  check_master_prompts
  check_worker_types
  check_routing_system
  check_lineage_tracing
  check_governance
  check_version_consistency

  # Summary
  echo ""
  echo "========================================="
  echo "READINESS CHECK SUMMARY"
  echo "========================================="
  echo -e "${GREEN}Passed:${NC}   $CHECKS_PASSED"
  echo -e "${RED}Failed:${NC}   $CHECKS_FAILED"
  echo -e "${YELLOW}Warnings:${NC} $WARNINGS"
  echo ""

  if [ "$CHECKS_FAILED" -eq 0 ]; then
    echo -e "${GREEN}✓ DEPLOYMENT READY${NC}"
    if [ "$WARNINGS" -gt 0 ]; then
      echo -e "${YELLOW}Note: $WARNINGS warnings found - review before deploying${NC}"
    fi
    exit 0
  else
    echo -e "${RED}✗ NOT READY FOR DEPLOYMENT${NC}"
    echo "Fix $CHECKS_FAILED failed checks before deploying"
    exit 1
  fi
}

# Run main if executed directly
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
  main "$@"
fi
