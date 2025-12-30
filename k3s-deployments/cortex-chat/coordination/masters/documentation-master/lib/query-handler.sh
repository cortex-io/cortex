#!/bin/bash
# Query Handler - Handle documentation queries from other masters

# Handle query command from CLI
handle_query_command() {
    local domain=""
    local topic=""
    local format="summary"
    local max_tokens=5000

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --domain)
                domain="$2"
                shift 2
                ;;
            --topic)
                topic="$2"
                shift 2
                ;;
            --format)
                format="$2"
                shift 2
                ;;
            --max-tokens)
                max_tokens="$2"
                shift 2
                ;;
            *)
                log_error "Unknown option: $1"
                shift
                ;;
        esac
    done

    if [[ -z "${domain}" ]]; then
        log_error "Domain is required"
        echo "{\"error\": \"domain_required\"}"
        return 1
    fi

    if [[ -z "${topic}" ]]; then
        log_error "Topic is required"
        echo "{\"error\": \"topic_required\"}"
        return 1
    fi

    # Execute query
    query_documentation "${domain}" "${topic}" "${format}" "${max_tokens}"
}

# Handle HTTP query (called from health server)
handle_http_query() {
    local request="$1"

    # Extract query parameters from POST body
    # In production, this would properly parse HTTP request
    # For now, simplified version
    log_debug "Handling HTTP query"

    # Placeholder response
    echo "{\"status\": \"query_handler_placeholder\"}"
}

# Main query documentation function
query_documentation() {
    local domain="$1"
    local topic="$2"
    local format="${3:-summary}"
    local max_tokens="${4:-5000}"

    log_info "Querying documentation: domain=${domain}, topic=${topic}, format=${format}"

    # Search indexed content
    local search_results
    search_results=$(search_index "${domain}" "${topic}")

    local result_count
    result_count=$(echo "${search_results}" | jq 'length')

    if [[ ${result_count} -eq 0 ]]; then
        log_warn "No documentation found for ${domain}/${topic}"

        # Check if this represents a knowledge gap
        record_knowledge_gap "${domain}" "${topic}"

        echo "{
            \"domain\": \"${domain}\",
            \"topic\": \"${topic}\",
            \"status\": \"not_found\",
            \"confidence\": 0.0,
            \"sources\": [],
            \"content\": \"No documentation found for this topic.\",
            \"last_updated\": null,
            \"related_topics\": []
        }"
        return 1
    fi

    log_info "Found ${result_count} results for ${topic}"

    # Get top result
    local top_result
    top_result=$(echo "${search_results}" | jq '.[0]')

    local url
    url=$(echo "${top_result}" | jq -r '.url')
    local priority_score
    priority_score=$(echo "${top_result}" | jq -r '.priority_score')
    local content_file
    content_file=$(echo "${top_result}" | jq -r '.content_file')
    local last_accessed
    last_accessed=$(echo "${top_result}" | jq -r '.last_accessed')

    # Read content
    local content=""
    if [[ -f "${content_file}" ]]; then
        if [[ "${format}" == "summary" ]]; then
            # Return first N words
            local word_limit=$((max_tokens / 2))
            content=$(head -c "${max_tokens}" "${content_file}" | head -n 50)
        else
            # Return full content
            content=$(cat "${content_file}")
        fi
    fi

    # Get related topics from knowledge graph
    local related_topics
    related_topics=$(query_knowledge_graph "${domain}" "${topic}" 2>/dev/null || echo "[]")

    # Build source list from all results
    local sources
    sources=$(echo "${search_results}" | jq 'map(.url)' | jq -c '.')

    # Calculate confidence based on priority score and result count
    local confidence
    confidence=$(echo "scale=2; ${priority_score} * (1 - (1 / (${result_count} + 1)))" | bc)

    # Get cross-domain recommendations
    local cross_domain_recs
    cross_domain_recs=$(get_cross_domain_recommendations "${domain}" "${topic}" 2>/dev/null || echo "[]")

    # Build response
    local response
    response=$(jq -n \
        --arg domain "${domain}" \
        --arg topic "${topic}" \
        --arg status "found" \
        --argjson confidence "${confidence}" \
        --argjson sources "${sources}" \
        --arg content "${content}" \
        --arg last_updated "${last_accessed}" \
        --argjson related "${related_topics}" \
        --argjson cross_domain "${cross_domain_recs}" \
        '{
            domain: $domain,
            topic: $topic,
            status: $status,
            confidence: $confidence,
            sources: $sources,
            content: $content,
            last_updated: $last_updated,
            related_topics: $related,
            cross_domain_links: $cross_domain,
            timestamp: (now | strftime("%Y-%m-%dT%H:%M:%SZ"))
        }')

    echo "${response}"

    # Record usage for MoE learning
    record_query_usage "${domain}" "${topic}" "${url}"

    return 0
}

# Record knowledge gap for later learning
record_knowledge_gap() {
    local domain="$1"
    local topic="$2"

    local gaps_file="${KNOWLEDGE_BASE}/${domain}/knowledge_gaps.jsonl"
    mkdir -p "$(dirname "${gaps_file}")"

    # Check if gap already recorded recently
    local recent_gap
    recent_gap=$(grep "\"${topic}\"" "${gaps_file}" 2>/dev/null | tail -n 1)

    if [[ -n "${recent_gap}" ]]; then
        local gap_time
        gap_time=$(echo "${recent_gap}" | jq -r '.timestamp')
        local gap_age=$(($(date +%s) - $(date -d "${gap_time}" +%s 2>/dev/null || date +%s)))

        # Only record if last gap was more than 1 hour ago
        if [[ ${gap_age} -lt 3600 ]]; then
            log_debug "Knowledge gap recently recorded for ${topic}"
            return 0
        fi
    fi

    # Record gap
    cat >> "${gaps_file}" <<EOF
{"domain":"${domain}","topic":"${topic}","timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","priority":"medium"}
EOF

    log_info "Knowledge gap recorded: ${domain}/${topic}"

    # Check if we should auto-trigger learning
    local gap_count
    gap_count=$(grep "\"${topic}\"" "${gaps_file}" 2>/dev/null | wc -l)

    local threshold
    threshold=$(get_config_value "${CRAWL_POLICY}" ".triggered_updates.task_failure_threshold" "3")

    if [[ ${gap_count} -ge ${threshold} ]]; then
        log_warn "Knowledge gap threshold reached for ${topic}, triggering learning"
        trigger_learning "${domain}" "${topic}" "high" &
    fi
}

# Record query usage for MoE learning
record_query_usage() {
    local domain="$1"
    local topic="$2"
    local url="$3"

    local usage_log="${KNOWLEDGE_BASE}/${domain}/query_log.jsonl"

    cat >> "${usage_log}" <<EOF
{"timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","topic":"${topic}","url":"${url}","type":"query"}
EOF

    log_debug "Recorded query usage: ${topic} -> ${url}"
}

# Get documentation freshness status
get_documentation_freshness() {
    local domain="$1"

    local index_dir="${KNOWLEDGE_BASE}/${domain}/index"

    if [[ ! -d "${index_dir}" ]]; then
        echo "{\"error\": \"not_found\"}"
        return 1
    fi

    # Count total indexed documents
    local total_docs
    total_docs=$(find "${index_dir}" -name "*.json" -type f | wc -l)

    # Count docs by age
    local fresh_docs=0    # < 7 days
    local stale_docs=0    # 7-30 days
    local old_docs=0      # > 30 days

    local now
    now=$(date +%s)

    for index_file in "${index_dir}"/*.json; do
        [[ ! -f "${index_file}" ]] && continue

        local indexed_at
        indexed_at=$(jq -r '.indexed_at' "${index_file}")
        local indexed_ts
        indexed_ts=$(date -d "${indexed_at}" +%s 2>/dev/null || echo "${now}")

        local age_days=$(( (now - indexed_ts) / 86400 ))

        if [[ ${age_days} -lt 7 ]]; then
            fresh_docs=$((fresh_docs + 1))
        elif [[ ${age_days} -lt 30 ]]; then
            stale_docs=$((stale_docs + 1))
        else
            old_docs=$((old_docs + 1))
        fi
    done

    # Calculate freshness score (0-100)
    local freshness_score
    freshness_score=$(echo "scale=0; ((${fresh_docs} * 100) + (${stale_docs} * 50) + (${old_docs} * 10)) / ${total_docs}" | bc)

    local status
    status=$(jq -n \
        --arg domain "${domain}" \
        --argjson total "${total_docs}" \
        --argjson fresh "${fresh_docs}" \
        --argjson stale "${stale_docs}" \
        --argjson old "${old_docs}" \
        --argjson score "${freshness_score}" \
        '{
            domain: $domain,
            total_documents: $total,
            fresh_documents: $fresh,
            stale_documents: $stale,
            old_documents: $old,
            freshness_score: $score,
            last_checked: (now | strftime("%Y-%m-%dT%H:%M:%SZ"))
        }')

    echo "${status}"
}

# Get master status
get_master_status() {
    log_info "Getting Documentation Master status..."

    local status="{}"

    # Get enabled domains
    local domains
    domains=$(jq -r 'to_entries[] | select(.value.enabled == true) | .key' "${SOURCES_CONFIG}" 2>/dev/null | jq -R -s -c 'split("\n") | map(select(length > 0))' || echo "[]")

    # Build status for each domain
    local domain_statuses="[]"
    local domain_count
    domain_count=$(echo "${domains}" | jq 'length')

    local i=0
    while [[ $i -lt ${domain_count} ]]; do
        local domain
        domain=$(echo "${domains}" | jq -r ".[$i]")

        # Get metrics
        local kg_metrics
        kg_metrics=$(calculate_kg_metrics "${domain}" 2>/dev/null || echo "{}")

        local freshness
        freshness=$(get_documentation_freshness "${domain}" 2>/dev/null || echo "{}")

        # Combine
        local domain_status
        domain_status=$(jq -n \
            --arg domain "${domain}" \
            --argjson kg "${kg_metrics}" \
            --argjson freshness "${freshness}" \
            '{
                domain: $domain,
                knowledge_graph: $kg,
                freshness: $freshness
            }')

        domain_statuses=$(echo "${domain_statuses}" | jq ". += [${domain_status}]")

        i=$((i + 1))
    done

    # Build overall status
    status=$(jq -n \
        --arg service "documentation-master" \
        --arg role "${CORTEX_ROLE:-documentation-master}" \
        --argjson domains "${domain_statuses}" \
        --arg kb_path "${KNOWLEDGE_BASE}" \
        --arg cache_path "${CACHE_DIR}" \
        '{
            service: $service,
            role: $role,
            status: "operational",
            domains: $domains,
            paths: {
                knowledge_base: $kb_path,
                cache: $cache_path
            },
            timestamp: (now | strftime("%Y-%m-%dT%H:%M:%SZ"))
        }')

    echo "${status}"
}
