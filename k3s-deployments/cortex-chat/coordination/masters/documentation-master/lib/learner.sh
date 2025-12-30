#!/bin/bash
# MoE Learning Integration - Connect documentation usage to MoE learning system

# Process MoE outcomes
process_moe_outcomes() {
    log_debug "Processing MoE learning outcomes..."

    # Check if MoE is enabled
    local moe_enabled
    moe_enabled=$(get_config_value "${LEARNING_POLICY}" ".moe_integration.enabled" "false")

    if [[ "${moe_enabled}" != "true" ]]; then
        log_debug "MoE learning disabled"
        return 0
    fi

    # Get MoE endpoints
    local learner_endpoint
    learner_endpoint=$(get_config_value "${LEARNING_POLICY}" ".moe_integration.learner_endpoint" "http://llm-mesh-moe-learner:8080")

    # Fetch recent outcomes related to documentation
    local outcomes
    outcomes=$(fetch_moe_outcomes "${learner_endpoint}") || return 1

    # Process each outcome
    local outcome_count
    outcome_count=$(echo "${outcomes}" | jq 'length')

    if [[ ${outcome_count} -eq 0 ]]; then
        log_debug "No MoE outcomes to process"
        return 0
    fi

    log_info "Processing ${outcome_count} MoE outcomes"

    local i=0
    while [[ $i -lt ${outcome_count} ]]; do
        local outcome
        outcome=$(echo "${outcomes}" | jq ".[$i]")

        process_single_outcome "${outcome}"

        i=$((i + 1))
    done

    log_info "MoE outcomes processed"
    return 0
}

# Fetch MoE outcomes from learner endpoint
fetch_moe_outcomes() {
    local endpoint="$1"

    log_debug "Fetching MoE outcomes from ${endpoint}"

    # Try to fetch outcomes (with timeout)
    local response
    response=$(curl -s --max-time 5 \
        "${endpoint}/outcomes?filter=documentation&limit=50" 2>/dev/null || echo "[]")

    # Validate JSON
    if ! echo "${response}" | jq empty 2>/dev/null; then
        log_warn "Invalid JSON response from MoE learner"
        echo "[]"
        return 1
    fi

    echo "${response}"
}

# Process a single outcome
process_single_outcome() {
    local outcome="$1"

    # Extract outcome details
    local outcome_id
    outcome_id=$(echo "${outcome}" | jq -r '.outcome_id // "unknown"')
    local task_id
    task_id=$(echo "${outcome}" | jq -r '.task_id // "unknown"')
    local success
    success=$(echo "${outcome}" | jq -r '.success // false')
    local confidence
    confidence=$(echo "${outcome}" | jq -r '.confidence // 0.5')
    local documentation_used
    documentation_used=$(echo "${outcome}" | jq -r '.documentation_used // []')

    log_debug "Processing outcome ${outcome_id}: success=${success}, confidence=${confidence}"

    # Update usage tracking for referenced documentation
    if [[ "${documentation_used}" != "[]" ]]; then
        local doc_count
        doc_count=$(echo "${documentation_used}" | jq 'length')

        local i=0
        while [[ $i -lt ${doc_count} ]]; do
            local doc_url
            doc_url=$(echo "${documentation_used}" | jq -r ".[$i]")

            # Find domain for this URL
            local domain
            domain=$(find_domain_for_url "${doc_url}")

            if [[ -n "${domain}" ]]; then
                # Update success tracking
                update_documentation_success "${domain}" "${doc_url}" "${success}" "${confidence}"

                # Track in knowledge graph
                record_documentation_usage "${domain}" "${doc_url}" "${task_id}" "${success}"
            fi

            i=$((i + 1))
        done
    fi

    # Report outcome back to learner
    report_outcome_processed "${outcome_id}"
}

# Find which domain a URL belongs to
find_domain_for_url() {
    local url="$1"

    # Check each configured domain
    if [[ ! -f "${SOURCES_CONFIG}" ]]; then
        echo ""
        return 1
    fi

    local domains
    domains=$(jq -r 'keys[]' "${SOURCES_CONFIG}")

    while IFS= read -r domain; do
        [[ -z "${domain}" ]] && continue

        local source_urls
        source_urls=$(jq -r ".${domain}.sources[].url" "${SOURCES_CONFIG}")

        while IFS= read -r source_url; do
            [[ -z "${source_url}" ]] && continue

            # Check if URL starts with source URL
            if [[ "${url}" == "${source_url}"* ]]; then
                echo "${domain}"
                return 0
            fi
        done <<< "${source_urls}"
    done <<< "${domains}"

    echo ""
    return 1
}

# Update success tracking for documentation
update_documentation_success() {
    local domain="$1"
    local url="$2"
    local success="$3"
    local confidence="$4"

    local url_hash
    url_hash=$(echo "${url}" | md5sum | cut -d' ' -f1)
    local index_file="${KNOWLEDGE_BASE}/${domain}/index/${url_hash}.json"

    if [[ ! -f "${index_file}" ]]; then
        log_debug "Index file not found for ${url}"
        return 1
    fi

    # Get current success metrics
    local success_count
    success_count=$(jq -r '.success_count // 0' "${index_file}")
    local failure_count
    failure_count=$(jq -r '.failure_count // 0' "${index_file}")
    local total_confidence
    total_confidence=$(jq -r '.total_confidence // 0' "${index_file}")
    local usage_count
    usage_count=$(jq -r '.usage_count // 0' "${index_file}")

    # Update metrics
    if [[ "${success}" == "true" ]]; then
        success_count=$((success_count + 1))
    else
        failure_count=$((failure_count + 1))
    fi

    usage_count=$((usage_count + 1))
    total_confidence=$(echo "${total_confidence} + ${confidence}" | bc)

    # Calculate success rate
    local total_attempts=$((success_count + failure_count))
    local success_rate
    success_rate=$(echo "scale=2; ${success_count} / ${total_attempts}" | bc)

    # Calculate average confidence
    local avg_confidence
    avg_confidence=$(echo "scale=2; ${total_confidence} / ${usage_count}" | bc)

    # Update index file
    local tmp_file="${index_file}.tmp"
    jq ".success_count = ${success_count} | \
        .failure_count = ${failure_count} | \
        .total_confidence = ${total_confidence} | \
        .usage_count = ${usage_count} | \
        .success_rate = ${success_rate} | \
        .avg_confidence = ${avg_confidence} | \
        .last_accessed = \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"" \
        "${index_file}" > "${tmp_file}"
    mv "${tmp_file}" "${index_file}"

    log_debug "Updated success metrics for ${url}: rate=${success_rate}, confidence=${avg_confidence}"

    # Update priority score
    update_priority_scores "${domain}"
}

# Record documentation usage in knowledge graph
record_documentation_usage() {
    local domain="$1"
    local url="$2"
    local task_id="$3"
    local success="$4"

    local usage_log="${KNOWLEDGE_BASE}/${domain}/usage_log.jsonl"

    # Append usage record
    cat >> "${usage_log}" <<EOF
{"timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","url":"${url}","task_id":"${task_id}","success":${success}}
EOF

    log_debug "Recorded usage: ${url} for task ${task_id}"
}

# Report outcome processed back to MoE learner
report_outcome_processed() {
    local outcome_id="$1"

    local learner_endpoint
    learner_endpoint=$(get_config_value "${LEARNING_POLICY}" ".moe_integration.learner_endpoint" "")

    if [[ -z "${learner_endpoint}" ]]; then
        return 0
    fi

    # Send acknowledgment (fire and forget)
    curl -s --max-time 2 -X POST \
        -H "Content-Type: application/json" \
        -d "{\"outcome_id\":\"${outcome_id}\",\"processor\":\"documentation-master\",\"status\":\"processed\"}" \
        "${learner_endpoint}/outcomes/${outcome_id}/ack" &>/dev/null || true
}

# Trigger learning for specific topic
trigger_learning() {
    local domain="${1:-}"
    local topic="${2:-}"
    local priority="${3:-medium}"

    if [[ -z "${domain}" || -z "${topic}" ]]; then
        log_error "Usage: learn <domain> <topic> [priority]"
        return 1
    fi

    log_info "Triggering learning for ${domain}/${topic} (priority: ${priority})"

    # Create learning task
    local task_file="${SCRIPT_DIR}/workers/learn_${domain}_${topic}_$(date +%s).task"

    cat > "${task_file}" <<EOF
{
  "type": "learn",
  "domain": "${domain}",
  "topic": "${topic}",
  "priority": "${priority}",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "status": "pending"
}
EOF

    log_info "Learning task created: ${task_file}"

    # Trigger immediate crawl for this topic
    if [[ -f "${SOURCES_CONFIG}" ]]; then
        local source_urls
        source_urls=$(jq -r ".${domain}.sources[].url" "${SOURCES_CONFIG}" 2>/dev/null || echo "")

        while IFS= read -r url; do
            [[ -z "${url}" ]] && continue

            # Add topic to URL if it's a path
            local topic_url="${url}"
            if [[ "${topic}" =~ ^/ ]]; then
                topic_url="${url}${topic}"
            else
                topic_url="${url}/${topic}"
            fi

            log_info "Crawling topic URL: ${topic_url}"
            crawl_url "${topic_url}" 0 3 "${domain}" &
        done <<< "${source_urls}"

        wait
    fi

    log_info "Learning triggered for ${domain}/${topic}"
}

# Identify knowledge gaps
identify_knowledge_gaps() {
    log_info "Identifying knowledge gaps..."

    local gaps="[]"

    # Check for domains with low coverage
    if [[ ! -f "${SOURCES_CONFIG}" ]]; then
        echo "${gaps}"
        return 0
    fi

    local domains
    domains=$(jq -r 'to_entries[] | select(.value.enabled == true) | .key' "${SOURCES_CONFIG}")

    while IFS= read -r domain; do
        [[ -z "${domain}" ]] && continue

        local index_dir="${KNOWLEDGE_BASE}/${domain}/index"
        local indexed_count=0

        if [[ -d "${index_dir}" ]]; then
            indexed_count=$(find "${index_dir}" -name "*.json" -type f | wc -l)
        fi

        # Check knowledge graph entities
        local expected_entities
        expected_entities=$(jq -r ".${domain}.knowledge_graph.entities[]" "${SOURCES_CONFIG}" 2>/dev/null || echo "")

        while IFS= read -r entity; do
            [[ -z "${entity}" ]] && continue

            # Count indexed content for this entity
            local entity_count
            entity_count=$(grep -l "${entity}" "${index_dir}"/*.json 2>/dev/null | wc -l)

            if [[ ${entity_count} -lt 3 ]]; then
                # Knowledge gap detected
                local gap="{\"domain\":\"${domain}\",\"entity\":\"${entity}\",\"coverage\":${entity_count},\"priority\":\"high\"}"
                gaps=$(echo "${gaps}" | jq ". += [${gap}]")
            fi
        done <<< "${expected_entities}"

        # Check overall domain coverage
        if [[ ${indexed_count} -lt 10 ]]; then
            local gap="{\"domain\":\"${domain}\",\"type\":\"low_coverage\",\"indexed_count\":${indexed_count},\"priority\":\"high\"}"
            gaps=$(echo "${gaps}" | jq ". += [${gap}]")
        fi
    done <<< "${domains}"

    echo "${gaps}"
}

# Auto-trigger learning for knowledge gaps
auto_trigger_learning() {
    log_info "Auto-triggering learning for knowledge gaps..."

    local gaps
    gaps=$(identify_knowledge_gaps)

    local gap_count
    gap_count=$(echo "${gaps}" | jq 'length')

    if [[ ${gap_count} -eq 0 ]]; then
        log_info "No knowledge gaps detected"
        return 0
    fi

    log_info "Found ${gap_count} knowledge gaps, triggering learning..."

    local i=0
    while [[ $i -lt ${gap_count} ]]; do
        local gap
        gap=$(echo "${gaps}" | jq ".[$i]")

        local domain
        domain=$(echo "${gap}" | jq -r '.domain')
        local entity
        entity=$(echo "${gap}" | jq -r '.entity // "overview"')
        local priority
        priority=$(echo "${gap}" | jq -r '.priority // "medium"')

        trigger_learning "${domain}" "${entity}" "${priority}"

        i=$((i + 1))
    done

    log_info "Learning triggered for ${gap_count} knowledge gaps"
}
