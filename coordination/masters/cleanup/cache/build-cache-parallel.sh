#!/bin/bash
# Parallel Cache Builder for Cleanup Master
# Builds reference index using multiple workers

set -euo pipefail

# Get project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
CACHE_DIR="$SCRIPT_DIR"

# Configuration
WORKER_COUNT="${1:-4}"  # Default 4 workers
MAX_WORKERS=8

if [[ $WORKER_COUNT -gt $MAX_WORKERS ]]; then
    WORKER_COUNT=$MAX_WORKERS
fi

echo "=== Parallel Cache Builder ===" >&2
echo "Project root: $PROJECT_ROOT" >&2
echo "Workers: $WORKER_COUNT" >&2
echo "" >&2

# Cleanup old cache
rm -f "$CACHE_DIR"/*.db "$CACHE_DIR"/*.tmp "$CACHE_DIR"/worker-*.json

# Step 1: Discover all code files
echo "Step 1: Discovering files..." >&2
ALL_FILES="$CACHE_DIR/all-files.tmp"
find "$PROJECT_ROOT" -type f \( -name "*.sh" -o -name "*.js" -o -name "*.py" \) 2>/dev/null | \
    grep -vE '(node_modules|\.git|\.venv|__pycache__|archives)' > "$ALL_FILES"

TOTAL_FILES=$(wc -l < "$ALL_FILES" | tr -d ' ')
echo "  Found $TOTAL_FILES files" >&2

# Step 2: Split files into chunks for workers
echo "Step 2: Splitting work across $WORKER_COUNT workers..." >&2
CHUNK_SIZE=$(( (TOTAL_FILES + WORKER_COUNT - 1) / WORKER_COUNT ))

split -l "$CHUNK_SIZE" "$ALL_FILES" "$CACHE_DIR/chunk-"

# Rename chunks with .txt extension
for chunk in "$CACHE_DIR"/chunk-*; do
    [[ -f "$chunk" ]] || continue
    mv "$chunk" "$chunk.txt"
done

CHUNKS=("$CACHE_DIR"/chunk-*.txt)
echo "  Created ${#CHUNKS[@]} chunks (~$CHUNK_SIZE files each)" >&2

# Step 3: Build reference corpus once (shared by all workers)
echo "Step 3: Building reference corpus..." >&2
REFERENCE_CORPUS="$CACHE_DIR/reference-corpus.tmp"

time grep -rh --no-filename \
    --include="*.sh" \
    --include="*.js" \
    --include="*.py" \
    --include="*.json" \
    --exclude-dir=node_modules \
    --exclude-dir=.git \
    --exclude-dir=.venv \
    --exclude-dir=__pycache__ \
    --exclude-dir=archives \
    "$PROJECT_ROOT" 2>/dev/null > "$REFERENCE_CORPUS"

CORPUS_LINES=$(wc -l < "$REFERENCE_CORPUS" | tr -d ' ')
echo "  Reference corpus: $CORPUS_LINES lines" >&2

# Step 4: Spawn parallel workers
echo "Step 4: Spawning $WORKER_COUNT parallel workers..." >&2

worker_pids=()
for i in $(seq 0 $((WORKER_COUNT - 1))); do
    chunk_file="${CHUNKS[$i]}"
    [[ -f "$chunk_file" ]] || continue

    worker_id="worker-$i"
    output_file="$CACHE_DIR/$worker_id.json"

    echo "  Starting $worker_id ($(wc -l < "$chunk_file" | tr -d ' ') files)..." >&2

    # Spawn worker in background
    "$CACHE_DIR/build-cache-worker.sh" \
        "$chunk_file" \
        "$REFERENCE_CORPUS" \
        "$output_file" \
        "$worker_id" \
        "$PROJECT_ROOT" &

    worker_pids+=($!)
done

echo "  Workers spawned (PIDs: ${worker_pids[*]})" >&2

# Step 5: Wait for all workers with progress monitoring
echo "Step 5: Processing (monitoring progress)..." >&2

completed=0
while [[ $completed -lt $WORKER_COUNT ]]; do
    sleep 2
    completed=0

    for pid in "${worker_pids[@]}"; do
        if ! kill -0 "$pid" 2>/dev/null; then
            ((completed++))
        fi
    done

    echo "  Progress: $completed/$WORKER_COUNT workers completed" >&2
done

echo "  All workers completed!" >&2

# Step 6: Merge worker results into single cache database
echo "Step 6: Merging results into cache database..." >&2

CACHE_DB="$CACHE_DIR/file-reference-cache.db"
rm -f "$CACHE_DB"

# Create schema
sqlite3 "$CACHE_DB" <<'SQL'
CREATE TABLE files (
    filepath TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    size_bytes INTEGER,
    last_modified TEXT
);

CREATE TABLE references (
    filename TEXT NOT NULL,
    referenced_by TEXT NOT NULL,
    PRIMARY KEY (filename, referenced_by)
);

CREATE TABLE metadata (
    key TEXT PRIMARY KEY,
    value TEXT
);

CREATE INDEX idx_filename ON files(filename);
CREATE INDEX idx_references_filename ON references(filename);
SQL

# Import worker results
for worker_output in "$CACHE_DIR"/worker-*.json; do
    [[ -f "$worker_output" ]] || continue

    # Extract data and import into SQLite
    jq -r '.files[] | "\(.filepath)|\(.filename)|\(.size_bytes)|\(.last_modified)"' "$worker_output" | \
    while IFS='|' read -r filepath filename size_bytes last_modified; do
        sqlite3 "$CACHE_DB" "INSERT OR IGNORE INTO files VALUES ('$filepath', '$filename', $size_bytes, '$last_modified');"
    done

    jq -r '.references[] | "\(.filename)|\(.referenced_by)"' "$worker_output" | \
    while IFS='|' read -r filename referenced_by; do
        sqlite3 "$CACHE_DB" "INSERT OR IGNORE INTO references VALUES ('$filename', '$referenced_by');"
    done
done

# Add metadata
sqlite3 "$CACHE_DB" <<SQL
INSERT INTO metadata VALUES ('built_at', '$(date -u +%Y-%m-%dT%H:%M:%SZ)');
INSERT INTO metadata VALUES ('file_count', '$TOTAL_FILES');
INSERT INTO metadata VALUES ('corpus_lines', '$CORPUS_LINES');
INSERT INTO metadata VALUES ('worker_count', '$WORKER_COUNT');
SQL

# Step 7: Generate summary
echo "Step 7: Generating cache summary..." >&2

CACHE_METADATA="$CACHE_DIR/cache-metadata.json"
jq -n \
    --arg built_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --argjson file_count "$TOTAL_FILES" \
    --argjson corpus_lines "$CORPUS_LINES" \
    --argjson worker_count "$WORKER_COUNT" \
    --arg cache_size "$(du -h "$CACHE_DB" | cut -f1)" \
    '{
        built_at: $built_at,
        file_count: $file_count,
        corpus_lines: $corpus_lines,
        worker_count: $worker_count,
        cache_size: $cache_size,
        cache_db: "file-reference-cache.db",
        status: "ready"
    }' > "$CACHE_METADATA"

# Cleanup temporary files
rm -f "$CACHE_DIR"/*.tmp "$CACHE_DIR"/chunk-*.txt "$CACHE_DIR"/worker-*.json

echo "" >&2
echo "=== Cache Build Complete ===" >&2
cat "$CACHE_METADATA" | jq . >&2

echo "$CACHE_DB"
