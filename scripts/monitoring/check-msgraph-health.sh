#!/usr/bin/env bash
# Health Check Script for Microsoft Graph MCP Server
# Monitors MS Graph API connectivity, authentication, and service health

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
MONITORING_DIR="${CORTEX_ROOT}/coordination/monitoring"
EVENTS_FILE="${CORTEX_ROOT}/coordination/dashboard-events.jsonl"
HEALTH_CHECK_LOG="${MONITORING_DIR}/msgraph-health-checks.jsonl"

# Timestamp
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if required environment variables are set
check_env_vars() {
    log_info "Checking Microsoft Graph MCP Server environment variables..."

    local missing_vars=()

    if [[ -z "${MICROSOFT_TENANT_ID:-}" ]]; then
        missing_vars+=("MICROSOFT_TENANT_ID")
    fi

    if [[ -z "${MICROSOFT_CLIENT_ID:-}" ]]; then
        missing_vars+=("MICROSOFT_CLIENT_ID")
    fi

    if [[ -z "${MICROSOFT_CLIENT_SECRET:-}" ]]; then
        missing_vars+=("MICROSOFT_CLIENT_SECRET")
    fi

    if [[ ${#missing_vars[@]} -gt 0 ]]; then
        log_warning "Missing environment variables: ${missing_vars[*]}"
        log_warning "MS Graph API health checks will be skipped"
        return 1
    fi

    log_success "All required environment variables are set"
    return 0
}

# Test Microsoft Graph API authentication
test_graph_auth() {
    log_info "Testing Microsoft Graph API authentication..."

    local auth_url="https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/token"

    local response
    response=$(curl -s -X POST "${auth_url}" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "client_id=${MICROSOFT_CLIENT_ID}" \
        -d "client_secret=${MICROSOFT_CLIENT_SECRET}" \
        -d "scope=https://graph.microsoft.com/.default" \
        -d "grant_type=client_credentials")

    if echo "${response}" | jq -e '.access_token' > /dev/null 2>&1; then
        log_success "Successfully authenticated with Microsoft Graph API"

        # Record success event
        cat >> "${EVENTS_FILE}" << EOF
{"timestamp":"${TIMESTAMP}","event":"msgraph_auth_success","severity":"info","source":"health_check","details":{"tenant":"${MICROSOFT_TENANT_ID}","status":"authenticated"}}
EOF
        return 0
    else
        local error_msg
        error_msg=$(echo "${response}" | jq -r '.error_description // .error // "Unknown error"')
        log_error "Authentication failed: ${error_msg}"

        # Record failure event
        cat >> "${EVENTS_FILE}" << EOF
{"timestamp":"${TIMESTAMP}","event":"msgraph_auth_failure","severity":"critical","source":"health_check","details":{"tenant":"${MICROSOFT_TENANT_ID}","error":"${error_msg}"}}
EOF
        return 1
    fi
}

# Check Microsoft Graph API endpoint availability
check_graph_api_availability() {
    log_info "Checking Microsoft Graph API endpoint availability..."

    # First get token
    local auth_url="https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/token"
    local token_response
    token_response=$(curl -s -X POST "${auth_url}" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "client_id=${MICROSOFT_CLIENT_ID}" \
        -d "client_secret=${MICROSOFT_CLIENT_SECRET}" \
        -d "scope=https://graph.microsoft.com/.default" \
        -d "grant_type=client_credentials")

    local access_token
    access_token=$(echo "${token_response}" | jq -r '.access_token // empty')

    if [[ -z "${access_token}" ]]; then
        log_error "Could not obtain access token"
        return 1
    fi

    # Test a simple API call (get organization info)
    local api_url="https://graph.microsoft.com/v1.0/organization"
    local api_response
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "Authorization: Bearer ${access_token}" \
        "${api_url}")

    if [[ "${http_code}" -eq 200 ]]; then
        log_success "Microsoft Graph API is available (HTTP ${http_code})"

        # Record success event
        cat >> "${EVENTS_FILE}" << EOF
{"timestamp":"${TIMESTAMP}","event":"msgraph_api_available","severity":"info","source":"health_check","details":{"http_code":${http_code},"endpoint":"organization"}}
EOF
        return 0
    else
        log_error "Microsoft Graph API returned HTTP ${http_code}"

        # Record failure event
        cat >> "${EVENTS_FILE}" << EOF
{"timestamp":"${TIMESTAMP}","event":"msgraph_api_unavailable","severity":"high","source":"health_check","details":{"http_code":${http_code},"endpoint":"organization"}}
EOF
        return 1
    fi
}

# Verify required permissions
verify_permissions() {
    log_info "Verifying Microsoft Graph API permissions..."

    # Get token with detailed response
    local auth_url="https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/token"
    local token_response
    token_response=$(curl -s -X POST "${auth_url}" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "client_id=${MICROSOFT_CLIENT_ID}" \
        -d "client_secret=${MICROSOFT_CLIENT_SECRET}" \
        -d "scope=https://graph.microsoft.com/.default" \
        -d "grant_type=client_credentials")

    local access_token
    access_token=$(echo "${token_response}" | jq -r '.access_token // empty')

    if [[ -z "${access_token}" ]]; then
        log_error "Could not verify permissions - no access token"
        return 1
    fi

    # Test each required permission by attempting basic operations
    local required_permissions=(
        "User.ReadWrite.All:users?$top=1"
        "Directory.ReadWrite.All:organization"
        "Group.ReadWrite.All:groups?$top=1"
        "Organization.Read.All:organization"
    )

    local failed_permissions=()

    for perm_test in "${required_permissions[@]}"; do
        IFS=':' read -r perm endpoint <<< "${perm_test}"

        local http_code
        http_code=$(curl -s -o /dev/null -w "%{http_code}" \
            -H "Authorization: Bearer ${access_token}" \
            "https://graph.microsoft.com/v1.0/${endpoint}")

        if [[ "${http_code}" -eq 200 ]]; then
            log_success "Permission verified: ${perm}"
        else
            log_warning "Permission check failed: ${perm} (HTTP ${http_code})"
            failed_permissions+=("${perm}")
        fi
    done

    if [[ ${#failed_permissions[@]} -eq 0 ]]; then
        log_success "All required permissions verified"
        return 0
    else
        log_error "Some permissions failed: ${failed_permissions[*]}"
        return 1
    fi
}

# Check rate limit status
check_rate_limits() {
    log_info "Checking Microsoft Graph API rate limit status..."

    # Get token
    local auth_url="https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/token"
    local token_response
    token_response=$(curl -s -X POST "${auth_url}" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "client_id=${MICROSOFT_CLIENT_ID}" \
        -d "client_secret=${MICROSOFT_CLIENT_SECRET}" \
        -d "scope=https://graph.microsoft.com/.default" \
        -d "grant_type=client_credentials")

    local access_token
    access_token=$(echo "${token_response}" | jq -r '.access_token // empty')

    if [[ -z "${access_token}" ]]; then
        log_error "Could not check rate limits - no access token"
        return 1
    fi

    # Make API call and capture headers
    local response_headers
    response_headers=$(curl -s -i -H "Authorization: Bearer ${access_token}" \
        "https://graph.microsoft.com/v1.0/organization" | grep -i "^ratelimit")

    if [[ -n "${response_headers}" ]]; then
        log_info "Rate limit headers: ${response_headers}"
        log_success "Rate limit status checked"
    else
        log_info "No rate limit headers returned (normal for current usage)"
    fi

    return 0
}

# Generate health check report
generate_health_report() {
    log_info "Generating health check report..."

    local overall_status="healthy"
    local checks_passed=0
    local checks_total=5

    # Summary of checks
    if check_env_vars; then
        ((checks_passed++))
    else
        overall_status="degraded"
    fi

    if test_graph_auth; then
        ((checks_passed++))
    else
        overall_status="unhealthy"
    fi

    if check_graph_api_availability; then
        ((checks_passed++))
    else
        overall_status="unhealthy"
    fi

    if verify_permissions; then
        ((checks_passed++))
    else
        overall_status="degraded"
    fi

    if check_rate_limits; then
        ((checks_passed++))
    fi

    # Write health report
    cat >> "${HEALTH_CHECK_LOG}" << EOF
{"timestamp":"${TIMESTAMP}","overall_status":"${overall_status}","checks_passed":${checks_passed},"checks_total":${checks_total},"health_score":$(awk "BEGIN {printf \"%.2f\", (${checks_passed}/${checks_total})*100}")}
EOF

    # Dashboard event
    cat >> "${EVENTS_FILE}" << EOF
{"timestamp":"${TIMESTAMP}","event":"msgraph_health_check_complete","severity":"info","source":"health_check","details":{"status":"${overall_status}","checks_passed":${checks_passed},"checks_total":${checks_total}}}
EOF

    log_info "Health Check Summary:"
    log_info "  Status: ${overall_status}"
    log_info "  Checks Passed: ${checks_passed}/${checks_total}"
    log_info "  Health Score: $(awk "BEGIN {printf \"%.2f\", (${checks_passed}/${checks_total})*100}")%"
}

# Main execution
main() {
    log_info "Starting Microsoft Graph MCP Server health check..."
    log_info "Timestamp: ${TIMESTAMP}"

    generate_health_report

    log_success "Health check complete"
}

# Run main if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
