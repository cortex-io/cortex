#!/usr/bin/env bash
# Unit Tests for Template Validator

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
VALIDATOR="${CORTEX_ROOT}/coordination/templates/validator.sh"

TESTS_RUN=0
TESTS_PASSED=0
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

test_template_list() {
    echo "Testing: List templates"
    local result
    result=$("$VALIDATOR" list)

    if echo "$result" | jq -e '. | length > 0' >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Templates list is not empty"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}✗${NC} No templates found"
    fi
    TESTS_RUN=$((TESTS_RUN + 1))
}

test_template_get() {
    echo "Testing: Get template by ID"
    local result
    result=$("$VALIDATOR" get security-scan 2>/dev/null)

    if echo "$result" | jq -e '.template_id == "security-scan"' >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Template retrieved successfully"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}✗${NC} Failed to get template"
    fi
    TESTS_RUN=$((TESTS_RUN + 1))
}

test_template_validation() {
    echo "Testing: Validate task with required fields"
    local task='{"target_repository":"/test/repo","scan_type":"full"}'
    local result
    result=$("$VALIDATOR" validate security-scan "$task" 2>/dev/null)

    if echo "$result" | jq -e '.valid == true' >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Valid task passes validation"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}✗${NC} Validation failed for valid task"
    fi
    TESTS_RUN=$((TESTS_RUN + 1))
}

test_template_validation_missing_field() {
    echo "Testing: Validate task with missing required field"
    local task='{"target_repository":"/test/repo"}'
    local result
    result=$("$VALIDATOR" validate security-scan "$task" 2>/dev/null)

    if echo "$result" | jq -e '.valid == false' >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Invalid task fails validation correctly"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}✗${NC} Should reject task with missing fields"
    fi
    TESTS_RUN=$((TESTS_RUN + 1))
}

test_template_suggestion() {
    echo "Testing: Suggest template for task"
    local result
    result=$("$VALIDATOR" suggest "Scan repository for vulnerabilities" 2>/dev/null)

    if echo "$result" | jq -e '.suggested_template == "security-scan"' >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Template suggestion works"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}✗${NC} Template suggestion failed"
    fi
    TESTS_RUN=$((TESTS_RUN + 1))
}

main() {
    echo "========================================"
    echo "Template Validator Unit Tests"
    echo "========================================"

    test_template_list
    test_template_get
    test_template_validation
    test_template_validation_missing_field
    test_template_suggestion

    echo ""
    echo "Tests run: $TESTS_RUN, Passed: $TESTS_PASSED"
    [[ $TESTS_PASSED -eq $TESTS_RUN ]] && echo -e "${GREEN}All tests passed!${NC}" && exit 0
    echo -e "${RED}Some tests failed${NC}" && exit 1
}

main "$@"
