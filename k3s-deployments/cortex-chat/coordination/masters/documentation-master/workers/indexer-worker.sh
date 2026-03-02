#!/bin/bash
# Indexer Worker - Spawnable worker for parallel indexing

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MASTER_DIR="$(dirname "${SCRIPT_DIR}")"
LIB_DIR="${MASTER_DIR}/lib"
CONFIG_DIR="${MASTER_DIR}/config"
KNOWLEDGE_BASE="${KNOWLEDGE_BASE_PATH:-${MASTER_DIR}/knowledge-base}"
CACHE_DIR="${CACHE_PATH:-${MASTER_DIR}/cache}"
LOG_LEVEL="${LOG_LEVEL:-info}"

# Logging functions
log_info() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [INDEXER-WORKER] [INFO] $*" >&2
}

log_warn() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [INDEXER-WORKER] [WARN] $*" >&2
}

log_error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [INDEXER-WORKER] [ERROR] $*" >&2
}

log_debug() {
    if [[ "${LOG_LEVEL}" == "debug" ]]; then
        echo "[$(date +'%Y-%m-%d %H:%M:%S')] [INDEXER-WORKER] [DEBUG] $*" >&2
    fi
}

# Source library functions
source "${LIB_DIR}/indexer.sh"
source "${LIB_DIR}/knowledge-graph.sh"

# Export config
export SOURCES_CONFIG="${CONFIG_DIR}/sources.json"
export CRAWL_POLICY="${CONFIG_DIR}/crawl-policy.json"
export RESOURCE_LIMITS="${CONFIG_DIR}/resource-limits.json"
export LEARNING_POLICY="${CONFIG_DIR}/learning-policy.json"

# Main worker function
main() {
    local task_file="${1:-}"

    if [[ -z "${task_file}" ]]; then
        log_error "Usage: $0 <task_file>"
        exit 1
    fi

    if [[ ! -f "${task_file}" ]]; then
        log_error "Task file not found: ${task_file}"
        exit 1
    fi

    log_info "Starting indexer worker for task: ${task_file}"

    # Parse task
    local task_type
    task_type=$(jq -r '.type' "${task_file}")
    local domain
    domain=$(jq -r '.domain' "${task_file}")
    local action
    action=$(jq -r '.action // "index"' "${task_file}")

    log_info "Task: type=${task_type}, domain=${domain}, action=${action}"

    # Update task status
    local tmp_file="${task_file}.tmp"
    jq '.status = "in_progress" | .started_at = (now | strftime("%Y-%m-%dT%H:%M:%SZ"))' \
        "${task_file}" > "${tmp_file}"
    mv "${tmp_file}" "${task_file}"

    # Execute indexing action
    local success=false
    case "${action}" in
        index)
            if index_domain_content "${domain}"; then
                success=true
            fi
            ;;
        rebuild)
            if rebuild_index "${domain}"; then
                success=true
            fi
            ;;
        update_priority)
            if update_priority_scores "${domain}"; then
                success=true
            fi
            ;;
        prune)
            if prune_cache; then
                success=true
            fi
            ;;
        *)
            log_error "Unknown action: ${action}"
            ;;
    esac

    # Update task status
    if ${success}; then
        jq '.status = "completed" | .completed_at = (now | strftime("%Y-%m-%dT%H:%M:%SZ"))' \
            "${task_file}" > "${tmp_file}"
        mv "${tmp_file}" "${task_file}"
        log_info "Indexer worker completed successfully"
    else
        jq '.status = "failed" | .failed_at = (now | strftime("%Y-%m-%dT%H:%M:%SZ"))' \
            "${task_file}" > "${tmp_file}"
        mv "${tmp_file}" "${task_file}"
        log_error "Indexer worker failed"
        exit 1
    fi

    log_info "Indexer worker finished"
}

# Index all content for a domain
index_domain_content() {
    local domain="$1"

    log_info "Indexing content for domain: ${domain}"

    local cache_domain_dir="${CACHE_DIR}/indexed-content/${domain}"

    if [[ ! -d "${cache_domain_dir}" ]]; then
        log_warn "No cached content found for ${domain}"
        return 0
    fi

    local indexed_count=0
    local failed_count=0

    for content_file in "${cache_domain_dir}"/*.txt; do
        [[ ! -f "${content_file}" ]] && continue

        local metadata_file
        metadata_file="${CACHE_DIR}/metadata/${domain}/$(basename "${content_file}" .txt).json"

        if [[ -f "${metadata_file}" ]]; then
            if index_content "${content_file}" "${metadata_file}"; then
                indexed_count=$((indexed_count + 1))
            else
                failed_count=$((failed_count + 1))
            fi
        fi
    done

    log_info "Indexed ${indexed_count} documents for ${domain} (${failed_count} failed)"

    return 0
}

# Execute main
main "$@"
