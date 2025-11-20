#!/usr/bin/env bash
#
# RAG Retriever
# Part of Q2: RAG Pipeline for Library
#
# Provides retrieval functions for the RAG pipeline:
# - Keyword-based search
# - Metadata filtering
# - Chunk retrieval
# - Relevance ranking
#
# Usage:
#   source scripts/lib/rag/retriever.sh
#   search_documents "authentication security"
#   retrieve_relevant_chunks "how to implement JWT" 5
#   search_by_metadata '{"extension":"pdf"}'

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMIT_RELAY_HOME="${COMMIT_RELAY_HOME:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"

# Directories
readonly EMBEDDINGS_DIR="$COMMIT_RELAY_HOME/coordination/knowledge-base/embeddings"
readonly CHUNKS_DIR="$EMBEDDINGS_DIR/chunks"
readonly METADATA_DIR="$EMBEDDINGS_DIR/metadata"
readonly INDEX_DIR="$EMBEDDINGS_DIR/indices"

# Source document processor for shared functions
source "$SCRIPT_DIR/document-processor.sh" 2>/dev/null || true

# Source logging
source "$COMMIT_RELAY_HOME/scripts/lib/logging.sh" 2>/dev/null || {
    log_info() { echo "[INFO] $1"; }
    log_warn() { echo "[WARN] $1"; }
    log_error() { echo "[ERROR] $1"; }
}

#------------------------------------------------------------------------------
# Text Processing
#------------------------------------------------------------------------------

# Tokenize and normalize query
normalize_query() {
    local query="$1"

    echo "$query" | \
        tr '[:upper:]' '[:lower:]' | \
        tr -cs '[:alpha:]' ' ' | \
        tr -s ' ' | \
        xargs
}

# Extract keywords from query
extract_query_keywords() {
    local query="$1"

    # Stop words to filter out
    local stop_words="a an the is are was were be been being have has had do does did will would could should may might must shall can"

    local normalized=$(normalize_query "$query")
    local keywords=""

    for word in $normalized; do
        # Skip stop words and short words
        if [ ${#word} -lt 3 ]; then
            continue
        fi

        local is_stop=false
        for stop in $stop_words; do
            if [ "$word" = "$stop" ]; then
                is_stop=true
                break
            fi
        done

        if [ "$is_stop" = "false" ]; then
            keywords="$keywords $word"
        fi
    done

    echo "$keywords" | xargs
}

#------------------------------------------------------------------------------
# Document Search
#------------------------------------------------------------------------------

# Search documents by keywords
search_documents() {
    local query="$1"
    local max_results="${2:-10}"

    local keywords=$(extract_query_keywords "$query")

    if [ -z "$keywords" ]; then
        log_warn "[RAG] No valid keywords in query"
        echo '[]'
        return 1
    fi

    log_info "[RAG] Searching for keywords: $keywords"

    # Score each document
    local results="[]"
    local master_index="$INDEX_DIR/master-index.jsonl"

    if [ ! -f "$master_index" ]; then
        echo '[]'
        return 0
    fi

    # Get all document IDs
    local doc_ids=$(cat "$master_index" | jq -r '.doc_id')

    for doc_id in $doc_ids; do
        local keyword_file="$INDEX_DIR/${doc_id}-keywords.json"

        if [ ! -f "$keyword_file" ]; then
            continue
        fi

        # Calculate score based on keyword matches
        local score=0
        local matched_keywords=""

        for keyword in $keywords; do
            local count=$(jq -r --arg kw "$keyword" '.keywords[] | select(.word == $kw) | .count // 0' "$keyword_file" 2>/dev/null || echo "0")

            if [ -n "$count" ] && [ "$count" != "null" ] && [ "$count" -gt 0 ]; then
                score=$((score + count))
                matched_keywords="$matched_keywords $keyword"
            fi
        done

        if [ $score -gt 0 ]; then
            local metadata=$(cat "$METADATA_DIR/${doc_id}.json" 2>/dev/null || echo '{}')

            local result=$(echo "$metadata" | jq \
                --argjson score "$score" \
                --arg matched "$matched_keywords" \
                '. + {score: $score, matched_keywords: ($matched | ltrimstr(" ") | split(" "))}')

            results=$(echo "$results" | jq --argjson r "$result" '. + [$r]')
        fi
    done

    # Sort by score and limit results
    echo "$results" | jq --argjson max "$max_results" 'sort_by(-.score) | .[:$max]'
}

# Search by metadata filters
search_by_metadata() {
    local filters="$1"
    local max_results="${2:-10}"

    local master_index="$INDEX_DIR/master-index.jsonl"

    if [ ! -f "$master_index" ]; then
        echo '[]'
        return 0
    fi

    # Build jq filter from JSON filters
    local jq_filter="."

    # Extension filter
    local ext=$(echo "$filters" | jq -r '.extension // empty')
    if [ -n "$ext" ]; then
        jq_filter="$jq_filter | select(.extension == \"$ext\")"
    fi

    # Author filter
    local author=$(echo "$filters" | jq -r '.author // empty')
    if [ -n "$author" ]; then
        jq_filter="$jq_filter | select(.author | contains(\"$author\"))"
    fi

    # Title filter
    local title=$(echo "$filters" | jq -r '.title // empty')
    if [ -n "$title" ]; then
        jq_filter="$jq_filter | select(.title | contains(\"$title\"))"
    fi

    # Date range filter
    local after=$(echo "$filters" | jq -r '.after // empty')
    if [ -n "$after" ]; then
        jq_filter="$jq_filter | select(.processed_at >= \"$after\")"
    fi

    local before=$(echo "$filters" | jq -r '.before // empty')
    if [ -n "$before" ]; then
        jq_filter="$jq_filter | select(.processed_at <= \"$before\")"
    fi

    cat "$master_index" | jq -s "map($jq_filter) | .[:$max_results]"
}

#------------------------------------------------------------------------------
# Chunk Retrieval
#------------------------------------------------------------------------------

# Retrieve relevant chunks for a query
retrieve_relevant_chunks() {
    local query="$1"
    local max_chunks="${2:-5}"
    local max_docs="${3:-3}"

    log_info "[RAG] Retrieving chunks for: $query"

    # First, find relevant documents
    local relevant_docs=$(search_documents "$query" "$max_docs")
    local doc_count=$(echo "$relevant_docs" | jq 'length')

    if [ "$doc_count" -eq 0 ]; then
        log_info "[RAG] No relevant documents found"
        echo '[]'
        return 0
    fi

    local keywords=$(extract_query_keywords "$query")
    local all_chunks="[]"

    # Get chunks from each relevant document
    echo "$relevant_docs" | jq -r '.[].doc_id' | while read -r doc_id; do
        local chunks_file="$CHUNKS_DIR/${doc_id}-chunks.jsonl"

        if [ ! -f "$chunks_file" ]; then
            continue
        fi

        # Score each chunk
        cat "$chunks_file" | while read -r chunk_json; do
            local content=$(echo "$chunk_json" | jq -r '.content' | tr '[:upper:]' '[:lower:]')
            local score=0

            for keyword in $keywords; do
                local matches=$(echo "$content" | grep -o "$keyword" | wc -l | tr -d ' ')
                score=$((score + matches))
            done

            if [ $score -gt 0 ]; then
                echo "$chunk_json" | jq --argjson s "$score" '. + {relevance_score: $s}'
            fi
        done
    done | jq -s "sort_by(-.relevance_score) | .[:$max_chunks]"
}

# Get chunks by document ID
get_chunks_by_doc() {
    local doc_id="$1"
    local start_index="${2:-0}"
    local count="${3:-10}"

    local chunks_file="$CHUNKS_DIR/${doc_id}-chunks.jsonl"

    if [ ! -f "$chunks_file" ]; then
        echo '[]'
        return 1
    fi

    cat "$chunks_file" | jq -s --argjson start "$start_index" --argjson count "$count" \
        '.[$start:($start + $count)]'
}

# Get specific chunk by ID
get_chunk() {
    local chunk_id="$1"

    # Extract doc_id from chunk_id (format: doc-xxx-chunk-n)
    local doc_id=$(echo "$chunk_id" | sed 's/-chunk-[0-9]*$//')
    local chunks_file="$CHUNKS_DIR/${doc_id}-chunks.jsonl"

    if [ ! -f "$chunks_file" ]; then
        echo '{"error": "Chunk not found"}'
        return 1
    fi

    cat "$chunks_file" | jq -s --arg id "$chunk_id" '.[] | select(.chunk_id == $id)'
}

#------------------------------------------------------------------------------
# Context Building
#------------------------------------------------------------------------------

# Build context from retrieved chunks
build_context() {
    local query="$1"
    local max_tokens="${2:-2000}"

    local chunks=$(retrieve_relevant_chunks "$query" 10)
    local chunk_count=$(echo "$chunks" | jq 'length')

    if [ "$chunk_count" -eq 0 ]; then
        echo '{"context": "", "sources": []}'
        return 0
    fi

    local context=""
    local sources="[]"
    local token_count=0

    # Approximate tokens as words / 0.75
    for i in $(seq 0 $((chunk_count - 1))); do
        local chunk=$(echo "$chunks" | jq ".[$i]")
        local content=$(echo "$chunk" | jq -r '.content')
        local chunk_id=$(echo "$chunk" | jq -r '.chunk_id')
        local doc_id=$(echo "$chunk" | jq -r '.doc_id')

        local word_count=$(echo "$content" | wc -w | tr -d ' ')
        local approx_tokens=$((word_count * 4 / 3))

        if [ $((token_count + approx_tokens)) -gt $max_tokens ]; then
            break
        fi

        context="$context\n\n---\n\n$content"
        token_count=$((token_count + approx_tokens))

        # Add to sources
        local source=$(jq -n \
            --arg chunk_id "$chunk_id" \
            --arg doc_id "$doc_id" \
            '{chunk_id: $chunk_id, doc_id: $doc_id}')

        sources=$(echo "$sources" | jq --argjson s "$source" '. + [$s]')
    done

    jq -n \
        --arg context "$context" \
        --argjson sources "$sources" \
        --argjson token_estimate "$token_count" \
        '{
            context: $context,
            sources: $sources,
            token_estimate: $token_estimate
        }'
}

#------------------------------------------------------------------------------
# Similarity Functions (Simple Implementation)
#------------------------------------------------------------------------------

# Calculate Jaccard similarity between two texts
calculate_similarity() {
    local text1="$1"
    local text2="$2"

    local words1=$(echo "$text1" | tr '[:upper:]' '[:lower:]' | tr -cs '[:alpha:]' '\n' | sort -u)
    local words2=$(echo "$text2" | tr '[:upper:]' '[:lower:]' | tr -cs '[:alpha:]' '\n' | sort -u)

    local intersection=$(echo "$words1" | grep -Fx -f <(echo "$words2") | wc -l | tr -d ' ')
    local union1=$(echo "$words1" | wc -l | tr -d ' ')
    local union2=$(echo "$words2" | wc -l | tr -d ' ')
    local union=$((union1 + union2 - intersection))

    if [ $union -eq 0 ]; then
        echo "0"
        return
    fi

    echo "scale=4; $intersection / $union" | bc
}

# Find similar documents
find_similar_documents() {
    local doc_id="$1"
    local max_results="${2:-5}"

    local source_keywords="$INDEX_DIR/${doc_id}-keywords.json"

    if [ ! -f "$source_keywords" ]; then
        echo '[]'
        return 1
    fi

    local source_words=$(jq -r '.keywords[].word' "$source_keywords" | tr '\n' ' ')
    local results="[]"

    # Compare with all other documents
    for keyword_file in "$INDEX_DIR"/*-keywords.json; do
        [ -f "$keyword_file" ] || continue

        local other_id=$(basename "$keyword_file" -keywords.json)

        # Skip self
        if [ "$other_id" = "$doc_id" ]; then
            continue
        fi

        local other_words=$(jq -r '.keywords[].word' "$keyword_file" | tr '\n' ' ')
        local similarity=$(calculate_similarity "$source_words" "$other_words")

        if [ "$(echo "$similarity > 0.1" | bc -l)" -eq 1 ]; then
            local metadata=$(cat "$METADATA_DIR/${other_id}.json" 2>/dev/null || echo '{}')
            local result=$(echo "$metadata" | jq --arg sim "$similarity" '. + {similarity: ($sim | tonumber)}')
            results=$(echo "$results" | jq --argjson r "$result" '. + [$r]')
        fi
    done

    echo "$results" | jq --argjson max "$max_results" 'sort_by(-.similarity) | .[:$max]'
}

#------------------------------------------------------------------------------
# Export Functions
#------------------------------------------------------------------------------

export -f normalize_query
export -f extract_query_keywords
export -f search_documents
export -f search_by_metadata
export -f retrieve_relevant_chunks
export -f get_chunks_by_doc
export -f get_chunk
export -f build_context
export -f calculate_similarity
export -f find_similar_documents

#------------------------------------------------------------------------------
# CLI Interface
#------------------------------------------------------------------------------

if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    case "${1:-help}" in
        search)
            search_documents "$2" "${3:-10}"
            ;;
        filter)
            search_by_metadata "$2" "${3:-10}"
            ;;
        chunks)
            if [ -n "${3:-}" ]; then
                get_chunks_by_doc "$2" "${3:-0}" "${4:-10}"
            else
                retrieve_relevant_chunks "$2" "${3:-5}"
            fi
            ;;
        context)
            build_context "$2" "${3:-2000}"
            ;;
        similar)
            find_similar_documents "$2" "${3:-5}"
            ;;
        help|*)
            echo "RAG Retriever"
            echo ""
            echo "Usage: retriever.sh <command> [args]"
            echo ""
            echo "Commands:"
            echo "  search <query> [max]        Search documents by keywords"
            echo "  filter <json> [max]         Filter by metadata"
            echo "  chunks <query> [max]        Retrieve relevant chunks"
            echo "  context <query> [tokens]    Build context from chunks"
            echo "  similar <doc_id> [max]      Find similar documents"
            ;;
    esac
fi
