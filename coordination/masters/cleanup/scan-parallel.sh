#!/bin/bash
# Cleanup Master - Parallel Quick Scan
# Fast scan using background jobs for parallelization

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load scanner and analyzer
source "$SCRIPT_DIR/lib/scanner.sh"
source "$SCRIPT_DIR/lib/analyzer.sh"

echo "=== Cleanup Master - Parallel Scan ==="
echo ""

# Create scan directory
output_dir="$SCRIPT_DIR/scans"
mkdir -p "$output_dir"

timestamp=$(date +%Y%m%d_%H%M%S)
scan_id="scan-$timestamp"
scan_dir="$output_dir/$scan_id"
mkdir -p "$scan_dir"

echo "Scan ID: $scan_id"
echo "Spawning parallel scan jobs..."
echo ""

# Run all scans in parallel using background jobs
find_unreferenced_files "$PROJECT_ROOT" "$scan_dir/unreferenced-files.json" >/dev/null 2>&1 &
pid_unreferenced=$!

find_dead_functions "$PROJECT_ROOT" "$scan_dir/dead-functions.json" >/dev/null 2>&1 &
pid_dead=$!

find_empty_directories "$PROJECT_ROOT" "$scan_dir/empty-directories.json" >/dev/null 2>&1 &
pid_empty=$!

check_file_permissions "$PROJECT_ROOT" "$scan_dir/permission-issues.json" >/dev/null 2>&1 &
pid_perms=$!

scan_for_duplicates "$PROJECT_ROOT" "$scan_dir/duplicate-files.json" >/dev/null 2>&1 &
pid_dups=$!

find_broken_references "$PROJECT_ROOT" "$scan_dir/broken-references.json" >/dev/null 2>&1 &
pid_broken=$!

find_legacy_api_calls "$PROJECT_ROOT" "$scan_dir/legacy-api-calls.json" >/dev/null 2>&1 &
pid_legacy_api=$!

find_legacy_patterns "$PROJECT_ROOT" "$scan_dir/legacy-patterns.json" >/dev/null 2>&1 &
pid_legacy=$!

check_gitignore_consistency "$PROJECT_ROOT" "$scan_dir/gitignore-issues.json" >/dev/null 2>&1 &
pid_gitignore=$!

echo "9 scan jobs running in parallel..."
echo ""

# Wait for all background jobs with progress indicator
pids=($pid_unreferenced $pid_dead $pid_empty $pid_perms $pid_dups $pid_broken $pid_legacy_api $pid_legacy $pid_gitignore)
completed=0

while [[ $completed -lt ${#pids[@]} ]]; do
    completed=0
    for pid in "${pids[@]}"; do
        if ! kill -0 $pid 2>/dev/null; then
            ((completed++))
        fi
    done

    echo -ne "\rProgress: $completed/${#pids[@]} scans complete"

    if [[ $completed -lt ${#pids[@]} ]]; then
        sleep 2
    fi
done

echo ""
echo ""

# Wait for all jobs to finish
wait

# Generate summary
echo "Generating summary..."

unreferenced=$(jq '.count // 0' "$scan_dir/unreferenced-files.json" 2>/dev/null || echo "0")
dead_funcs=$(jq '.count // 0' "$scan_dir/dead-functions.json" 2>/dev/null || echo "0")
empty_dirs=$(jq '.count // 0' "$scan_dir/empty-directories.json" 2>/dev/null || echo "0")
perm_issues=$(jq '.count // 0' "$scan_dir/permission-issues.json" 2>/dev/null || echo "0")
duplicates=$(jq '.count // 0' "$scan_dir/duplicate-files.json" 2>/dev/null || echo "0")
broken_refs=$(jq '.count // 0' "$scan_dir/broken-references.json" 2>/dev/null || echo "0")
legacy_apis=$(jq '.count // 0' "$scan_dir/legacy-api-calls.json" 2>/dev/null || echo "0")
legacy_patterns=$(jq '.count // 0' "$scan_dir/legacy-patterns.json" 2>/dev/null || echo "0")
gitignore_issues=$(jq '.count // 0' "$scan_dir/gitignore-issues.json" 2>/dev/null || echo "0")

jq -n \
    --arg scan_id "$scan_id" \
    --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --argjson unreferenced "$unreferenced" \
    --argjson dead_funcs "$dead_funcs" \
    --argjson empty_dirs "$empty_dirs" \
    --argjson perm_issues "$perm_issues" \
    --argjson duplicates "$duplicates" \
    --argjson broken_refs "$broken_refs" \
    --argjson legacy_apis "$legacy_apis" \
    --argjson legacy_patterns "$legacy_patterns" \
    --argjson gitignore "$gitignore_issues" \
    '{
        scan_id: $scan_id,
        timestamp: $timestamp,
        execution_mode: "parallel",
        summary: {
            unreferenced_files: $unreferenced,
            dead_functions: $dead_funcs,
            empty_directories: $empty_dirs,
            permission_issues: $perm_issues,
            duplicate_files: $duplicates,
            broken_references: $broken_refs,
            legacy_api_calls: $legacy_apis,
            legacy_patterns: $legacy_patterns,
            gitignore_issues: $gitignore,
            total_issues: ($unreferenced + $dead_funcs + $empty_dirs + $perm_issues + $duplicates + $broken_refs + $legacy_apis + $legacy_patterns + $gitignore)
        },
        scan_directory: "'"$scan_dir"'"
    }' > "$scan_dir/summary.json"

echo ""
echo "✅ Parallel scan complete!"
echo "Results: $scan_dir"
echo ""
echo "=== Summary ==="
cat "$scan_dir/summary.json" | jq '.summary'

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
