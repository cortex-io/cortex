#!/bin/bash
# Cleanup Master - Full Run
# Complete cleanup with optional auto-fix

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load libraries
source "$SCRIPT_DIR/lib/scanner.sh"
source "$SCRIPT_DIR/lib/analyzer.sh"
source "$SCRIPT_DIR/lib/auto-fix.sh"

# Parse arguments
AUTO_FIX=false
DRY_RUN=true

for arg in "$@"; do
    case $arg in
        --auto-fix)
            AUTO_FIX=true
            ;;
        --live)
            DRY_RUN=false
            ;;
        *)
            echo "Unknown argument: $arg"
            echo "Usage: $0 [--auto-fix] [--live]"
            exit 1
            ;;
    esac
done

echo "=== Cleanup Master - Full Run ==="
echo ""

# Step 1: Scan
echo "[Step 1/3] Running scanner..."
scan_dir=$(run_full_scan)
echo ""

# Step 2: Analyze
echo "[Step 2/3] Running analyzer..."
run_full_analysis "$SCRIPT_DIR/scans" >/dev/null
echo ""

# Step 3: Auto-fix (if requested)
if [[ "$AUTO_FIX" == "true" ]]; then
    echo "[Step 3/3] Running auto-fix..."

    if [[ "$DRY_RUN" == "false" ]]; then
        echo "⚠️  WARNING: Running in LIVE mode - changes will be made!"
        echo "Press Ctrl+C to cancel, or wait 5 seconds to continue..."
        sleep 5

        # Create backup
        backup_dir="$SCRIPT_DIR/backups/backup-$(date +%Y%m%d_%H%M%S)"
        mkdir -p "$backup_dir"
        echo "Creating backup at $backup_dir..."
        git stash push -m "Cleanup backup $(date +%Y%m%d_%H%M%S)" || true
    fi

    run_auto_fix "$scan_dir" "$DRY_RUN"
else
    echo "[Step 3/3] Skipping auto-fix (use --auto-fix to enable)"
fi

echo ""
echo "=== Cleanup Complete ==="
echo "Results: $scan_dir"
echo ""
echo "Summary:"
cat "$scan_dir/summary.json" | jq '.summary'

if [[ "$AUTO_FIX" == "true" && "$DRY_RUN" == "true" ]]; then
    echo ""
    echo "💡 This was a DRY RUN. Use --live to apply changes."
fi

echo ""
echo "Generate report: ./coordination/masters/cleanup/report.sh"
