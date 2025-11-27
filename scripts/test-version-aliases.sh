#!/bin/bash

################################################################################
# Test Script for Master Version Aliases System
#
# Purpose: Comprehensive testing of version alias functionality
# Tests: All deployment flows, rollback, validation
################################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/logging.sh"
source "$SCRIPT_DIR/lib/read-alias.sh"

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# Test helper
test_pass() {
    local msg="$1"
    log_success "✅ PASS: $msg"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

test_fail() {
    local msg="$1"
    log_error "❌ FAIL: $msg"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

log_section "Testing Master Version Aliases System"

# Test 1: Library functions exist
log_info "TEST 1: Library functions load correctly"
if type get_champion_version >/dev/null 2>&1 && \
   type get_master_version_path >/dev/null 2>&1 && \
   type validate_champion >/dev/null 2>&1; then
    test_pass "Library functions load correctly"
else
    test_fail "Library functions load correctly"
fi

# Test 2: All masters have aliases.json
log_info "TEST 2: All masters have aliases.json"
if [ -f "coordination/masters/coordinator/versions/aliases.json" ] && \
   [ -f "coordination/masters/security/versions/aliases.json" ] && \
   [ -f "coordination/masters/development/versions/aliases.json" ] && \
   [ -f "coordination/masters/inventory/versions/aliases.json" ] && \
   [ -f "coordination/masters/cicd/versions/aliases.json" ]; then
    test_pass "All masters have aliases.json"
else
    test_fail "All masters have aliases.json"
fi

# Test 3: All masters have v1.0.0 version
log_info "TEST 3: All masters have v1.0.0 version"
if [ -d "coordination/masters/coordinator/versions/v1.0.0" ] && \
   [ -d "coordination/masters/security/versions/v1.0.0" ] && \
   [ -d "coordination/masters/development/versions/v1.0.0" ] && \
   [ -d "coordination/masters/inventory/versions/v1.0.0" ] && \
   [ -d "coordination/masters/cicd/versions/v1.0.0" ]; then
    test_pass "All masters have v1.0.0 version"
else
    test_fail "All masters have v1.0.0 version"
fi

# Test 4: Champion validation works
log_info "TEST 4: Champion validation works"
if validate_champion "coordinator"; then
    test_pass "Champion validation works"
else
    test_fail "Champion validation works"
fi

# Test 5: Get champion version
log_info "TEST 5: Get champion version returns v1.0.0"
version=$(get_champion_version "coordinator")
if [ "$version" = "v1.0.0" ]; then
    test_pass "Get champion version returns v1.0.0"
else
    test_fail "Get champion version returns v1.0.0 (got: $version)"
fi

# Test 6: Create test version
log_info "TEST 6: Create test version v1.1.0"
if mkdir -p coordination/masters/coordinator/versions/v1.1.0 && \
   echo "Test version" > coordination/masters/coordinator/versions/v1.1.0/README.txt; then
    test_pass "Create test version v1.1.0"
else
    test_fail "Create test version v1.1.0"
fi

# Test 7: Deploy to shadow
log_info "TEST 7: Deploy v1.1.0 to shadow"
if echo "y" | "$SCRIPT_DIR/promote-master.sh" coordinator deploy-shadow v1.1.0 >/dev/null 2>&1; then
    shadow=$(get_shadow_version "coordinator")
    if [ "$shadow" = "v1.1.0" ]; then
        test_pass "Deploy v1.1.0 to shadow"
    else
        test_fail "Deploy v1.1.0 to shadow (got: $shadow)"
    fi
else
    test_fail "Deploy v1.1.0 to shadow"
fi

# Test 8: Promote to challenger
log_info "TEST 8: Promote shadow to challenger"
if echo "y" | "$SCRIPT_DIR/promote-master.sh" coordinator promote-to-challenger >/dev/null 2>&1; then
    challenger=$(get_challenger_version "coordinator")
    shadow=$(get_shadow_version "coordinator" 2>/dev/null || echo "")
    if [ "$challenger" = "v1.1.0" ] && [ -z "$shadow" ]; then
        test_pass "Promote shadow to challenger"
    else
        test_fail "Promote shadow to challenger (challenger: $challenger, shadow: $shadow)"
    fi
else
    test_fail "Promote shadow to challenger"
fi

# Test 9: Promote to champion
log_info "TEST 9: Promote challenger to champion"
if echo "y" | "$SCRIPT_DIR/promote-master.sh" coordinator promote-to-champion >/dev/null 2>&1; then
    champion=$(get_champion_version "coordinator")
    if [ "$champion" = "v1.1.0" ]; then
        test_pass "Promote challenger to champion"
    else
        test_fail "Promote challenger to champion (got: $champion)"
    fi
else
    test_fail "Promote challenger to champion"
fi

# Test 10: Rollback
log_info "TEST 10: Rollback to previous version"
if echo "y" | "$SCRIPT_DIR/promote-master.sh" coordinator rollback >/dev/null 2>&1; then
    champion=$(get_champion_version "coordinator")
    if [ "$champion" = "v1.0.0" ]; then
        test_pass "Rollback to previous version"
    else
        test_fail "Rollback to previous version (got: $champion)"
    fi
else
    test_fail "Rollback to previous version"
fi

# Test 11: Get available versions
log_info "TEST 11: Get available versions includes both v1.0.0 and v1.1.0"
versions=$(get_available_versions "coordinator")
if echo "$versions" | grep -q "v1.0.0" && echo "$versions" | grep -q "v1.1.0"; then
    test_pass "Get available versions includes both v1.0.0 and v1.1.0"
else
    test_fail "Get available versions includes both v1.0.0 and v1.1.0"
fi

# Test 12: Run coordinator master with validation
log_info "TEST 12: Run coordinator master with version validation"
if "$SCRIPT_DIR/run-coordinator-master.sh" 2>&1 | grep -q "Running champion version: v1.0.0"; then
    test_pass "Run coordinator master with version validation"
else
    test_fail "Run coordinator master with version validation"
fi

# Test 13: Version history tracking
log_info "TEST 13: Version history includes all promotions"
history=$(jq '.version_history | length' coordination/masters/coordinator/versions/aliases.json)
if [ "$history" -ge 4 ]; then
    test_pass "Version history includes all promotions ($history entries)"
else
    test_fail "Version history includes all promotions (only $history entries)"
fi

# Test 14: Show command displays correctly
log_info "TEST 14: Show command displays version info"
show_output=$("$SCRIPT_DIR/promote-master.sh" coordinator show 2>&1)
if echo "$show_output" | grep -q "Champion (Production)" && \
   echo "$show_output" | grep -q "Available Versions"; then
    test_pass "Show command displays version info"
else
    test_fail "Show command displays version info"
fi

# Cleanup
log_info "Cleaning up test versions..."
rm -rf coordination/masters/coordinator/versions/v1.1.0 2>/dev/null || true

# Reset aliases to v1.0.0
cat > coordination/masters/coordinator/versions/aliases.json <<'EOF'
{
  "master_id": "coordinator",
  "aliases": {
    "champion": {
      "version": "v1.0.0",
      "description": "Production version (primary active)",
      "promoted_at": "2025-11-27T00:00:00Z",
      "status": "active"
    },
    "challenger": {
      "version": null,
      "description": "Canary version (testing in shadow mode)",
      "promoted_at": null,
      "status": "inactive"
    },
    "shadow": {
      "version": null,
      "description": "Shadow version (receives traffic but responses discarded)",
      "promoted_at": null,
      "status": "inactive"
    }
  },
  "version_history": [
    {
      "version": "v1.0.0",
      "created_at": "2025-11-27T00:00:00Z",
      "description": "Initial version",
      "status": "champion"
    }
  ],
  "last_updated": "2025-11-27T00:00:00Z"
}
EOF

# Summary
echo ""
log_section "Test Summary"
echo "Tests Passed: $TESTS_PASSED"
echo "Tests Failed: $TESTS_FAILED"
echo "Total Tests:  $((TESTS_PASSED + TESTS_FAILED))"

if [ $TESTS_FAILED -eq 0 ]; then
    log_success "All tests passed! ✅"
    exit 0
else
    log_error "Some tests failed ❌"
    exit 1
fi
