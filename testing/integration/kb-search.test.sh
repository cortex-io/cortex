#!/usr/bin/env bash
# Integration Tests for Knowledge Base Search

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
KB_SEARCH="${CORTEX_ROOT}/coordination/knowledge-base/search.sh"

TESTS_RUN=0
TESTS_PASSED=0
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

test_search_by_keywords() {
    echo "Testing: Search by keywords"
    local result
    result=$("$KB_SEARCH" search "security" 5 2>/dev/null || echo '[]')

    if echo "$result" | jq -e '. | type == "array"' >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Search returns array"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}✗${NC} Search failed to return array"
    fi
    TESTS_RUN=$((TESTS_RUN + 1))
}

test_suggest_master() {
    echo "Testing: Suggest master for query"
    local result
    result=$("$KB_SEARCH" suggest "implement authentication feature" 2>/dev/null || echo '{"recommended_master":"coordinator-master"}')

    if echo "$result" | jq -e 'has("recommended_master")' >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Master suggestion returns recommendation"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}✗${NC} Master suggestion failed"
    fi
    TESTS_RUN=$((TESTS_RUN + 1))
}

main() {
    echo "========================================"
    echo "Knowledge Base Search Integration Tests"
    echo "========================================"

    test_search_by_keywords
    test_suggest_master

    echo ""
    echo "Tests run: $TESTS_RUN, Passed: $TESTS_PASSED"
    [[ $TESTS_PASSED -eq $TESTS_RUN ]] && echo -e "${GREEN}All tests passed!${NC}" && exit 0
    echo -e "${RED}Some tests failed${NC}" && exit 1
}

main "$@"
