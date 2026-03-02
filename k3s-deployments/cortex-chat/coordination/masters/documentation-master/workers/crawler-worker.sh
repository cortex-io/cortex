#!/bin/bash
# Crawler Worker - Spawnable worker for parallel crawling

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
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [CRAWLER-WORKER] [INFO] $*" >&2
}

log_warn() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [CRAWLER-WORKER] [WARN] $*" >&2
}

log_error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [CRAWLER-WORKER] [ERROR] $*" >&2
}

log_debug() {
    if [[ "${LOG_LEVEL}" == "debug" ]]; then
        echo "[$(date +'%Y-%m-%d %H:%M:%S')] [CRAWLER-WORKER] [DEBUG] $*" >&2
    fi
}

# Source library functions
source "${LIB_DIR}/crawler.sh"
source "${LIB_DIR}/indexer.sh"

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

    log_info "Starting crawler worker for task: ${task_file}"

    # Parse task
    local task_type
    task_type=$(jq -r '.type' "${task_file}")
    local domain
    domain=$(jq -r '.domain' "${task_file}")
    local url
    url=$(jq -r '.url // ""' "${task_file}")
    local depth
    depth=$(jq -r '.depth // 0' "${task_file}")
    local max_depth
    max_depth=$(jq -r '.max_depth // 5' "${task_file}")

    log_info "Task: type=${task_type}, domain=${domain}, url=${url}"

    # Update task status
    local tmp_file="${task_file}.tmp"
    jq '.status = "in_progress" | .started_at = (now | strftime("%Y-%m-%dT%H:%M:%SZ"))' \
        "${task_file}" > "${tmp_file}"
    mv "${tmp_file}" "${task_file}"

    # Execute crawl
    local success=false
    if crawl_url "${url}" "${depth}" "${max_depth}" "${domain}"; then
        success=true
        log_info "Crawl completed successfully"
    else
        log_error "Crawl failed"
    fi

    # Update task status
    if ${success}; then
        jq '.status = "completed" | .completed_at = (now | strftime("%Y-%m-%dT%H:%M:%SZ"))' \
            "${task_file}" > "${tmp_file}"
        mv "${tmp_file}" "${task_file}"
    else
        jq '.status = "failed" | .failed_at = (now | strftime("%Y-%m-%dT%H:%M:%SZ"))' \
            "${task_file}" > "${tmp_file}"
        mv "${tmp_file}" "${task_file}"
        exit 1
    fi

    log_info "Crawler worker finished"
}

# Execute main
main "$@"
