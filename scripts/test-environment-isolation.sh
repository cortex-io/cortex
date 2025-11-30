#!/usr/bin/env bash

################################################################################
# Environment Isolation Test Script
#
# Purpose: Verify environment separation and cross-environment access rules
# Tests:
#   - Environment detection and path resolution
#   - Cross-environment read access rules
#   - Write isolation enforcement
#   - Library integration
################################################################################

set -eo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Source environment library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/environment.sh"

# ==============================================================================
# TEST FRAMEWORK
# ==============================================================================

print_header() {
    echo -e "\n${BLUE}=== $1 ===${NC}\n"
}

print_test() {
    echo -e "${YELLOW}[TEST]${NC} $1"
}

print_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

print_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

run_test() {
    local test_name="$1"
    TESTS_RUN=$((TESTS_RUN + 1))
    print_test "$test_name"
}

# ==============================================================================
# ENVIRONMENT TESTS
# ==============================================================================

test_default_environment() {
    run_test "Default environment should be 'prod'"

    unset CORTEX_ENV 2>/dev/null || true
    local env=$(get_env)

    if [ "$env" = "prod" ]; then
        print_pass "Default environment is prod"
    else
        print_fail "Expected 'prod', got '$env'"
    fi
}

test_environment_variable() {
    run_test "CORTEX_ENV variable should set environment"

    export CORTEX_ENV="dev"
    local env=$(get_env)

    if [ "$env" = "dev" ]; then
        print_pass "CORTEX_ENV=dev correctly set"
    else
        print_fail "Expected 'dev', got '$env'"
    fi

    unset CORTEX_ENV 2>/dev/null || true
}

test_invalid_environment() {
    run_test "Invalid environment should fail gracefully"

    export CORTEX_ENV="invalid"
    # Capture exit code without triggering errexit
    set +e
    local env=$(get_env 2>&1)
    local exit_code=$?
    set -e

    if [ $exit_code -ne 0 ]; then
        print_pass "Invalid environment rejected correctly"
    else
        print_fail "Should have rejected invalid environment"
    fi

    unset CORTEX_ENV 2>/dev/null || true
}

# ==============================================================================
# PATH RESOLUTION TESTS
# ==============================================================================

test_path_resolution_dev() {
    run_test "Dev environment should resolve to coordination/dev paths"

    export CORTEX_ENV="dev"
    local tasks_dir=$(get_tasks_dir)

    if [[ "$tasks_dir" == *"/coordination/dev/tasks" ]]; then
        print_pass "Dev tasks path correct: $tasks_dir"
    else
        print_fail "Expected dev tasks path, got: $tasks_dir"
    fi

    unset CORTEX_ENV 2>/dev/null || true
}

test_path_resolution_staging() {
    run_test "Staging environment should resolve to coordination/staging paths"

    export CORTEX_ENV="staging"
    local metrics_dir=$(get_metrics_dir)

    if [[ "$metrics_dir" == *"/coordination/staging/metrics" ]]; then
        print_pass "Staging metrics path correct: $metrics_dir"
    else
        print_fail "Expected staging metrics path, got: $metrics_dir"
    fi

    unset CORTEX_ENV 2>/dev/null || true
}

test_path_resolution_prod() {
    run_test "Prod environment should resolve to coordination/prod paths"

    export CORTEX_ENV="prod"
    local lineage_dir=$(get_lineage_dir)

    if [[ "$lineage_dir" == *"/coordination/prod/lineage" ]]; then
        print_pass "Prod lineage path correct: $lineage_dir"
    else
        print_fail "Expected prod lineage path, got: $lineage_dir"
    fi

    unset CORTEX_ENV 2>/dev/null || true
}

# ==============================================================================
# CROSS-ENVIRONMENT ACCESS TESTS
# ==============================================================================

test_dev_can_read_staging() {
    run_test "Dev environment should be able to read from staging"

    export CORTEX_ENV="dev"

    if can_read_from_env "staging"; then
        print_pass "Dev can read from staging"
    else
        print_fail "Dev should be able to read from staging"
    fi

    unset CORTEX_ENV 2>/dev/null || true
}

test_dev_can_read_prod() {
    run_test "Dev environment should be able to read from prod"

    export CORTEX_ENV="dev"

    if can_read_from_env "prod"; then
        print_pass "Dev can read from prod"
    else
        print_fail "Dev should be able to read from prod"
    fi

    unset CORTEX_ENV 2>/dev/null || true
}

test_staging_can_read_prod() {
    run_test "Staging environment should be able to read from prod"

    export CORTEX_ENV="staging"

    if can_read_from_env "prod"; then
        print_pass "Staging can read from prod"
    else
        print_fail "Staging should be able to read from prod"
    fi

    unset CORTEX_ENV 2>/dev/null || true
}

test_staging_cannot_read_dev() {
    run_test "Staging environment should NOT be able to read from dev"

    export CORTEX_ENV="staging"

    if ! can_read_from_env "dev"; then
        print_pass "Staging correctly blocked from reading dev"
    else
        print_fail "Staging should not be able to read from dev"
    fi

    unset CORTEX_ENV 2>/dev/null || true
}

test_prod_isolation() {
    run_test "Prod environment should be isolated (no cross-env reads)"

    export CORTEX_ENV="prod"

    local can_read_dev=false
    local can_read_staging=false

    can_read_from_env "dev" 2>/dev/null && can_read_dev=true
    can_read_from_env "staging" 2>/dev/null && can_read_staging=true

    if [ "$can_read_dev" = "false" ] && [ "$can_read_staging" = "false" ]; then
        print_pass "Prod is properly isolated"
    else
        print_fail "Prod should not be able to read from other environments"
    fi

    unset CORTEX_ENV 2>/dev/null || true
}

# ==============================================================================
# WRITE ISOLATION TESTS
# ==============================================================================

test_write_isolation_same_env() {
    run_test "Environment should be able to write to itself"

    export CORTEX_ENV="dev"

    if can_write_to_env "dev"; then
        print_pass "Dev can write to dev"
    else
        print_fail "Dev should be able to write to itself"
    fi

    unset CORTEX_ENV 2>/dev/null || true
}

test_write_isolation_cross_env() {
    run_test "Environment should NOT be able to write to other environments"

    export CORTEX_ENV="dev"

    if ! can_write_to_env "prod"; then
        print_pass "Dev correctly blocked from writing to prod"
    else
        print_fail "Dev should not be able to write to prod"
    fi

    unset CORTEX_ENV 2>/dev/null || true
}

# ==============================================================================
# SHARED RESOURCE TESTS
# ==============================================================================

test_shared_prompts() {
    run_test "Prompts should be shared across environments"

    export CORTEX_ENV="dev"
    local dev_prompts=$(get_prompts_dir)

    export CORTEX_ENV="prod"
    local prod_prompts=$(get_prompts_dir)

    if [ "$dev_prompts" = "$prod_prompts" ]; then
        print_pass "Prompts are shared: $dev_prompts"
    else
        print_fail "Prompts should be shared, got dev=$dev_prompts, prod=$prod_prompts"
    fi

    unset CORTEX_ENV 2>/dev/null || true
}

test_shared_schemas() {
    run_test "Schemas should be shared across environments"

    export CORTEX_ENV="staging"
    local staging_schemas=$(get_schemas_dir)

    export CORTEX_ENV="prod"
    local prod_schemas=$(get_schemas_dir)

    if [ "$staging_schemas" = "$prod_schemas" ]; then
        print_pass "Schemas are shared: $staging_schemas"
    else
        print_fail "Schemas should be shared"
    fi

    unset CORTEX_ENV 2>/dev/null || true
}

test_shared_masters() {
    run_test "Masters should be shared across environments"

    export CORTEX_ENV="dev"
    local dev_masters=$(get_masters_dir)

    export CORTEX_ENV="prod"
    local prod_masters=$(get_masters_dir)

    if [ "$dev_masters" = "$prod_masters" ]; then
        print_pass "Masters are shared: $dev_masters"
    else
        print_fail "Masters should be shared"
    fi

    unset CORTEX_ENV 2>/dev/null || true
}

# ==============================================================================
# LIBRARY INTEGRATION TESTS
# ==============================================================================

test_lineage_integration() {
    run_test "Lineage library should use environment-aware paths"

    export CORTEX_ENV="dev"
    source "$SCRIPT_DIR/lib/lineage.sh"

    if [[ "$LINEAGE_DIR" == *"/coordination/dev/lineage" ]]; then
        print_pass "Lineage library using dev environment path"
    else
        print_fail "Expected dev lineage path, got: $LINEAGE_DIR"
    fi

    unset CORTEX_ENV 2>/dev/null || true
}

test_metrics_integration() {
    run_test "Metrics library should use environment-aware paths"

    # Note: We cannot easily re-source metrics.sh due to readonly variables
    # Instead, verify that metrics.sh sources environment.sh
    if grep -q "source.*environment.sh" "$SCRIPT_DIR/lib/metrics.sh"; then
        print_pass "Metrics library sources environment.sh"
    else
        print_fail "Metrics library should source environment.sh"
    fi

    # Also verify environment-aware path assignment exists
    if grep -q "get_metrics_dir" "$SCRIPT_DIR/lib/metrics.sh"; then
        print_pass "Metrics library uses get_metrics_dir()"
    else
        print_fail "Metrics library should use get_metrics_dir()"
    fi
}

# ==============================================================================
# DIRECTORY STRUCTURE TESTS
# ==============================================================================

test_directory_creation() {
    run_test "All environment directories should exist"

    local all_exist=true
    local envs=("dev" "staging" "prod")
    local dirs=("tasks" "routing" "metrics" "lineage" "events" "traces" "logs")

    for env in "${envs[@]}"; do
        for dir in "${dirs[@]}"; do
            if [ ! -d "$COORDINATION_BASE/$env/$dir" ]; then
                print_fail "Missing directory: $env/$dir"
                all_exist=false
            fi
        done
    done

    if [ "$all_exist" = "true" ]; then
        print_pass "All environment directories exist"
    fi
}

# ==============================================================================
# MAIN TEST RUNNER
# ==============================================================================

main() {
    echo -e "${BLUE}"
    echo "################################################################################"
    echo "# Cortex Environment Isolation Test Suite"
    echo "################################################################################"
    echo -e "${NC}"

    print_header "Environment Detection Tests"
    test_default_environment
    test_environment_variable
    test_invalid_environment

    print_header "Path Resolution Tests"
    test_path_resolution_dev
    test_path_resolution_staging
    test_path_resolution_prod

    print_header "Cross-Environment Read Access Tests"
    test_dev_can_read_staging
    test_dev_can_read_prod
    test_staging_can_read_prod
    test_staging_cannot_read_dev
    test_prod_isolation

    print_header "Write Isolation Tests"
    test_write_isolation_same_env
    test_write_isolation_cross_env

    print_header "Shared Resource Tests"
    test_shared_prompts
    test_shared_schemas
    test_shared_masters

    print_header "Library Integration Tests"
    test_lineage_integration
    test_metrics_integration

    print_header "Directory Structure Tests"
    test_directory_creation

    # Summary
    echo -e "\n${BLUE}=== Test Summary ===${NC}\n"
    echo "Total Tests: $TESTS_RUN"
    echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
    echo -e "${RED}Failed: $TESTS_FAILED${NC}"

    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "\n${GREEN}All tests passed!${NC}\n"
        exit 0
    else
        echo -e "\n${RED}Some tests failed!${NC}\n"
        exit 1
    fi
}

main "$@"
