#!/bin/bash
# Clean up unused files and empty directories

CORTEX_HOME="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$CORTEX_HOME"

echo "═══════════════════════════════════════════════════════════"
echo "  Cortex Codebase Cleanup"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Remove empty directories (excluding critical ones)
echo "🗑️  Removing empty directories..."
find ./coordination/optimization -type d -empty -delete 2>/dev/null || true
find ./api-server/coordination/optimization -type d -empty -delete 2>/dev/null || true
find ./coordination/llm-costs -type d -empty -delete 2>/dev/null || true
find ./coordination/moe-learning/deliverables -type d -empty -delete 2>/dev/null || true
find ./coordination/restart -type d -empty -delete 2>/dev/null || true
find ./coordination/evaluation -type d -empty -delete 2>/dev/null || true
find ./coordination/worker-checkins -type d -empty -delete 2>/dev/null || true
find ./coordination/pm-requests -type d -empty -delete 2>/dev/null || true
find ./coordination/pm-alerts -type d -empty -delete 2>/dev/null || true
find ./coordination/workflow-executions -type d -empty -delete 2>/dev/null || true
find ./coordination/gateway -type d -empty -delete 2>/dev/null || true
find ./llm-mesh/models -type d -empty -delete 2>/dev/null || true
find ./llm-mesh/training-data -type d -empty -delete 2>/dev/null || true
find ./llm-mesh/vectors -type d -empty -delete 2>/dev/null || true
find ./llm-mesh/scripts -type d -empty -delete 2>/dev/null || true
find ./llm-mesh/lib -type d -empty -delete 2>/dev/null || true
find ./scripts/lib/identity -type d -empty -delete 2>/dev/null || true

# Remove old agentstudio test artifacts
echo "🗑️  Removing old test artifacts..."
rm -rf ./coordination/agentstudio/test-* 2>/dev/null || true

# Remove old worker logs (keeping last 7 days)
echo "🗑️  Cleaning old worker logs (>7 days)..."
find ./agents/logs/workers -type d -mtime +7 -exec rm -rf {} \; 2>/dev/null || true

# Clean up empty worker log directories
find ./agents/logs/workers -type d -empty -delete 2>/dev/null || true

echo ""
echo "✓ Cleanup complete"
echo ""
echo "Remaining structure:"
ls -la coordination/ | grep -E "^d" | wc -l | xargs echo "  Coordination directories:"
ls -la llm-mesh/ | grep -E "^d" | wc -l | xargs echo "  LLM-mesh directories:"
