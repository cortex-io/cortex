#!/usr/bin/env bash
# End-to-End Integration Tests for Cortex CLI

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CORTEX_CLI="${CORTEX_ROOT}/scripts/cortex-cli.sh"

TESTS_RUN=0
TESTS_PASSED=0
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

test_cli_help() {
    echo "Testing: CLI help command"

    if "$CORTEX_CLI" help >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Help command works"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}✗${NC} Help command failed"
    fi
    TESTS_RUN=$((TESTS_RUN + 1))
}

test_cli_masters() {
    echo "Testing: CLI masters command"

    if "$CORTEX_CLI" masters >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Masters command works"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}✗${NC} Masters command failed"
    fi
    TESTS_RUN=$((TESTS_RUN + 1))
}

test_cli_list() {
    echo "Testing: CLI list command"

    if "$CORTEX_CLI" list >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} List command works"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}✗${NC} List command failed"
    fi
    TESTS_RUN=$((TESTS_RUN + 1))
}

test_cli_workers() {
    echo "Testing: CLI workers command"

    if "$CORTEX_CLI" workers >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Workers command works"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}✗${NC} Workers command failed"
    fi
    TESTS_RUN=$((TESTS_RUN + 1))
}

main() {
    echo "========================================"
    echo "Cortex CLI End-to-End Integration Tests"
    echo "========================================"

    test_cli_help
    test_cli_masters
    test_cli_list
    test_cli_workers

    echo ""
    echo "Tests run: $TESTS_RUN, Passed: $TESTS_PASSED"
    [[ $TESTS_PASSED -eq $TESTS_RUN ]] && echo -e "${GREEN}All tests passed!${NC}" && exit 0
    echo -e "${RED}Some tests failed${NC}" && exit 1
}

main "$@"
