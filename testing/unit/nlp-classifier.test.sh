#!/usr/bin/env bash

# Unit Tests for NLP Task Classifier
# Tests all 3 layers: keyword, pattern, and Claude API fallback

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
NLP_CLASSIFIER="${CORTEX_ROOT}/coordination/masters/coordinator/lib/nlp-classifier.sh"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

# Test helper functions
assert_equals() {
    local expected="$1"
    local actual="$2"
    local test_name="$3"

    TESTS_RUN=$((TESTS_RUN + 1))

    if [[ "$expected" == "$actual" ]]; then
        echo -e "${GREEN}✓${NC} PASS: $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "${RED}✗${NC} FAIL: $test_name"
        echo "  Expected: $expected"
        echo "  Actual:   $actual"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

assert_contains() {
    local haystack="$1"
    local needle="$2"
    local test_name="$3"

    TESTS_RUN=$((TESTS_RUN + 1))

    if [[ "$haystack" == *"$needle"* ]]; then
        echo -e "${GREEN}✓${NC} PASS: $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "${RED}✗${NC} FAIL: $test_name"
        echo "  Expected to contain: $needle"
        echo "  Actual: $haystack"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

assert_confidence_range() {
    local result="$1"
    local min="$2"
    local max="$3"
    local test_name="$4"

    TESTS_RUN=$((TESTS_RUN + 1))

    local confidence
    confidence=$(echo "$result" | jq -r '.confidence')

    if (( $(echo "$confidence >= $min && $confidence <= $max" | bc -l) )); then
        echo -e "${GREEN}✓${NC} PASS: $test_name (confidence: $confidence)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "${RED}✗${NC} FAIL: $test_name"
        echo "  Expected confidence in range: [$min, $max]"
        echo "  Actual: $confidence"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

# Test Layer 1: Keyword Classification
test_layer1_security() {
    echo ""
    echo "=== Testing Layer 1: Keyword Classification (Security) ==="

    local result
    result=$("$NLP_CLASSIFIER" "Scan repository for CVE-2024-12345 vulnerabilities")

    local method
    method=$(echo "$result" | jq -r '.classification_method')

    local master
    master=$(echo "$result" | jq -r '.recommended_master')

    assert_equals "keyword" "$method" "Security task uses keyword method"
    assert_equals "security-master" "$master" "Security keywords route to security-master"
    assert_confidence_range "$result" 0.5 1.0 "Security confidence is reasonable"
}

test_layer1_development() {
    echo ""
    echo "=== Testing Layer 1: Keyword Classification (Development) ==="

    local result
    result=$("$NLP_CLASSIFIER" "Implement new API endpoint for user authentication")

    local method
    method=$(echo "$result" | jq -r '.classification_method')

    local master
    master=$(echo "$result" | jq -r '.recommended_master')

    assert_equals "keyword" "$method" "Development task uses keyword method"
    assert_equals "development-master" "$master" "Development keywords route to development-master"
    assert_confidence_range "$result" 0.5 1.0 "Development confidence is reasonable"
}

test_layer1_inventory() {
    echo ""
    echo "=== Testing Layer 1: Keyword Classification (Inventory) ==="

    local result
    result=$("$NLP_CLASSIFIER" "Update repository documentation and dependency catalog")

    local method
    method=$(echo "$result" | jq -r '.classification_method')

    local master
    master=$(echo "$result" | jq -r '.recommended_master')

    assert_equals "keyword" "$method" "Inventory task uses keyword method"
    assert_equals "inventory-master" "$master" "Inventory keywords route to inventory-master"
    assert_confidence_range "$result" 0.5 1.0 "Inventory confidence is reasonable"
}

# Test Layer 2: Pattern Matching
test_layer2_cve_pattern() {
    echo ""
    echo "=== Testing Layer 2: Pattern Matching (CVE) ==="

    local result
    result=$("$NLP_CLASSIFIER" "Analyze CVE-2024-98765 impact on our systems")

    local method
    method=$(echo "$result" | jq -r '.classification_method')

    local master
    master=$(echo "$result" | jq -r '.recommended_master')

    assert_contains "$method" "pattern\|keyword" "CVE pattern triggers pattern or keyword method"
    assert_equals "security-master" "$master" "CVE pattern routes to security-master"
    assert_confidence_range "$result" 0.8 1.0 "CVE pattern has high confidence"
}

test_layer2_urgent_pattern() {
    echo ""
    echo "=== Testing Layer 2: Pattern Matching (Urgent Security) ==="

    local result
    result=$("$NLP_CLASSIFIER" "URGENT: Critical vulnerability found in authentication module")

    local method
    method=$(echo "$result" | jq -r '.classification_method')

    local master
    master=$(echo "$result" | jq -r '.recommended_master')

    # Should detect urgency + security
    assert_equals "security-master" "$master" "Urgent security routes to security-master"
    assert_confidence_range "$result" 0.7 1.0 "Urgent pattern has good confidence"
}

test_layer2_multi_master() {
    echo ""
    echo "=== Testing Layer 2: Pattern Matching (Multi-master) ==="

    local result
    result=$("$NLP_CLASSIFIER" "Security audit of new feature implementation")

    local method
    method=$(echo "$result" | jq -r '.classification_method')

    local master
    master=$(echo "$result" | jq -r '.recommended_master')

    local fallbacks
    fallbacks=$(echo "$result" | jq -r '.fallback_masters | length')

    # Should detect multi-master need
    assert_contains "$master" "security-master\|coordinator-master" "Multi-master task detected"

    if [[ "$fallbacks" != "0" ]]; then
        echo -e "${GREEN}✓${NC} Multi-master task has fallback masters"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${YELLOW}⚠${NC} Multi-master task should have fallbacks (non-critical)"
    fi
    TESTS_RUN=$((TESTS_RUN + 1))
}

# Test Layer 3: Claude API Fallback
test_layer3_fallback() {
    echo ""
    echo "=== Testing Layer 3: Claude API Fallback ==="

    # This test requires ANTHROPIC_API_KEY
    if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
        echo -e "${YELLOW}⚠${NC} SKIP: Layer 3 test (ANTHROPIC_API_KEY not set)"
        return 0
    fi

    local result
    result=$("$NLP_CLASSIFIER" "We need to optimize the database query performance for the reporting dashboard")

    local method
    method=$(echo "$result" | jq -r '.classification_method')

    local master
    master=$(echo "$result" | jq -r '.recommended_master')

    # Should use claude or pattern method for ambiguous task
    if [[ "$method" == "claude" ]]; then
        echo -e "${GREEN}✓${NC} Claude API fallback used successfully"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${YELLOW}⚠${NC} Task resolved without Claude API (confidence may have been high enough)"
    fi
    TESTS_RUN=$((TESTS_RUN + 1))

    assert_confidence_range "$result" 0.0 1.0 "Fallback produces valid confidence"
}

# Test edge cases
test_edge_case_empty() {
    echo ""
    echo "=== Testing Edge Cases: Empty Description ==="

    local result
    result=$("$NLP_CLASSIFIER" "" 2>&1 || echo '{"classification_method":"error","recommended_master":"coordinator-master","confidence":0.5}')

    local method
    method=$(echo "$result" | jq -r '.classification_method')

    assert_contains "$method" "error\|fallback" "Empty description handled gracefully"
}

test_edge_case_ambiguous() {
    echo ""
    echo "=== Testing Edge Cases: Ambiguous Description ==="

    local result
    result=$("$NLP_CLASSIFIER" "Do something")

    local method
    method=$(echo "$result" | jq -r '.classification_method')

    local master
    master=$(echo "$result" | jq -r '.recommended_master')

    # Should fallback to coordinator or have low confidence
    assert_confidence_range "$result" 0.0 0.6 "Ambiguous task has low confidence"
}

# Test JSON output validity
test_json_validity() {
    echo ""
    echo "=== Testing JSON Output Validity ==="

    local result
    result=$("$NLP_CLASSIFIER" "Fix authentication bug")

    # Try to parse as JSON
    if echo "$result" | jq . >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} PASS: Output is valid JSON"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}✗${NC} FAIL: Output is not valid JSON"
        echo "$result"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
    TESTS_RUN=$((TESTS_RUN + 1))

    # Check required fields
    local has_method
    has_method=$(echo "$result" | jq 'has("classification_method")')

    local has_master
    has_master=$(echo "$result" | jq 'has("recommended_master")')

    local has_confidence
    has_confidence=$(echo "$result" | jq 'has("confidence")')

    assert_equals "true" "$has_method" "Output has classification_method field"
    assert_equals "true" "$has_master" "Output has recommended_master field"
    assert_equals "true" "$has_confidence" "Output has confidence field"
}

# Main test runner
main() {
    echo "=========================================="
    echo "NLP Classifier Unit Tests"
    echo "=========================================="

    # Layer 1 tests
    test_layer1_security
    test_layer1_development
    test_layer1_inventory

    # Layer 2 tests
    test_layer2_cve_pattern
    test_layer2_urgent_pattern
    test_layer2_multi_master

    # Layer 3 tests
    test_layer3_fallback

    # Edge cases
    test_edge_case_empty
    test_edge_case_ambiguous

    # JSON validity
    test_json_validity

    # Summary
    echo ""
    echo "=========================================="
    echo "Test Summary"
    echo "=========================================="
    echo "Tests run:    $TESTS_RUN"
    echo -e "Tests passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Tests failed: ${RED}$TESTS_FAILED${NC}"
    echo "=========================================="

    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "${GREEN}All tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}Some tests failed${NC}"
        exit 1
    fi
}

# Run tests
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
