#!/usr/bin/env bash
# Verify event archival system setup

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=======================================${NC}"
echo -e "${BLUE}  Event Archival Setup Verification${NC}"
echo -e "${BLUE}=======================================${NC}"
echo ""

PASSED=0
FAILED=0

check_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    PASSED=$((PASSED + 1))
}

check_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    FAILED=$((FAILED + 1))
}

check_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Check 1: Event archiver script exists and is executable
if [[ -x "$PROJECT_ROOT/scripts/events/event-archiver.sh" ]]; then
    check_pass "event-archiver.sh exists and is executable"
else
    check_fail "event-archiver.sh missing or not executable"
fi

# Check 2: Setup script exists and is executable
if [[ -x "$PROJECT_ROOT/scripts/events/setup-archiver-cron.sh" ]]; then
    check_pass "setup-archiver-cron.sh exists and is executable"
else
    check_fail "setup-archiver-cron.sh missing or not executable"
fi

# Check 3: Utilities script exists and is executable
if [[ -x "$PROJECT_ROOT/scripts/events/archive-utils.sh" ]]; then
    check_pass "archive-utils.sh exists and is executable"
else
    check_fail "archive-utils.sh missing or not executable"
fi

# Check 4: Documentation exists
if [[ -f "$PROJECT_ROOT/docs/EVENT-ARCHIVAL.md" ]]; then
    check_pass "Documentation exists (docs/EVENT-ARCHIVAL.md)"
else
    check_fail "Documentation missing"
fi

# Check 5: Events directory exists
if [[ -d "$PROJECT_ROOT/coordination/events" ]]; then
    check_pass "Events directory exists"
else
    check_fail "Events directory missing"
fi

# Check 6: Archive directory exists
if [[ -d "$PROJECT_ROOT/coordination/events/archive" ]]; then
    check_pass "Archive directory exists"
else
    check_warn "Archive directory missing (will be created on first run)"
fi

# Check 7: Cron job configured
if crontab -l 2>/dev/null | grep -q "event-archiver.sh"; then
    check_pass "Cron job configured"
else
    check_warn "Cron job not configured (run setup-archiver-cron.sh)"
fi

# Check 8: Log directory exists
if [[ -d "/var/log/cortex" ]]; then
    check_pass "Log directory exists (/var/log/cortex)"
else
    check_warn "Log directory missing (will be created by setup script)"
fi

# Check 9: Required commands available
if command -v gzip &> /dev/null; then
    check_pass "gzip command available"
else
    check_fail "gzip command not found"
fi

if command -v jq &> /dev/null; then
    check_pass "jq command available"
else
    check_fail "jq command not found (required for event parsing)"
fi

# Check 10: Test dry-run execution
echo ""
echo -e "${BLUE}Testing dry-run execution...${NC}"
if "$PROJECT_ROOT/scripts/events/event-archiver.sh" --dry-run &>/dev/null; then
    check_pass "Dry-run execution successful"
else
    check_fail "Dry-run execution failed"
fi

# Summary
echo ""
echo -e "${BLUE}=======================================${NC}"
echo -e "${BLUE}  Verification Summary${NC}"
echo -e "${BLUE}=======================================${NC}"
echo ""
echo -e "${GREEN}Passed:${NC} $PASSED"

if [[ $FAILED -gt 0 ]]; then
    echo -e "${RED}Failed:${NC} $FAILED"
fi

echo ""

if [[ $FAILED -eq 0 ]]; then
    echo -e "${GREEN}All critical checks passed!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Setup cron job: ./scripts/events/setup-archiver-cron.sh"
    echo "  2. Test manually:  ./scripts/events/event-archiver.sh --dry-run"
    echo "  3. View stats:     ./scripts/events/archive-utils.sh stats"
    echo ""
    exit 0
else
    echo -e "${RED}Some checks failed. Please fix the issues above.${NC}"
    echo ""
    exit 1
fi
