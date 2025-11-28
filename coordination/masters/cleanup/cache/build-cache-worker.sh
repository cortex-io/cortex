#!/bin/bash
# Cache Builder Worker
# Processes a chunk of files and builds reference index

set -euo pipefail

CHUNK_FILE="$1"
REFERENCE_CORPUS="$2"
OUTPUT_FILE="$3"
WORKER_ID="$4"
PROJECT_ROOT="$5"

echo "[$WORKER_ID] Starting..." >&2

# Arrays to collect data
files_data=()
references_data=()

checked=0
total=$(wc -l < "$CHUNK_FILE" | tr -d ' ')

# Process each file in chunk
while IFS= read -r filepath; do
    ((checked++))

    filename=$(basename "$filepath")
    relative_path="${filepath#$PROJECT_ROOT/}"

    # Get file metadata
    size_bytes=$(stat -f%z "$filepath" 2>/dev/null || stat -c%s "$filepath" 2>/dev/null || echo 0)
    last_modified=$(stat -f%Sm -t "%Y-%m-%dT%H:%M:%SZ" "$filepath" 2>/dev/null || stat -c%y "$filepath" 2>/dev/null | cut -d' ' -f1)

    # Store file info
    files_data+=("$(jq -n \
        --arg filepath "$relative_path" \
        --arg filename "$filename" \
        --argjson size_bytes "$size_bytes" \
        --arg last_modified "$last_modified" \
        '{filepath: $filepath, filename: $filename, size_bytes: $size_bytes, last_modified: $last_modified}')")

    # Check if referenced in corpus
    if grep -q "$filename" "$REFERENCE_CORPUS"; then
        # Find all files that reference this one
        while IFS= read -r ref_line; do
            # Extract potential file paths from the line
            # This is a simplified approach - in production might need more sophisticated parsing
            references_data+=("$(jq -n \
                --arg filename "$filename" \
                --arg referenced_by "corpus" \
                '{filename: $filename, referenced_by: $referenced_by}')")
        done < <(grep -n "$filename" "$REFERENCE_CORPUS" | head -10)  # Limit to avoid explosion
    fi

    # Progress indicator
    if (( checked % 100 == 0 )); then
        echo "[$WORKER_ID] Processed $checked/$total files..." >&2
    fi

done < "$CHUNK_FILE"

echo "[$WORKER_ID] Processed all $checked files" >&2

# Generate JSON output
echo "[$WORKER_ID] Writing output..." >&2

jq -n \
    --arg worker_id "$WORKER_ID" \
    --argjson files "$(printf '%s\n' "${files_data[@]}" | jq -s .)" \
    --argjson references "$(printf '%s\n' "${references_data[@]}" | jq -s .)" \
    --argjson file_count "$checked" \
    '{
        worker_id: $worker_id,
        file_count: $file_count,
        files: $files,
        references: $references
    }' > "$OUTPUT_FILE"

echo "[$WORKER_ID] Complete!" >&2
