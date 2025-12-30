#!/bin/bash
# Evolution Tracker - Track and prioritize documentation updates

# Main evolution tracking function
track_documentation_evolution() {
    log_debug "Tracking documentation evolution..."

    # Update priority scores for all domains
    update_all_priority_scores

    # Check for version changes
    check_version_updates

    # Analyze usage patterns
    analyze_usage_patterns

    # Check storage limits
    check_storage_limits

    # Build cross-domain links
    build_cross_domain_links

    log_debug "Evolution tracking completed"
}

# Update priority scores for all domains
update_all_priority_scores() {
    if [[ ! -f "${SOURCES_CONFIG}" ]]; then
        return 0
    fi

    local domains
    domains=$(jq -r 'to_entries[] | select(.value.enabled == true) | .key' "${SOURCES_CONFIG}")

    while IFS= read -r domain; do
        [[ -z "${domain}" ]] && continue

        log_debug "Updating priority scores for ${domain}"
        update_priority_scores "${domain}"
    done <<< "${domains}"
}

# Check for version updates in documentation sources
check_version_updates() {
    log_debug "Checking for version updates..."

    if [[ ! -f "${CRAWL_POLICY}" ]]; then
        return 0
    fi

    local version_tracking_enabled
    version_tracking_enabled=$(get_config_value "${CRAWL_POLICY}" ".version_tracking.detect_new_releases" "false")

    if [[ "${version_tracking_enabled}" != "true" ]]; then
        return 0
    fi

    # Check each domain for version changes
    if [[ ! -f "${SOURCES_CONFIG}" ]]; then
        return 0
    fi

    local domains
    domains=$(jq -r 'to_entries[] | select(.value.enabled == true) | .key' "${SOURCES_CONFIG}")

    while IFS= read -r domain; do
        [[ -z "${domain}" ]] && continue

        check_domain_version "${domain}"
    done <<< "${domains}"
}

# Check version for a specific domain
check_domain_version() {
    local domain="$1"

    log_debug "Checking version for ${domain}"

    # Get source URLs
    local source_urls
    source_urls=$(jq -r ".${domain}.sources[] | select(.type == \"documentation\") | .url" "${SOURCES_CONFIG}" 2>/dev/null)

    while IFS= read -r base_url; do
        [[ -z "${base_url}" ]] && continue

        # Try to fetch version/changelog (common patterns)
        local version_urls=(
            "${base_url}/CHANGELOG"
            "${base_url}/changelog"
            "${base_url}/releases"
            "${base_url}/version"
        )

        for version_url in "${version_urls[@]}"; do
            local version_content
            version_content=$(curl -s --max-time 5 "${version_url}" 2>/dev/null || echo "")

            if [[ -n "${version_content}" ]]; then
                # Check if version has changed
                local version_cache="${CACHE_DIR}/metadata/${domain}/version_cache.txt"
                mkdir -p "$(dirname "${version_cache}")"

                local version_hash
                version_hash=$(echo "${version_content}" | md5sum | cut -d' ' -f1)

                local cached_hash=""
                if [[ -f "${version_cache}" ]]; then
                    cached_hash=$(cat "${version_cache}")
                fi

                if [[ "${version_hash}" != "${cached_hash}" ]]; then
                    log_info "Version change detected for ${domain}"

                    # Record version change event
                    record_version_change "${domain}" "${version_url}"

                    # Update cache
                    echo "${version_hash}" > "${version_cache}"

                    # Trigger high-priority re-crawl
                    log_info "Triggering re-crawl due to version change"
                    trigger_learning "${domain}" "version_update" "high" &
                fi

                break
            fi
        done
    done <<< "${source_urls}"
}

# Record version change event
record_version_change() {
    local domain="$1"
    local version_url="$2"

    local events_file="${KNOWLEDGE_BASE}/${domain}/evolution_events.jsonl"
    mkdir -p "$(dirname "${events_file}")"

    cat >> "${events_file}" <<EOF
{"type":"version_change","domain":"${domain}","source":"${version_url}","timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF

    log_info "Recorded version change event for ${domain}"
}

# Analyze usage patterns
analyze_usage_patterns() {
    log_debug "Analyzing usage patterns..."

    if [[ ! -f "${SOURCES_CONFIG}" ]]; then
        return 0
    fi

    local domains
    domains=$(jq -r 'to_entries[] | select(.value.enabled == true) | .key' "${SOURCES_CONFIG}")

    while IFS= read -r domain; do
        [[ -z "${domain}" ]] && continue

        analyze_domain_usage "${domain}"
    done <<< "${domains}"
}

# Analyze usage patterns for a domain
analyze_domain_usage() {
    local domain="$1"

    local query_log="${KNOWLEDGE_BASE}/${domain}/query_log.jsonl"
    local usage_log="${KNOWLEDGE_BASE}/${domain}/usage_log.jsonl"

    # Count queries in last 24 hours
    local query_count=0
    if [[ -f "${query_log}" ]]; then
        local cutoff
        cutoff=$(date -u -d "24 hours ago" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)

        query_count=$(awk -v cutoff="${cutoff}" '
            {
                if (match($0, /"timestamp":"([^"]*)"/, arr)) {
                    if (arr[1] > cutoff) count++
                }
            }
            END { print count+0 }
        ' "${query_log}")
    fi

    # Find most queried topics
    local top_topics="[]"
    if [[ -f "${query_log}" && ${query_count} -gt 0 ]]; then
        top_topics=$(jq -s 'group_by(.topic) | map({topic: .[0].topic, count: length}) | sort_by(-.count) | .[0:5]' "${query_log}" 2>/dev/null || echo "[]")
    fi

    # Record usage analysis
    local analysis_file="${KNOWLEDGE_BASE}/${domain}/usage_analysis.json"

    cat > "${analysis_file}" <<EOF
{
  "domain": "${domain}",
  "analyzed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "query_count_24h": ${query_count},
  "top_topics": ${top_topics},
  "usage_trend": "$(determine_usage_trend "${domain}")"
}
EOF

    log_debug "Usage analysis completed for ${domain}"

    # Adjust crawl priority based on usage
    adjust_crawl_priority "${domain}" "${query_count}"
}

# Determine usage trend
determine_usage_trend() {
    local domain="$1"

    # Compare current query count to historical average
    # Simplified: return "stable" for now
    echo "stable"
}

# Adjust crawl priority based on usage
adjust_crawl_priority() {
    local domain="$1"
    local query_count="$2"

    local current_priority
    current_priority=$(jq -r ".${domain}.priority" "${SOURCES_CONFIG}" 2>/dev/null || echo "medium")

    local new_priority="${current_priority}"

    # High usage -> high priority
    if [[ ${query_count} -gt 100 ]]; then
        new_priority="high"
    elif [[ ${query_count} -gt 20 ]]; then
        new_priority="medium"
    elif [[ ${query_count} -lt 5 ]]; then
        new_priority="low"
    fi

    if [[ "${new_priority}" != "${current_priority}" ]]; then
        log_info "Adjusting ${domain} priority: ${current_priority} -> ${new_priority}"

        # Update config (in production, this would update persistent config)
        # For now, just log the change
        record_priority_change "${domain}" "${current_priority}" "${new_priority}"
    fi
}

# Record priority change event
record_priority_change() {
    local domain="$1"
    local old_priority="$2"
    local new_priority="$3"

    local events_file="${KNOWLEDGE_BASE}/${domain}/evolution_events.jsonl"
    mkdir -p "$(dirname "${events_file}")"

    cat >> "${events_file}" <<EOF
{"type":"priority_change","domain":"${domain}","old_priority":"${old_priority}","new_priority":"${new_priority}","timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF

    log_info "Recorded priority change event for ${domain}"
}

# Get evolution metrics
get_evolution_metrics() {
    local domain="${1:-all}"

    log_info "Getting evolution metrics for ${domain}"

    if [[ "${domain}" == "all" ]]; then
        # Get metrics for all domains
        local all_metrics="[]"

        if [[ ! -f "${SOURCES_CONFIG}" ]]; then
            echo "[]"
            return 0
        fi

        local domains
        domains=$(jq -r 'to_entries[] | select(.value.enabled == true) | .key' "${SOURCES_CONFIG}")

        while IFS= read -r domain_name; do
            [[ -z "${domain_name}" ]] && continue

            local domain_metrics
            domain_metrics=$(get_domain_evolution_metrics "${domain_name}")

            all_metrics=$(echo "${all_metrics}" | jq ". += [${domain_metrics}]")
        done <<< "${domains}"

        echo "${all_metrics}"
    else
        # Get metrics for specific domain
        get_domain_evolution_metrics "${domain}"
    fi
}

# Get evolution metrics for a specific domain
get_domain_evolution_metrics() {
    local domain="$1"

    # Count evolution events
    local events_file="${KNOWLEDGE_BASE}/${domain}/evolution_events.jsonl"
    local event_count=0
    local version_changes=0
    local priority_changes=0

    if [[ -f "${events_file}" ]]; then
        event_count=$(wc -l < "${events_file}")
        version_changes=$(grep '"type":"version_change"' "${events_file}" | wc -l)
        priority_changes=$(grep '"type":"priority_change"' "${events_file}" | wc -l)
    fi

    # Get current priority
    local current_priority
    current_priority=$(jq -r ".${domain}.priority" "${SOURCES_CONFIG}" 2>/dev/null || echo "unknown")

    # Get usage analysis
    local usage_analysis="{}"
    local analysis_file="${KNOWLEDGE_BASE}/${domain}/usage_analysis.json"
    if [[ -f "${analysis_file}" ]]; then
        usage_analysis=$(cat "${analysis_file}")
    fi

    # Get knowledge gaps
    local gap_count=0
    local gaps_file="${KNOWLEDGE_BASE}/${domain}/knowledge_gaps.jsonl"
    if [[ -f "${gaps_file}" ]]; then
        gap_count=$(wc -l < "${gaps_file}")
    fi

    # Build metrics
    local metrics
    metrics=$(jq -n \
        --arg domain "${domain}" \
        --argjson events "${event_count}" \
        --argjson version_changes "${version_changes}" \
        --argjson priority_changes "${priority_changes}" \
        --arg current_priority "${current_priority}" \
        --argjson usage "${usage_analysis}" \
        --argjson gaps "${gap_count}" \
        '{
            domain: $domain,
            evolution_events: $events,
            version_changes: $version_changes,
            priority_changes: $priority_changes,
            current_priority: $current_priority,
            usage_analysis: $usage,
            knowledge_gaps: $gaps,
            timestamp: (now | strftime("%Y-%m-%dT%H:%M:%SZ"))
        }')

    echo "${metrics}"
}

# Generate evolution report
generate_evolution_report() {
    local output_file="${1:-${KNOWLEDGE_BASE}/evolution_report.json}"

    log_info "Generating evolution report..."

    # Get metrics for all domains
    local all_metrics
    all_metrics=$(get_evolution_metrics "all")

    # Calculate summary statistics
    local total_domains
    total_domains=$(echo "${all_metrics}" | jq 'length')
    local total_version_changes
    total_version_changes=$(echo "${all_metrics}" | jq '[.[].version_changes] | add')
    local total_priority_changes
    total_priority_changes=$(echo "${all_metrics}" | jq '[.[].priority_changes] | add')
    local total_knowledge_gaps
    total_knowledge_gaps=$(echo "${all_metrics}" | jq '[.[].knowledge_gaps] | add')

    # Build report
    local report
    report=$(jq -n \
        --argjson domains "${all_metrics}" \
        --argjson total_domains "${total_domains}" \
        --argjson version_changes "${total_version_changes}" \
        --argjson priority_changes "${total_priority_changes}" \
        --argjson gaps "${total_knowledge_gaps}" \
        '{
            title: "Documentation Master Evolution Report",
            generated_at: (now | strftime("%Y-%m-%dT%H:%M:%SZ")),
            summary: {
                total_domains: $total_domains,
                total_version_changes: $version_changes,
                total_priority_changes: $priority_changes,
                total_knowledge_gaps: $gaps
            },
            domains: $domains
        }')

    echo "${report}" > "${output_file}"

    log_info "Evolution report generated: ${output_file}"
    echo "${output_file}"
}
