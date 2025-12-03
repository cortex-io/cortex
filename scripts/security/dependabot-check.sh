#!/bin/bash
#
# Dependabot Security Check Script
# Queries GitHub Dependabot API and provides CVE vulnerability status
#
# Usage: ./dependabot-check.sh [repo-owner/repo-name]
# Example: ./dependabot-check.sh ry-ops/cortex

set -euo pipefail

# Configuration
REPO="${1:-ry-ops/cortex}"
OUTPUT_FORMAT="${2:-summary}"  # Options: summary, json, detailed

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to check if gh CLI is available
check_gh_cli() {
    if ! command -v gh &> /dev/null; then
        echo -e "${RED}Error: GitHub CLI (gh) is not installed${NC}"
        echo "Install with: brew install gh"
        exit 1
    fi
}

# Function to fetch Dependabot alerts
fetch_dependabot_alerts() {
    local repo=$1
    gh api "repos/$repo/dependabot/alerts" --jq '.' 2>/dev/null || {
        echo -e "${RED}Error: Failed to fetch Dependabot alerts${NC}"
        echo "Make sure Dependabot is enabled for this repository"
        exit 1
    }
}

# Function to generate summary report
generate_summary() {
    local alerts=$1

    # Count by severity
    local critical=$(echo "$alerts" | jq '[.[] | select(.security_advisory.severity == "critical")] | length')
    local high=$(echo "$alerts" | jq '[.[] | select(.security_advisory.severity == "high")] | length')
    local medium=$(echo "$alerts" | jq '[.[] | select(.security_advisory.severity == "medium")] | length')
    local low=$(echo "$alerts" | jq '[.[] | select(.security_advisory.severity == "low")] | length')
    local total=$(echo "$alerts" | jq 'length')

    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Dependabot Security Status: $REPO${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

    # Overall status
    if [ "$total" -eq 0 ]; then
        echo -e "${GREEN}✓ No vulnerabilities found${NC}\n"
        return 0
    fi

    echo -e "${RED}⚠ Total Vulnerabilities: $total${NC}\n"

    # Severity breakdown
    echo "Severity Breakdown:"
    [ "$critical" -gt 0 ] && echo -e "  ${RED}● Critical: $critical${NC}"
    [ "$high" -gt 0 ] && echo -e "  ${YELLOW}● High: $high${NC}"
    [ "$medium" -gt 0 ] && echo -e "  ${BLUE}● Medium: $medium${NC}"
    [ "$low" -gt 0 ] && echo -e "  ${GREEN}● Low: $low${NC}"

    echo ""

    # Top vulnerable packages
    echo "Top Affected Packages:"
    echo "$alerts" | jq -r '
        group_by(.dependency.package.name) |
        map({
            package: .[0].dependency.package.name,
            count: length,
            max_severity: (map(.security_advisory.severity) | max)
        }) |
        sort_by(-.count) |
        limit(10; .[]) |
        "  • \(.package) (\(.count) alert\(if .count > 1 then "s" else "" end), \(.max_severity) severity)"
    '

    echo ""
    echo -e "${BLUE}View details: https://github.com/$REPO/security/dependabot${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

# Function to generate detailed report
generate_detailed() {
    local alerts=$1

    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Detailed Vulnerability Report: $REPO${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

    echo "$alerts" | jq -r '
        group_by(.security_advisory.severity) |
        reverse |
        .[] |
        "\n" + (.[0].security_advisory.severity | ascii_upcase) + " SEVERITY (" + (length | tostring) + " alerts):\n" +
        "----------------------------------------\n" +
        (.[] |
            "Package: \(.dependency.package.name)\n" +
            "Summary: \(.security_advisory.summary)\n" +
            "Patched: \(.security_vulnerability.first_patched_version.identifier // "N/A")\n" +
            "CVE: \(.security_advisory.cve_id // "N/A")\n" +
            "URL: \(.html_url)\n"
        )
    '

    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

# Function to generate JSON output
generate_json() {
    local alerts=$1

    echo "$alerts" | jq '{
        repository: "'$REPO'",
        timestamp: (now | strftime("%Y-%m-%dT%H:%M:%SZ")),
        summary: {
            total: length,
            critical: [.[] | select(.security_advisory.severity == "critical")] | length,
            high: [.[] | select(.security_advisory.severity == "high")] | length,
            medium: [.[] | select(.security_advisory.severity == "medium")] | length,
            low: [.[] | select(.security_advisory.severity == "low")] | length
        },
        alerts: [.[] | {
            severity: .security_advisory.severity,
            package: .dependency.package.name,
            summary: .security_advisory.summary,
            cve_id: .security_advisory.cve_id,
            patched_version: .security_vulnerability.first_patched_version.identifier,
            url: .html_url
        }]
    }'
}

# Main execution
main() {
    check_gh_cli

    # Only show fetching message if not JSON output
    if [ "$OUTPUT_FORMAT" != "json" ]; then
        echo "Fetching Dependabot alerts for $REPO..."
    fi
    local alerts=$(fetch_dependabot_alerts "$REPO")

    case "$OUTPUT_FORMAT" in
        json)
            generate_json "$alerts"
            ;;
        detailed)
            generate_detailed "$alerts"
            ;;
        summary|*)
            generate_summary "$alerts"
            ;;
    esac

    # Exit with error code if vulnerabilities found
    local total=$(echo "$alerts" | jq 'length')
    if [ "$total" -gt 0 ]; then
        exit 1
    fi
}

main
