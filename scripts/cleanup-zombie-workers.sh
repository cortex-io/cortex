#!/usr/bin/env bash
#
# Cleanup Zombie Workers
# Removes workers that are pending with 0 tokens used
#

set -euo pipefail

WORKER_POOL_FILE="coordination/worker-pool.json"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$CORTEX_ROOT"

echo "=== Zombie Worker Cleanup ==="
echo ""

# Count zombies
ZOMBIE_COUNT=$(jq '[.active_workers[] | select(.status == "pending" and .tokens_used == 0 and .last_heartbeat == null)] | length' "$WORKER_POOL_FILE")

echo "Found $ZOMBIE_COUNT zombie workers"
echo ""

# Show sample
jq -r '[.active_workers[] | select(.status == "pending" and .tokens_used == 0)] | .[0:3] | .[] | "  \(.worker_id) (task: \(.task_id))"' "$WORKER_POOL_FILE"
echo "  ... and more"
echo ""

# Clean up
jq '{
  active_workers: [.active_workers[] | select(
    .status != "pending" or .tokens_used > 0 or .last_heartbeat != null
  )],
  completed_workers: .completed_workers,
  failed_workers: .failed_workers,
  stats: (.stats + {total_cleaned_zombies: '"$ZOMBIE_COUNT"', note: "Cleaned on '"$(date +%Y-%m-%d)"'"}),
  updated_at: "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"
}' "$WORKER_POOL_FILE" > "${WORKER_POOL_FILE}.tmp" && mv "${WORKER_POOL_FILE}.tmp" "$WORKER_POOL_FILE"

REMAINING=$(jq '.active_workers | length' "$WORKER_POOL_FILE")
echo "✓ Removed: $ZOMBIE_COUNT workers"
echo "✓ Remaining: $REMAINING active workers"
