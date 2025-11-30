#!/usr/bin/env bash
# Cache Builder Worker
# Processes a chunk of files and builds reference index

set -euo pipefail

CHUNK_FILE="$1"
REFERENCE_CORPUS="$2"
OUTPUT_FILE="$3"
WORKER_ID="$4"
PROJECT_ROOT="$5"

echo "[$WORKER_ID] Starting..." >&2

# Stream output directly to temp files (avoids memory issues)
TEMP_FILES="$OUTPUT_FILE.files.tmp"
TEMP_REFS="$OUTPUT_FILE.refs.tmp"

: > "$TEMP_FILES"  # Clear files
: > "$TEMP_REFS"   # Clear refs

checked=0
referenced=0
total=$(wc -l < "$CHUNK_FILE" | tr -d ' ')

# Process each file in chunk
while IFS= read -r filepath; do
    ((checked++))

    filename=$(basename "$filepath")
    relative_path="${filepath#$PROJECT_ROOT/}"

    # Get file metadata
    size_bytes=$(stat -f%z "$filepath" 2>/dev/null || stat -c%s "$filepath" 2>/dev/null || echo 0)
    last_modified=$(stat -f%Sm -t "%Y-%m-%dT%H:%M:%SZ" "$filepath" 2>/dev/null || stat -c%y "$filepath" 2>/dev/null | cut -d' ' -f1)

    # Stream file info directly to file (one JSON object per line)
    jq -nc \
        --arg filepath "$relative_path" \
        --arg filename "$filename" \
        --argjson size_bytes "$size_bytes" \
        --arg last_modified "$last_modified" \
        '{filepath: $filepath, filename: $filename, size_bytes: $size_bytes, last_modified: $last_modified}' >> "$TEMP_FILES"

    # Check if referenced in corpus (simple boolean check)
    if grep -q "$filename" "$REFERENCE_CORPUS"; then
        ((referenced++))
        # Just record that it's referenced (don't track every reference)
        echo "$filename|referenced" >> "$TEMP_REFS"
    fi

    # Progress indicator
    if (( checked % 100 == 0 )); then
        echo "[$WORKER_ID] Processed $checked/$total files ($referenced referenced)..." >&2
    fi

done < "$CHUNK_FILE"

echo "[$WORKER_ID] Processed all $checked files ($referenced referenced)" >&2

# Generate JSON output by combining temp files
echo "[$WORKER_ID] Writing output..." >&2

{
    echo '{'
    echo "  \"worker_id\": \"$WORKER_ID\","
    echo "  \"file_count\": $checked,"
    echo "  \"referenced_count\": $referenced,"
    echo '  "files": ['

    # Stream files array
    first=true
    while IFS= read -r line; do
        if [[ "$first" == "true" ]]; then
            first=false
            echo "    $line"
        else
            echo "    ,$line"
        fi
    done < "$TEMP_FILES"

    echo '  ],'
    echo '  "references": ['

    # Stream references array
    first=true
    while IFS='|' read -r filename status; do
        if [[ "$first" == "true" ]]; then
            first=false
        else
            echo ","
        fi
        jq -nc --arg filename "$filename" '{filename: $filename, is_referenced: true}' | tr -d '\n'
    done < "$TEMP_REFS"

    echo ''
    echo '  ]'
    echo '}'
} > "$OUTPUT_FILE"

# Cleanup temp files
rm -f "$TEMP_FILES" "$TEMP_REFS"

echo "[$WORKER_ID] Complete!" >&2
