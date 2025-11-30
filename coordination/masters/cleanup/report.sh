#!/usr/bin/env bash
# Cleanup Master - Report Generator
# Generates actionable cleanup reports

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Find latest scan
latest_scan=$(ls -t "$SCRIPT_DIR/scans" | grep "^scan-" | head -1)

if [[ -z "$latest_scan" ]]; then
    echo "Error: No scan found. Run ./coordination/masters/cleanup/scan.sh first."
    exit 1
fi

scan_dir="$SCRIPT_DIR/scans/$latest_scan"
summary="$scan_dir/summary.json"

# Generate markdown report
report_file="$scan_dir/CLEANUP-REPORT.md"

cat > "$report_file" << 'EOF'
# Cleanup Report

**Scan ID:** SCAN_ID
**Timestamp:** TIMESTAMP

---

## Summary

| Category | Count | Priority |
|----------|-------|----------|
| Unreferenced Files | UNREFERENCED | Medium |
| Dead Functions | DEAD_FUNCS | Low |
| Empty Directories | EMPTY_DIRS | Low |
| Permission Issues | PERM_ISSUES | High |
| Duplicate Files | DUPLICATES | Medium |
| Broken References | BROKEN_REFS | High |
| Legacy API Calls | LEGACY_APIS | High |
| Legacy Patterns | LEGACY_PATTERNS | Medium |
| .gitignore Issues | GITIGNORE | Low |

**Total Issues:** TOTAL_ISSUES

---

## High Priority Issues

### Broken References
BROKEN_REFS_DETAIL

### Permission Issues
PERM_ISSUES_DETAIL

### Legacy API Calls
LEGACY_APIS_DETAIL

---

## Medium Priority Issues

### Unreferenced Files
UNREFERENCED_DETAIL

### Duplicate Files
DUPLICATES_DETAIL

### Legacy Patterns
LEGACY_PATTERNS_DETAIL

---

## Low Priority Issues

### Dead Functions
DEAD_FUNCS_DETAIL

### Empty Directories
EMPTY_DIRS_DETAIL

### .gitignore Issues
GITIGNORE_DETAIL

---

## Recommended Actions

### Immediate (High Priority)
1. Fix broken references - these will cause runtime errors
2. Resolve permission issues - scripts won't execute
3. Remove legacy API calls - referencing removed infrastructure

### Soon (Medium Priority)
1. Remove unreferenced files - reduce codebase size
2. Deduplicate files - improve maintainability
3. Clean up legacy patterns - modernize codebase

### Eventually (Low Priority)
1. Remove dead functions - reduce noise
2. Clean empty directories - cleaner structure
3. Fix .gitignore issues - proper version control

---

## Auto-Fix Recommendations

**Safe to auto-fix:**
- Empty directories
- File permissions
- Duplicate files (keeps newest)
- .gitignore violations

**Manual review required:**
- Unreferenced files
- Broken references
- Legacy API calls
- Dead functions

**Run auto-fix:**
```bash
# Dry run (preview)
./coordination/masters/cleanup/run.sh --auto-fix

# Live run (apply changes)
./coordination/masters/cleanup/run.sh --auto-fix --live
```

---

EOF

# Substitute values
sed -i.bak "s/SCAN_ID/$(jq -r '.scan_id' "$summary")/g" "$report_file"
sed -i.bak "s/TIMESTAMP/$(jq -r '.timestamp' "$summary")/g" "$report_file"
sed -i.bak "s/UNREFERENCED/$(jq -r '.summary.unreferenced_files' "$summary")/g" "$report_file"
sed -i.bak "s/DEAD_FUNCS/$(jq -r '.summary.dead_functions' "$summary")/g" "$report_file"
sed -i.bak "s/EMPTY_DIRS/$(jq -r '.summary.empty_directories' "$summary")/g" "$report_file"
sed -i.bak "s/PERM_ISSUES/$(jq -r '.summary.permission_issues' "$summary")/g" "$report_file"
sed -i.bak "s/DUPLICATES/$(jq -r '.summary.duplicate_files' "$summary")/g" "$report_file"
sed -i.bak "s/BROKEN_REFS/$(jq -r '.summary.broken_references // 0' "$summary")/g" "$report_file"
sed -i.bak "s/LEGACY_APIS/$(jq -r '.summary.legacy_api_calls // 0' "$summary")/g" "$report_file"
sed -i.bak "s/LEGACY_PATTERNS/$(jq -r '.summary.legacy_patterns // 0' "$summary")/g" "$report_file"
sed -i.bak "s/GITIGNORE/$(jq -r '.summary.gitignore_issues // 0' "$summary")/g" "$report_file"
sed -i.bak "s/TOTAL_ISSUES/$(jq -r '.summary.total_issues' "$summary")/g" "$report_file"

# Add details
if [[ -f "$scan_dir/broken-references.json" ]]; then
    broken_detail=$(jq -r '.references[] | "- `\(.file):\(.line)` - Missing: \(.missing_reference)"' "$scan_dir/broken-references.json" | head -10)
    echo "$broken_detail" | sed -i.bak "/BROKEN_REFS_DETAIL/r /dev/stdin" "$report_file"
fi
sed -i.bak "s/BROKEN_REFS_DETAIL//g" "$report_file"

if [[ -f "$scan_dir/permission-issues.json" ]]; then
    perm_detail=$(jq -r '.issues[] | "- `\(.file)` - \(.issue)"' "$scan_dir/permission-issues.json" | head -10)
    echo "$perm_detail" | sed -i.bak "/PERM_ISSUES_DETAIL/r /dev/stdin" "$report_file"
fi
sed -i.bak "s/PERM_ISSUES_DETAIL//g" "$report_file"

if [[ -f "$scan_dir/legacy-api-calls.json" ]]; then
    legacy_detail=$(jq -r '.findings[] | "- `\(.file):\(.line)` - Pattern: \(.pattern)"' "$scan_dir/legacy-api-calls.json" | head -10)
    echo "$legacy_detail" | sed -i.bak "/LEGACY_APIS_DETAIL/r /dev/stdin" "$report_file"
fi
sed -i.bak "s/LEGACY_APIS_DETAIL//g" "$report_file"

# Add placeholder text for other sections
sed -i.bak "s/UNREFERENCED_DETAIL/See: $scan_dir\/unreferenced-files.json/g" "$report_file"
sed -i.bak "s/DUPLICATES_DETAIL/See: $scan_dir\/duplicate-files.json/g" "$report_file"
sed -i.bak "s/LEGACY_PATTERNS_DETAIL/See: $scan_dir\/legacy-patterns.json/g" "$report_file"
sed -i.bak "s/DEAD_FUNCS_DETAIL/See: $scan_dir\/dead-functions.json/g" "$report_file"
sed -i.bak "s/EMPTY_DIRS_DETAIL/See: $scan_dir\/empty-directories.json/g" "$report_file"
sed -i.bak "s/GITIGNORE_DETAIL/See: $scan_dir\/gitignore-issues.json/g" "$report_file"

# Clean up backup files
rm -f "$report_file.bak"

echo "=== Cleanup Report Generated ==="
echo ""
cat "$report_file"
echo ""
echo "Report saved to: $report_file"
