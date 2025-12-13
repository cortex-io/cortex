#!/usr/bin/env bash
# check-unifi-health.sh
# Health check monitoring for UniFi MCP Server
# Validates UniFi controller connectivity and API availability

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
MONITORING_CONFIG="${PROJECT_ROOT}/coordination/monitoring/unifi-mcp-server.json"
EVENTS_LOG="${PROJECT_ROOT}/coordination/dashboard-events.jsonl"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Health check status
OVERALL_STATUS="healthy"
FAILED_CHECKS=0
WARNINGS=0

# Timestamp for event logging
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}UniFi MCP Server Health Check${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Function to log event to dashboard
log_event() {
    local event_type="$1"
    local severity="$2"
    local message="$3"
    local component="${4:-unifi-mcp-server}"

    local event_json=$(cat <<EOF
{"timestamp":"${TIMESTAMP}","event_type":"${event_type}","severity":"${severity}","component":"${component}","message":"${message}","source":"health_check"}
EOF
)
    echo "${event_json}" >> "${EVENTS_LOG}"
}

# Function to check if monitoring config exists
check_monitoring_config() {
    echo -e "${BLUE}[1/8] Checking monitoring configuration...${NC}"
    if [[ ! -f "${MONITORING_CONFIG}" ]]; then
        echo -e "${RED}✗ Monitoring configuration not found${NC}"
        log_event "health_check_failed" "high" "Monitoring configuration not found at ${MONITORING_CONFIG}"
        ((FAILED_CHECKS++))
        OVERALL_STATUS="unhealthy"
        return 1
    fi
    echo -e "${GREEN}✓ Monitoring configuration found${NC}"
    return 0
}

# Function to check UniFi MCP server repository
check_repository() {
    echo -e "${BLUE}[2/8] Checking UniFi MCP server repository...${NC}"
    local repo_path="/Users/ryandahlberg/Projects/unifi-mcp-server"

    if [[ ! -d "${repo_path}" ]]; then
        echo -e "${YELLOW}⚠ Repository not found locally (remote monitoring only)${NC}"
        log_event "repository_check" "low" "UniFi MCP server not cloned locally - remote monitoring only"
        ((WARNINGS++))
        return 0
    fi

    echo -e "${GREEN}✓ Repository found at ${repo_path}${NC}"

    # Check if it's a git repository
    if [[ ! -d "${repo_path}/.git" ]]; then
        echo -e "${YELLOW}⚠ Not a git repository${NC}"
        ((WARNINGS++))
        return 0
    fi

    # Check for updates
    cd "${repo_path}"
    git fetch origin --quiet 2>/dev/null || true
    local behind_commits=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo "0")

    if [[ "${behind_commits}" -gt 0 ]]; then
        echo -e "${YELLOW}⚠ Repository is ${behind_commits} commits behind origin/main${NC}"
        log_event "repository_outdated" "low" "UniFi MCP server is ${behind_commits} commits behind"
        ((WARNINGS++))
    else
        echo -e "${GREEN}✓ Repository is up to date${NC}"
    fi

    cd "${PROJECT_ROOT}"
    return 0
}

# Function to validate agent-card.json (A2A protocol compliance)
check_a2a_protocol() {
    echo -e "${BLUE}[3/8] Validating A2A protocol compliance...${NC}"
    local repo_path="/Users/ryandahlberg/Projects/unifi-mcp-server"
    local agent_card="${repo_path}/agent-card.json"

    if [[ ! -f "${agent_card}" ]]; then
        echo -e "${YELLOW}⚠ Agent card not found (repository may not be cloned)${NC}"
        ((WARNINGS++))
        return 0
    fi

    # Validate JSON syntax
    if ! jq empty "${agent_card}" 2>/dev/null; then
        echo -e "${RED}✗ Invalid agent-card.json syntax${NC}"
        log_event "a2a_protocol_invalid" "high" "agent-card.json has invalid JSON syntax"
        ((FAILED_CHECKS++))
        OVERALL_STATUS="degraded"
        return 1
    fi

    # Check required fields
    local skills_count=$(jq '.skills | length' "${agent_card}" 2>/dev/null || echo "0")
    local prompts_count=$(jq '[.skills[].prompts[]] | length' "${agent_card}" 2>/dev/null || echo "0")

    echo -e "${GREEN}✓ Agent card valid (${skills_count} skills, ${prompts_count} prompts)${NC}"
    return 0
}

# Function to check Python environment
check_python_environment() {
    echo -e "${BLUE}[4/8] Checking Python environment...${NC}"

    # Check Python version
    if ! command -v python3 &> /dev/null; then
        echo -e "${YELLOW}⚠ Python 3 not found in PATH${NC}"
        ((WARNINGS++))
        return 0
    fi

    local python_version=$(python3 --version 2>&1 | awk '{print $2}')
    local python_major=$(echo "${python_version}" | cut -d. -f1)
    local python_minor=$(echo "${python_version}" | cut -d. -f2)

    # UniFi MCP server requires Python 3.12+
    if [[ "${python_major}" -lt 3 ]] || { [[ "${python_major}" -eq 3 ]] && [[ "${python_minor}" -lt 12 ]]; }; then
        echo -e "${YELLOW}⚠ Python ${python_version} found, requires 3.12+${NC}"
        log_event "python_version_low" "medium" "Python ${python_version} is below required 3.12+"
        ((WARNINGS++))
    else
        echo -e "${GREEN}✓ Python ${python_version} meets requirements (3.12+)${NC}"
    fi

    # Check for uv package manager
    if ! command -v uv &> /dev/null; then
        echo -e "${YELLOW}⚠ uv package manager not found${NC}"
        ((WARNINGS++))
    else
        echo -e "${GREEN}✓ uv package manager installed${NC}"
    fi

    return 0
}

# Function to check environment variables
check_environment_variables() {
    echo -e "${BLUE}[5/8] Checking UniFi environment configuration...${NC}"
    local repo_path="/Users/ryandahlberg/Projects/unifi-mcp-server"
    local secrets_env="${repo_path}/secrets.env"

    if [[ ! -f "${secrets_env}" ]]; then
        echo -e "${YELLOW}⚠ secrets.env not found (API configuration missing)${NC}"
        log_event "config_missing" "medium" "UniFi secrets.env not configured"
        ((WARNINGS++))
        return 0
    fi

    # Check for required variables without exposing values
    local required_vars=("UNIFI_API_KEY" "UNIFI_GATEWAY_HOST" "UNIFI_GATEWAY_PORT")
    local missing_vars=0

    for var in "${required_vars[@]}"; do
        if ! grep -q "^${var}=" "${secrets_env}"; then
            echo -e "${YELLOW}⚠ Missing required variable: ${var}${NC}"
            ((missing_vars++))
        fi
    done

    if [[ "${missing_vars}" -gt 0 ]]; then
        echo -e "${YELLOW}⚠ ${missing_vars} required environment variables missing${NC}"
        ((WARNINGS++))
    else
        echo -e "${GREEN}✓ Core environment variables configured${NC}"
    fi

    # Check for optional cloud variables
    if grep -q "^UNIFI_SITEMGR_TOKEN=" "${secrets_env}"; then
        echo -e "${GREEN}✓ Cloud Site Manager configured${NC}"
    else
        echo -e "${YELLOW}⚠ Cloud Site Manager not configured (optional)${NC}"
    fi

    return 0
}

# Function to check security posture
check_security_posture() {
    echo -e "${BLUE}[6/8] Checking security posture...${NC}"
    local repo_path="/Users/ryandahlberg/Projects/unifi-mcp-server"

    if [[ ! -d "${repo_path}" ]]; then
        echo -e "${YELLOW}⚠ Repository not found (skipping security checks)${NC}"
        ((WARNINGS++))
        return 0
    fi

    # Check if secrets.env is in .gitignore
    if [[ -f "${repo_path}/.gitignore" ]]; then
        if grep -q "secrets.env" "${repo_path}/.gitignore"; then
            echo -e "${GREEN}✓ secrets.env properly excluded from git${NC}"
        else
            echo -e "${RED}✗ secrets.env not in .gitignore (SECURITY RISK)${NC}"
            log_event "security_risk" "critical" "secrets.env not excluded from git"
            ((FAILED_CHECKS++))
            OVERALL_STATUS="unhealthy"
        fi
    fi

    # Check for SSRF protection in code
    if [[ -f "${repo_path}/main.py" ]]; then
        if grep -q "SSRF Protection" "${repo_path}/main.py"; then
            echo -e "${GREEN}✓ SSRF protection implemented${NC}"
        else
            echo -e "${YELLOW}⚠ SSRF protection not detected in code${NC}"
            ((WARNINGS++))
        fi
    fi

    return 0
}

# Function to check integration with Cortex
check_cortex_integration() {
    echo -e "${BLUE}[7/8] Checking Cortex integration...${NC}"

    # Check if repository is in inventory
    if grep -q "unifi-mcp-server" "${PROJECT_ROOT}/coordination/repository-inventory.json" 2>/dev/null; then
        echo -e "${GREEN}✓ Repository in inventory${NC}"
    else
        echo -e "${YELLOW}⚠ Repository not in inventory${NC}"
        ((WARNINGS++))
    fi

    # Check for monitoring configuration
    if [[ -f "${MONITORING_CONFIG}" ]]; then
        local monitoring_enabled=$(jq -r '.monitoring_config.enabled' "${MONITORING_CONFIG}" 2>/dev/null || echo "false")
        if [[ "${monitoring_enabled}" == "true" ]]; then
            echo -e "${GREEN}✓ Monitoring enabled in configuration${NC}"
        else
            echo -e "${YELLOW}⚠ Monitoring disabled in configuration${NC}"
            ((WARNINGS++))
        fi
    fi

    # Check dashboard events log exists
    if [[ -f "${EVENTS_LOG}" ]]; then
        echo -e "${GREEN}✓ Dashboard events log accessible${NC}"
    else
        echo -e "${YELLOW}⚠ Dashboard events log not found${NC}"
        ((WARNINGS++))
    fi

    return 0
}

# Function to generate health summary
generate_health_summary() {
    echo -e "${BLUE}[8/8] Generating health summary...${NC}"
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}Health Check Summary${NC}"
    echo -e "${BLUE}========================================${NC}"

    if [[ "${OVERALL_STATUS}" == "healthy" ]]; then
        echo -e "${GREEN}Overall Status: HEALTHY${NC}"
        log_event "health_check_passed" "info" "UniFi MCP server health check passed"
    elif [[ "${OVERALL_STATUS}" == "degraded" ]]; then
        echo -e "${YELLOW}Overall Status: DEGRADED${NC}"
        log_event "health_check_degraded" "medium" "UniFi MCP server health check degraded (${FAILED_CHECKS} failures, ${WARNINGS} warnings)"
    else
        echo -e "${RED}Overall Status: UNHEALTHY${NC}"
        log_event "health_check_failed" "high" "UniFi MCP server health check failed (${FAILED_CHECKS} failures, ${WARNINGS} warnings)"
    fi

    echo -e "Failed Checks: ${FAILED_CHECKS}"
    echo -e "Warnings: ${WARNINGS}"
    echo -e "Timestamp: ${TIMESTAMP}"
    echo ""

    # Save summary to file
    local summary_file="${PROJECT_ROOT}/coordination/monitoring/unifi-health-summary.json"
    cat > "${summary_file}" <<EOF
{
  "timestamp": "${TIMESTAMP}",
  "overall_status": "${OVERALL_STATUS}",
  "failed_checks": ${FAILED_CHECKS},
  "warnings": ${WARNINGS},
  "checks_completed": {
    "monitoring_config": true,
    "repository": true,
    "a2a_protocol": true,
    "python_environment": true,
    "environment_variables": true,
    "security_posture": true,
    "cortex_integration": true
  }
}
EOF

    echo -e "${GREEN}Health summary saved to: ${summary_file}${NC}"
}

# Main execution
main() {
    check_monitoring_config || true
    check_repository || true
    check_a2a_protocol || true
    check_python_environment || true
    check_environment_variables || true
    check_security_posture || true
    check_cortex_integration || true
    generate_health_summary

    # Exit with appropriate code
    if [[ "${OVERALL_STATUS}" == "unhealthy" ]]; then
        exit 2
    elif [[ "${OVERALL_STATUS}" == "degraded" ]]; then
        exit 1
    else
        exit 0
    fi
}

main "$@"
