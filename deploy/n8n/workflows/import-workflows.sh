#!/bin/bash
# N8N Workflow Import Script
# This script helps import all workflows into N8N

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
N8N_HOST="${N8N_HOST:-localhost}"
N8N_PORT="${N8N_PORT:-5678}"
N8N_PROTOCOL="${N8N_PROTOCOL:-http}"
N8N_API_KEY="${N8N_API_KEY:-}"

WORKFLOW_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}N8N Workflow Import Script${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check if N8N is accessible
echo -e "${YELLOW}Checking N8N accessibility...${NC}"
if curl -s -f "${N8N_PROTOCOL}://${N8N_HOST}:${N8N_PORT}/healthz" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ N8N is accessible at ${N8N_PROTOCOL}://${N8N_HOST}:${N8N_PORT}${NC}"
else
    echo -e "${RED}✗ N8N is not accessible at ${N8N_PROTOCOL}://${N8N_HOST}:${N8N_PORT}${NC}"
    echo -e "${YELLOW}Please check:${NC}"
    echo "  - N8N is running"
    echo "  - N8N_HOST, N8N_PORT, N8N_PROTOCOL are correct"
    echo "  - Firewall allows access"
    exit 1
fi

echo ""
echo -e "${YELLOW}Available workflows:${NC}"
echo "  1. alertmanager-webhook-handler.json - Main alert handling"
echo "  2. alert-escalation-workflow.json - Alert escalation logic"
echo "  3. auto-remediation-workflow.json - Auto-remediation"
echo "  4. daily-health-report.json - Daily health reports"
echo "  5. governance-audit-workflow.json - Governance automation"
echo ""

# Function to import workflow via N8N API
import_workflow() {
    local workflow_file=$1
    local workflow_name=$(basename "$workflow_file" .json)

    echo -e "${YELLOW}Importing ${workflow_name}...${NC}"

    if [ ! -f "$workflow_file" ]; then
        echo -e "${RED}✗ File not found: ${workflow_file}${NC}"
        return 1
    fi

    # Import via API if N8N_API_KEY is set
    if [ -n "$N8N_API_KEY" ]; then
        response=$(curl -s -w "\n%{http_code}" \
            -X POST \
            -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
            -H "Content-Type: application/json" \
            -d @"${workflow_file}" \
            "${N8N_PROTOCOL}://${N8N_HOST}:${N8N_PORT}/api/v1/workflows")

        http_code=$(echo "$response" | tail -n1)
        body=$(echo "$response" | head -n-1)

        if [ "$http_code" -eq 200 ] || [ "$http_code" -eq 201 ]; then
            echo -e "${GREEN}✓ Successfully imported ${workflow_name}${NC}"
            return 0
        else
            echo -e "${RED}✗ Failed to import ${workflow_name} (HTTP ${http_code})${NC}"
            echo "$body"
            return 1
        fi
    else
        echo -e "${YELLOW}  → Manual import required (N8N_API_KEY not set)${NC}"
        echo -e "${YELLOW}  → Import via N8N UI: Workflows > Import from File${NC}"
        echo -e "${YELLOW}  → File: ${workflow_file}${NC}"
        return 0
    fi
}

# Import all workflows
echo -e "${GREEN}Starting workflow import...${NC}"
echo ""

success_count=0
fail_count=0

for workflow in \
    "alertmanager-webhook-handler.json" \
    "alert-escalation-workflow.json" \
    "auto-remediation-workflow.json" \
    "daily-health-report.json" \
    "governance-audit-workflow.json"
do
    if import_workflow "${WORKFLOW_DIR}/${workflow}"; then
        ((success_count++))
    else
        ((fail_count++))
    fi
    echo ""
done

# Summary
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Import Summary${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Successful: ${success_count}${NC}"
if [ $fail_count -gt 0 ]; then
    echo -e "${RED}Failed: ${fail_count}${NC}"
else
    echo -e "${GREEN}Failed: ${fail_count}${NC}"
fi
echo ""

# Configuration reminder
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Next Steps${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""
echo "1. Configure environment variables in N8N:"
echo "   - Copy config-template.env to .env"
echo "   - Update with your actual values"
echo "   - Load in N8N: Settings > Environment Variables"
echo ""
echo "2. Activate each workflow:"
echo "   - Open workflow in N8N UI"
echo "   - Click 'Active' toggle"
echo "   - Verify webhook URLs are registered"
echo ""
echo "3. Configure Alertmanager to send webhooks:"
echo "   - Webhook URL: ${N8N_PROTOCOL}://${N8N_HOST}:${N8N_PORT}/webhook/alertmanager"
echo "   - Update alertmanager.yml with receiver config"
echo ""
echo "4. Test workflows:"
echo "   - See README.md for test commands"
echo "   - Verify notifications in Slack/Email"
echo ""
echo -e "${GREEN}For detailed documentation, see README.md${NC}"
echo ""

if [ $fail_count -eq 0 ] && [ -z "$N8N_API_KEY" ]; then
    echo -e "${YELLOW}Note: API key not provided, workflows listed for manual import${NC}"
    echo -e "${YELLOW}Set N8N_API_KEY environment variable for automatic import${NC}"
    echo ""
fi

exit 0
