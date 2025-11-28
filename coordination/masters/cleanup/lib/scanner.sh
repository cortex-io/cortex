#!/bin/bash
# Cleanup Master - Core Scanner
# Detects dead code, unreferenced files, and structural issues

set -euo pipefail

# Get project root
if [[ -z "${PROJECT_ROOT:-}" ]]; then
    LIB_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    PROJECT_ROOT="$(cd "$LIB_SCRIPT_DIR/../../../.." && pwd)"
fi

# ==============================================================================
# DEAD CODE DETECTION
# ==============================================================================

find_unreferenced_files() {
    local scan_dir="${1:-$PROJECT_ROOT}"
    local results_file="${2:-/tmp/unreferenced-files.json}"

    echo "Scanning for unreferenced files in $scan_dir..." >&2
    echo "Step 1/2: Building reference index..." >&2

    # Build reference index ONCE (O(n) instead of O(n²))
    local temp_refs="/tmp/file-references-$$.txt"
    grep -rh --no-filename \
        --include="*.sh" \
        --include="*.js" \
        --include="*.py" \
        --include="*.json" \
        --exclude-dir=node_modules \
        --exclude-dir=.git \
        --exclude-dir=.venv \
        --exclude-dir=__pycache__ \
        "$PROJECT_ROOT" 2>/dev/null > "$temp_refs"

    echo "Step 2/2: Checking files against index..." >&2

    local unreferenced=()
    local total=0
    local checked=0

    # Count total files for progress
    total=$(find "$scan_dir" -type f \( -name "*.sh" -o -name "*.js" -o -name "*.py" \) 2>/dev/null | wc -l | tr -d ' ')

    # Check each file against the index (O(n))
    while IFS= read -r file; do
        ((checked++))

        local filename=$(basename "$file")
        local relative_path="${file#$PROJECT_ROOT/}"

        # Skip if in excluded patterns
        if echo "$relative_path" | grep -qE '(node_modules|\.git|\.venv|__pycache__)'; then
            continue
        fi

        # Check if filename appears in the reference index
        if ! grep -q "$filename" "$temp_refs"; then
            unreferenced+=("$relative_path")
        fi

        # Progress indicator every 100 files
        if (( checked % 100 == 0 )); then
            echo "  Checked $checked/$total files..." >&2
        fi
    done < <(find "$scan_dir" -type f \( -name "*.sh" -o -name "*.js" -o -name "*.py" \) 2>/dev/null)

    # Cleanup
    rm -f "$temp_refs"

    # Generate JSON output
    jq -n \
        --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --argjson files "$(printf '%s\n' "${unreferenced[@]}" | jq -R . | jq -s .)" \
        '{
            scan_type: "unreferenced_files",
            timestamp: $timestamp,
            count: ($files | length),
            files: $files
        }' > "$results_file"

    echo "${#unreferenced[@]}"
}

find_dead_functions() {
    local scan_dir="${1:-$PROJECT_ROOT}"
    local results_file="${2:-/tmp/dead-functions.json}"

    echo "Scanning for dead functions in $scan_dir..." >&2

    local dead_functions=()

    # Find all function definitions in bash scripts
    while IFS= read -r line; do
        local file=$(echo "$line" | cut -d: -f1)
        local func_name=$(echo "$line" | sed -E 's/.*function\s+([a-zA-Z_][a-zA-Z0-9_]*).*/\1/' | sed -E 's/.*([a-zA-Z_][a-zA-Z0-9_]*)\(\).*/\1/')

        # Skip if empty
        [[ -z "$func_name" ]] && continue

        # Count references (excluding definition)
        local ref_count=$(grep -r "\b$func_name\b" "$PROJECT_ROOT" \
            --include="*.sh" \
            2>/dev/null | grep -v "^$file:" | grep -v "function $func_name" | wc -l | tr -d ' ')

        if [[ $ref_count -eq 0 ]]; then
            dead_functions+=("{\"file\": \"${file#$PROJECT_ROOT/}\", \"function\": \"$func_name\"}")
        fi
    done < <(grep -r "^[[:space:]]*\(function[[:space:]]\+\)\?[a-zA-Z_][a-zA-Z0-9_]*[[:space:]]*()[[:space:]]*{" "$scan_dir" \
        --include="*.sh" 2>/dev/null || true)

    # Generate JSON output
    if [[ ${#dead_functions[@]} -gt 0 ]]; then
        echo "[$(IFS=,; echo "${dead_functions[*]}")]" | jq \
            --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
            '{
                scan_type: "dead_functions",
                timestamp: $timestamp,
                count: (. | length),
                functions: .
            }' > "$results_file"
    else
        jq -n \
            --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
            '{
                scan_type: "dead_functions",
                timestamp: $timestamp,
                count: 0,
                functions: []
            }' > "$results_file"
    fi

    echo "${#dead_functions[@]}"
}

find_empty_directories() {
    local scan_dir="${1:-$PROJECT_ROOT}"
    local results_file="${2:-/tmp/empty-directories.json}"

    echo "Scanning for empty directories in $scan_dir..." >&2

    local empty_dirs=()

    while IFS= read -r dir; do
        local relative_path="${dir#$PROJECT_ROOT/}"

        # Skip excluded patterns
        if echo "$relative_path" | grep -qE '(node_modules|\.git|\.venv|__pycache__)'; then
            continue
        fi

        # Check if truly empty (no files, only .gitkeep allowed)
        local file_count=$(find "$dir" -type f ! -name ".gitkeep" | wc -l | tr -d ' ')

        if [[ $file_count -eq 0 ]]; then
            empty_dirs+=("$relative_path")
        fi
    done < <(find "$scan_dir" -type d -empty 2>/dev/null || find "$scan_dir" -type d 2>/dev/null | while read d; do [[ $(find "$d" -maxdepth 1 -type f ! -name ".gitkeep" | wc -l) -eq 0 ]] && echo "$d"; done)

    # Generate JSON output
    jq -n \
        --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --argjson dirs "$(printf '%s\n' "${empty_dirs[@]}" | jq -R . | jq -s .)" \
        '{
            scan_type: "empty_directories",
            timestamp: $timestamp,
            count: ($dirs | length),
            directories: $dirs
        }' > "$results_file"

    echo "${#empty_dirs[@]}"
}

# ==============================================================================
# FILE PERMISSION VALIDATION
# ==============================================================================

check_file_permissions() {
    local scan_dir="${1:-$PROJECT_ROOT}"
    local results_file="${2:-/tmp/permission-issues.json}"

    echo "Checking file permissions in $scan_dir..." >&2

    local issues=()

    # Scripts should be executable
    while IFS= read -r file; do
        if [[ ! -x "$file" ]]; then
            local relative_path="${file#$PROJECT_ROOT/}"
            issues+=("{\"file\": \"$relative_path\", \"issue\": \"not_executable\", \"expected\": \"755\"}")
        fi
    done < <(find "$scan_dir" -type f -name "*.sh" 2>/dev/null)

    # Config files should NOT be executable
    while IFS= read -r file; do
        if [[ -x "$file" ]]; then
            local relative_path="${file#$PROJECT_ROOT/}"
            issues+=("{\"file\": \"$relative_path\", \"issue\": \"should_not_be_executable\", \"expected\": \"644\"}")
        fi
    done < <(find "$scan_dir" -type f \( -name "*.json" -o -name "*.md" -o -name "*.txt" \) 2>/dev/null)

    # Generate JSON output
    if [[ ${#issues[@]} -gt 0 ]]; then
        echo "[$(IFS=,; echo "${issues[*]}")]" | jq \
            --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
            '{
                scan_type: "permission_issues",
                timestamp: $timestamp,
                count: (. | length),
                issues: .
            }' > "$results_file"
    else
        jq -n \
            --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
            '{
                scan_type: "permission_issues",
                timestamp: $timestamp,
                count: 0,
                issues: []
            }' > "$results_file"
    fi

    echo "${#issues[@]}"
}

# ==============================================================================
# DUPLICATE FILE DETECTION
# ==============================================================================

scan_for_duplicates() {
    local scan_dir="${1:-$PROJECT_ROOT}"
    local results_file="${2:-/tmp/duplicate-files.json}"

    echo "Scanning for duplicate files in $scan_dir..." >&2
    echo "Step 1/3: Grouping files by size..." >&2

    local duplicates=()

    # Step 1: Group files by size (duplicates must have same size)
    declare -A size_groups
    local total=0

    while IFS= read -r file; do
        local relative_path="${file#$PROJECT_ROOT/}"

        # Skip excluded patterns
        if echo "$relative_path" | grep -qE '(node_modules|\.git|\.venv|__pycache__)'; then
            continue
        fi

        local size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
        size_groups[$size]="${size_groups[$size]:-}$file"$'\n'
        ((total++))
    done < <(find "$scan_dir" -type f \( -name "*.sh" -o -name "*.js" -o -name "*.py" -o -name "*.json" \) 2>/dev/null)

    echo "Step 2/3: Identifying size groups with multiple files..." >&2

    # Step 2: Only hash files that have potential duplicates (same size)
    local candidates=0
    for size in "${!size_groups[@]}"; do
        local file_list="${size_groups[$size]}"
        local count=$(echo "$file_list" | grep -c '^' || echo 0)
        if [[ $count -gt 1 ]]; then
            ((candidates += count))
        fi
    done

    echo "Step 3/3: Computing hashes for $candidates/$total candidate files..." >&2

    # Step 3: Hash only the candidate files
    declare -A file_hashes
    local hashed=0

    for size in "${!size_groups[@]}"; do
        local file_list="${size_groups[$size]}"
        local count=$(echo "$file_list" | grep -c '^' || echo 0)

        # Only hash if multiple files have this size
        if [[ $count -gt 1 ]]; then
            while IFS= read -r file; do
                [[ -z "$file" ]] && continue

                local relative_path="${file#$PROJECT_ROOT/}"
                local hash=$(md5sum "$file" 2>/dev/null | cut -d' ' -f1 || md5 -q "$file" 2>/dev/null)

                if [[ -n "${file_hashes[$hash]:-}" ]]; then
                    duplicates+=("{\"hash\": \"$hash\", \"original\": \"${file_hashes[$hash]}\", \"duplicate\": \"$relative_path\"}")
                else
                    file_hashes[$hash]="$relative_path"
                fi

                ((hashed++))
                if (( hashed % 50 == 0 )); then
                    echo "  Hashed $hashed/$candidates files..." >&2
                fi
            done <<< "$file_list"
        fi
    done

    # Generate JSON output
    if [[ ${#duplicates[@]} -gt 0 ]]; then
        echo "[$(IFS=,; echo "${duplicates[*]}")]" | jq \
            --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
            '{
                scan_type: "duplicate_files",
                timestamp: $timestamp,
                count: (. | length),
                duplicates: .
            }' > "$results_file"
    else
        jq -n \
            --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
            '{
                scan_type: "duplicate_files",
                timestamp: $timestamp,
                count: 0,
                duplicates: []
            }' > "$results_file"
    fi

    echo "${#duplicates[@]}"
}

# ==============================================================================
# MAIN SCAN
# ==============================================================================

run_full_scan() {
    local output_dir="${1:-coordination/masters/cleanup/scans}"

    mkdir -p "$output_dir"

    local timestamp=$(date +%Y%m%d_%H%M%S)
    local scan_id="scan-$timestamp"
    local scan_dir="$output_dir/$scan_id"

    mkdir -p "$scan_dir"

    echo "=== Cleanup Master - Full Scan ===" >&2
    echo "Scan ID: $scan_id" >&2
    echo "" >&2

    # Run all scans
    local unreferenced=$(find_unreferenced_files "$PROJECT_ROOT" "$scan_dir/unreferenced-files.json")
    local dead_funcs=$(find_dead_functions "$PROJECT_ROOT" "$scan_dir/dead-functions.json")
    local empty_dirs=$(find_empty_directories "$PROJECT_ROOT" "$scan_dir/empty-directories.json")
    local perm_issues=$(check_file_permissions "$PROJECT_ROOT" "$scan_dir/permission-issues.json")
    local duplicates=$(scan_for_duplicates "$PROJECT_ROOT" "$scan_dir/duplicate-files.json")

    # Generate summary
    jq -n \
        --arg scan_id "$scan_id" \
        --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --argjson unreferenced "$unreferenced" \
        --argjson dead_funcs "$dead_funcs" \
        --argjson empty_dirs "$empty_dirs" \
        --argjson perm_issues "$perm_issues" \
        --argjson duplicates "$duplicates" \
        '{
            scan_id: $scan_id,
            timestamp: $timestamp,
            summary: {
                unreferenced_files: $unreferenced,
                dead_functions: $dead_funcs,
                empty_directories: $empty_dirs,
                permission_issues: $perm_issues,
                duplicate_files: $duplicates,
                total_issues: ($unreferenced + $dead_funcs + $empty_dirs + $perm_issues + $duplicates)
            },
            scan_directory: "'"$scan_dir"'"
        }' > "$scan_dir/summary.json"

    echo "" >&2
    echo "=== Scan Complete ===" >&2
    echo "Results: $scan_dir" >&2
    cat "$scan_dir/summary.json" | jq '.summary' >&2

    echo "$scan_dir"
}

# ==============================================================================
# EXPORTS
# ==============================================================================

export -f find_unreferenced_files
export -f find_dead_functions
export -f find_empty_directories
export -f check_file_permissions
export -f scan_for_duplicates
export -f run_full_scan
