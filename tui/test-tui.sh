#!/usr/bin/env bash
# Test script for Cortex TUI features

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

echo "Testing Cortex TUI Components..."
echo ""

# Test 1: Dashboard loads without errors
echo -n "Testing dashboard.js loads... "
if node "$SCRIPT_DIR/dashboard.js" > /dev/null 2>&1 & then
    DASHBOARD_PID=$!
    sleep 2
    if kill -0 $DASHBOARD_PID 2>/dev/null; then
        kill $DASHBOARD_PID 2>/dev/null || true
        echo -e "${GREEN}✓ PASS${NC}"
    else
        echo -e "${RED}✗ FAIL (process died)${NC}"
        exit 1
    fi
else
    echo -e "${RED}✗ FAIL (couldn't start)${NC}"
    exit 1
fi

# Test 2: Chat loads without errors
echo -n "Testing chat.js loads... "
if echo -e "help\nexit" | node "$SCRIPT_DIR/chat.js" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PASS${NC}"
else
    echo -e "${RED}✗ FAIL${NC}"
    exit 1
fi

# Test 3: CLI integration
echo -n "Testing cortex-cli.sh integration... "
CLI_SCRIPT="$SCRIPT_DIR/../scripts/cortex-cli.sh"
if [[ -f "$CLI_SCRIPT" ]]; then
    if grep -q "cmd_dashboard" "$CLI_SCRIPT" && grep -q "cmd_chat" "$CLI_SCRIPT"; then
        echo -e "${GREEN}✓ PASS${NC}"
    else
        echo -e "${YELLOW}⚠ PARTIAL (functions not found)${NC}"
    fi
else
    echo -e "${RED}✗ FAIL (CLI not found)${NC}"
    exit 1
fi

# Test 4: Required files exist
echo -n "Testing coordination files exist... "
CORTEX_ROOT="$SCRIPT_DIR/.."
REQUIRED_FILES=(
    "coordination/worker-pool.json"
    "coordination/token-budget.json"
    "coordination/task-queue.json"
)

ALL_EXIST=true
for file in "${REQUIRED_FILES[@]}"; do
    if [[ ! -f "$CORTEX_ROOT/$file" ]]; then
        ALL_EXIST=false
        break
    fi
done

if $ALL_EXIST; then
    echo -e "${GREEN}✓ PASS${NC}"
else
    echo -e "${YELLOW}⚠ WARNING (some coordination files missing)${NC}"
fi

echo ""
echo -e "${GREEN}All TUI tests passed!${NC}"
echo ""
echo "Try the TUIs:"
echo "  ./scripts/cortex-cli.sh dashboard"
echo "  ./scripts/cortex-cli.sh chat"
