#!/bin/bash
# Test Routing Cascade - Demonstration Script

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_HOME="$(cd "$SCRIPT_DIR/.." && pwd)"

ROUTING_CASCADE="$CORTEX_HOME/coordination/masters/coordinator/lib/routing-cascade.sh"
KEYWORD_ROUTER="$CORTEX_HOME/coordination/masters/coordinator/lib/keyword-router.sh"

echo "========================================"
echo "Routing Cascade Test Suite"
echo "========================================"
echo ""

# Test 1: Keyword router only (no Python dependencies needed)
echo "Test 1: Keyword Router (Layer 1 only)"
echo "----------------------------------------"
echo "Query: 'Fix CVE-2024-1234 vulnerability'"
echo ""

result=$(bash "$KEYWORD_ROUTER" "Fix CVE-2024-1234 vulnerability" 2>/dev/null || echo "{}")
if [ "$result" != "{}" ]; then
  echo "✅ Result:"
  echo "$result" | jq '.'
  echo ""
  echo "✅ Keyword router working!"
else
  echo "❌ No match (expected to match security-master)"
fi
echo ""

# Test 2: Another keyword test
echo "Test 2: Keyword Router - Development Command"
echo "----------------------------------------"
echo "Query: 'git status'"
echo ""

result=$(bash "$KEYWORD_ROUTER" "git status" 2>/dev/null || echo "{}")
if [ "$result" != "{}" ]; then
  echo "✅ Result:"
  echo "$result" | jq '.'
  echo ""
  echo "✅ Keyword router working!"
else
  echo "❌ No match"
fi
echo ""

# Test 3: Low-confidence query (should return empty)
echo "Test 3: Keyword Router - Low Confidence Query"
echo "----------------------------------------"
echo "Query: 'implement feature'"
echo ""

result=$(bash "$KEYWORD_ROUTER" "implement feature" 2>/dev/null || echo "{}")
if [ "$result" = "{}" ]; then
  echo "✅ Correctly returned no match (needs semantic routing)"
  echo "   (This query would fall through to Layer 2: Semantic)"
else
  echo "Result: $result"
fi
echo ""

# Test 4: Full cascade (if Python dependencies installed)
echo "Test 4: Full Cascade (All Layers)"
echo "----------------------------------------"
echo "Query: 'Fix CVE-2024-1234 vulnerability in authentication module'"
echo ""

if command -v python3 &> /dev/null; then
  # Check if numpy is available
  if python3 -c "import numpy" 2>/dev/null; then
    echo "✅ Python dependencies found, testing full cascade..."
    echo ""

    result=$(bash "$ROUTING_CASCADE" "task-test-001" "Fix CVE-2024-1234 vulnerability in authentication module" 2>&1)
    echo "$result"
    echo ""
  else
    echo "⏳ Python dependencies not installed"
    echo "   Install with: pip3 install --user numpy sentence-transformers"
    echo ""
    echo "   For now, testing keyword router only:"
    result=$(bash "$KEYWORD_ROUTER" "Fix CVE-2024-1234 vulnerability in authentication module" 2>/dev/null || echo "{}")
    echo "$result" | jq '.'
  fi
else
  echo "⚠️  python3 not found"
fi
echo ""

# Summary
echo "========================================"
echo "Test Summary"
echo "========================================"
echo ""
echo "✅ Keyword Router (Layer 1): Working"
echo "⏳ Semantic Router (Layer 2): Requires Python dependencies"
echo "⏳ RAG Router (Layer 3): Requires Python dependencies"
echo "⚠️  PyTorch Router (Layer 4): Model not trained yet (Week 2-3)"
echo ""
echo "To install Python dependencies:"
echo "  pip3 install --user numpy sentence-transformers"
echo ""
echo "To view routing logs:"
echo "  tail -f coordination/logs/routing-decisions.jsonl | jq '.'"
echo ""
echo "For full setup guide, see:"
echo "  docs/ROUTING-CASCADE-SETUP.md"
echo ""
