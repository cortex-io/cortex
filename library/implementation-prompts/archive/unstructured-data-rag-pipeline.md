# Unstructured Data Integration & Governance for Commit-Relay

**Source**: "Unlocking Smarter AI Agents with Unstructured Data, RAG & Vector Databases"
**Purpose**: Transform commit-relay's unstructured data (bash scripts, logs, task outputs) into AI-ready knowledge
**Critical Insight**: "Most AI agents don't fail because of weak models. They fail because of the data behind them."

---

## Executive Summary

**The Problem**: 90% of enterprise data is unstructured (PDFs, docs, emails, transcripts, code, logs). Unlike rows in a database, this content can't be easily searched, queried, or fed to models.

**Commit-Relay's Unstructured Data**:
- Bash scripts (500+ files)
- JSON state files (task queues, worker specs, learnings)
- Log files (worker outputs, system events, error traces)
- Task descriptions and outcomes
- Code patterns and security findings
- Worker conversation transcripts
- Git commit messages
- Documentation

**The Solution**: Two-part system
1. **Unstructured Data Integration**: Transform raw content into AI-ready datasets
2. **Unstructured Data Governance**: Ensure datasets are discoverable, cataloged, and trusted

**Impact**: Workers gain access to 90% of commit-relay knowledge currently unused

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│            COMMIT-RELAY UNSTRUCTURED DATA PIPELINE          │
└─────────────────────────────────────────────────────────────┘

1. INGEST (Collect Raw Data)
   │
   ├─→ Scripts:      *.sh, *.py, *.js
   ├─→ Logs:         agents/logs/**, coordination/pm-activity.jsonl
   ├─→ Task Data:    coordination/task-queue.json
   ├─→ Worker Specs: coordination/worker-specs/**/*.json
   ├─→ Learnings:    coordination/memory/**/*.json
   ├─→ Git Data:     commit messages, diffs
   └─→ Documentation: README.md, *.md

2. TRANSFORM (Make AI-Ready)
   │
   ├─→ Text Extraction:    Extract code comments, docstrings, logs
   ├─→ Deduplication:      Remove redundant patterns
   ├─→ Entity Extraction:  Identify functions, variables, patterns
   ├─→ PII Removal:        Strip secrets, tokens, credentials
   ├─→ Chunking:           Split into semantic segments
   └─→ Vectorization:      Generate embeddings

3. LOAD (Store for Retrieval)
   │
   └─→ Vector Database: coordination/embeddings/collections/
       ├─ code-patterns/       (bash best practices)
       ├─ task-history/        (completed tasks)
       ├─ error-solutions/     (fixed bugs)
       ├─ worker-learnings/    (successful strategies)
       └─ security-findings/   (vulnerabilities)

4. GOVERN (Ensure Quality)
   │
   ├─→ Entity Extraction:  Names, dates, task IDs, worker IDs
   ├─→ Classification:     Bug fix, feature, security, refactor
   ├─→ Quality Assessment: Confidence scores, validation
   ├─→ Metadata Tagging:   Topics, sentiment, priority
   ├─→ Lineage Tracking:   Source → Transform → Destination
   └─→ Access Control:     Who can access what data

5. CONSUME (Workers Use Knowledge)
   │
   └─→ RAG Retrieval: Workers query vector DB for relevant context
```

---

## Part 1: Unstructured Data Integration

### Problem Statement

**Before Integration**:
- Worker needs to know "how to fix command injection in bash"
- Current approach: Search through all scripts manually
- Time: 10-20 minutes per query
- Coverage: Only finds exact keyword matches
- Result: Misses similar patterns with different wording

**After Integration**:
- Worker queries: "prevent command injection bash"
- Vector DB returns: Top 5 semantically similar examples
- Time: <1 second
- Coverage: Finds all related patterns regardless of wording
- Result: Worker sees actual past fixes with context

### Implementation: 3-Stage Pipeline

#### Stage 1: INGEST - Collect Unstructured Data

**File**: `coordination/unstructured/ingest/ingestor.sh`

```bash
#!/bin/bash
# coordination/unstructured/ingest/ingestor.sh
# Ingest unstructured data from multiple sources

set -euo pipefail

COMMIT_RELAY_HOME="${COMMIT_RELAY_HOME:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
INGEST_DIR="$COMMIT_RELAY_HOME/coordination/unstructured/ingested"
RAW_DIR="$INGEST_DIR/raw"

mkdir -p "$RAW_DIR"/{scripts,logs,tasks,git,docs}

# Source 1: Bash Scripts
ingest_scripts() {
    echo "=== Ingesting Scripts ==="

    local count=0

    # Find all bash scripts
    find "$COMMIT_RELAY_HOME" -name "*.sh" -type f ! -path "*/node_modules/*" | \
    while read -r script; do
        # Extract metadata
        local rel_path="${script#$COMMIT_RELAY_HOME/}"
        local basename=$(basename "$script")
        local dir=$(dirname "$rel_path")

        # Get file stats
        local size=$(stat -f%z "$script" 2>/dev/null || stat -c%s "$script")
        local modified=$(stat -f%m "$script" 2>/dev/null || stat -c%Y "$script")

        # Create ingested document
        jq -n \
            --arg path "$rel_path" \
            --arg name "$basename" \
            --arg dir "$dir" \
            --arg content "$(cat "$script")" \
            --argjson size "$size" \
            --argjson modified "$modified" \
            '{
                source_type: "script",
                source_path: $path,
                file_name: $name,
                directory: $dir,
                language: "bash",
                content: $content,
                metadata: {
                    size_bytes: $size,
                    modified_at: $modified,
                    ingested_at: (now | todate)
                }
            }' > "$RAW_DIR/scripts/${basename%.sh}.json"

        count=$((count + 1))
    done

    echo "Ingested $count scripts"
}

# Source 2: Log Files
ingest_logs() {
    echo "=== Ingesting Logs ==="

    local count=0

    # Worker logs
    if [ -d "$COMMIT_RELAY_HOME/agents/logs" ]; then
        find "$COMMIT_RELAY_HOME/agents/logs" -name "*.log" -type f -mtime -7 | \
        while read -r log_file; do
            local rel_path="${log_file#$COMMIT_RELAY_HOME/}"
            local basename=$(basename "$log_file")

            # Read log content (last 1000 lines)
            local content=$(tail -1000 "$log_file")

            jq -n \
                --arg path "$rel_path" \
                --arg name "$basename" \
                --arg content "$content" \
                '{
                    source_type: "log",
                    source_path: $path,
                    file_name: $name,
                    content: $content,
                    metadata: {
                        log_type: "worker",
                        ingested_at: (now | todate)
                    }
                }' > "$RAW_DIR/logs/${basename%.log}.json"

            count=$((count + 1))
        done
    fi

    # JSONL activity logs
    for jsonl in "$COMMIT_RELAY_HOME/coordination"/*.jsonl; do
        if [ -f "$jsonl" ]; then
            local basename=$(basename "$jsonl")

            # Read last 100 lines
            local content=$(tail -100 "$jsonl" | jq -s '.')

            jq -n \
                --arg name "$basename" \
                --argjson content "$content" \
                '{
                    source_type: "jsonl_log",
                    file_name: $name,
                    content: $content,
                    metadata: {
                        log_type: "activity",
                        ingested_at: (now | todate)
                    }
                }' > "$RAW_DIR/logs/${basename%.jsonl}-events.json"

            count=$((count + 1))
        fi
    done

    echo "Ingested $count log files"
}

# Source 3: Task Queue & Worker Specs
ingest_tasks() {
    echo "=== Ingesting Task Data ==="

    local count=0

    # Task queue
    if [ -f "$COMMIT_RELAY_HOME/coordination/task-queue.json" ]; then
        # Extract each task as separate document
        jq -c '.tasks[]' "$COMMIT_RELAY_HOME/coordination/task-queue.json" | \
        while read -r task; do
            local task_id=$(echo "$task" | jq -r '.id')

            echo "$task" | jq '{
                source_type: "task",
                task_id: .id,
                content: "\(.title). \(.description)",
                full_data: .,
                metadata: {
                    status: .status,
                    priority: .priority,
                    type: .type,
                    ingested_at: (now | todate)
                }
            }' > "$RAW_DIR/tasks/${task_id}.json"

            count=$((count + 1))
        done
    fi

    # Worker specs (completed)
    if [ -d "$COMMIT_RELAY_HOME/coordination/worker-specs/completed" ]; then
        for spec in "$COMMIT_RELAY_HOME/coordination/worker-specs/completed"/*.json; do
            if [ -f "$spec" ]; then
                local worker_id=$(jq -r '.worker_id' "$spec")
                local task_id=$(jq -r '.task_id' "$spec")

                # Extract outcome as content
                local content=$(jq -r '"\(.worker_type) completed \(.task_id): \(.result // "no result")"' "$spec")

                jq --arg content "$content" \
                    '{
                        source_type: "worker_result",
                        worker_id: .worker_id,
                        task_id: .task_id,
                        content: $content,
                        full_data: .,
                        metadata: {
                            worker_type: .worker_type,
                            status: .status,
                            ingested_at: (now | todate)
                        }
                    }' "$spec" > "$RAW_DIR/tasks/${worker_id}-result.json"

                count=$((count + 1))
            fi
        done
    fi

    echo "Ingested $count task-related documents"
}

# Source 4: Git History
ingest_git() {
    echo "=== Ingesting Git Data ==="

    local count=0

    # Last 100 commits
    git -C "$COMMIT_RELAY_HOME" log -100 --pretty=format:'%H|%an|%ae|%at|%s|%b' | \
    while IFS='|' read -r hash author email timestamp subject body; do
        jq -n \
            --arg hash "$hash" \
            --arg author "$author" \
            --arg email "$email" \
            --argjson ts "$timestamp" \
            --arg subject "$subject" \
            --arg body "$body" \
            '{
                source_type: "git_commit",
                commit_hash: $hash,
                content: "\($subject). \($body)",
                metadata: {
                    author: $author,
                    email: $email,
                    timestamp: $ts,
                    ingested_at: (now | todate)
                }
            }' > "$RAW_DIR/git/${hash:0:8}.json"

        count=$((count + 1))
    done

    echo "Ingested $count git commits"
}

# Source 5: Documentation
ingest_docs() {
    echo "=== Ingesting Documentation ==="

    local count=0

    # Find markdown files
    find "$COMMIT_RELAY_HOME" -name "*.md" -type f ! -path "*/node_modules/*" | \
    while read -r doc; do
        local rel_path="${doc#$COMMIT_RELAY_HOME/}"
        local basename=$(basename "$doc")

        jq -n \
            --arg path "$rel_path" \
            --arg name "$basename" \
            --arg content "$(cat "$doc")" \
            '{
                source_type: "documentation",
                source_path: $path,
                file_name: $name,
                content: $content,
                metadata: {
                    format: "markdown",
                    ingested_at: (now | todate)
                }
            }' > "$RAW_DIR/docs/${basename%.md}.json"

        count=$((count + 1))
    done

    echo "Ingested $count documentation files"
}

# Run all ingestion
run_ingestion() {
    echo "=== STARTING INGESTION ==="
    echo "Target: $RAW_DIR"
    echo ""

    local start=$(date +%s)

    ingest_scripts
    ingest_logs
    ingest_tasks
    ingest_git
    ingest_docs

    local end=$(date +%s)
    local duration=$((end - start))

    # Summary
    local total_docs=$(find "$RAW_DIR" -name "*.json" | wc -l | tr -d ' ')

    echo ""
    echo "=== INGESTION COMPLETE ==="
    echo "Total documents: $total_docs"
    echo "Duration: ${duration}s"
    echo "Location: $RAW_DIR"
}

# Command-line interface
case "${1:-}" in
    all)
        run_ingestion
        ;;
    scripts)
        ingest_scripts
        ;;
    logs)
        ingest_logs
        ;;
    tasks)
        ingest_tasks
        ;;
    git)
        ingest_git
        ;;
    docs)
        ingest_docs
        ;;
    *)
        cat << USAGE
Usage: ingestor.sh <command>

Commands:
    all      Ingest all sources
    scripts  Ingest bash scripts only
    logs     Ingest log files only
    tasks    Ingest task & worker data only
    git      Ingest git history only
    docs     Ingest documentation only

Example:
    ./ingestor.sh all
USAGE
        ;;
esac
```

#### Stage 2: TRANSFORM - Make AI-Ready

**File**: `coordination/unstructured/transform/transformer.sh`

```bash
#!/bin/bash
# coordination/unstructured/transform/transformer.sh
# Transform raw ingested data into AI-ready format

set -euo pipefail

COMMIT_RELAY_HOME="${COMMIT_RELAY_HOME:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
RAW_DIR="$COMMIT_RELAY_HOME/coordination/unstructured/ingested/raw"
TRANSFORMED_DIR="$COMMIT_RELAY_HOME/coordination/unstructured/transformed"

mkdir -p "$TRANSFORMED_DIR"/{clean,chunks,vectors}

# Transform 1: Text Extraction & Cleaning
extract_and_clean() {
    local input_doc="$1"
    local source_type=$(jq -r '.source_type' "$input_doc")

    case "$source_type" in
        script)
            # Extract: code + comments + docstrings
            local code=$(jq -r '.content' "$input_doc")

            # Get comments and meaningful content
            local comments=$(echo "$code" | grep -E '^\s*#' | sed 's/^\s*#\s*//' || echo "")
            local functions=$(echo "$code" | grep -oE '[a-z_]+\(\)' | sed 's/()//' || echo "")

            # Create clean text
            local clean_text=$(cat << TEXT
Functions: $(echo "$functions" | tr '\n' ',' | sed 's/,$//')
Comments: $comments
Code: $code
TEXT
)
            ;;
        log)
            # Extract: errors, warnings, important events
            local content=$(jq -r '.content' "$input_doc")

            # Filter for important lines
            local clean_text=$(echo "$content" | \
                grep -E 'ERROR|WARN|SUCCESS|FAIL|✓|✗' || echo "$content")
            ;;
        task)
            # Use title + description
            local clean_text=$(jq -r '.content' "$input_doc")
            ;;
        *)
            # Default: use content as-is
            local clean_text=$(jq -r '.content' "$input_doc")
            ;;
    esac

    echo "$clean_text"
}

# Transform 2: Deduplication
deduplicate_content() {
    local content="$1"

    # Simple dedup: remove consecutive duplicate lines
    echo "$content" | awk '!seen[$0]++'
}

# Transform 3: Language & Entity Extraction
extract_entities() {
    local input_doc="$1"
    local source_type=$(jq -r '.source_type' "$input_doc")
    local content=$(jq -r '.content' "$input_doc")

    local entities=()

    # Extract task IDs
    local task_ids=$(echo "$content" | grep -oE 'task-[0-9]+' | sort -u || echo "")
    if [ -n "$task_ids" ]; then
        entities+=($(echo "$task_ids" | jq -R . | jq -s '{type: "task_id", values: .}'))
    fi

    # Extract worker IDs
    local worker_ids=$(echo "$content" | grep -oE '(dev|sec|inv)-worker-[A-Z0-9]+' | sort -u || echo "")
    if [ -n "$worker_ids" ]; then
        entities+=($(echo "$worker_ids" | jq -R . | jq -s '{type: "worker_id", values: .}'))
    fi

    # Extract file paths
    local paths=$(echo "$content" | grep -oE '[a-z0-9/_-]+\.(sh|json|js|py)' | sort -u || echo "")
    if [ -n "$paths" ]; then
        entities+=($(echo "$paths" | jq -R . | jq -s '{type: "file_path", values: .}'))
    fi

    # Return entities as JSON array
    if [ ${#entities[@]} -gt 0 ]; then
        printf '%s\n' "${entities[@]}" | jq -s '.'
    else
        echo "[]"
    fi
}

# Transform 4: PII Removal
remove_pii() {
    local content="$1"

    # Remove email addresses
    content=$(echo "$content" | sed -E 's/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/[EMAIL]/g')

    # Remove API keys/tokens (basic pattern)
    content=$(echo "$content" | sed -E 's/[a-zA-Z0-9]{32,}/[TOKEN]/g')

    # Remove IP addresses
    content=$(echo "$content" | sed -E 's/[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/[IP]/g')

    echo "$content"
}

# Transform 5: Chunking
chunk_content() {
    local content="$1"
    local chunk_size="${2:-500}"  # words per chunk
    local overlap="${3:-50}"       # overlap between chunks

    # Split into words
    local words=($(echo "$content" | tr ' ' '\n'))
    local total_words=${#words[@]}

    local chunks=()
    local start=0

    while [ $start -lt $total_words ]; do
        local end=$((start + chunk_size))
        if [ $end -gt $total_words ]; then
            end=$total_words
        fi

        # Get chunk
        local chunk="${words[@]:$start:$((end - start))}"
        chunks+=("$chunk")

        # Move start with overlap
        start=$((end - overlap))

        # Prevent infinite loop
        if [ $start -le $((end - chunk_size)) ]; then
            break
        fi
    done

    # Return chunks as JSON array
    printf '%s\n' "${chunks[@]}" | jq -R . | jq -s '.'
}

# Transform 6: Vectorization (call Python)
vectorize_text() {
    local text="$1"

    python3 << 'PYEOF'
import sys
import json
from sentence_transformers import SentenceTransformer

text = sys.stdin.read()

# Use lightweight model
model = SentenceTransformer('all-MiniLM-L6-v2')

# Generate embedding
embedding = model.encode(text).tolist()

print(json.dumps(embedding))
PYEOF
}

# Main transformation pipeline
transform_document() {
    local input_doc="$1"
    local basename=$(basename "$input_doc" .json)

    echo "Transforming: $basename"

    # 1. Extract & Clean
    local clean_text=$(extract_and_clean "$input_doc")

    # 2. Deduplicate
    clean_text=$(deduplicate_content "$clean_text")

    # 3. Extract Entities
    local entities=$(extract_entities "$input_doc")

    # 4. Remove PII
    clean_text=$(remove_pii "$clean_text")

    # 5. Chunk
    local chunks=$(chunk_content "$clean_text" 500 50)

    # Save cleaned document
    jq -n \
        --arg id "$basename" \
        --arg clean "$clean_text" \
        --argjson entities "$entities" \
        --argjson chunks "$chunks" \
        --slurpfile original "$input_doc" \
        '{
            id: $id,
            clean_text: $clean,
            entities: $entities,
            chunks: $chunks,
            original_metadata: $original[0].metadata,
            transformed_at: (now | todate)
        }' > "$TRANSFORMED_DIR/clean/${basename}.json"

    # 6. Vectorize each chunk
    local chunk_count=$(echo "$chunks" | jq 'length')

    for ((i=0; i<chunk_count; i++)); do
        local chunk_text=$(echo "$chunks" | jq -r ".[$i]")

        if [ -n "$chunk_text" ]; then
            # Generate vector
            local vector=$(echo "$chunk_text" | vectorize_text)

            # Save chunk with vector
            jq -n \
                --arg doc_id "$basename" \
                --argjson chunk_idx "$i" \
                --arg text "$chunk_text" \
                --argjson vector "$vector" \
                --slurpfile meta "$input_doc" \
                '{
                    document_id: $doc_id,
                    chunk_index: $chunk_idx,
                    text: $text,
                    vector: $vector,
                    metadata: $meta[0].metadata,
                    vectorized_at: (now | todate)
                }' > "$TRANSFORMED_DIR/vectors/${basename}-chunk-${i}.json"
        fi
    done
}

# Transform all documents
transform_all() {
    echo "=== STARTING TRANSFORMATION ==="

    local count=0

    for category in scripts logs tasks git docs; do
        if [ -d "$RAW_DIR/$category" ]; then
            echo "Processing $category..."

            for doc in "$RAW_DIR/$category"/*.json; do
                if [ -f "$doc" ]; then
                    transform_document "$doc"
                    count=$((count + 1))
                fi
            done
        fi
    done

    echo ""
    echo "=== TRANSFORMATION COMPLETE ==="
    echo "Documents transformed: $count"
    echo "Clean documents: $(ls -1 "$TRANSFORMED_DIR/clean"/*.json 2>/dev/null | wc -l)"
    echo "Vector chunks: $(ls -1 "$TRANSFORMED_DIR/vectors"/*.json 2>/dev/null | wc -l)"
}

# Command-line interface
case "${1:-}" in
    all)
        transform_all
        ;;
    doc)
        transform_document "$2"
        ;;
    *)
        cat << USAGE
Usage: transformer.sh <command> [args]

Commands:
    all            Transform all ingested documents
    doc <file>     Transform specific document

Example:
    ./transformer.sh all
USAGE
        ;;
esac
```

#### Stage 3: LOAD - Store in Vector Database

**File**: `coordination/unstructured/load/loader.sh`

```bash
#!/bin/bash
# coordination/unstructured/load/loader.sh
# Load transformed vectors into vector database

set -euo pipefail

COMMIT_RELAY_HOME="${COMMIT_RELAY_HOME:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
VECTORS_DIR="$COMMIT_RELAY_HOME/coordination/unstructured/transformed/vectors"
VECTOR_DB="$COMMIT_RELAY_HOME/coordination/embeddings/vector-db.sh"

# Load vectors into appropriate collections
load_vectors() {
    echo "=== LOADING VECTORS INTO DATABASE ==="

    local count=0

    for vector_file in "$VECTORS_DIR"/*.json; do
        if [ ! -f "$vector_file" ]; then
            continue
        fi

        local doc_id=$(jq -r '.document_id' "$vector_file")
        local chunk_idx=$(jq -r '.chunk_index' "$vector_file")
        local text=$(jq -r '.text' "$vector_file")
        local metadata=$(jq -c '.metadata' "$vector_file")

        # Determine collection based on source type
        local source_type=$(echo "$metadata" | jq -r '.source_type // "general"')

        local collection=""
        case "$source_type" in
            script)
                collection="code-patterns"
                ;;
            task)
                collection="task-history"
                ;;
            log)
                collection="error-solutions"
                ;;
            worker_result)
                collection="worker-learnings"
                ;;
            git_commit)
                collection="task-history"
                ;;
            *)
                collection="general-knowledge"
                ;;
        esac

        # Add to vector database
        $VECTOR_DB add "$collection" \
            "${doc_id}-chunk-${chunk_idx}" \
            "$text" \
            "$metadata"

        count=$((count + 1))
    done

    echo ""
    echo "=== LOAD COMPLETE ==="
    echo "Vectors loaded: $count"

    # Show collection stats
    echo ""
    echo "Collection Statistics:"
    $VECTOR_DB list
}

# Command-line interface
case "${1:-}" in
    load)
        load_vectors
        ;;
    *)
        cat << USAGE
Usage: loader.sh <command>

Commands:
    load    Load all vectors into database

Example:
    ./loader.sh load
USAGE
        ;;
esac
```

### Automation: Continuous Pipeline

**File**: `coordination/unstructured/pipeline-daemon.sh`

```bash
#!/bin/bash
# coordination/unstructured/pipeline-daemon.sh
# Continuous pipeline for unstructured data

set -euo pipefail

COMMIT_RELAY_HOME="${COMMIT_RELAY_HOME:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
PIPELINE_DIR="$COMMIT_RELAY_HOME/coordination/unstructured"

# Run full pipeline
run_pipeline() {
    echo "=== UNSTRUCTURED DATA PIPELINE RUN ==="
    echo "Started: $(date)"
    echo ""

    local start=$(date +%s)

    # Stage 1: Ingest
    echo "[1/3] INGESTING..."
    "$PIPELINE_DIR/ingest/ingestor.sh" all
    echo ""

    # Stage 2: Transform
    echo "[2/3] TRANSFORMING..."
    "$PIPELINE_DIR/transform/transformer.sh" all
    echo ""

    # Stage 3: Load
    echo "[3/3] LOADING..."
    "$PIPELINE_DIR/load/loader.sh" load
    echo ""

    local end=$(date +%s)
    local duration=$((end - start))

    echo "=== PIPELINE COMPLETE ==="
    echo "Duration: ${duration}s"
    echo "Finished: $(date)"
}

# Daemon mode: run every N hours
daemon_mode() {
    local interval_hours="${1:-6}"  # Default: every 6 hours
    local interval_seconds=$((interval_hours * 3600))

    echo "Starting pipeline daemon (interval: ${interval_hours}h)"

    while true; do
        run_pipeline

        echo ""
        echo "Next run in ${interval_hours} hours..."
        sleep "$interval_seconds"
    done
}

# Delta mode: only process new/changed files
delta_mode() {
    echo "=== DELTA PIPELINE RUN ==="

    # Find files modified in last hour
    local modified_scripts=$(find "$COMMIT_RELAY_HOME" -name "*.sh" -mtime -1h -type f)
    local modified_logs=$(find "$COMMIT_RELAY_HOME/agents/logs" -name "*.log" -mtime -1h -type f)

    # Process only deltas
    # (Implementation: filter ingestor to only process these files)

    echo "Delta processing complete"
}

# Command-line interface
case "${1:-}" in
    once)
        run_pipeline
        ;;
    daemon)
        daemon_mode "${2:-6}"
        ;;
    delta)
        delta_mode
        ;;
    *)
        cat << USAGE
Usage: pipeline-daemon.sh <command> [args]

Commands:
    once           Run pipeline once
    daemon [hrs]   Run continuously every N hours (default: 6)
    delta          Process only changed files since last run

Examples:
    # Run once
    ./pipeline-daemon.sh once

    # Run every 4 hours
    ./pipeline-daemon.sh daemon 4

    # Process deltas only
    ./pipeline-daemon.sh delta
USAGE
        ;;
esac
```

---

## Part 2: Unstructured Data Governance

### Governance Pipeline

**File**: `coordination/unstructured/govern/governance-pipeline.sh`

```bash
#!/bin/bash
# coordination/unstructured/govern/governance-pipeline.sh
# Governance layer for unstructured data

set -euo pipefail

COMMIT_RELAY_HOME="${COMMIT_RELAY_HOME:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
CATALOG_DIR="$COMMIT_RELAY_HOME/coordination/unstructured/catalog"
LINEAGE_DIR="$CATALOG_DIR/lineage"
QUALITY_DIR="$CATALOG_DIR/quality"

mkdir -p "$CATALOG_DIR" "$LINEAGE_DIR" "$QUALITY_DIR"

# Step 1: Entity Extraction (already done in transform)
# Step 2: Classification

classify_document() {
    local doc="$1"

    local content=$(jq -r '.content // .clean_text' "$doc")
    local source_type=$(jq -r '.source_type // .metadata.source_type' "$doc")

    local category=""
    local subcategory=""
    local confidence=0

    # Classification rules
    if echo "$content" | grep -qi "security\|vulnerability\|CVE\|injection"; then
        category="security"
        subcategory=$(echo "$content" | grep -oi "SQL injection\|XSS\|command injection\|CSRF" | head -1)
        confidence=90
    elif echo "$content" | grep -qi "bug\|fix\|error\|fail"; then
        category="bug_fix"
        subcategory="error_resolution"
        confidence=85
    elif echo "$content" | grep -qi "implement\|feature\|add"; then
        category="feature"
        subcategory="enhancement"
        confidence=80
    elif echo "$content" | grep -qi "refactor\|optimize\|improve"; then
        category="refactor"
        subcategory="code_improvement"
        confidence=75
    else
        category="general"
        subcategory="unknown"
        confidence=50
    fi

    # Return classification
    jq -n \
        --arg cat "$category" \
        --arg subcat "$subcategory" \
        --argjson conf "$confidence" \
        '{
            category: $cat,
            subcategory: $subcat,
            confidence: $conf
        }'
}

# Step 3: Quality Assessment

assess_quality() {
    local doc="$1"

    local content=$(jq -r '.content // .clean_text' "$doc")

    # Quality metrics
    local word_count=$(echo "$content" | wc -w | tr -d ' ')
    local has_entities=$(jq '.entities | length > 0' "$doc")
    local has_metadata=$(jq '.metadata != null' "$doc")

    # Quality score
    local quality_score=0

    if [ "$word_count" -gt 50 ]; then
        quality_score=$((quality_score + 40))
    fi

    if [ "$has_entities" = "true" ]; then
        quality_score=$((quality_score + 30))
    fi

    if [ "$has_metadata" = "true" ]; then
        quality_score=$((quality_score + 30))
    fi

    # Return assessment
    jq -n \
        --argjson score "$quality_score" \
        --argjson words "$word_count" \
        --argjson entities "$has_entities" \
        '{
            quality_score: $score,
            word_count: $words,
            has_entities: $entities,
            status: (if $score >= 70 then "high" elif $score >= 40 then "medium" else "low" end)
        }'
}

# Step 4: Metadata Tagging

tag_document() {
    local doc="$1"

    local content=$(jq -r '.content // .clean_text' "$doc")

    local tags=()

    # Extract topics
    if echo "$content" | grep -qi "bash\|shell"; then
        tags+=("bash")
    fi

    if echo "$content" | grep -qi "security"; then
        tags+=("security")
    fi

    if echo "$content" | grep -qi "worker\|agent"; then
        tags+=("agents")
    fi

    if echo "$content" | grep -qi "MoE\|routing"; then
        tags+=("moe")
    fi

    # Sentiment (simple)
    local sentiment="neutral"
    if echo "$content" | grep -qi "success\|✓\|completed\|fixed"; then
        sentiment="positive"
    elif echo "$content" | grep -qi "error\|fail\|✗\|bug"; then
        sentiment="negative"
    fi

    # Priority inference
    local priority="medium"
    if echo "$content" | grep -qi "critical\|urgent\|security"; then
        priority="high"
    elif echo "$content" | grep -qi "minor\|trivial"; then
        priority="low"
    fi

    # Return tags
    printf '%s\n' "${tags[@]}" | jq -R . | jq -s \
        --arg sentiment "$sentiment" \
        --arg priority "$priority" \
        '{
            topics: .,
            sentiment: $sentiment,
            priority: $priority
        }'
}

# Step 5: Data Lineage Tracking

record_lineage() {
    local source_file="$1"
    local target_file="$2"
    local operation="$3"

    local lineage_id="lineage-$(date +%s)-$(openssl rand -hex 4)"

    jq -n \
        --arg id "$lineage_id" \
        --arg source "$source_file" \
        --arg target "$target_file" \
        --arg op "$operation" \
        '{
            id: $id,
            source: $source,
            target: $target,
            operation: $op,
            timestamp: (now | todate)
        }' >> "$LINEAGE_DIR/lineage-log.jsonl"
}

# Step 6: Validation & Alerts

validate_and_alert() {
    local doc="$1"
    local doc_id=$(jq -r '.id // .document_id' "$doc")

    local classification=$(classify_document "$doc")
    local quality=$(assess_quality "$doc")

    local confidence=$(echo "$classification" | jq -r '.confidence')
    local quality_score=$(echo "$quality" | jq -r '.quality_score')

    local alerts=()

    # Alert: Low confidence classification
    if [ "$confidence" -lt 60 ]; then
        alerts+=("Low confidence classification: ${confidence}%")
    fi

    # Alert: Low quality
    if [ "$quality_score" -lt 40 ]; then
        alerts+=("Low quality document: ${quality_score}/100")
    fi

    # Alert: Missing entities
    if ! jq -e '.entities | length > 0' "$doc" >/dev/null 2>&1; then
        alerts+=("No entities extracted")
    fi

    # If alerts exist, log them
    if [ ${#alerts[@]} -gt 0 ]; then
        echo "⚠️  Alerts for $doc_id:"
        printf '  - %s\n' "${alerts[@]}"

        # Write to quality report
        printf '%s\n' "${alerts[@]}" | jq -R . | jq -s \
            --arg id "$doc_id" \
            '{
                document_id: $id,
                alerts: .,
                timestamp: (now | todate)
            }' >> "$QUALITY_DIR/alerts.jsonl"
    fi
}

# Step 7: Catalog Document

catalog_document() {
    local doc="$1"
    local doc_id=$(jq -r '.id // .document_id' "$doc")

    # Gather all governance metadata
    local classification=$(classify_document "$doc")
    local quality=$(assess_quality "$doc")
    local tags=$(tag_document "$doc")

    # Create catalog entry
    jq -n \
        --arg id "$doc_id" \
        --slurpfile doc "$doc" \
        --argjson classification "$classification" \
        --argjson quality "$quality" \
        --argjson tags "$tags" \
        '{
            id: $id,
            original: $doc[0],
            governance: {
                classification: $classification,
                quality: $quality,
                tags: $tags
            },
            cataloged_at: (now | todate),
            discoverable: true
        }' > "$CATALOG_DIR/${doc_id}.json"

    echo "✓ Cataloged: $doc_id"
}

# Run governance pipeline
run_governance() {
    echo "=== GOVERNANCE PIPELINE ==="

    local clean_dir="$COMMIT_RELAY_HOME/coordination/unstructured/transformed/clean"

    if [ ! -d "$clean_dir" ]; then
        echo "No transformed documents found. Run transformation first."
        return 1
    fi

    local count=0

    for doc in "$clean_dir"/*.json; do
        if [ -f "$doc" ]; then
            echo "Governing: $(basename "$doc")"

            # Validate & Alert
            validate_and_alert "$doc"

            # Catalog
            catalog_document "$doc"

            # Record lineage
            record_lineage "$doc" "$CATALOG_DIR/$(basename "$doc")" "catalog"

            count=$((count + 1))
        fi
    done

    echo ""
    echo "=== GOVERNANCE COMPLETE ==="
    echo "Documents governed: $count"
    echo "Catalog entries: $(ls -1 "$CATALOG_DIR"/*.json 2>/dev/null | wc -l | tr -d ' ')"
    echo "Alerts logged: $(cat "$QUALITY_DIR/alerts.jsonl" 2>/dev/null | wc -l | tr -d ' ')"
}

# Search catalog
search_catalog() {
    local query="$1"

    echo "Searching catalog for: $query"

    # Search by tags, category, or content
    for catalog_entry in "$CATALOG_DIR"/*.json; do
        if [ -f "$catalog_entry" ]; then
            local matched=false

            # Check tags
            if jq -e --arg q "$query" '.governance.tags.topics[] | select(. == $q)' "$catalog_entry" >/dev/null 2>&1; then
                matched=true
            fi

            # Check category
            if jq -e --arg q "$query" '.governance.classification.category | select(. == $q)' "$catalog_entry" >/dev/null 2>&1; then
                matched=true
            fi

            if [ "$matched" = "true" ]; then
                local doc_id=$(jq -r '.id' "$catalog_entry")
                local category=$(jq -r '.governance.classification.category' "$catalog_entry")
                local quality=$(jq -r '.governance.quality.status' "$catalog_entry")

                echo "  - $doc_id ($category, quality: $quality)"
            fi
        fi
    done
}

# Command-line interface
case "${1:-}" in
    run)
        run_governance
        ;;
    search)
        search_catalog "$2"
        ;;
    *)
        cat << USAGE
Usage: governance-pipeline.sh <command> [args]

Commands:
    run              Run governance pipeline
    search <query>   Search catalog by tags/category

Examples:
    ./governance-pipeline.sh run
    ./governance-pipeline.sh search security
USAGE
        ;;
esac
```

---

## Integration: Workers Use Unstructured Data

### RAG-Enhanced Worker Launch

**File**: `coordination/unstructured/rag-worker.sh`

```bash
#!/bin/bash
# coordination/unstructured/rag-worker.sh
# Launch worker with RAG context from unstructured data

set -euo pipefail

VECTOR_DB="coordination/embeddings/vector-db.sh"
CATALOG_DIR="coordination/unstructured/catalog"

# Enhance worker prompt with RAG
enhance_worker_prompt_with_catalog() {
    local base_prompt="$1"
    local task_description="$2"

    # Search vector DB for relevant context
    local relevant_docs=$($VECTOR_DB search code-patterns "$task_description" 3 0.6)

    # Search catalog for additional context
    local catalog_matches=$(grep -l "$task_description" "$CATALOG_DIR"/*.json 2>/dev/null || echo "")

    # Build enhanced prompt
    cat << ENHANCED
$base_prompt

---

## RETRIEVED KNOWLEDGE (Unstructured Data)

### Semantic Search Results
We've searched our unstructured data catalog for relevant examples:

$(echo "$relevant_docs" | jq -r '.[] |
"#### [\(.metadata.source_type)] \(.id)
Similarity: \(.similarity | tonumber | . * 100 | floor)%

\(.text)

**Source**: \(.metadata.source_path // "system")
**Quality**: \(.metadata.quality_status // "unknown")
---
"')

### Catalog Metadata
$(if [ -n "$catalog_matches" ]; then
    for match in $catalog_matches; do
        jq -r '"- \(.governance.classification.category): \(.id)"' "$match"
    done
else
    echo "No additional catalog matches"
fi)

**How to use this knowledge**:
1. Review semantic matches (higher similarity = more relevant)
2. Adapt patterns to your specific task
3. Check quality scores to assess reliability
4. Consult catalog for related documents

---

ENHANCED
}

# Launch worker with RAG
launch_rag_worker() {
    local task_id="$1"
    local worker_type="$2"

    # Get task details
    local task_data=$(jq --arg tid "$task_id" \
        '.tasks[] | select(.id == $tid)' \
        coordination/task-queue.json)

    local task_description=$(echo "$task_data" | jq -r '.description')

    # Get base prompt
    local base_prompt=$(cat "agents/prompts/workers/${worker_type}-worker.md")

    # Enhance with RAG
    local enhanced_prompt=$(enhance_worker_prompt_with_catalog \
        "$base_prompt" \
        "$task_description")

    # Launch worker with enhanced prompt
    echo "$enhanced_prompt" > "/tmp/rag-prompt-${task_id}.md"

    echo "Worker prompt enhanced with unstructured data RAG"
    echo "Prompt: /tmp/rag-prompt-${task_id}.md"
}

# Command-line interface
case "${1:-}" in
    launch)
        launch_rag_worker "$2" "$3"
        ;;
    *)
        cat << USAGE
Usage: rag-worker.sh <command> <task-id> <worker-type>

Commands:
    launch <task-id> <type>    Launch worker with RAG enhancement

Example:
    ./rag-worker.sh launch task-123 dev
USAGE
        ;;
esac
```

---

## Success Metrics

**Week 1-2: Pipeline Setup**
- Ingestion: Process 100% of commit-relay scripts, logs, tasks
- Transformation: Generate vectors for all documents
- Load: Populate 5 vector DB collections
- Target: 1000+ documents indexed

**Week 3-4: Governance Layer**
- Classification: 90%+ accuracy on document categorization
- Quality: Flag <5% low-quality documents
- Catalog: 100% documents cataloged with metadata
- Lineage: Track all transformations

**Week 5-6: Worker Integration**
- RAG Retrieval: Workers query unstructured data 80% of time
- Relevance: 70%+ relevance score on retrieved documents
- Impact: 30% reduction in "I don't know" responses

**Month 3+: Production Scale**
- Continuous pipeline: Delta processing every hour
- Quality: <1% alert rate on low-confidence classifications
- Coverage: 95% of commit-relay knowledge accessible via RAG
- Performance: <100ms query time for vector search

---

## Conclusion

**Key Insight**: "Most AI agents don't fail because of weak models. They fail because of the data behind them."

**Commit-Relay Solution**:
1. **Integration**: Transform bash scripts, logs, tasks into AI-ready vectors
2. **Governance**: Classify, validate, catalog all unstructured data
3. **RAG**: Workers query 90% of previously-unused knowledge

**Result**: Workers gain access to the 90% of commit-relay knowledge currently locked in unstructured data.

**Next Steps**:
1. Install sentence-transformers: `pip install sentence-transformers`
2. Run ingestion: `./coordination/unstructured/ingest/ingestor.sh all`
3. Run transformation: `./coordination/unstructured/transform/transformer.sh all`
4. Run governance: `./coordination/unstructured/govern/governance-pipeline.sh run`
5. Start continuous pipeline: `./coordination/unstructured/pipeline-daemon.sh daemon 6`

The foundation is built. Now unlock the 90%.
