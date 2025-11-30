#!/usr/bin/env bash
#
# Dependency-Track Live Monitor
# Real-time dashboard showing vulnerability status across portfolio
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
API_LIB="$SCRIPT_DIR/dependency-track-api.sh"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Refresh interval (seconds)
REFRESH_INTERVAL=${REFRESH_INTERVAL:-30}

# Source API library
source "$API_LIB"

# Check health
if ! check_health 2>/dev/null; then
  echo -e "${RED}✗ Dependency-Track is not running${NC}"
  exit 1
fi

# Load API key
load_api_key

# Function to draw box
draw_box() {
  local width=70
  echo "╔$(printf '═%.0s' $(seq 1 $width))╗"
}

draw_box_bottom() {
  local width=70
  echo "╚$(printf '═%.0s' $(seq 1 $width))╝"
}

draw_separator() {
  local width=70
  echo "╟$(printf '─%.0s' $(seq 1 $width))╢"
}

# Function to center text
center_text() {
  local text="$1"
  local width=70
  local padding=$(( (width - ${#text}) / 2 ))
  printf "║%*s%s%*s║\n" $padding "" "$text" $((width - padding - ${#text})) ""
}

# Function to display project summary
display_project() {
  local project_json="$1"

  local name=$(echo "$project_json" | jq -r '.name')
  local version=$(echo "$project_json" | jq -r '.version')
  local uuid=$(echo "$project_json" | jq -r '.uuid')

  # Get metrics
  local metrics_response=$(get_project_metrics "$uuid" 2>/dev/null || echo -e "\n404")
  local http_code=$(echo "$metrics_response" | tail -n 1)

  if [ "$http_code" != "200" ]; then
    printf "║  %-66s║\n" "$name v$version: Metrics N/A"
    return
  fi

  local metrics=$(echo "$metrics_response" | head -n -1)

  local critical=$(echo "$metrics" | jq -r '.critical // 0')
  local high=$(echo "$metrics" | jq -r '.high // 0')
  local medium=$(echo "$metrics" | jq -r '.medium // 0')
  local low=$(echo "$metrics" | jq -r '.low // 0')
  local vulns=$(echo "$metrics" | jq -r '.vulnerabilities // 0')
  local risk=$(echo "$metrics" | jq -r '.inheritedRiskScore // 0')
  local components=$(echo "$metrics" | jq -r '.components // 0')

  # Status indicator
  local status="${GREEN}✓${NC}"
  if [ "$critical" -gt 0 ]; then
    status="${RED}⚠${NC}"
  elif [ "$high" -gt 0 ]; then
    status="${YELLOW}⚠${NC}"
  fi

  # Project line
  printf "║ %b %-44s %18s ║\n" "$status" "$name v$version" "Risk: $risk"

  # Metrics line
  if [ "$vulns" -gt 0 ]; then
    printf "║   Components: %-6s  Vulns: %-6s  %b%-2s %b%-2s %b%-2s %-2s%b  ║\n" \
      "$components" "$vulns" \
      "${RED}" "C:$critical" \
      "${YELLOW}" "H:$high" \
      "${BLUE}" "M:$medium" \
      "L:$low" "${NC}"
  else
    printf "║   Components: %-6s  ${GREEN}No vulnerabilities${NC}%-26s║\n" "$components" ""
  fi
}

# Main monitoring loop
while true; do
  clear

  # Header
  draw_box
  center_text ""
  center_text "DEPENDENCY-TRACK SECURITY MONITOR"
  center_text "Cortex Portfolio Vulnerability Dashboard"
  center_text ""
  center_text "$(date '+%Y-%m-%d %H:%M:%S')"
  center_text ""
  draw_separator

  # Get portfolio metrics
  portfolio_response=$(get_portfolio_metrics 2>/dev/null || echo -e "{}\n500")
  portfolio_http_code=$(echo "$portfolio_response" | tail -n 1)

  if [ "$portfolio_http_code" = "200" ]; then
    portfolio=$(echo "$portfolio_response" | head -n -1)

    total_projects=$(echo "$portfolio" | jq -r '.projects // 0')
    total_components=$(echo "$portfolio" | jq -r '.components // 0')
    total_vulnerabilities=$(echo "$portfolio" | jq -r '.vulnerabilities // 0')
    critical=$(echo "$portfolio" | jq -r '.critical // 0')
    high=$(echo "$portfolio" | jq -r '.high // 0')
    medium=$(echo "$portfolio" | jq -r '.medium // 0')
    low=$(echo "$portfolio" | jq -r '.low // 0')
    risk_score=$(echo "$portfolio" | jq -r '.inheritedRiskScore // 0')

    # Portfolio summary
    center_text ""
    printf "║  %-23s %44s ║\n" "Portfolio Overview" ""
    printf "║    Projects: %-8s  Components: %-8s  Risk Score: %-8s ║\n" \
      "$total_projects" "$total_components" "$risk_score"
    center_text ""

    # Vulnerability counts
    printf "║  %-23s %44s ║\n" "Total Vulnerabilities: $total_vulnerabilities" ""

    if [ "$total_vulnerabilities" -gt 0 ]; then
      printf "║    %bCritical: %-4s%b  %bHigh: %-4s%b  %bMedium: %-4s%b  Low: %-4s%b  ║\n" \
        "${RED}${BOLD}" "$critical" "${NC}" \
        "${YELLOW}" "$high" "${NC}" \
        "${BLUE}" "$medium" "${NC}" \
        "" "$low" ""
    else
      printf "║    ${GREEN}${BOLD}No vulnerabilities detected${NC}%-35s║\n" ""
    fi

    center_text ""
    draw_separator

    # Project details
    center_text ""
    center_text "PROJECT STATUS"
    center_text ""

    # Get all projects
    projects_response=$(get_projects 2>/dev/null || echo -e "[]\n500")
    projects_http_code=$(echo "$projects_response" | tail -n 1)

    if [ "$projects_http_code" = "200" ]; then
      projects=$(echo "$projects_response" | head -n -1)
      project_count=$(echo "$projects" | jq '. | length')

      if [ "$project_count" -eq 0 ]; then
        center_text "No projects found"
      else
        echo "$projects" | jq -c '.[]' | while read -r project; do
          display_project "$project"
        done
      fi
    else
      center_text "Failed to load projects"
    fi

    center_text ""
  else
    center_text ""
    center_text "ERROR: Unable to fetch portfolio metrics"
    center_text ""
  fi

  draw_separator

  # Footer
  center_text ""
  printf "║  %-68s║\n" "Refresh: ${REFRESH_INTERVAL}s | Press Ctrl+C to exit | Web: http://localhost:8082"
  center_text ""
  draw_box_bottom

  # Wait for refresh
  sleep "$REFRESH_INTERVAL"
done
