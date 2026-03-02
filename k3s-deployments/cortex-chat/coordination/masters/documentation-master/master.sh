#!/bin/bash
# Documentation Master - Main Orchestration Script
# Manages evolving documentation systems across all Cortex integrations

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="${SCRIPT_DIR}/lib"
CONFIG_DIR="${SCRIPT_DIR}/config"
KNOWLEDGE_BASE="${KNOWLEDGE_BASE_PATH:-${SCRIPT_DIR}/knowledge-base}"
CACHE_DIR="${CACHE_PATH:-${SCRIPT_DIR}/cache}"
LOG_LEVEL="${LOG_LEVEL:-info}"
HEALTH_CHECK_PORT="${HEALTH_CHECK_PORT:-8080}"
QUERY_PORT="${QUERY_PORT:-8080}"

# Logging functions
log_info() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [INFO] $*" >&2
}

log_warn() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [WARN] $*" >&2
}

log_error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [ERROR] $*" >&2
}

log_debug() {
    if [[ "${LOG_LEVEL}" == "debug" ]]; then
        echo "[$(date +'%Y-%m-%d %H:%M:%S')] [DEBUG] $*" >&2
    fi
}

# Source library functions
source_libraries() {
    log_info "Loading library functions..."

    for lib_file in "${LIB_DIR}"/*.sh; do
        if [[ -f "${lib_file}" ]]; then
            log_debug "Sourcing ${lib_file}"
            # shellcheck source=/dev/null
            source "${lib_file}"
        fi
    done
}

# Initialize directories
init_directories() {
    log_info "Initializing directories..."

    mkdir -p "${KNOWLEDGE_BASE}"/{sandfly,proxmox,k3s,cross-domain}
    mkdir -p "${CACHE_DIR}"/{indexed-content,embeddings,metadata}
    mkdir -p "${SCRIPT_DIR}/workers"

    log_info "Directory structure initialized"
}

# Load configuration
load_config() {
    log_info "Loading configuration..."

    export SOURCES_CONFIG="${CONFIG_DIR}/sources.json"
    export CRAWL_POLICY="${CONFIG_DIR}/crawl-policy.json"
    export RESOURCE_LIMITS="${CONFIG_DIR}/resource-limits.json"
    export LEARNING_POLICY="${CONFIG_DIR}/learning-policy.json"

    # Validate config files exist
    for config_file in "${SOURCES_CONFIG}" "${CRAWL_POLICY}" "${RESOURCE_LIMITS}" "${LEARNING_POLICY}"; do
        if [[ ! -f "${config_file}" ]]; then
            log_warn "Config file not found: ${config_file}"
        fi
    done

    log_info "Configuration loaded"
}

# Health check endpoint
start_health_server() {
    log_info "Starting health check server on port ${HEALTH_CHECK_PORT}..."

    {
        while true; do
            {
                read -r request

                # Simple HTTP response
                if [[ "${request}" =~ ^GET\ /health ]]; then
                    echo -e "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{\"status\":\"healthy\",\"service\":\"documentation-master\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
                elif [[ "${request}" =~ ^GET\ /status ]]; then
                    # Get status from evolution tracker
                    local status_response
                    status_response=$(get_master_status 2>/dev/null || echo "{\"error\":\"status unavailable\"}")
                    echo -e "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n${status_response}"
                elif [[ "${request}" =~ ^POST\ /query ]]; then
                    # Handle query requests
                    local query_response
                    query_response=$(handle_http_query "${request}" 2>/dev/null || echo "{\"error\":\"query failed\"}")
                    echo -e "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n${query_response}"
                elif [[ "${request}" =~ ^POST\ /outcome ]]; then
                    # Handle MoE outcome reporting
                    log_info "Received outcome report"
                    echo -e "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{\"status\":\"accepted\"}"
                else
                    echo -e "HTTP/1.1 404 Not Found\r\n\r\n"
                fi
            } | nc -l -p "${HEALTH_CHECK_PORT}" -q 1
        done
    } &

    HEALTH_SERVER_PID=$!
    log_info "Health check server started (PID: ${HEALTH_SERVER_PID})"
}

# Start crawlers
start_crawlers() {
    log_info "Starting documentation crawlers..."

    if [[ ! -f "${SOURCES_CONFIG}" ]]; then
        log_warn "No sources configuration found, skipping crawlers"
        return
    fi

    # Get enabled sources from config
    local enabled_sources
    enabled_sources=$(jq -r 'to_entries[] | select(.value.enabled == true) | .key' "${SOURCES_CONFIG}" 2>/dev/null || echo "")

    if [[ -z "${enabled_sources}" ]]; then
        log_warn "No enabled sources found"
        return
    fi

    log_info "Enabled sources: ${enabled_sources}"

    # Start crawler in background
    {
        while true; do
            log_info "Starting scheduled crawl..."
            run_scheduled_crawl || log_error "Crawl failed"

            # Get crawl interval from config (default: 24 hours)
            local crawl_interval=86400
            log_info "Next crawl in ${crawl_interval} seconds"
            sleep "${crawl_interval}"
        done
    } &

    CRAWLER_PID=$!
    log_info "Crawler started (PID: ${CRAWLER_PID})"
}

# Start query handler
start_query_handler() {
    log_info "Query handler integrated with health server on port ${QUERY_PORT}"
}

# Start MoE learner
start_moe_learner() {
    if [[ "${MOE_ENABLED:-false}" != "true" ]]; then
        log_info "MoE learning disabled, skipping learner"
        return
    fi

    log_info "Starting MoE learning integration..."

    {
        while true; do
            log_debug "Processing MoE learning updates..."
            process_moe_outcomes || log_error "MoE processing failed"

            # Process every 5 minutes
            sleep 300
        done
    } &

    MOE_LEARNER_PID=$!
    log_info "MoE learner started (PID: ${MOE_LEARNER_PID})"
}

# Start evolution tracker
start_evolution_tracker() {
    log_info "Starting evolution tracker..."

    {
        while true; do
            log_debug "Tracking documentation evolution..."
            track_documentation_evolution || log_error "Evolution tracking failed"

            # Track every 15 minutes
            sleep 900
        done
    } &

    EVOLUTION_TRACKER_PID=$!
    log_info "Evolution tracker started (PID: ${EVOLUTION_TRACKER_PID})"
}

# Cleanup on exit
cleanup() {
    log_info "Shutting down Documentation Master..."

    [[ -n "${HEALTH_SERVER_PID:-}" ]] && kill "${HEALTH_SERVER_PID}" 2>/dev/null || true
    [[ -n "${CRAWLER_PID:-}" ]] && kill "${CRAWLER_PID}" 2>/dev/null || true
    [[ -n "${MOE_LEARNER_PID:-}" ]] && kill "${MOE_LEARNER_PID}" 2>/dev/null || true
    [[ -n "${EVOLUTION_TRACKER_PID:-}" ]] && kill "${EVOLUTION_TRACKER_PID}" 2>/dev/null || true

    log_info "Documentation Master stopped"
}

trap cleanup EXIT INT TERM

# Main command dispatcher
main() {
    local command="${1:-start}"

    log_info "Documentation Master starting (command: ${command})..."
    log_info "Role: ${CORTEX_ROLE:-documentation-master}"
    log_info "Knowledge base: ${KNOWLEDGE_BASE}"
    log_info "Cache directory: ${CACHE_DIR}"

    case "${command}" in
        start)
            init_directories
            load_config
            source_libraries
            start_health_server
            start_query_handler
            start_crawlers
            start_moe_learner
            start_evolution_tracker

            log_info "Documentation Master fully operational"

            # Keep running
            wait
            ;;

        crawl)
            shift
            load_config
            source_libraries
            run_manual_crawl "$@"
            ;;

        query)
            shift
            load_config
            source_libraries
            handle_query_command "$@"
            ;;

        status)
            load_config
            source_libraries
            get_master_status
            ;;

        learn)
            shift
            load_config
            source_libraries
            trigger_learning "$@"
            ;;

        *)
            log_error "Unknown command: ${command}"
            echo "Usage: $0 {start|crawl|query|status|learn}"
            exit 1
            ;;
    esac
}

# Execute main
main "$@"
