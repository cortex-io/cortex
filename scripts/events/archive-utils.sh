#!/usr/bin/env bash
# Utility functions for event archive management

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EVENTS_DIR="${PROJECT_ROOT}/coordination/events"
ARCHIVE_DIR="${EVENTS_DIR}/archive"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

show_usage() {
    cat <<EOF
Event Archive Utilities

USAGE: $(basename "$0") <command> [options]

COMMANDS:
    stats                Show archive statistics
    search <pattern>     Search archives for pattern
    list [date]          List archives (optionally for specific date)
    size                 Show size breakdown
    decompress <date>    Decompress archives for specific date
    restore <date> <type> Restore events from archive to active file
    cleanup-temp         Remove temporary/failed archives
    verify               Verify archive integrity
    help                 Show this help message

EXAMPLES:
    # Show statistics
    $(basename "$0") stats

    # Search for worker failures in archives
    $(basename "$0") search "worker_presumed_dead"

    # List archives for specific date
    $(basename "$0") list 2025-11-20

    # Show size breakdown by type
    $(basename "$0") size

    # Decompress archives for analysis
    $(basename "$0") decompress 2025-11-20

    # Restore heartbeat events from archive
    $(basename "$0") restore 2025-11-20 heartbeat

    # Verify all compressed archives
    $(basename "$0") verify

EOF
}

cmd_stats() {
    echo -e "${BLUE}Archive Statistics${NC}"
    echo "===================="
    echo ""

    # Total archive size
    local total_size=$(du -sh "$ARCHIVE_DIR" 2>/dev/null | cut -f1)
    echo "Total archive size: $total_size"
    echo ""

    # Count archives by date
    local date_count=$(find "$ARCHIVE_DIR" -type d -name "20??-??-??" | wc -l | tr -d ' ')
    echo "Archive dates: $date_count"
    echo ""

    # Count files
    local total_files=$(find "$ARCHIVE_DIR" -type f | wc -l | tr -d ' ')
    local compressed=$(find "$ARCHIVE_DIR" -name "*.gz" | wc -l | tr -d ' ')
    local uncompressed=$(find "$ARCHIVE_DIR" -name "*.jsonl" ! -name "*.gz" | wc -l | tr -d ' ')

    echo "Files:"
    echo "  Total:         $total_files"
    echo "  Compressed:    $compressed"
    echo "  Uncompressed:  $uncompressed"
    echo ""

    # Oldest and newest
    local oldest=$(find "$ARCHIVE_DIR" -type d -name "20??-??-??" | sort | head -1 | xargs basename)
    local newest=$(find "$ARCHIVE_DIR" -type d -name "20??-??-??" | sort | tail -1 | xargs basename)

    [[ -n "$oldest" ]] && echo "Oldest archive: $oldest"
    [[ -n "$newest" ]] && echo "Newest archive: $newest"
    echo ""

    # Compression ratio
    local comp_size=$(find "$ARCHIVE_DIR" -name "*.gz" -exec du -ch {} + 2>/dev/null | tail -1 | cut -f1)
    local uncomp_size=$(find "$ARCHIVE_DIR" -name "*.jsonl" ! -name "*.gz" -exec du -ch {} + 2>/dev/null | tail -1 | cut -f1)

    if [[ -n "$comp_size" ]]; then
        echo "Compressed archives: $comp_size"
    fi
    if [[ -n "$uncomp_size" ]]; then
        echo "Uncompressed archives: $uncomp_size"
    fi
    echo ""

    # Recent archives
    echo "Recent archives:"
    find "$ARCHIVE_DIR" -type d -name "20??-??-??" | sort -r | head -5 | while read -r dir; do
        local date=$(basename "$dir")
        local size=$(du -sh "$dir" 2>/dev/null | cut -f1)
        local files=$(find "$dir" -type f | wc -l | tr -d ' ')
        echo "  $date: $size ($files files)"
    done
}

cmd_search() {
    local pattern="$1"
    echo -e "${BLUE}Searching archives for: ${YELLOW}$pattern${NC}"
    echo ""

    local matches=0

    # Search compressed archives
    find "$ARCHIVE_DIR" -name "*.jsonl.gz" | while read -r archive; do
        local date=$(basename $(dirname "$archive"))
        local type=$(basename "$archive" .jsonl.gz)

        local count=$(zgrep -c "$pattern" "$archive" 2>/dev/null || echo "0")

        if [[ $count -gt 0 ]]; then
            echo -e "${GREEN}Found $count matches${NC} in $date/$type"
            matches=$((matches + count))
        fi
    done

    # Search uncompressed archives
    find "$ARCHIVE_DIR" -name "*.jsonl" ! -name "*.gz" | while read -r archive; do
        local date=$(basename $(dirname "$archive"))
        local type=$(basename "$archive" .jsonl)

        local count=$(grep -c "$pattern" "$archive" 2>/dev/null || echo "0")

        if [[ $count -gt 0 ]]; then
            echo -e "${GREEN}Found $count matches${NC} in $date/$type"
            matches=$((matches + count))
        fi
    done

    echo ""
    echo "Search complete"
}

cmd_list() {
    if [[ $# -eq 0 ]]; then
        # List all archive dates
        echo -e "${BLUE}All Archive Dates${NC}"
        echo "=================="
        echo ""

        find "$ARCHIVE_DIR" -type d -name "20??-??-??" | sort | while read -r dir; do
            local date=$(basename "$dir")
            local size=$(du -sh "$dir" 2>/dev/null | cut -f1)
            local files=$(find "$dir" -type f | wc -l | tr -d ' ')
            echo "$date - $size ($files files)"
        done
    else
        # List files for specific date
        local date="$1"
        local archive_path="$ARCHIVE_DIR/$date"

        if [[ ! -d "$archive_path" ]]; then
            echo "No archive found for date: $date"
            return 1
        fi

        echo -e "${BLUE}Archive Contents: $date${NC}"
        echo "======================"
        echo ""

        find "$archive_path" -type f | while read -r file; do
            local filename=$(basename "$file")
            local size=$(ls -lh "$file" | awk '{print $5}')
            echo "$filename - $size"
        done
    fi
}

cmd_size() {
    echo -e "${BLUE}Size Breakdown by Event Type${NC}"
    echo "============================="
    echo ""

    # Aggregate by event type across all dates
    declare -A sizes

    find "$ARCHIVE_DIR" -type f -name "*.jsonl*" | while read -r file; do
        local filename=$(basename "$file")
        local type="${filename%.jsonl*}"
        local size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)

        # Accumulate sizes (bash 4+ feature, may need adjustment for older bash)
        echo "$type $size"
    done | awk '{sizes[$1]+=$2} END {for (type in sizes) printf "%-30s %10d bytes\n", type, sizes[type]}' | sort -k2 -rn | numfmt --to=iec-i --suffix=B --field=2
}

cmd_decompress() {
    local date="$1"
    local archive_path="$ARCHIVE_DIR/$date"

    if [[ ! -d "$archive_path" ]]; then
        echo "No archive found for date: $date"
        return 1
    fi

    echo -e "${BLUE}Decompressing archives for: $date${NC}"
    echo ""

    local count=0
    find "$archive_path" -name "*.gz" | while read -r gz_file; do
        echo "Decompressing: $(basename "$gz_file")"
        gunzip -k "$gz_file"
        count=$((count + 1))
    done

    echo ""
    echo -e "${GREEN}Decompressed $count files${NC}"
}

cmd_restore() {
    local date="$1"
    local event_type="$2"

    local archive_file="$ARCHIVE_DIR/$date/${event_type}-events.jsonl"
    local archive_file_gz="${archive_file}.gz"
    local active_file="$EVENTS_DIR/${event_type}-events.jsonl"

    if [[ -f "$archive_file" ]]; then
        echo -e "${BLUE}Restoring from: $archive_file${NC}"
        cat "$archive_file" >> "$active_file"
        echo -e "${GREEN}Restored to: $active_file${NC}"
    elif [[ -f "$archive_file_gz" ]]; then
        echo -e "${BLUE}Restoring from: $archive_file_gz${NC}"
        zcat "$archive_file_gz" >> "$active_file"
        echo -e "${GREEN}Restored to: $active_file${NC}"
    else
        echo "Archive not found: $date/${event_type}-events.jsonl[.gz]"
        return 1
    fi
}

cmd_cleanup_temp() {
    echo -e "${BLUE}Cleaning up temporary and failed archives${NC}"
    echo ""

    # Remove failed directory if empty
    if [[ -d "$ARCHIVE_DIR/failed" ]]; then
        if [[ -z "$(ls -A "$ARCHIVE_DIR/failed")" ]]; then
            rmdir "$ARCHIVE_DIR/failed"
            echo "Removed empty failed directory"
        else
            echo "Failed directory contains files:"
            ls -lh "$ARCHIVE_DIR/failed"
        fi
    fi

    # Remove invalid directory if empty
    if [[ -d "$ARCHIVE_DIR/invalid" ]]; then
        if [[ -z "$(ls -A "$ARCHIVE_DIR/invalid")" ]]; then
            rmdir "$ARCHIVE_DIR/invalid"
            echo "Removed empty invalid directory"
        else
            echo "Invalid directory contains files:"
            ls -lh "$ARCHIVE_DIR/invalid"
        fi
    fi

    # Remove any temp files
    find "$ARCHIVE_DIR" -name "*.tmp" -o -name "*.temp" | while read -r temp; do
        echo "Removing: $temp"
        rm -f "$temp"
    done

    echo ""
    echo -e "${GREEN}Cleanup complete${NC}"
}

cmd_verify() {
    echo -e "${BLUE}Verifying archive integrity${NC}"
    echo ""

    local total=0
    local valid=0
    local invalid=0

    find "$ARCHIVE_DIR" -name "*.gz" | while read -r gz_file; do
        total=$((total + 1))

        if gzip -t "$gz_file" 2>/dev/null; then
            valid=$((valid + 1))
        else
            invalid=$((invalid + 1))
            echo -e "${YELLOW}Invalid: $gz_file${NC}"
        fi
    done

    echo ""
    echo "Total compressed archives: $total"
    echo -e "${GREEN}Valid: $valid${NC}"

    if [[ $invalid -gt 0 ]]; then
        echo -e "${YELLOW}Invalid: $invalid${NC}"
    fi
}

# Main
main() {
    if [[ $# -eq 0 ]]; then
        show_usage
        exit 0
    fi

    local command="$1"
    shift

    case "$command" in
        stats)
            cmd_stats
            ;;
        search)
            if [[ $# -eq 0 ]]; then
                echo "Error: search requires a pattern"
                exit 1
            fi
            cmd_search "$1"
            ;;
        list)
            cmd_list "$@"
            ;;
        size)
            cmd_size
            ;;
        decompress)
            if [[ $# -eq 0 ]]; then
                echo "Error: decompress requires a date (YYYY-MM-DD)"
                exit 1
            fi
            cmd_decompress "$1"
            ;;
        restore)
            if [[ $# -lt 2 ]]; then
                echo "Error: restore requires date and event type"
                echo "Example: restore 2025-11-20 heartbeat"
                exit 1
            fi
            cmd_restore "$1" "$2"
            ;;
        cleanup-temp)
            cmd_cleanup_temp
            ;;
        verify)
            cmd_verify
            ;;
        help|--help|-h)
            show_usage
            ;;
        *)
            echo "Unknown command: $command"
            echo ""
            show_usage
            exit 1
            ;;
    esac
}

main "$@"
