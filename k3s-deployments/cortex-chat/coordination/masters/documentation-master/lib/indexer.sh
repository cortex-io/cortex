#!/bin/bash
# Documentation Indexer - Content indexing and storage management

# Index content from a crawled page
index_content() {
    local content_file="$1"
    local metadata_file="$2"

    if [[ ! -f "${content_file}" ]]; then
        log_error "Content file not found: ${content_file}"
        return 1
    fi

    if [[ ! -f "${metadata_file}" ]]; then
        log_error "Metadata file not found: ${metadata_file}"
        return 1
    fi

    log_debug "Indexing content from ${content_file}"

    # Extract metadata
    local url
    url=$(jq -r '.url' "${metadata_file}")
    local domain
    domain=$(jq -r '.domain' "${metadata_file}")
    local word_count
    word_count=$(jq -r '.word_count' "${metadata_file}")

    # Skip empty or too small content
    if [[ ${word_count} -lt 10 ]]; then
        log_debug "Skipping content with only ${word_count} words: ${url}"
        return 0
    fi

    # Create index entry
    local index_dir="${KNOWLEDGE_BASE}/${domain}/index"
    mkdir -p "${index_dir}"

    local url_hash
    url_hash=$(echo "${url}" | md5sum | cut -d' ' -f1)
    local index_file="${index_dir}/${url_hash}.json"

    # Extract key terms and concepts
    local key_terms
    key_terms=$(extract_key_terms "${content_file}")

    # Create searchable index
    cat > "${index_file}" <<EOF
{
  "url": "${url}",
  "domain": "${domain}",
  "indexed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "word_count": ${word_count},
  "key_terms": ${key_terms},
  "content_file": "${content_file}",
  "metadata_file": "${metadata_file}",
  "priority_score": 0.5,
  "usage_count": 0,
  "last_accessed": null
}
EOF

    log_info "Indexed: ${url} (${word_count} words)"

    # Update knowledge graph
    update_knowledge_graph "${domain}" "${url}" "${key_terms}"

    # Generate embeddings (placeholder for now)
    generate_embeddings "${content_file}" "${domain}" "${url_hash}"

    return 0
}

# Extract key terms from content
extract_key_terms() {
    local content_file="$1"

    # Simple term extraction: get most common words
    # In production, use NLP tools for better extraction
    local terms
    terms=$(tr '[:upper:]' '[:lower:]' < "${content_file}" | \
        tr -cs '[:alpha:]' '\n' | \
        sort | uniq -c | sort -rn | \
        head -n 20 | \
        awk '{print "\"" $2 "\""}' | \
        paste -sd ',')

    echo "[${terms}]"
}

# Generate embeddings for content
generate_embeddings() {
    local content_file="$1"
    local domain="$2"
    local url_hash="$3"

    local embeddings_dir="${CACHE_DIR}/embeddings/${domain}"
    mkdir -p "${embeddings_dir}"

    local embeddings_file="${embeddings_dir}/${url_hash}.vec"

    # Placeholder for embeddings generation
    # In production, call embedding API (OpenAI, local model, etc.)
    # For now, just create a marker file
    cat > "${embeddings_file}" <<EOF
{
  "url_hash": "${url_hash}",
  "domain": "${domain}",
  "generated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "vector_dimensions": 1536,
  "note": "Embeddings generation placeholder - integrate with embedding API"
}
EOF

    log_debug "Generated embeddings placeholder for ${url_hash}"
}

# Search indexed content
search_index() {
    local domain="$1"
    local query="$2"
    local max_results="${3:-10}"

    log_info "Searching ${domain} for: ${query}"

    local index_dir="${KNOWLEDGE_BASE}/${domain}/index"

    if [[ ! -d "${index_dir}" ]]; then
        log_warn "No index found for domain: ${domain}"
        echo "[]"
        return 0
    fi

    # Simple keyword search across all index files
    local results="[]"
    local count=0

    for index_file in "${index_dir}"/*.json; do
        [[ ! -f "${index_file}" ]] && continue

        # Check if query terms appear in key_terms
        local key_terms
        key_terms=$(jq -r '.key_terms[]' "${index_file}" 2>/dev/null || echo "")

        local query_lower
        query_lower=$(echo "${query}" | tr '[:upper:]' '[:lower:]')

        if echo "${key_terms}" | grep -qi "${query_lower}"; then
            # Add to results
            local entry
            entry=$(cat "${index_file}")
            results=$(echo "${results}" | jq ". += [${entry}]")

            count=$((count + 1))
            if [[ ${count} -ge ${max_results} ]]; then
                break
            fi
        fi
    done

    # Sort by priority score
    results=$(echo "${results}" | jq 'sort_by(-.priority_score)')

    echo "${results}"
}

# Get content by URL
get_indexed_content() {
    local url="$1"
    local domain="$2"

    local url_hash
    url_hash=$(echo "${url}" | md5sum | cut -d' ' -f1)

    local index_file="${KNOWLEDGE_BASE}/${domain}/index/${url_hash}.json"

    if [[ ! -f "${index_file}" ]]; then
        log_warn "No indexed content found for: ${url}"
        echo "{\"error\": \"not_found\"}"
        return 1
    fi

    # Update access tracking
    local now
    now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    local usage_count
    usage_count=$(jq -r '.usage_count' "${index_file}")
    usage_count=$((usage_count + 1))

    # Update index file
    local tmp_file="${index_file}.tmp"
    jq ".usage_count = ${usage_count} | .last_accessed = \"${now}\"" "${index_file}" > "${tmp_file}"
    mv "${tmp_file}" "${index_file}"

    # Return content
    local content_file
    content_file=$(jq -r '.content_file' "${index_file}")

    if [[ -f "${content_file}" ]]; then
        cat "${content_file}"
    else
        log_error "Content file not found: ${content_file}"
        echo "{\"error\": \"content_not_found\"}"
        return 1
    fi
}

# Update priority scores based on usage
update_priority_scores() {
    local domain="$1"

    log_info "Updating priority scores for ${domain}"

    local index_dir="${KNOWLEDGE_BASE}/${domain}/index"

    if [[ ! -d "${index_dir}" ]]; then
        log_warn "No index found for domain: ${domain}"
        return 0
    fi

    # Get weights from learning policy
    local usage_weight
    usage_weight=$(get_config_value "${LEARNING_POLICY}" ".priority_scoring.weights.usage_frequency" "0.4")
    local success_weight
    success_weight=$(get_config_value "${LEARNING_POLICY}" ".priority_scoring.weights.success_rate" "0.4")
    local recency_weight
    recency_weight=$(get_config_value "${LEARNING_POLICY}" ".priority_scoring.weights.recency" "0.2")

    for index_file in "${index_dir}"/*.json; do
        [[ ! -f "${index_file}" ]] && continue

        # Calculate normalized usage score (0-1)
        local usage_count
        usage_count=$(jq -r '.usage_count' "${index_file}")
        local usage_score
        usage_score=$(echo "scale=2; ${usage_count} / 100" | bc)
        [[ $(echo "${usage_score} > 1" | bc) -eq 1 ]] && usage_score="1.0"

        # Calculate recency score (0-1 based on last access)
        local last_accessed
        last_accessed=$(jq -r '.last_accessed' "${index_file}")
        local recency_score="0.5"  # Default if never accessed

        if [[ "${last_accessed}" != "null" ]]; then
            local days_since_access
            days_since_access=$(( ($(date +%s) - $(date -d "${last_accessed}" +%s 2>/dev/null || date +%s)) / 86400 ))
            recency_score=$(echo "scale=2; 1 / (1 + ${days_since_access} / 30)" | bc)
        fi

        # Success rate placeholder (would come from MoE outcomes)
        local success_score="0.5"

        # Calculate weighted priority score
        local priority_score
        priority_score=$(echo "scale=2; (${usage_score} * ${usage_weight}) + (${success_score} * ${success_weight}) + (${recency_score} * ${recency_weight})" | bc)

        # Update index file
        local tmp_file="${index_file}.tmp"
        jq ".priority_score = ${priority_score}" "${index_file}" > "${tmp_file}"
        mv "${tmp_file}" "${index_file}"

        log_debug "Updated priority for $(jq -r '.url' "${index_file}"): ${priority_score}"
    done

    log_info "Priority scores updated for ${domain}"
}

# Prune low-value cached content
prune_cache() {
    log_info "Starting cache pruning..."

    # Get pruning policy
    local min_score
    min_score=$(get_config_value "${LEARNING_POLICY}" ".pruning_policy.min_value_score" "0.3")
    local evaluation_window_days
    evaluation_window_days=$(get_config_value "${LEARNING_POLICY}" ".pruning_policy.evaluation_window_days" "90")

    local pruned_count=0
    local cutoff_date
    cutoff_date=$(date -u -d "${evaluation_window_days} days ago" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)

    # Check each domain
    for domain_dir in "${KNOWLEDGE_BASE}"/*; do
        [[ ! -d "${domain_dir}" ]] && continue

        local domain
        domain=$(basename "${domain_dir}")
        local index_dir="${domain_dir}/index"

        [[ ! -d "${index_dir}" ]] && continue

        for index_file in "${index_dir}"/*.json; do
            [[ ! -f "${index_file}" ]] && continue

            local priority_score
            priority_score=$(jq -r '.priority_score' "${index_file}")
            local indexed_at
            indexed_at=$(jq -r '.indexed_at' "${index_file}")

            # Check if content is old enough to evaluate
            if [[ "${indexed_at}" < "${cutoff_date}" ]]; then
                # Check if priority is below threshold
                if (( $(echo "${priority_score} < ${min_score}" | bc -l) )); then
                    local url
                    url=$(jq -r '.url' "${index_file}")
                    local content_file
                    content_file=$(jq -r '.content_file' "${index_file}")

                    log_info "Pruning low-value content: ${url} (score: ${priority_score})"

                    # Remove content and index
                    rm -f "${content_file}" "${index_file}"
                    pruned_count=$((pruned_count + 1))
                fi
            fi
        done
    done

    log_info "Cache pruning completed: removed ${pruned_count} low-value entries"
}

# Check storage limits
check_storage_limits() {
    local max_cache_size_gb
    max_cache_size_gb=$(get_config_value "${RESOURCE_LIMITS}" ".storage.max_cache_size_gb" "10")
    local pruning_threshold
    pruning_threshold=$(get_config_value "${RESOURCE_LIMITS}" ".storage.pruning_threshold_percent" "80")

    # Get current cache size
    local cache_size_kb
    cache_size_kb=$(du -sk "${CACHE_DIR}" 2>/dev/null | cut -f1)
    local cache_size_gb
    cache_size_gb=$(echo "scale=2; ${cache_size_kb} / 1024 / 1024" | bc)

    local usage_percent
    usage_percent=$(echo "scale=0; (${cache_size_gb} / ${max_cache_size_gb}) * 100" | bc)

    log_info "Cache storage: ${cache_size_gb}GB / ${max_cache_size_gb}GB (${usage_percent}%)"

    # Trigger pruning if threshold exceeded
    if [[ ${usage_percent} -ge ${pruning_threshold} ]]; then
        log_warn "Storage threshold exceeded (${usage_percent}%), triggering pruning"
        prune_cache
    fi
}

# Rebuild index for a domain
rebuild_index() {
    local domain="$1"

    log_info "Rebuilding index for ${domain}"

    local index_dir="${KNOWLEDGE_BASE}/${domain}/index"
    local cache_domain_dir="${CACHE_DIR}/indexed-content/${domain}"

    # Clear existing index
    rm -rf "${index_dir}"
    mkdir -p "${index_dir}"

    # Re-index all cached content
    if [[ -d "${cache_domain_dir}" ]]; then
        for content_file in "${cache_domain_dir}"/*.txt; do
            [[ ! -f "${content_file}" ]] && continue

            local metadata_file
            metadata_file="${CACHE_DIR}/metadata/${domain}/$(basename "${content_file}" .txt).json"

            if [[ -f "${metadata_file}" ]]; then
                index_content "${content_file}" "${metadata_file}"
            fi
        done
    fi

    log_info "Index rebuild completed for ${domain}"
}
