#!/usr/bin/env bash
# Event Archival and Compression Automation for Cortex
# Handles daily archival, compression, rotation, and cleanup

set -euo pipefail

# Configuration
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EVENTS_DIR="${PROJECT_ROOT}/coordination/events"
ARCHIVE_DIR="${EVENTS_DIR}/archive"
LOG_FILE="${EVENTS_DIR}/.archiver.log"

# Thresholds
ARCHIVE_AGE_HOURS=24           # Archive events older than 24 hours
COMPRESS_AGE_DAYS=7            # Compress archives older than 7 days
DELETE_AGE_DAYS=90             # Delete archives older than 90 days
ROTATION_SIZE_MB=10            # Rotate JSONL files larger than 10MB

# Operation modes
DRY_RUN=false
COMPRESS_ONLY=false
CLEANUP_ONLY=false
VERBOSE=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Statistics
ARCHIVED_COUNT=0
COMPRESSED_COUNT=0
DELETED_COUNT=0
ROTATED_COUNT=0
SPACE_FREED=0

#######################################
# Logging Functions
#######################################

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    echo "${timestamp} [${level}] ${message}" | tee -a "$LOG_FILE"
}

log_info() {
    log "INFO" "$@"
    if [[ "$VERBOSE" == true ]]; then
        echo -e "${BLUE}[INFO]${NC} $*"
    fi
}

log_success() {
    log "SUCCESS" "$@"
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_warn() {
    log "WARN" "$@"
    echo -e "${YELLOW}[WARN]${NC} $*"
}

log_error() {
    log "ERROR" "$@"
    echo -e "${RED}[ERROR]${NC} $*"
}

#######################################
# Utility Functions
#######################################

usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Event archival and compression automation for Cortex.

OPTIONS:
    --dry-run           Show what would be done without making changes
    --compress-only     Only compress old archives
    --cleanup-only      Only clean up old archives
    --verbose, -v       Enable verbose output
    --help, -h          Show this help message

EXAMPLES:
    # Run full archival process
    ./$(basename "$0")

    # Preview changes without executing
    ./$(basename "$0") --dry-run

    # Only compress archives older than 7 days
    ./$(basename "$0") --compress-only

    # Only delete archives older than 90 days
    ./$(basename "$0") --cleanup-only

CONFIGURATION:
    Archive age:     ${ARCHIVE_AGE_HOURS} hours
    Compress age:    ${COMPRESS_AGE_DAYS} days
    Delete age:      ${DELETE_AGE_DAYS} days
    Rotation size:   ${ROTATION_SIZE_MB} MB

EOF
}

get_file_size() {
    local file="$1"
    if [[ -f "$file" ]]; then
        stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo 0
    else
        echo 0
    fi
}

get_file_size_human() {
    local file="$1"
    if [[ -f "$file" ]]; then
        ls -lh "$file" | awk '{print $5}'
    else
        echo "0B"
    fi
}

extract_timestamp() {
    local file="$1"
    # Extract timestamp from JSON event (ISO 8601 format)
    jq -r '.timestamp' <<< "$(tail -1 "$file" 2>/dev/null)" 2>/dev/null || echo ""
}

get_date_from_timestamp() {
    local timestamp="$1"
    # Convert ISO 8601 timestamp to YYYY-MM-DD
    date -j -f "%Y-%m-%dT%H:%M:%S%z" "${timestamp}" "+%Y-%m-%d" 2>/dev/null || \
    date -d "${timestamp}" "+%Y-%m-%d" 2>/dev/null || \
    echo ""
}

ensure_dir() {
    local dir="$1"
    if [[ ! -d "$dir" ]]; then
        if [[ "$DRY_RUN" == true ]]; then
            log_info "[DRY-RUN] Would create directory: $dir"
        else
            mkdir -p "$dir"
            log_info "Created directory: $dir"
        fi
    fi
}

#######################################
# Archive Functions
#######################################

archive_old_events() {
    log_info "=== Starting Daily Event Archival ==="

    local cutoff_time=$(date -u -v-${ARCHIVE_AGE_HOURS}H +%s 2>/dev/null || date -u -d "${ARCHIVE_AGE_HOURS} hours ago" +%s)
    local today=$(date -u +%Y-%m-%d)

    # Process each JSONL event file
    for event_file in "${EVENTS_DIR}"/*.jsonl; do
        [[ -f "$event_file" ]] || continue

        local filename=$(basename "$event_file")
        local temp_new="${event_file}.new"
        local temp_archive="${event_file}.archive"

        log_info "Processing: $filename"

        # Split events into current and archivable
        local archived=0

        if [[ "$DRY_RUN" == true ]]; then
            # Count events that would be archived
            archived=$(jq -c 'select(.timestamp != null)' "$event_file" 2>/dev/null | while read -r event; do
                local timestamp=$(jq -r '.timestamp' <<< "$event")
                local event_time=$(date -j -f "%Y-%m-%dT%H:%M:%S%z" "${timestamp}" +%s 2>/dev/null || echo 0)

                if [[ $event_time -lt $cutoff_time && $event_time -gt 0 ]]; then
                    echo "1"
                fi
            done | wc -l | tr -d ' ')

            if [[ $archived -gt 0 ]]; then
                log_info "[DRY-RUN] Would archive $archived events from $filename"
                ARCHIVED_COUNT=$((ARCHIVED_COUNT + archived))
            fi
        else
            # Actually split the file
            > "$temp_new"
            > "$temp_archive"

            while IFS= read -r event; do
                local timestamp=$(jq -r '.timestamp' <<< "$event" 2>/dev/null || echo "")

                if [[ -z "$timestamp" || "$timestamp" == "null" ]]; then
                    # Keep events without timestamps in current file
                    echo "$event" >> "$temp_new"
                else
                    local event_time=$(date -j -f "%Y-%m-%dT%H:%M:%S%z" "${timestamp}" +%s 2>/dev/null || \
                                     date -d "${timestamp}" +%s 2>/dev/null || echo 0)

                    if [[ $event_time -lt $cutoff_time && $event_time -gt 0 ]]; then
                        # Archive old event
                        echo "$event" >> "$temp_archive"
                        archived=$((archived + 1))
                    else
                        # Keep recent event
                        echo "$event" >> "$temp_new"
                    fi
                fi
            done < "$event_file"

            # Move archived events to daily archive directory
            if [[ -s "$temp_archive" ]]; then
                local event_date=$(jq -r '.timestamp' < "$temp_archive" | head -1 | cut -d'T' -f1)
                [[ -z "$event_date" || "$event_date" == "null" ]] && event_date="$today"

                local archive_subdir="${ARCHIVE_DIR}/${event_date}"
                ensure_dir "$archive_subdir"

                local archive_filename="${archive_subdir}/${filename}"
                cat "$temp_archive" >> "$archive_filename"
                log_success "Archived $archived events from $filename to $event_date/"
                ARCHIVED_COUNT=$((ARCHIVED_COUNT + archived))
            fi

            # Replace current file with events to keep
            if [[ -s "$temp_new" ]]; then
                mv "$temp_new" "$event_file"
            else
                # Keep file with empty JSON array if no events remain
                echo "" > "$event_file"
            fi

            # Cleanup temp files
            rm -f "$temp_archive" "$temp_new"
        fi
    done

    log_info "Archived $ARCHIVED_COUNT events total"
}

#######################################
# Compression Functions
#######################################

compress_old_archives() {
    log_info "=== Starting Archive Compression ==="

    local cutoff_date=$(date -u -v-${COMPRESS_AGE_DAYS}d +%Y-%m-%d 2>/dev/null || \
                       date -u -d "${COMPRESS_AGE_DAYS} days ago" +%Y-%m-%d)

    # Find date-based archive directories older than cutoff
    find "$ARCHIVE_DIR" -type d -name "20??-??-??" | while read -r archive_day_dir; do
        local dir_date=$(basename "$archive_day_dir")

        # Compare dates (lexicographic comparison works for YYYY-MM-DD)
        if [[ "$dir_date" < "$cutoff_date" ]]; then
            # Compress all uncompressed JSONL files in this directory
            find "$archive_day_dir" -type f -name "*.jsonl" ! -name "*.gz" | while read -r jsonl_file; do
                local size_before=$(get_file_size "$jsonl_file")
                local size_human=$(get_file_size_human "$jsonl_file")

                if [[ "$DRY_RUN" == true ]]; then
                    log_info "[DRY-RUN] Would compress: $jsonl_file ($size_human)"
                    COMPRESSED_COUNT=$((COMPRESSED_COUNT + 1))
                else
                    gzip -9 "$jsonl_file"
                    local size_after=$(get_file_size "${jsonl_file}.gz")
                    local saved=$((size_before - size_after))
                    SPACE_FREED=$((SPACE_FREED + saved))
                    COMPRESSED_COUNT=$((COMPRESSED_COUNT + 1))

                    local saved_mb=$((saved / 1024 / 1024))
                    log_success "Compressed: $(basename "$jsonl_file") (saved ${saved_mb}MB)"
                fi
            done
        fi
    done

    log_info "Compressed $COMPRESSED_COUNT archive files"
}

#######################################
# Cleanup Functions
#######################################

cleanup_old_archives() {
    log_info "=== Starting Old Archive Cleanup ==="

    local cutoff_date=$(date -u -v-${DELETE_AGE_DAYS}d +%Y-%m-%d 2>/dev/null || \
                       date -u -d "${DELETE_AGE_DAYS} days ago" +%Y-%m-%d)

    # Find and delete archive directories older than cutoff
    find "$ARCHIVE_DIR" -type d -name "20??-??-??" | while read -r archive_day_dir; do
        local dir_date=$(basename "$archive_day_dir")

        if [[ "$dir_date" < "$cutoff_date" ]]; then
            if [[ "$DRY_RUN" == true ]]; then
                local count=$(find "$archive_day_dir" -type f | wc -l | tr -d ' ')
                log_info "[DRY-RUN] Would delete archive: $dir_date/ ($count files)"
                DELETED_COUNT=$((DELETED_COUNT + count))
            else
                # Calculate space to be freed
                local dir_size=$(du -sk "$archive_day_dir" | cut -f1)
                local file_count=$(find "$archive_day_dir" -type f | wc -l | tr -d ' ')

                rm -rf "$archive_day_dir"
                SPACE_FREED=$((SPACE_FREED + dir_size * 1024))
                DELETED_COUNT=$((DELETED_COUNT + file_count))

                log_success "Deleted archive: $dir_date/ ($file_count files, ${dir_size}KB)"
            fi
        fi
    done

    log_info "Deleted $DELETED_COUNT old archive files"
}

remove_empty_directories() {
    log_info "Removing empty archive directories..."

    if [[ "$DRY_RUN" == true ]]; then
        find "$ARCHIVE_DIR" -type d -empty | while read -r empty_dir; do
            log_info "[DRY-RUN] Would remove empty directory: $empty_dir"
        done
    else
        find "$ARCHIVE_DIR" -type d -empty -delete
        log_info "Removed empty directories"
    fi
}

#######################################
# Rotation Functions
#######################################

rotate_large_jsonl_files() {
    log_info "=== Starting JSONL File Rotation ==="

    local rotation_size_bytes=$((ROTATION_SIZE_MB * 1024 * 1024))
    local timestamp=$(date -u +%Y%m%d-%H%M%S)

    for event_file in "${EVENTS_DIR}"/*.jsonl; do
        [[ -f "$event_file" ]] || continue

        local file_size=$(get_file_size "$event_file")

        if [[ $file_size -gt $rotation_size_bytes ]]; then
            local filename=$(basename "$event_file")
            local size_mb=$((file_size / 1024 / 1024))

            if [[ "$DRY_RUN" == true ]]; then
                log_info "[DRY-RUN] Would rotate $filename (${size_mb}MB > ${ROTATION_SIZE_MB}MB)"
                ROTATED_COUNT=$((ROTATED_COUNT + 1))
            else
                local today=$(date -u +%Y-%m-%d)
                local archive_subdir="${ARCHIVE_DIR}/${today}"
                ensure_dir "$archive_subdir"

                local rotated_name="${filename%.jsonl}-rotated-${timestamp}.jsonl"
                local rotated_path="${archive_subdir}/${rotated_name}"

                # Move entire file to archive with timestamp
                cp "$event_file" "$rotated_path"

                # Clear original file
                echo "" > "$event_file"

                ROTATED_COUNT=$((ROTATED_COUNT + 1))
                log_success "Rotated $filename (${size_mb}MB) to ${today}/${rotated_name}"
            fi
        fi
    done

    if [[ $ROTATED_COUNT -gt 0 ]]; then
        log_info "Rotated $ROTATED_COUNT large JSONL files"
    else
        log_info "No files need rotation"
    fi
}

#######################################
# Reporting Functions
#######################################

report_disk_usage() {
    log_info "=== Disk Space Report ==="

    # Current events directory
    local events_size=$(du -sh "$EVENTS_DIR" 2>/dev/null | cut -f1)
    log_info "Events directory size: $events_size"

    # Archive directory breakdown
    if [[ -d "$ARCHIVE_DIR" ]]; then
        log_info "Archive breakdown:"

        # Size by year-month
        find "$ARCHIVE_DIR" -type d -name "20??-??-??" -print0 | \
        xargs -0 du -sh 2>/dev/null | \
        sort -k2 | \
        tail -10 | \
        while read -r size dir; do
            log_info "  $(basename "$dir"): $size"
        done

        # Compressed vs uncompressed
        local compressed_size=$(find "$ARCHIVE_DIR" -name "*.gz" -exec du -ch {} + 2>/dev/null | tail -1 | cut -f1)
        local uncompressed_size=$(find "$ARCHIVE_DIR" -name "*.jsonl" ! -name "*.gz" -exec du -ch {} + 2>/dev/null | tail -1 | cut -f1)

        [[ -n "$compressed_size" ]] && log_info "  Compressed archives: $compressed_size"
        [[ -n "$uncompressed_size" ]] && log_info "  Uncompressed archives: $uncompressed_size"
    fi

    # Space freed during this run
    if [[ $SPACE_FREED -gt 0 ]]; then
        local freed_mb=$((SPACE_FREED / 1024 / 1024))
        log_success "Total space freed: ${freed_mb}MB"
    fi
}

generate_summary() {
    echo ""
    echo "======================================="
    echo "  Event Archiver Summary"
    echo "======================================="
    echo ""
    echo "Operations performed:"
    echo "  Events archived:     $ARCHIVED_COUNT"
    echo "  Files compressed:    $COMPRESSED_COUNT"
    echo "  Files deleted:       $DELETED_COUNT"
    echo "  Files rotated:       $ROTATED_COUNT"

    if [[ $SPACE_FREED -gt 0 ]]; then
        local freed_mb=$((SPACE_FREED / 1024 / 1024))
        echo "  Space freed:         ${freed_mb}MB"
    fi

    echo ""
    if [[ "$DRY_RUN" == true ]]; then
        echo "Mode: DRY RUN (no changes made)"
    else
        echo "Mode: LIVE (changes applied)"
    fi
    echo ""
}

#######################################
# Main Function
#######################################

main() {
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --compress-only)
                COMPRESS_ONLY=true
                shift
                ;;
            --cleanup-only)
                CLEANUP_ONLY=true
                shift
                ;;
            --verbose|-v)
                VERBOSE=true
                shift
                ;;
            --help|-h)
                usage
                exit 0
                ;;
            *)
                echo "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done

    # Ensure directories exist
    ensure_dir "$EVENTS_DIR"
    ensure_dir "$ARCHIVE_DIR"

    # Log start
    log_info "========================================="
    log_info "Event Archiver Started"
    if [[ "$DRY_RUN" == true ]]; then
        log_info "Mode: DRY RUN"
    fi
    log_info "========================================="

    # Execute operations based on mode
    if [[ "$COMPRESS_ONLY" == true ]]; then
        compress_old_archives
    elif [[ "$CLEANUP_ONLY" == true ]]; then
        cleanup_old_archives
        remove_empty_directories
    else
        # Full archival process
        archive_old_events
        rotate_large_jsonl_files
        compress_old_archives
        cleanup_old_archives
        remove_empty_directories
    fi

    # Generate reports
    report_disk_usage
    generate_summary

    log_info "Event Archiver Completed"

    return 0
}

# Run main function
main "$@"
