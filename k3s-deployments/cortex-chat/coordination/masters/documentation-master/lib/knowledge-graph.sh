#!/bin/bash
# Knowledge Graph - Cross-domain knowledge management

# Update knowledge graph with new content
update_knowledge_graph() {
    local domain="$1"
    local url="$2"
    local key_terms="$3"

    log_debug "Updating knowledge graph for ${domain}"

    local kg_file="${KNOWLEDGE_BASE}/${domain}/knowledge_graph.json"

    # Initialize knowledge graph if doesn't exist
    if [[ ! -f "${kg_file}" ]]; then
        initialize_knowledge_graph "${domain}"
    fi

    # Extract entities and relationships from config
    local entities
    entities=$(jq -r ".${domain}.knowledge_graph.entities" "${SOURCES_CONFIG}" 2>/dev/null || echo "[]")
    local relationships
    relationships=$(jq -r ".${domain}.knowledge_graph.relationships" "${SOURCES_CONFIG}" 2>/dev/null || echo "[]")

    # Add URL as a node
    local url_hash
    url_hash=$(echo "${url}" | md5sum | cut -d' ' -f1)

    # Check which entities appear in the key terms
    local found_entities="[]"
    local entity_count
    entity_count=$(echo "${entities}" | jq 'length')

    local i=0
    while [[ $i -lt ${entity_count} ]]; do
        local entity
        entity=$(echo "${entities}" | jq -r ".[$i]")

        # Check if entity appears in key terms
        if echo "${key_terms}" | jq -e ". | index(\"${entity}\")" >/dev/null 2>&1; then
            found_entities=$(echo "${found_entities}" | jq ". += [\"${entity}\"]")
        fi

        i=$((i + 1))
    done

    # Update knowledge graph
    local tmp_file="${kg_file}.tmp"
    jq ".nodes.\"${url_hash}\" = {
        \"url\": \"${url}\",
        \"entities\": ${found_entities},
        \"updated_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
    }" "${kg_file}" > "${tmp_file}"
    mv "${tmp_file}" "${kg_file}"

    log_debug "Knowledge graph updated for ${url}"
}

# Initialize knowledge graph for domain
initialize_knowledge_graph() {
    local domain="$1"

    local kg_file="${KNOWLEDGE_BASE}/${domain}/knowledge_graph.json"
    mkdir -p "$(dirname "${kg_file}")"

    # Get config
    local entities
    entities=$(jq -r ".${domain}.knowledge_graph.entities" "${SOURCES_CONFIG}" 2>/dev/null || echo "[]")
    local relationships
    relationships=$(jq -r ".${domain}.knowledge_graph.relationships" "${SOURCES_CONFIG}" 2>/dev/null || echo "[]")
    local cross_domain_links
    cross_domain_links=$(jq -r ".${domain}.knowledge_graph.cross_domain_links" "${SOURCES_CONFIG}" 2>/dev/null || echo "{}")

    cat > "${kg_file}" <<EOF
{
  "domain": "${domain}",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "entities": ${entities},
  "relationships": ${relationships},
  "cross_domain_links": ${cross_domain_links},
  "nodes": {},
  "edges": []
}
EOF

    log_info "Initialized knowledge graph for ${domain}"
}

# Query knowledge graph for related concepts
query_knowledge_graph() {
    local domain="$1"
    local concept="$2"

    local kg_file="${KNOWLEDGE_BASE}/${domain}/knowledge_graph.json"

    if [[ ! -f "${kg_file}" ]]; then
        echo "{\"error\": \"knowledge_graph_not_found\"}"
        return 1
    fi

    # Find nodes that reference this concept
    local results
    results=$(jq "[.nodes | to_entries[] | select(.value.entities | index(\"${concept}\"))] | map({url: .value.url, entities: .value.entities})" "${kg_file}")

    echo "${results}"
}

# Build cross-domain knowledge links
build_cross_domain_links() {
    log_info "Building cross-domain knowledge links..."

    local all_domains="[]"

    # Get all enabled domains
    if [[ -f "${SOURCES_CONFIG}" ]]; then
        all_domains=$(jq -r 'to_entries[] | select(.value.enabled == true) | .key' "${SOURCES_CONFIG}" | jq -R -s -c 'split("\n") | map(select(length > 0))')
    fi

    local domain_count
    domain_count=$(echo "${all_domains}" | jq 'length')

    # For each domain, find concepts that overlap with other domains
    local i=0
    while [[ $i -lt ${domain_count} ]]; do
        local domain1
        domain1=$(echo "${all_domains}" | jq -r ".[$i]")

        local kg_file1="${KNOWLEDGE_BASE}/${domain1}/knowledge_graph.json"
        [[ ! -f "${kg_file1}" ]] && { i=$((i + 1)); continue; }

        local entities1
        entities1=$(jq -r '.entities[]' "${kg_file1}")

        # Compare with other domains
        local j=0
        while [[ $j -lt ${domain_count} ]]; do
            [[ $i -eq $j ]] && { j=$((j + 1)); continue; }

            local domain2
            domain2=$(echo "${all_domains}" | jq -r ".[$j]")

            local kg_file2="${KNOWLEDGE_BASE}/${domain2}/knowledge_graph.json"
            [[ ! -f "${kg_file2}" ]] && { j=$((j + 1)); continue; }

            local entities2
            entities2=$(jq -r '.entities[]' "${kg_file2}")

            # Find common concepts
            while IFS= read -r entity1; do
                [[ -z "${entity1}" ]] && continue

                while IFS= read -r entity2; do
                    [[ -z "${entity2}" ]] && continue

                    # Check for semantic similarity (simple string matching for now)
                    if [[ "${entity1}" == "${entity2}" ]] || echo "${entity1}" | grep -qi "${entity2}"; then
                        log_info "Cross-domain link found: ${domain1}/${entity1} <-> ${domain2}/${entity2}"

                        # Record link
                        record_cross_domain_link "${domain1}" "${entity1}" "${domain2}" "${entity2}"
                    fi
                done <<< "${entities2}"
            done <<< "${entities1}"

            j=$((j + 1))
        done

        i=$((i + 1))
    done

    log_info "Cross-domain link building completed"
}

# Record a cross-domain link
record_cross_domain_link() {
    local domain1="$1"
    local entity1="$2"
    local domain2="$3"
    local entity2="$4"

    local links_file="${KNOWLEDGE_BASE}/cross-domain/links.jsonl"
    mkdir -p "$(dirname "${links_file}")"

    # Check if link already exists
    if grep -q "\"${domain1}\".*\"${entity1}\".*\"${domain2}\".*\"${entity2}\"" "${links_file}" 2>/dev/null; then
        log_debug "Cross-domain link already exists"
        return 0
    fi

    # Append link
    cat >> "${links_file}" <<EOF
{"source_domain":"${domain1}","source_entity":"${entity1}","target_domain":"${domain2}","target_entity":"${entity2}","created_at":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF

    log_debug "Recorded cross-domain link: ${domain1}/${entity1} -> ${domain2}/${entity2}"
}

# Get cross-domain recommendations
get_cross_domain_recommendations() {
    local domain="$1"
    local entity="$2"

    local links_file="${KNOWLEDGE_BASE}/cross-domain/links.jsonl"

    if [[ ! -f "${links_file}" ]]; then
        echo "[]"
        return 0
    fi

    # Find links involving this domain and entity
    local recommendations
    recommendations=$(grep "\"${domain}\"" "${links_file}" | grep "\"${entity}\"" | jq -s '.')

    echo "${recommendations}"
}

# Export knowledge graph for visualization
export_knowledge_graph() {
    local domain="$1"
    local output_file="${2:-${KNOWLEDGE_BASE}/${domain}/kg_export.json}"

    local kg_file="${KNOWLEDGE_BASE}/${domain}/knowledge_graph.json"

    if [[ ! -f "${kg_file}" ]]; then
        log_error "Knowledge graph not found for ${domain}"
        return 1
    fi

    # Export in format suitable for graph visualization tools
    local export_data
    export_data=$(jq '{
        domain: .domain,
        nodes: [.nodes | to_entries[] | {id: .key, label: .value.url, entities: .value.entities}],
        edges: .edges,
        metadata: {
            created_at: .created_at,
            node_count: (.nodes | length),
            edge_count: (.edges | length)
        }
    }' "${kg_file}")

    echo "${export_data}" > "${output_file}"

    log_info "Knowledge graph exported to ${output_file}"
    echo "${output_file}"
}

# Calculate knowledge graph metrics
calculate_kg_metrics() {
    local domain="$1"

    local kg_file="${KNOWLEDGE_BASE}/${domain}/knowledge_graph.json"

    if [[ ! -f "${kg_file}" ]]; then
        echo "{\"error\": \"not_found\"}"
        return 1
    fi

    local node_count
    node_count=$(jq '.nodes | length' "${kg_file}")
    local edge_count
    edge_count=$(jq '.edges | length' "${kg_file}")
    local entity_count
    entity_count=$(jq '.entities | length' "${kg_file}")

    # Calculate coverage (percentage of entities with indexed content)
    local entities_with_content=0
    local entities
    entities=$(jq -r '.entities[]' "${kg_file}")

    while IFS= read -r entity; do
        [[ -z "${entity}" ]] && continue

        local entity_nodes
        entity_nodes=$(jq "[.nodes[] | select(.entities | index(\"${entity}\"))] | length" "${kg_file}")

        if [[ ${entity_nodes} -gt 0 ]]; then
            entities_with_content=$((entities_with_content + 1))
        fi
    done <<< "${entities}"

    local coverage
    coverage=$(echo "scale=2; (${entities_with_content} / ${entity_count}) * 100" | bc)

    local metrics
    metrics=$(jq -n \
        --arg domain "${domain}" \
        --argjson nodes "${node_count}" \
        --argjson edges "${edge_count}" \
        --argjson entities "${entity_count}" \
        --argjson entities_with_content "${entities_with_content}" \
        --argjson coverage "${coverage}" \
        '{
            domain: $domain,
            nodes: $nodes,
            edges: $edges,
            entities: $entities,
            entities_with_content: $entities_with_content,
            coverage_percent: $coverage
        }')

    echo "${metrics}"
}
