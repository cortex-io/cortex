#!/bin/bash
# Validate Deployment - Orchestrates all pre-deployment checks
# Run this before promoting any changes to production

set -euo pipefail

CORTEX_HOME="${CORTEX_HOME:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
CORTEX_ENV="${CORTEX_ENV:-staging}"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Test suite paths
READINESS_CHECKS="$CORTEX_HOME/testing/pre-deployment/readiness-checks.sh"
SMOKE_TESTS="$CORTEX_HOME/testing/pre-deployment/smoke-tests.sh"
INTEGRATION_TESTS="$CORTEX_HOME/testing/pre-deployment/integration-tests.sh"
LOAD_TESTS="$CORTEX_HOME/testing/pre-deployment/load-tests.sh"

# Results
VALIDATION_REPORT="/tmp/cortex-validation-report-$(date +%s).json"
VALIDATION_START_TIME=$(date +%s)

# Validation stages
STAGE_RESULTS=()

##############################################################################
# Helper Functions
##############################################################################

print_header() {
  echo ""
  echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║  $1${NC}"
  echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
  echo ""
}

print_stage() {
  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}STAGE $1: $2${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
}

stage_pass() {
  echo -e "${GREEN}✓ STAGE PASSED${NC}: $1"
  STAGE_RESULTS+=("pass:$1")
}

stage_fail() {
  echo -e "${RED}✗ STAGE FAILED${NC}: $1"
  STAGE_RESULTS+=("fail:$1")
}

stage_skip() {
  echo -e "${YELLOW}⊘ STAGE SKIPPED${NC}: $1"
  STAGE_RESULTS+=("skip:$1")
}

check_prerequisites() {
  print_header "Checking Prerequisites"

  local missing_tools=()

  # Check for required commands
  for cmd in jq python3 bash bc; do
    if ! command -v "$cmd" &> /dev/null; then
      missing_tools+=("$cmd")
    fi
  done

  if [ ${#missing_tools[@]} -gt 0 ]; then
    echo -e "${RED}✗ Missing required tools: ${missing_tools[*]}${NC}"
    echo "Please install missing tools before running validation"
    exit 1
  fi

  echo -e "${GREEN}✓ All required tools present${NC}"

  # Check for test scripts
  local missing_scripts=()

  if [ ! -f "$READINESS_CHECKS" ]; then missing_scripts+=("readiness-checks.sh"); fi
  if [ ! -f "$SMOKE_TESTS" ]; then missing_scripts+=("smoke-tests.sh"); fi
  if [ ! -f "$INTEGRATION_TESTS" ]; then missing_scripts+=("integration-tests.sh"); fi
  if [ ! -f "$LOAD_TESTS" ]; then missing_scripts+=("load-tests.sh"); fi

  if [ ${#missing_scripts[@]} -gt 0 ]; then
    echo -e "${RED}✗ Missing test scripts: ${missing_scripts[*]}${NC}"
    echo "Test scripts should be in: $CORTEX_HOME/testing/pre-deployment/"
    exit 1
  fi

  echo -e "${GREEN}✓ All test scripts present${NC}"
}

##############################################################################
# Stage 1: Readiness Checks
##############################################################################
run_readiness_checks() {
  print_stage "1" "Readiness Checks"

  echo "Running deployment gates..."
  echo "Time limit: 30 seconds"
  echo ""

  local stage_start=$(date +%s)

  if timeout 30 bash "$READINESS_CHECKS"; then
    local stage_end=$(date +%s)
    local duration=$((stage_end - stage_start))

    echo ""
    echo "Duration: ${duration}s"
    stage_pass "Readiness Checks (${duration}s)"
    return 0
  else
    local exit_code=$?
    local stage_end=$(date +%s)
    local duration=$((stage_end - stage_start))

    echo ""
    echo "Duration: ${duration}s"

    if [ $exit_code -eq 124 ]; then
      echo -e "${RED}Readiness checks timed out after 30s${NC}"
    fi

    stage_fail "Readiness Checks (${duration}s)"
    return 1
  fi
}

##############################################################################
# Stage 2: Smoke Tests
##############################################################################
run_smoke_tests() {
  print_stage "2" "Smoke Tests (Quick Validation)"

  echo "Running smoke tests..."
  echo "Target: <2 minutes"
  echo ""

  local stage_start=$(date +%s)

  if timeout 120 bash "$SMOKE_TESTS"; then
    local stage_end=$(date +%s)
    local duration=$((stage_end - stage_start))

    echo ""
    echo "Duration: ${duration}s"
    stage_pass "Smoke Tests (${duration}s)"
    return 0
  else
    local exit_code=$?
    local stage_end=$(date +%s)
    local duration=$((stage_end - stage_start))

    echo ""
    echo "Duration: ${duration}s"

    if [ $exit_code -eq 124 ]; then
      echo -e "${RED}Smoke tests timed out after 2 minutes${NC}"
    fi

    stage_fail "Smoke Tests (${duration}s)"
    return 1
  fi
}

##############################################################################
# Stage 3: Integration Tests
##############################################################################
run_integration_tests() {
  print_stage "3" "Integration Tests (End-to-End Scenarios)"

  echo "Running integration tests in staging environment..."
  echo "Environment: $CORTEX_ENV"
  echo "Target: <5 minutes"
  echo ""

  local stage_start=$(date +%s)

  export CORTEX_ENV="staging"

  if timeout 300 bash "$INTEGRATION_TESTS"; then
    local stage_end=$(date +%s)
    local duration=$((stage_end - stage_start))

    echo ""
    echo "Duration: ${duration}s"
    stage_pass "Integration Tests (${duration}s)"
    return 0
  else
    local exit_code=$?
    local stage_end=$(date +%s)
    local duration=$((stage_end - stage_start))

    echo ""
    echo "Duration: ${duration}s"

    if [ $exit_code -eq 124 ]; then
      echo -e "${RED}Integration tests timed out after 5 minutes${NC}"
    fi

    stage_fail "Integration Tests (${duration}s)"
    return 1
  fi
}

##############################################################################
# Stage 4: Load Tests
##############################################################################
run_load_tests() {
  print_stage "4" "Load Tests (Performance Validation)"

  echo "Running load tests in staging environment..."
  echo "Concurrent tasks: 10"
  echo "Target throughput: 5 tasks/min"
  echo "Target P95 latency: <30s"
  echo ""

  local stage_start=$(date +%s)

  export CORTEX_ENV="staging"

  if timeout 300 bash "$LOAD_TESTS"; then
    local stage_end=$(date +%s)
    local duration=$((stage_end - stage_start))

    echo ""
    echo "Duration: ${duration}s"
    stage_pass "Load Tests (${duration}s)"
    return 0
  else
    local exit_code=$?
    local stage_end=$(date +%s)
    local duration=$((stage_end - stage_start))

    echo ""
    echo "Duration: ${duration}s"

    if [ $exit_code -eq 124 ]; then
      echo -e "${RED}Load tests timed out after 5 minutes${NC}"
    fi

    stage_fail "Load Tests (${duration}s)"
    return 1
  fi
}

##############################################################################
# Generate Validation Report
##############################################################################
generate_report() {
  print_header "Generating Validation Report"

  local end_time=$(date +%s)
  local total_duration=$((end_time - VALIDATION_START_TIME))

  local passed=0
  local failed=0
  local skipped=0

  for result in "${STAGE_RESULTS[@]}"; do
    local status="${result%%:*}"
    case "$status" in
      pass) ((passed++)) ;;
      fail) ((failed++)) ;;
      skip) ((skipped++)) ;;
    esac
  done

  # Create JSON report
  local stages_json="["
  local first=true
  for result in "${STAGE_RESULTS[@]}"; do
    local status="${result%%:*}"
    local stage="${result#*:}"

    if [ "$first" = true ]; then
      first=false
    else
      stages_json+=","
    fi

    stages_json+="{\"stage\":\"$stage\",\"status\":\"$status\"}"
  done
  stages_json+="]"

  local report=$(jq -n \
    --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg environment "$CORTEX_ENV" \
    --argjson duration "$total_duration" \
    --argjson passed "$passed" \
    --argjson failed "$failed" \
    --argjson skipped "$skipped" \
    --argjson stages "$stages_json" \
    '{
      validation_timestamp: $timestamp,
      environment: $environment,
      total_duration_seconds: $duration,
      summary: {
        passed: $passed,
        failed: $failed,
        skipped: $skipped,
        total: ($passed + $failed + $skipped)
      },
      stages: $stages,
      deployment_ready: ($failed == 0)
    }')

  echo "$report" > "$VALIDATION_REPORT"

  echo "Report saved to: $VALIDATION_REPORT"
  echo ""
  echo "$report" | jq '.'
}

##############################################################################
# Final Summary
##############################################################################
print_summary() {
  print_header "Validation Summary"

  local end_time=$(date +%s)
  local total_duration=$((end_time - VALIDATION_START_TIME))
  local minutes=$((total_duration / 60))
  local seconds=$((total_duration % 60))

  echo "Total Duration: ${minutes}m ${seconds}s"
  echo ""

  local passed=0
  local failed=0
  local skipped=0

  for result in "${STAGE_RESULTS[@]}"; do
    local status="${result%%:*}"
    local stage="${result#*:}"

    case "$status" in
      pass)
        echo -e "  ${GREEN}✓${NC} $stage"
        ((passed++))
        ;;
      fail)
        echo -e "  ${RED}✗${NC} $stage"
        ((failed++))
        ;;
      skip)
        echo -e "  ${YELLOW}⊘${NC} $stage"
        ((skipped++))
        ;;
    esac
  done

  echo ""
  echo "Results:"
  echo -e "  ${GREEN}Passed:${NC}  $passed"
  echo -e "  ${RED}Failed:${NC}  $failed"
  echo -e "  ${YELLOW}Skipped:${NC} $skipped"
  echo ""

  if [ "$failed" -eq 0 ]; then
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                  ✓ DEPLOYMENT READY                            ║${NC}"
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo ""
    echo "All validation stages passed. Safe to deploy to production."
    echo ""
    return 0
  else
    echo -e "${RED}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║                  ✗ NOT READY FOR DEPLOYMENT                    ║${NC}"
    echo -e "${RED}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo ""
    echo "Fix $failed failed stage(s) before deploying to production."
    echo ""
    return 1
  fi
}

##############################################################################
# Main Execution
##############################################################################
main() {
  local stop_on_failure="${STOP_ON_FAILURE:-false}"
  local skip_load_tests="${SKIP_LOAD_TESTS:-false}"

  echo ""
  echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║              Cortex Deployment Validation Suite                ║${NC}"
  echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
  echo ""
  echo "Environment: $CORTEX_ENV"
  echo "Cortex Home: $CORTEX_HOME"
  echo "Start Time: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo ""

  # Prerequisites
  check_prerequisites

  # Run validation stages
  local all_passed=true

  # Stage 1: Readiness Checks
  if ! run_readiness_checks; then
    all_passed=false
    if [ "$stop_on_failure" = "true" ]; then
      echo ""
      echo -e "${RED}Stopping validation due to readiness check failure${NC}"
      echo "Use STOP_ON_FAILURE=false to continue despite failures"
      generate_report
      print_summary
      exit 1
    fi
  fi

  # Stage 2: Smoke Tests
  if ! run_smoke_tests; then
    all_passed=false
    if [ "$stop_on_failure" = "true" ]; then
      echo ""
      echo -e "${RED}Stopping validation due to smoke test failure${NC}"
      generate_report
      print_summary
      exit 1
    fi
  fi

  # Stage 3: Integration Tests
  if ! run_integration_tests; then
    all_passed=false
    if [ "$stop_on_failure" = "true" ]; then
      echo ""
      echo -e "${RED}Stopping validation due to integration test failure${NC}"
      generate_report
      print_summary
      exit 1
    fi
  fi

  # Stage 4: Load Tests (optional)
  if [ "$skip_load_tests" = "true" ]; then
    stage_skip "Load Tests (skipped by user)"
  else
    if ! run_load_tests; then
      all_passed=false
      if [ "$stop_on_failure" = "true" ]; then
        echo ""
        echo -e "${RED}Stopping validation due to load test failure${NC}"
        generate_report
        print_summary
        exit 1
      fi
    fi
  fi

  # Generate report and summary
  generate_report
  print_summary

  if [ "$all_passed" = true ]; then
    exit 0
  else
    exit 1
  fi
}

# Parse command line options
while [[ $# -gt 0 ]]; do
  case $1 in
    --stop-on-failure)
      export STOP_ON_FAILURE=true
      shift
      ;;
    --skip-load-tests)
      export SKIP_LOAD_TESTS=true
      shift
      ;;
    --help)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --stop-on-failure   Stop validation on first failure"
      echo "  --skip-load-tests   Skip load testing stage"
      echo "  --help              Show this help message"
      echo ""
      echo "Environment Variables:"
      echo "  CORTEX_ENV          Set environment (default: staging)"
      echo "  CORTEX_HOME         Set Cortex home directory"
      echo ""
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Run main
main "$@"
