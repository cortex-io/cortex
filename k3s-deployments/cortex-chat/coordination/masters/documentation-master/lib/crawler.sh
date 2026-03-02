#!/bin/bash
# Documentation Crawler - Web crawling and content extraction engine

# Crawl a single URL
crawl_url() {
    local url="$1"
    local depth="${2:-0}"
    local max_depth="${3:-5}"
    local domain="${4:-unknown}"

    log_debug "Crawling URL: ${url} (depth: ${depth}/${max_depth})"

    # Check resource limits
    if ! check_rate_limit; then
        log_warn "Rate limit reached, skipping URL: ${url}"
        return 1
    fi

    # Check robots.txt if enabled
    if should_respect_robots_txt && ! check_robots_txt "${url}"; then
        log_warn "Robots.txt disallows crawling: ${url}"
        return 1
    fi

    # Fetch content
    local content
    local http_code
    local cache_file="${CACHE_DIR}/indexed-content/${domain}/$(echo "${url}" | md5sum | cut -d' ' -f1).html"

    mkdir -p "$(dirname "${cache_file}")"

    # Use curl to fetch with timeout and retry
    local max_retries
    max_retries=$(get_config_value "${RESOURCE_LIMITS}" ".rate_limiting.max_retries" "3")
    local timeout
    timeout=$(get_config_value "${RESOURCE_LIMITS}" ".rate_limiting.timeout_seconds" "30")

    local retry=0
    while [[ ${retry} -lt ${max_retries} ]]; do
        http_code=$(curl -s -w "%{http_code}" -o "${cache_file}" \
            --max-time "${timeout}" \
            -H "User-Agent: Cortex-Documentation-Master/1.0" \
            -H "Accept: text/html,application/xhtml+xml" \
            "${url}")

        if [[ "${http_code}" == "200" ]]; then
            log_debug "Successfully fetched ${url} (HTTP ${http_code})"
            break
        else
            retry=$((retry + 1))
            log_warn "Fetch failed for ${url} (HTTP ${http_code}), retry ${retry}/${max_retries}"
            sleep 2
        fi
    done

    if [[ "${http_code}" != "200" ]]; then
        log_error "Failed to fetch ${url} after ${max_retries} retries"
        return 1
    fi

    # Apply crawl delay
    local crawl_delay
    crawl_delay=$(get_config_value "${RESOURCE_LIMITS}" ".rate_limiting.crawl_delay_seconds" "1")
    sleep "${crawl_delay}"

    # Extract content using selectors
    extract_content "${cache_file}" "${url}" "${domain}"

    # Find and crawl links if under max depth
    if [[ ${depth} -lt ${max_depth} ]]; then
        extract_and_crawl_links "${cache_file}" "${url}" "${depth}" "${max_depth}" "${domain}"
    fi

    return 0
}

# Extract content from HTML based on selectors
extract_content() {
    local html_file="$1"
    local url="$2"
    local domain="$3"

    log_debug "Extracting content from ${url}"

    # Get selectors from config
    local content_selectors
    content_selectors=$(get_source_selectors "${domain}" "content")
    local exclude_selectors
    exclude_selectors=$(get_source_selectors "${domain}" "exclude")

    # Simple text extraction (in production, use HTML parser like pup or htmlq)
    # For now, just extract basic text content
    local extracted_text
    extracted_text=$(grep -v "^[[:space:]]*$" "${html_file}" | \
        sed 's/<script[^>]*>.*<\/script>//g' | \
        sed 's/<style[^>]*>.*<\/style>//g' | \
        sed 's/<[^>]*>//g' | \
        sed 's/&nbsp;/ /g' | \
        sed 's/&[a-z]*;//g')

    # Save extracted content
    local content_file="${CACHE_DIR}/indexed-content/${domain}/$(echo "${url}" | md5sum | cut -d' ' -f1).txt"
    echo "${extracted_text}" > "${content_file}"

    # Create metadata
    local metadata_file="${CACHE_DIR}/metadata/${domain}/$(echo "${url}" | md5sum | cut -d' ' -f1).json"
    mkdir -p "$(dirname "${metadata_file}")"

    cat > "${metadata_file}" <<EOF
{
  "url": "${url}",
  "domain": "${domain}",
  "crawled_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "content_length": $(wc -c < "${content_file}"),
  "word_count": $(wc -w < "${content_file}"),
  "cache_file": "${content_file}"
}
EOF

    log_info "Content extracted from ${url} ($(wc -w < "${content_file}") words)"

    # Trigger indexing
    index_content "${content_file}" "${metadata_file}"

    return 0
}

# Extract links from HTML and crawl them
extract_and_crawl_links() {
    local html_file="$1"
    local base_url="$2"
    local current_depth="$3"
    local max_depth="$4"
    local domain="$5"

    # Extract links (simple grep-based, production should use proper HTML parser)
    local links
    links=$(grep -oP 'href="[^"]*"' "${html_file}" 2>/dev/null | \
        sed 's/href="//;s/"$//' | \
        grep -v '^#' | \
        grep -v '^javascript:' | \
        grep -v '^mailto:' | \
        head -n 50) || true

    local next_depth=$((current_depth + 1))

    while IFS= read -r link; do
        [[ -z "${link}" ]] && continue

        # Convert relative URLs to absolute
        local absolute_url
        if [[ "${link}" =~ ^http ]]; then
            absolute_url="${link}"
        elif [[ "${link}" =~ ^/ ]]; then
            local base_domain
            base_domain=$(echo "${base_url}" | sed 's|^\(https\?://[^/]*\).*|\1|')
            absolute_url="${base_domain}${link}"
        else
            local base_path
            base_path=$(dirname "${base_url}")
            absolute_url="${base_path}/${link}"
        fi

        # Only crawl URLs from the same domain
        if [[ "${absolute_url}" =~ $(get_source_base_domain "${domain}") ]]; then
            # Check if already crawled
            local url_hash
            url_hash=$(echo "${absolute_url}" | md5sum | cut -d' ' -f1)
            if [[ ! -f "${CACHE_DIR}/metadata/${domain}/${url_hash}.json" ]]; then
                log_debug "Found new link: ${absolute_url}"
                crawl_url "${absolute_url}" "${next_depth}" "${max_depth}" "${domain}" &
            fi
        fi
    done <<< "${links}"

    # Limit concurrent crawls
    local max_concurrent
    max_concurrent=$(get_config_value "${RESOURCE_LIMITS}" ".rate_limiting.concurrent_crawls" "5")

    # Wait for background jobs if too many running
    while [[ $(jobs -r | wc -l) -ge ${max_concurrent} ]]; do
        sleep 1
    done
}

# Check rate limiting
check_rate_limit() {
    local rate_limit_file="${CACHE_DIR}/rate_limit_tracker"
    local now
    now=$(date +%s)
    local requests_per_minute
    requests_per_minute=$(get_config_value "${RESOURCE_LIMITS}" ".rate_limiting.requests_per_minute" "60")

    # Create rate limit file if not exists
    if [[ ! -f "${rate_limit_file}" ]]; then
        echo "${now}" > "${rate_limit_file}"
        return 0
    fi

    # Count requests in last minute
    local cutoff=$((now - 60))
    local count
    count=$(awk -v cutoff="${cutoff}" '$1 > cutoff' "${rate_limit_file}" 2>/dev/null | wc -l)

    if [[ ${count} -ge ${requests_per_minute} ]]; then
        return 1
    fi

    # Record this request
    echo "${now}" >> "${rate_limit_file}"

    # Clean old entries
    awk -v cutoff="${cutoff}" '$1 > cutoff' "${rate_limit_file}" > "${rate_limit_file}.tmp"
    mv "${rate_limit_file}.tmp" "${rate_limit_file}"

    return 0
}

# Check if robots.txt should be respected
should_respect_robots_txt() {
    local respect
    respect=$(get_config_value "${RESOURCE_LIMITS}" ".rate_limiting.respect_robots_txt" "true")
    [[ "${respect}" == "true" ]]
}

# Check robots.txt for URL
check_robots_txt() {
    local url="$1"
    # Simplified - always return true for now
    # Production should fetch and parse robots.txt
    return 0
}

# Get source base domain
get_source_base_domain() {
    local domain="$1"
    local base_url
    base_url=$(jq -r ".${domain}.sources[0].url" "${SOURCES_CONFIG}" 2>/dev/null)
    echo "${base_url}" | sed 's|^\(https\?://[^/]*\).*|\1|'
}

# Get source selectors
get_source_selectors() {
    local domain="$1"
    local selector_type="$2"
    jq -r ".${domain}.sources[0].selectors.${selector_type}" "${SOURCES_CONFIG}" 2>/dev/null || echo ""
}

# Run scheduled crawl for all enabled sources
run_scheduled_crawl() {
    log_info "Starting scheduled crawl..."

    if [[ ! -f "${SOURCES_CONFIG}" ]]; then
        log_error "Sources config not found: ${SOURCES_CONFIG}"
        return 1
    fi

    # Get enabled sources
    local sources
    sources=$(jq -r 'to_entries[] | select(.value.enabled == true) | .key' "${SOURCES_CONFIG}")

    while IFS= read -r domain; do
        [[ -z "${domain}" ]] && continue

        log_info "Crawling domain: ${domain}"

        # Get sources for this domain
        local source_urls
        source_urls=$(jq -r ".${domain}.sources[].url" "${SOURCES_CONFIG}")

        while IFS= read -r url; do
            [[ -z "${url}" ]] && continue

            local max_depth
            max_depth=$(jq -r ".${domain}.sources[] | select(.url == \"${url}\") | .crawl_depth" "${SOURCES_CONFIG}")

            log_info "Crawling ${url} with max depth ${max_depth}"
            crawl_url "${url}" 0 "${max_depth}" "${domain}"
        done <<< "${source_urls}"
    done <<< "${sources}"

    log_info "Scheduled crawl completed"
}

# Run manual crawl
run_manual_crawl() {
    local domain="${1:-}"
    local url="${2:-}"

    if [[ -z "${domain}" ]]; then
        log_error "Usage: crawl <domain> [url]"
        return 1
    fi

    log_info "Starting manual crawl for domain: ${domain}"

    if [[ -n "${url}" ]]; then
        crawl_url "${url}" 0 5 "${domain}"
    else
        # Crawl all sources for domain
        local source_urls
        source_urls=$(jq -r ".${domain}.sources[].url" "${SOURCES_CONFIG}" 2>/dev/null)

        while IFS= read -r crawl_url; do
            [[ -z "${crawl_url}" ]] && continue

            local max_depth
            max_depth=$(jq -r ".${domain}.sources[] | select(.url == \"${crawl_url}\") | .crawl_depth" "${SOURCES_CONFIG}")

            crawl_url "${crawl_url}" 0 "${max_depth}" "${domain}"
        done <<< "${source_urls}"
    fi

    log_info "Manual crawl completed"
}

# Helper function to get config values
get_config_value() {
    local config_file="$1"
    local jq_path="$2"
    local default_value="$3"

    if [[ ! -f "${config_file}" ]]; then
        echo "${default_value}"
        return
    fi

    local value
    value=$(jq -r "${jq_path}" "${config_file}" 2>/dev/null)

    if [[ -z "${value}" || "${value}" == "null" ]]; then
        echo "${default_value}"
    else
        echo "${value}"
    fi
}
