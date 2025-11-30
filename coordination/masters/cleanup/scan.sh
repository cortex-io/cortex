#!/usr/bin/env bash
# Cleanup Master - Quick Scan
# Fast scan for cleanup opportunities

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load scanner
source "$SCRIPT_DIR/lib/scanner.sh"
source "$SCRIPT_DIR/lib/analyzer.sh"

echo "=== Cleanup Master - Quick Scan ==="
echo ""

# Run scanner
scan_dir=$(run_full_scan)

# Run analyzer
run_full_analysis "$SCRIPT_DIR/scans" >/dev/null

echo ""
echo "✅ Scan complete!"
echo "Results: $scan_dir"
echo ""
echo "Next steps:"
echo "  - Review results: cat $scan_dir/summary.json | jq"
echo "  - Generate report: ./coordination/masters/cleanup/report.sh"
echo "  - Run auto-fix: ./coordination/masters/cleanup/run.sh --auto-fix"

# Exit with non-zero if issues found
total_issues=$(jq '.summary.total_issues' "$scan_dir/summary.json")

if [[ $total_issues -gt 0 ]]; then
    exit 1
else
    exit 0
fi
