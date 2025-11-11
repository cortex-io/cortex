#!/bin/bash
# JSON Validation and Repair Utility
# Provides validation and automatic repair for common JSON errors
# Used by emit-event.sh and dashboard server to prevent malformed JSON

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Logging function
log_validation() {
    local level="$1"
    local message="$2"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    # Log to stderr for debugging
    if [ "${DEBUG_JSON_VALIDATION:-0}" = "1" ]; then
        echo "[$timestamp] [$level] $message" >&2
    fi

    # Log to validation log file if specified
    if [ -n "${JSON_VALIDATION_LOG:-}" ]; then
        echo "{\"timestamp\":\"$timestamp\",\"level\":\"$level\",\"message\":\"$message\"}" >> "$JSON_VALIDATION_LOG"
    fi
}

# Validate JSON using jq
validate_json() {
    local json_string="$1"

    if echo "$json_string" | jq empty 2>/dev/null; then
        return 0
    else
        return 1
    fi
}

# Repair common JSON errors
repair_json() {
    local json_string="$1"
    local repaired="$json_string"
    local repair_attempted=0

    log_validation "INFO" "Attempting JSON repair"

    # 1. Remove trailing commas before closing braces/brackets
    if echo "$repaired" | grep -qE ',[[:space:]]*(\}|\])'; then
        # Use perl for more reliable regex replacement on macOS
        repaired=$(echo "$repaired" | perl -pe 's/,(\s*[\}\]])/\1/g')
        repair_attempted=1
        log_validation "INFO" "Removed trailing commas"
    fi

    # 2. Fix missing commas between objects (common in JSONL concatenation)
    # Pattern: }{ should be },{
    if echo "$repaired" | grep -qE '\}[[:space:]]*\{'; then
        repaired=$(echo "$repaired" | perl -pe 's/\}([[:space:]]*)\{/},\1{/g')
        repair_attempted=1
        log_validation "INFO" "Added missing commas between objects"
    fi

    # 3. Fix missing commas between array elements
    # Pattern: ][ should be ],[
    if echo "$repaired" | grep -qE '\][[:space:]]*\['; then
        repaired=$(echo "$repaired" | perl -pe 's/\]([[:space:]]*)\[/],\1[/g')
        repair_attempted=1
        log_validation "INFO" "Added missing commas between arrays"
    fi

    # 4. Balance unclosed brackets
    local open_braces=$(echo "$repaired" | grep -o '{' | wc -l | tr -d ' ')
    local close_braces=$(echo "$repaired" | grep -o '}' | wc -l | tr -d ' ')
    local open_brackets=$(echo "$repaired" | grep -o '\[' | wc -l | tr -d ' ')
    local close_brackets=$(echo "$repaired" | grep -o '\]' | wc -l | tr -d ' ')

    # Add missing closing braces
    if [ "$open_braces" -gt "$close_braces" ]; then
        local missing=$((open_braces - close_braces))
        for ((i=0; i<missing; i++)); do
            repaired="${repaired}}"
        done
        repair_attempted=1
        log_validation "WARN" "Added $missing missing closing brace(s)"
    fi

    # Add missing closing brackets
    if [ "$open_brackets" -gt "$close_brackets" ]; then
        local missing=$((open_brackets - close_brackets))
        for ((i=0; i<missing; i++)); do
            repaired="${repaired}]"
        done
        repair_attempted=1
        log_validation "WARN" "Added $missing missing closing bracket(s)"
    fi

    # 5. Remove extra closing braces/brackets
    if [ "$close_braces" -gt "$open_braces" ]; then
        log_validation "ERROR" "More closing braces than opening - cannot auto-repair"
    fi

    if [ "$close_brackets" -gt "$open_brackets" ]; then
        log_validation "ERROR" "More closing brackets than opening - cannot auto-repair"
    fi

    # 6. Escape unescaped quotes in string values (basic attempt)
    # This is tricky and may not work in all cases
    # We skip this for now as it's complex and error-prone

    if [ "$repair_attempted" -eq 1 ]; then
        log_validation "INFO" "JSON repair completed"
    fi

    echo "$repaired"
}

# Validate and repair JSON
# Returns: 0 if valid or repaired successfully, 1 if cannot repair
validate_and_repair_json() {
    local json_string="$1"
    local allow_repair="${2:-1}"  # Default: allow repair

    # First, try to validate as-is
    if validate_json "$json_string"; then
        log_validation "INFO" "JSON is valid"
        echo "$json_string"
        return 0
    fi

    log_validation "WARN" "JSON validation failed"

    # If repair is allowed, attempt to repair
    if [ "$allow_repair" = "1" ]; then
        local repaired=$(repair_json "$json_string")

        # Validate repaired JSON
        if validate_json "$repaired"; then
            log_validation "INFO" "JSON repair successful"
            echo "$repaired"
            return 0
        else
            log_validation "ERROR" "JSON repair failed - still invalid"
            return 1
        fi
    else
        log_validation "ERROR" "JSON invalid and repair disabled"
        return 1
    fi
}

# Validate JSONL file (newline-delimited JSON)
validate_jsonl_file() {
    local file_path="$1"
    local repair="${2:-0}"  # Default: no repair
    local errors=0
    local line_num=0

    if [ ! -f "$file_path" ]; then
        log_validation "ERROR" "File not found: $file_path"
        return 1
    fi

    log_validation "INFO" "Validating JSONL file: $file_path"

    while IFS= read -r line || [ -n "$line" ]; do
        line_num=$((line_num + 1))

        # Skip empty lines
        if [ -z "$line" ]; then
            continue
        fi

        # Validate line
        if ! validate_json "$line"; then
            log_validation "ERROR" "Line $line_num: Invalid JSON"
            errors=$((errors + 1))

            # Attempt repair if enabled
            if [ "$repair" = "1" ]; then
                if repaired=$(validate_and_repair_json "$line" 1); then
                    log_validation "INFO" "Line $line_num: Repaired successfully"
                    errors=$((errors - 1))
                fi
            fi
        fi
    done < "$file_path"

    if [ "$errors" -eq 0 ]; then
        log_validation "INFO" "JSONL file validation completed: All lines valid"
        return 0
    else
        log_validation "ERROR" "JSONL file validation completed: $errors invalid line(s)"
        return 1
    fi
}

# Repair JSONL file in place
repair_jsonl_file() {
    local file_path="$1"
    local backup="${2:-1}"  # Default: create backup

    if [ ! -f "$file_path" ]; then
        log_validation "ERROR" "File not found: $file_path"
        return 1
    fi

    log_validation "INFO" "Repairing JSONL file: $file_path"

    # Create backup if requested
    if [ "$backup" = "1" ]; then
        local backup_path="${file_path}.backup.$(date +%s)"
        cp "$file_path" "$backup_path"
        log_validation "INFO" "Backup created: $backup_path"
    fi

    # Create temporary file
    local temp_file=$(mktemp)
    local line_num=0
    local repaired_count=0
    local failed_count=0

    while IFS= read -r line || [ -n "$line" ]; do
        line_num=$((line_num + 1))

        # Skip empty lines
        if [ -z "$line" ]; then
            continue
        fi

        # Try to repair line
        if repaired=$(validate_and_repair_json "$line" 1); then
            echo "$repaired" >> "$temp_file"
            if [ "$repaired" != "$line" ]; then
                repaired_count=$((repaired_count + 1))
                log_validation "INFO" "Line $line_num: Repaired"
            fi
        else
            log_validation "ERROR" "Line $line_num: Cannot repair - skipping"
            failed_count=$((failed_count + 1))
        fi
    done < "$file_path"

    # Replace original file with repaired version
    mv "$temp_file" "$file_path"

    log_validation "INFO" "Repair completed: $repaired_count repaired, $failed_count failed"

    if [ "$failed_count" -gt 0 ]; then
        return 1
    fi

    return 0
}

# CLI interface
if [ -n "${BASH_SOURCE:-}" ] && [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    # Script is being run directly, not sourced

    case "${1:-}" in
        validate)
            if [ -z "${2:-}" ]; then
                echo "Usage: $0 validate <json_string>"
                exit 1
            fi
            if validate_json "$2"; then
                echo -e "${GREEN}Valid JSON${NC}"
                exit 0
            else
                echo -e "${RED}Invalid JSON${NC}"
                exit 1
            fi
            ;;
        repair)
            if [ -z "${2:-}" ]; then
                echo "Usage: $0 repair <json_string>"
                exit 1
            fi
            if repaired=$(validate_and_repair_json "$2" 1); then
                echo "$repaired"
                exit 0
            else
                echo -e "${RED}Cannot repair JSON${NC}" >&2
                exit 1
            fi
            ;;
        validate-file)
            if [ -z "${2:-}" ]; then
                echo "Usage: $0 validate-file <file_path>"
                exit 1
            fi
            validate_jsonl_file "$2" 0
            ;;
        repair-file)
            if [ -z "${2:-}" ]; then
                echo "Usage: $0 repair-file <file_path> [backup:0|1]"
                exit 1
            fi
            repair_jsonl_file "$2" "${3:-1}"
            ;;
        *)
            echo "JSON Validation and Repair Utility"
            echo ""
            echo "Usage: $0 <command> [arguments]"
            echo ""
            echo "Commands:"
            echo "  validate <json_string>        Validate a JSON string"
            echo "  repair <json_string>          Repair and output valid JSON"
            echo "  validate-file <file_path>     Validate a JSONL file"
            echo "  repair-file <file_path> [backup]  Repair a JSONL file (backup=1 by default)"
            echo ""
            echo "Environment variables:"
            echo "  DEBUG_JSON_VALIDATION=1       Enable debug output"
            echo "  JSON_VALIDATION_LOG=<path>    Log validation events to file"
            exit 1
            ;;
    esac
fi
