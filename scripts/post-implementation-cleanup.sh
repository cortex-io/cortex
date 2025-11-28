#!/bin/bash
# Post-Implementation Cleanup
# Run this after major implementations or removals

set -euo pipefail

echo "=== Post-Implementation Cleanup ==="
echo ""
echo "Running cleanup master scan to detect:"
echo "  - Unreferenced files"
echo "  - Legacy patterns"
echo "  - Permission issues"
echo "  - Broken references"
echo ""

# Run parallel scan
./coordination/masters/cleanup/scan-parallel.sh

echo ""
echo "✅ Cleanup scan complete!"
echo ""
echo "Next steps:"
echo "  1. Review results: cat coordination/masters/cleanup/scans/scan-*/summary.json | jq"
echo "  2. Generate report: ./coordination/masters/cleanup/report.sh"
echo "  3. Apply fixes: ./coordination/masters/cleanup/run.sh --auto-fix --live"
