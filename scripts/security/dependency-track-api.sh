#!/usr/bin/env bash
#
# Dependency-Track API Integration Library
# Provides functions for interacting with Dependency-Track REST API
#

set -euo pipefail

# Configuration
DTRACK_URL="${DTRACK_URL:-http://localhost:8081}"
DTRACK_API_KEY_FILE="${DTRACK_API_KEY_FILE:-$HOME/.cortex/dtrack-api-key}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Load API key
load_api_key() {
  if [ -f "$DTRACK_API_KEY_FILE" ]; then
    DTRACK_API_KEY=$(cat "$DTRACK_API_KEY_FILE")
  else
    echo -e "${RED}ERROR: API key file not found: $DTRACK_API_KEY_FILE${NC}" >&2
    echo "Please run: scripts/security/dependency-track-setup.sh" >&2
    exit 1
  fi
}

# Make API request
api_request() {
  local method="$1"
  local endpoint="$2"
  local data="${3:-}"

  local url="${DTRACK_URL}/api/v1${endpoint}"

  local curl_args=(
    -X "$method"
    -H "X-Api-Key: $DTRACK_API_KEY"
    -H "Content-Type: application/json"
    -H "Accept: application/json"
    -s
    -w "\n%{http_code}"
  )

  if [ -n "$data" ]; then
    curl_args+=(-d "$data")
  fi

  curl "${curl_args[@]}" "$url"
}

# Upload file (for SBOM)
api_upload() {
  local endpoint="$1"
  local file_path="$2"
  local project_name="$3"
  local project_version="$4"
  local auto_create="${5:-true}"

  local url="${DTRACK_URL}/api/v1${endpoint}"

  # Base64 encode the BOM
  local bom_base64=$(base64 < "$file_path" | tr -d '\n')

  # Create JSON payload
  local payload=$(cat <<EOF
{
  "projectName": "$project_name",
  "projectVersion": "$project_version",
  "autoCreate": $auto_create,
  "bom": "$bom_base64"
}
EOF
)

  curl -X POST "$url" \
    -H "X-Api-Key: $DTRACK_API_KEY" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -s \
    -w "\n%{http_code}" \
    -d "$payload"
}

# Get all projects
get_projects() {
  api_request "GET" "/project"
}

# Get project by name and version
get_project() {
  local name="$1"
  local version="$2"

  api_request "GET" "/project/lookup?name=$(urlencode "$name")&version=$(urlencode "$version")"
}

# Create project
create_project() {
  local name="$1"
  local version="$2"
  local description="${3:-}"
  local tags="${4:-}"

  local data=$(cat <<EOF
{
  "name": "$name",
  "version": "$version",
  "description": "$description",
  "tags": [$tags],
  "active": true
}
EOF
)

  api_request "POST" "/project" "$data"
}

# Get project metrics
get_project_metrics() {
  local project_uuid="$1"

  api_request "GET" "/metrics/project/$project_uuid/current"
}

# Get project vulnerabilities
get_project_vulnerabilities() {
  local project_uuid="$1"

  api_request "GET" "/vulnerability/project/$project_uuid"
}

# Get findings for project
get_project_findings() {
  local project_uuid="$1"
  local suppressed="${2:-false}"

  api_request "GET" "/finding/project/$project_uuid?suppressed=$suppressed"
}

# Upload BOM (SBOM)
upload_bom() {
  local file_path="$1"
  local project_name="$2"
  local project_version="$3"
  local auto_create="${4:-true}"

  echo -e "${BLUE}Uploading SBOM to Dependency-Track...${NC}" >&2
  echo -e "  Project: ${GREEN}$project_name${NC}" >&2
  echo -e "  Version: ${GREEN}$project_version${NC}" >&2
  echo -e "  File: $file_path" >&2

  api_upload "/bom" "$file_path" "$project_name" "$project_version" "$auto_create"
}

# Get portfolio metrics (all projects)
get_portfolio_metrics() {
  api_request "GET" "/metrics/portfolio/current"
}

# URL encode function
urlencode() {
  local string="$1"
  echo "$string" | jq -sRr @uri
}

# Parse response and extract HTTP code
parse_response() {
  local response="$1"

  # Get last line (HTTP code)
  local http_code=$(echo "$response" | tail -n 1)

  # Get all but last line (body)
  local body=$(echo "$response" | sed '$d')

  echo "$body"
  return $http_code
}

# Check if Dependency-Track is healthy
check_health() {
  local response=$(curl -s -w "\n%{http_code}" "${DTRACK_URL}/api/version" || echo "000")
  local http_code=$(echo "$response" | tail -n 1)

  if [ "$http_code" = "200" ]; then
    echo -e "${GREEN}✓ Dependency-Track is healthy${NC}" >&2
    return 0
  else
    echo -e "${RED}✗ Dependency-Track is not responding (HTTP $http_code)${NC}" >&2
    return 1
  fi
}

# Wait for Dependency-Track to be ready
wait_for_ready() {
  local max_attempts="${1:-30}"
  local sleep_time="${2:-10}"

  echo -e "${BLUE}Waiting for Dependency-Track to be ready...${NC}" >&2

  for i in $(seq 1 "$max_attempts"); do
    if check_health 2>/dev/null; then
      echo -e "${GREEN}✓ Dependency-Track is ready!${NC}" >&2
      return 0
    fi

    echo -e "${YELLOW}Attempt $i/$max_attempts: Not ready yet, waiting ${sleep_time}s...${NC}" >&2
    sleep "$sleep_time"
  done

  echo -e "${RED}✗ Dependency-Track failed to become ready after $max_attempts attempts${NC}" >&2
  return 1
}

# Get vulnerability by CVE ID
get_vulnerability() {
  local cve_id="$1"

  api_request "GET" "/vulnerability/source/NVD/vuln/$cve_id"
}

# Export library functions
export -f load_api_key
export -f api_request
export -f api_upload
export -f get_projects
export -f get_project
export -f create_project
export -f get_project_metrics
export -f get_project_vulnerabilities
export -f get_project_findings
export -f upload_bom
export -f get_portfolio_metrics
export -f urlencode
export -f parse_response
export -f check_health
export -f wait_for_ready
export -f get_vulnerability
