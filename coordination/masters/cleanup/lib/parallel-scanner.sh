#!/bin/bash
# Cleanup Master - Parallel Scanner
# Spawns worker agents for fast parallel scanning

set -euo pipefail

# Get project root
if [[ -z "${PROJECT_ROOT:-}" ]]; then
    LIB_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    PROJECT_ROOT="$(cd "$LIB_SCRIPT_DIR/../../../.." && pwd)"
fi

source "$PROJECT_ROOT/scripts/lib/task-manager.sh" 2>/dev/null || true

# ==============================================================================
# PARALLEL SCANNING WITH WORKERS
# ==============================================================================

spawn_scanner_worker() {
    local scan_type="$1"
    local scan_dir="$2"
    local output_file="$3"
    local task_id="cleanup-${scan_type}-$(date +%s)-$$"

    echo "Spawning worker for: $scan_type" >&2

    # Create task description
    local task_desc="Cleanup scan: $scan_type on $scan_dir"

    # Spawn worker via coordinator
    GOVERNANCE_BYPASS=true "$PROJECT_ROOT/scripts/spawn-worker.sh" \
        --type "scan-worker" \
        --task-id "$task_id" \
        --master "cleanup-master" \
        --description "$task_desc" \
        --scan-type "$scan_type" \
        --scan-dir "$scan_dir" \
        --output "$output_file" &

    echo "$task_id"
}

run_parallel_scan() {
    local output_dir="${1:-coordination/masters/cleanup/scans}"

    mkdir -p "$output_dir"

    local timestamp=$(date +%Y%m%d_%H%M%S)
    local scan_id="scan-$timestamp"
    local scan_dir="$output_dir/$scan_id"

    mkdir -p "$scan_dir"

    echo "=== Cleanup Master - Parallel Scan ===" >&2
    echo "Scan ID: $scan_id" >&2
    echo "Spawning worker agents for parallel execution..." >&2
    echo "" >&2

    # Spawn workers for each scan type
    local workers=()

    workers+=("$(spawn_scanner_worker "unreferenced_files" "$PROJECT_ROOT" "$scan_dir/unreferenced-files.json")")
    workers+=("$(spawn_scanner_worker "dead_functions" "$PROJECT_ROOT" "$scan_dir/dead-functions.json")")
    workers+=("$(spawn_scanner_worker "empty_directories" "$PROJECT_ROOT" "$scan_dir/empty-directories.json")")
    workers+=("$(spawn_scanner_worker "permission_issues" "$PROJECT_ROOT" "$scan_dir/permission-issues.json")")
    workers+=("$(spawn_scanner_worker "duplicate_files" "$PROJECT_ROOT" "$scan_dir/duplicate-files.json")")
    workers+=("$(spawn_scanner_worker "broken_references" "$PROJECT_ROOT" "$scan_dir/broken-references.json")")
    workers+=("$(spawn_scanner_worker "legacy_api_calls" "$PROJECT_ROOT" "$scan_dir/legacy-api-calls.json")")
    workers+=("$(spawn_scanner_worker "legacy_patterns" "$PROJECT_ROOT" "$scan_dir/legacy-patterns.json")")
    workers+=("$(spawn_scanner_worker "gitignore_issues" "$PROJECT_ROOT" "$scan_dir/gitignore-issues.json")")

    echo "Spawned ${#workers[@]} workers" >&2
    echo "" >&2

    # Wait for all workers to complete
    echo "Waiting for workers to complete..." >&2

    local max_wait=300  # 5 minutes
    local start_time=$(date +%s)
    local all_complete=false

    while [[ $all_complete == false ]]; do
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))

        if [[ $elapsed -gt $max_wait ]]; then
            echo "⚠️  Timeout waiting for workers" >&2
            break
        fi

        # Check if all output files exist
        local complete_count=0
        for output in "$scan_dir"/*.json; do
            [[ -f "$output" ]] && ((complete_count++))
        done

        if [[ $complete_count -ge 9 ]]; then
            all_complete=true
        else
            echo "  $complete_count/9 scans complete..." >&2
            sleep 5
        fi
    done

    # Generate summary
    local unreferenced=$(jq '.count // 0' "$scan_dir/unreferenced-files.json" 2>/dev/null || echo "0")
    local dead_funcs=$(jq '.count // 0' "$scan_dir/dead-functions.json" 2>/dev/null || echo "0")
    local empty_dirs=$(jq '.count // 0' "$scan_dir/empty-directories.json" 2>/dev/null || echo "0")
    local perm_issues=$(jq '.count // 0' "$scan_dir/permission-issues.json" 2>/dev/null || echo "0")
    local duplicates=$(jq '.count // 0' "$scan_dir/duplicate-files.json" 2>/dev/null || echo "0")
    local broken_refs=$(jq '.count // 0' "$scan_dir/broken-references.json" 2>/dev/null || echo "0")
    local legacy_apis=$(jq '.count // 0' "$scan_dir/legacy-api-calls.json" 2>/dev/null || echo "0")
    local legacy_patterns=$(jq '.count // 0' "$scan_dir/legacy-patterns.json" 2>/dev/null || echo "0")
    local gitignore=$(jq '.count // 0' "$scan_dir/gitignore-issues.json" 2>/dev/null || echo "0")

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
        --argjson gitignore "$gitignore" \
        '{
            scan_id: $scan_id,
            timestamp: $timestamp,
            execution_mode: "parallel_workers",
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
            scan_directory: "'"$scan_dir"'",
            workers: $workers
        }' --argjson workers "$(printf '%s\n' "${workers[@]}" | jq -R . | jq -s .)" \
        > "$scan_dir/summary.json"

    echo "" >&2
    echo "=== Parallel Scan Complete ===" >&2
    echo "Results: $scan_dir" >&2
    cat "$scan_dir/summary.json" | jq '.summary' >&2

    echo "$scan_dir"
}

# ==============================================================================
# EXPORT
# ==============================================================================

export -f spawn_scanner_worker
export -f run_parallel_scan
