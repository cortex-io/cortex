#!/usr/bin/env bash
# Cache Manager
# Manages cache lifecycle: build, refresh, validate

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CACHE_DB="$SCRIPT_DIR/file-reference-cache.db"
CACHE_METADATA="$SCRIPT_DIR/cache-metadata.json"
MAX_CACHE_AGE_HOURS="${MAX_CACHE_AGE_HOURS:-24}"

# ==============================================================================
# CACHE STATUS
# ==============================================================================

cache_exists() {
    [[ -f "$CACHE_DB" && -f "$CACHE_METADATA" ]]
}

cache_age_hours() {
    if ! cache_exists; then
        echo "999999"
        return
    fi

    local built_at=$(jq -r '.built_at' "$CACHE_METADATA")
    local built_timestamp=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$built_at" "+%s" 2>/dev/null || echo 0)
    local now_timestamp=$(date +%s)
    local age_seconds=$((now_timestamp - built_timestamp))
    local age_hours=$((age_seconds / 3600))

    echo "$age_hours"
}

cache_is_stale() {
    local age=$(cache_age_hours)
    [[ $age -gt $MAX_CACHE_AGE_HOURS ]]
}

cache_status() {
    if ! cache_exists; then
        echo "missing"
        return
    fi

    if cache_is_stale; then
        echo "stale"
        return
    fi

    echo "fresh"
}

# ==============================================================================
# CACHE OPERATIONS
# ==============================================================================

build_cache() {
    local worker_count="${1:-4}"

    echo "Building cache with $worker_count workers..." >&2

    if [[ ! -x "$SCRIPT_DIR/build-cache-parallel.sh" ]]; then
        echo "Error: Cache builder not found" >&2
        return 1
    fi

    "$SCRIPT_DIR/build-cache-parallel.sh" "$worker_count"
}

rebuild_cache() {
    echo "Rebuilding cache..." >&2

    # Remove old cache
    rm -f "$CACHE_DB" "$CACHE_METADATA"

    # Build new cache
    build_cache "${1:-4}"
}

ensure_cache() {
    local status=$(cache_status)

    case "$status" in
        missing)
            echo "Cache missing, building..." >&2
            build_cache
            ;;
        stale)
            echo "Cache stale (age: $(cache_age_hours)h), rebuilding..." >&2
            rebuild_cache
            ;;
        fresh)
            echo "Cache fresh (age: $(cache_age_hours)h)" >&2
            ;;
    esac
}

# ==============================================================================
# CACHE QUERIES
# ==============================================================================

query_file_references() {
    local filename="$1"

    if ! cache_exists; then
        echo "Error: Cache does not exist" >&2
        return 1
    fi

    sqlite3 "$CACHE_DB" "SELECT is_referenced FROM file_references WHERE filename = '$filename';" 2>/dev/null || echo "0"
}

is_file_referenced() {
    local filename="$1"

    if ! cache_exists; then
        echo "0"
        return
    fi

    local result=$(sqlite3 "$CACHE_DB" "SELECT is_referenced FROM file_references WHERE filename = '$filename';" 2>/dev/null || echo "0")
    [[ "$result" == "1" ]] && echo "1" || echo "0"
}

list_all_files() {
    if ! cache_exists; then
        echo "Error: Cache does not exist" >&2
        return 1
    fi

    sqlite3 "$CACHE_DB" "SELECT filepath FROM files;" 2>/dev/null || true
}

# ==============================================================================
# CACHE INFO
# ==============================================================================

cache_info() {
    if ! cache_exists; then
        echo "Cache: Not built"
        return
    fi

    echo "=== Cache Information ==="
    cat "$CACHE_METADATA" | jq .
    echo ""
    echo "Status: $(cache_status)"
    echo "Age: $(cache_age_hours) hours"
    echo ""
    echo "Database stats:"
    sqlite3 "$CACHE_DB" <<'SQL'
SELECT
    'Files: ' || COUNT(*) FROM files
UNION ALL
SELECT
    'Referenced files: ' || COUNT(*) FROM file_references WHERE is_referenced = 1;
SQL
}

# ==============================================================================
# MAIN
# ==============================================================================

main() {
    local command="${1:-status}"

    case "$command" in
        build)
            build_cache "${2:-4}"
            ;;
        rebuild)
            rebuild_cache "${2:-4}"
            ;;
        ensure)
            ensure_cache
            ;;
        status)
            cache_info
            ;;
        query)
            is_file_referenced "$2"
            ;;
        check)
            is_file_referenced "$2"
            ;;
        list)
            list_all_files
            ;;
        age)
            echo "$(cache_age_hours) hours"
            ;;
        *)
            echo "Usage: $0 {build|rebuild|ensure|status|query|count|list|age} [args]"
            echo ""
            echo "Commands:"
            echo "  build [workers]  - Build cache with N workers (default: 4)"
            echo "  rebuild [workers] - Force rebuild cache"
            echo "  ensure           - Ensure cache exists and is fresh"
            echo "  status           - Show cache status and stats"
            echo "  query <filename> - Check if file is referenced (1 or 0)"
            echo "  check <filename> - Check if file is referenced (1 or 0)"
            echo "  list             - List all cached files"
            echo "  age              - Show cache age in hours"
            return 1
            ;;
    esac
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi

# Export functions for sourcing
export -f cache_exists
export -f cache_is_stale
export -f cache_status
export -f ensure_cache
export -f query_file_references
export -f is_file_referenced
