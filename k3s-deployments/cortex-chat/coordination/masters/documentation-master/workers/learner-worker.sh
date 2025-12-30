#!/bin/bash
# Learner Worker - Spawnable worker for MoE learning tasks

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
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [LEARNER-WORKER] [INFO] $*" >&2
}

log_warn() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [LEARNER-WORKER] [WARN] $*" >&2
}

log_error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [LEARNER-WORKER] [ERROR] $*" >&2
}

log_debug() {
    if [[ "${LOG_LEVEL}" == "debug" ]]; then
        echo "[$(date +'%Y-%m-%d %H:%M:%S')] [LEARNER-WORKER] [DEBUG] $*" >&2
    fi
}

# Source library functions
source "${LIB_DIR}/learner.sh"
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

    log_info "Starting learner worker for task: ${task_file}"

    # Parse task
    local task_type
    task_type=$(jq -r '.type' "${task_file}")
    local domain
    domain=$(jq -r '.domain' "${task_file}")
    local topic
    topic=$(jq -r '.topic // ""' "${task_file}")
    local priority
    priority=$(jq -r '.priority // "medium"' "${task_file}")

    log_info "Task: type=${task_type}, domain=${domain}, topic=${topic}, priority=${priority}"

    # Update task status
    local tmp_file="${task_file}.tmp"
    jq '.status = "in_progress" | .started_at = (now | strftime("%Y-%m-%dT%H:%M:%SZ"))' \
        "${task_file}" > "${tmp_file}"
    mv "${tmp_file}" "${task_file}"

    # Execute learning action
    local success=false
    case "${task_type}" in
        learn)
            if execute_learning_task "${domain}" "${topic}" "${priority}"; then
                success=true
            fi
            ;;
        process_outcomes)
            if process_moe_outcomes; then
                success=true
            fi
            ;;
        identify_gaps)
            if identify_and_record_gaps "${domain}"; then
                success=true
            fi
            ;;
        *)
            log_error "Unknown task type: ${task_type}"
            ;;
    esac

    # Update task status
    if ${success}; then
        jq '.status = "completed" | .completed_at = (now | strftime("%Y-%m-%dT%H:%M:%SZ"))' \
            "${task_file}" > "${tmp_file}"
        mv "${tmp_file}" "${task_file}"
        log_info "Learner worker completed successfully"
    else
        jq '.status = "failed" | .failed_at = (now | strftime("%Y-%m-%dT%H:%M:%SZ"))' \
            "${task_file}" > "${tmp_file}"
        mv "${tmp_file}" "${task_file}"
        log_error "Learner worker failed"
        exit 1
    fi

    log_info "Learner worker finished"
}

# Execute a learning task
execute_learning_task() {
    local domain="$1"
    local topic="$2"
    local priority="$3"

    log_info "Executing learning task for ${domain}/${topic} (priority: ${priority})"

    # Find source URLs for this domain
    if [[ ! -f "${SOURCES_CONFIG}" ]]; then
        log_error "Sources config not found"
        return 1
    fi

    local source_urls
    source_urls=$(jq -r ".${domain}.sources[].url" "${SOURCES_CONFIG}" 2>/dev/null || echo "")

    if [[ -z "${source_urls}" ]]; then
        log_error "No sources found for domain: ${domain}"
        return 1
    fi

    # Crawl each source with topic context
    local crawled_any=false
    while IFS= read -r base_url; do
        [[ -z "${base_url}" ]] && continue

        # Construct topic-specific URL
        local topic_url="${base_url}"
        if [[ -n "${topic}" && "${topic}" != "null" ]]; then
            if [[ "${topic}" =~ ^/ ]]; then
                topic_url="${base_url}${topic}"
            else
                topic_url="${base_url}/${topic}"
            fi
        fi

        log_info "Learning from: ${topic_url}"

        # Crawl with limited depth for targeted learning
        if crawl_url "${topic_url}" 0 2 "${domain}"; then
            crawled_any=true
        fi
    done <<< "${source_urls}"

    if ${crawled_any}; then
        # Update priority scores after learning
        update_priority_scores "${domain}"
        log_info "Learning task completed for ${domain}/${topic}"
        return 0
    else
        log_error "No successful crawls for learning task"
        return 1
    fi
}

# Identify and record knowledge gaps
identify_and_record_gaps() {
    local domain="$1"

    log_info "Identifying knowledge gaps for ${domain}"

    local gaps
    gaps=$(identify_knowledge_gaps)

    local gap_count
    gap_count=$(echo "${gaps}" | jq 'length')

    log_info "Found ${gap_count} knowledge gaps for ${domain}"

    # Record gaps
    local gaps_file="${KNOWLEDGE_BASE}/${domain}/detected_gaps.json"
    echo "${gaps}" > "${gaps_file}"

    return 0
}

# Execute main
main "$@"
