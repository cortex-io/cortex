#!/usr/bin/env bash
#
# Generate Dependency-Track Portfolio Report
# Fetches vulnerability metrics and generates comprehensive security report
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
API_LIB="$SCRIPT_DIR/dependency-track-api.sh"
REPORT_DIR="$CORTEX_ROOT/coordination/security/dependency-track/reports"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Create report directory
mkdir -p "$REPORT_DIR"

REPORT_FILE="$REPORT_DIR/portfolio-report-$(date +%Y%m%d-%H%M%S).txt"
JSON_REPORT="$REPORT_DIR/portfolio-report-$(date +%Y%m%d-%H%M%S).json"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║      DEPENDENCY-TRACK PORTFOLIO SECURITY REPORT                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Source API library
source "$API_LIB"

# Check health
if ! check_health; then
  echo -e "${RED}✗ Dependency-Track is not running${NC}"
  exit 1
fi

# Load API key
load_api_key

# Initialize report
{
  echo "CORTEX SECURITY PORTFOLIO REPORT"
  echo "Generated: $(date)"
  echo "Dependency-Track: $DTRACK_URL"
  echo ""
  echo "════════════════════════════════════════════════════════════════"
  echo ""
} > "$REPORT_FILE"

# Get portfolio metrics
echo -e "${BLUE}Fetching portfolio metrics...${NC}"

portfolio_response=$(get_portfolio_metrics)
portfolio_http_code=$?

if [ $portfolio_http_code -ne 200 ]; then
  echo -e "${RED}✗ Failed to fetch portfolio metrics (HTTP $portfolio_http_code)${NC}"
  exit 1
fi

portfolio=$(echo "$portfolio_response" | head -n -1)

# Extract metrics
total_projects=$(echo "$portfolio" | jq -r '.projects // 0')
total_components=$(echo "$portfolio" | jq -r '.components // 0')
total_vulnerabilities=$(echo "$portfolio" | jq -r '.vulnerabilities // 0')
critical=$(echo "$portfolio" | jq -r '.critical // 0')
high=$(echo "$portfolio" | jq -r '.high // 0')
medium=$(echo "$portfolio" | jq -r '.medium // 0')
low=$(echo "$portfolio" | jq -r '.low // 0')
unassigned=$(echo "$portfolio" | jq -r '.unassigned // 0')
risk_score=$(echo "$portfolio" | jq -r '.inheritedRiskScore // 0')

# Display portfolio summary
{
  echo "PORTFOLIO OVERVIEW"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "Total Projects:        $total_projects"
  echo "Total Components:      $total_components"
  echo "Total Vulnerabilities: $total_vulnerabilities"
  echo "Inherited Risk Score:  $risk_score"
  echo ""
  echo "VULNERABILITY BREAKDOWN"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "Critical:    $critical"
  echo "High:        $high"
  echo "Medium:      $medium"
  echo "Low:         $low"
  echo "Unassigned:  $unassigned"
  echo ""
  echo ""
} >> "$REPORT_FILE"

# Console output
echo ""
echo -e "${BOLD}Portfolio Overview:${NC}"
echo -e "  Projects:        ${CYAN}$total_projects${NC}"
echo -e "  Components:      ${CYAN}$total_components${NC}"
echo -e "  Vulnerabilities: ${CYAN}$total_vulnerabilities${NC}"
echo -e "  Risk Score:      ${CYAN}$risk_score${NC}"
echo ""
echo -e "${BOLD}Vulnerability Severity:${NC}"
echo -e "  ${RED}Critical: $critical${NC}"
echo -e "  ${YELLOW}High:     $high${NC}"
echo -e "  ${BLUE}Medium:   $medium${NC}"
echo -e "  Low:      $low"
echo -e "  Unassigned: $unassigned"
echo ""

# Get all projects
echo -e "${BLUE}Fetching project details...${NC}"

projects_response=$(get_projects)
projects_http_code=$?

if [ $projects_http_code -ne 200 ]; then
  echo -e "${RED}✗ Failed to fetch projects (HTTP $projects_http_code)${NC}"
  exit 1
fi

projects=$(echo "$projects_response" | head -n -1)

# Process each project
{
  echo "PROJECT DETAILS"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
} >> "$REPORT_FILE"

project_count=$(echo "$projects" | jq '. | length')

if [ "$project_count" -eq 0 ]; then
  echo "No projects found" >> "$REPORT_FILE"
else
  echo "$projects" | jq -c '.[]' | while read -r project; do
    project_name=$(echo "$project" | jq -r '.name')
    project_version=$(echo "$project" | jq -r '.version')
    project_uuid=$(echo "$project" | jq -r '.uuid')
    active=$(echo "$project" | jq -r '.active')

    echo -e "${CYAN}  • $project_name${NC} v$project_version"

    {
      echo "Project: $project_name"
      echo "Version: $project_version"
      echo "UUID:    $project_uuid"
      echo "Active:  $active"
    } >> "$REPORT_FILE"

    # Get project metrics
    metrics_response=$(get_project_metrics "$project_uuid" 2>/dev/null || echo -e "\n404")
    metrics_http_code=$(echo "$metrics_response" | tail -n 1)

    if [ "$metrics_http_code" = "200" ]; then
      metrics=$(echo "$metrics_response" | head -n -1)

      proj_critical=$(echo "$metrics" | jq -r '.critical // 0')
      proj_high=$(echo "$metrics" | jq -r '.high // 0')
      proj_medium=$(echo "$metrics" | jq -r '.medium // 0')
      proj_low=$(echo "$metrics" | jq -r '.low // 0')
      proj_components=$(echo "$metrics" | jq -r '.components // 0')
      proj_vulns=$(echo "$metrics" | jq -r '.vulnerabilities // 0')
      proj_risk=$(echo "$metrics" | jq -r '.inheritedRiskScore // 0')

      {
        echo ""
        echo "  Components:      $proj_components"
        echo "  Vulnerabilities: $proj_vulns"
        echo "  Risk Score:      $proj_risk"
        echo ""
        echo "  Severity Breakdown:"
        echo "    Critical: $proj_critical"
        echo "    High:     $proj_high"
        echo "    Medium:   $proj_medium"
        echo "    Low:      $proj_low"
      } >> "$REPORT_FILE"

      # Display in console
      if [ "$proj_vulns" -gt 0 ]; then
        echo -e "    Vulnerabilities: ${YELLOW}$proj_vulns${NC} (Risk: $proj_risk)"
        if [ "$proj_critical" -gt 0 ]; then
          echo -e "    ${RED}⚠ Critical: $proj_critical${NC}"
        fi
        if [ "$proj_high" -gt 0 ]; then
          echo -e "    ${YELLOW}⚠ High: $proj_high${NC}"
        fi
      else
        echo -e "    ${GREEN}✓ No vulnerabilities${NC}"
      fi
    else
      echo "  Metrics: Not available" >> "$REPORT_FILE"
      echo -e "    ${YELLOW}Metrics not available${NC}"
    fi

    echo "" >> "$REPORT_FILE"
    echo "────────────────────────────────────────────────────────────────" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
  done
fi

# Save JSON report
{
  echo "$portfolio" | jq -s '{
    report_timestamp: (now | strftime("%Y-%m-%dT%H:%M:%SZ")),
    portfolio_metrics: .[0],
    projects: []
  }'
} > "$JSON_REPORT"

# Add individual project data
echo "$projects" | jq -c '.[]' | while read -r project; do
  project_uuid=$(echo "$project" | jq -r '.uuid')

  metrics_response=$(get_project_metrics "$project_uuid" 2>/dev/null || echo "{}")
  metrics=$(echo "$metrics_response" | head -n -1)

  combined=$(echo "$project" "$metrics" | jq -s '.[0] + {metrics: .[1]}')

  jq --argjson proj "$combined" '.projects += [$proj]' "$JSON_REPORT" > "${JSON_REPORT}.tmp"
  mv "${JSON_REPORT}.tmp" "$JSON_REPORT"
done

# Footer
{
  echo ""
  echo "════════════════════════════════════════════════════════════════"
  echo "Report generated by Cortex Security Master"
  echo "$(date)"
} >> "$REPORT_FILE"

echo ""
echo -e "${GREEN}✓ Report generated${NC}"
echo ""
echo "Text Report: $REPORT_FILE"
echo "JSON Report: $JSON_REPORT"
echo ""
echo -e "${BOLD}Recommendations:${NC}"

if [ "$critical" -gt 0 ]; then
  echo -e "  ${RED}⚠ CRITICAL:${NC} $critical critical vulnerabilities require immediate attention"
fi

if [ "$high" -gt 0 ]; then
  echo -e "  ${YELLOW}⚠ HIGH:${NC} $high high-severity vulnerabilities should be addressed soon"
fi

if [ "$total_vulnerabilities" -eq 0 ]; then
  echo -e "  ${GREEN}✓ EXCELLENT:${NC} No vulnerabilities detected in portfolio"
fi

echo ""
echo "View in web UI: http://localhost:8082"
echo ""

# Cat report to console
cat "$REPORT_FILE"
