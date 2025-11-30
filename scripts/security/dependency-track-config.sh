#!/usr/bin/env bash
#
# Dependency-Track Configuration Helper
# Interactive tool to configure Dependency-Track settings
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DTRACK_DIR="$CORTEX_ROOT/coordination/security/dependency-track"
API_LIB="$SCRIPT_DIR/dependency-track-api.sh"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║      DEPENDENCY-TRACK CONFIGURATION HELPER                     ║${NC}"
echo -e "${BOLD}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if running
source "$API_LIB"

if ! check_health 2>/dev/null; then
  echo -e "${RED}✗ Dependency-Track is not running${NC}"
  echo "Start it with: ./scripts/security/dependency-track-setup.sh"
  exit 1
fi

echo -e "${GREEN}✓ Dependency-Track is running${NC}"
echo ""

# Main menu
show_menu() {
  echo -e "${BOLD}Configuration Options:${NC}"
  echo ""
  echo "  1. Enable CISA KEV (Known Exploited Vulnerabilities)"
  echo "  2. Enable EPSS (Exploit Prediction Scoring)"
  echo "  3. Configure Webhook Notifications"
  echo "  4. Create Security Policy"
  echo "  5. View Current Configuration"
  echo "  6. Test API Connection"
  echo "  7. Generate API Documentation"
  echo "  8. Exit"
  echo ""
}

# CISA KEV
enable_kev() {
  echo -e "${BLUE}Enabling CISA KEV...${NC}"
  echo ""
  echo "Manual steps required:"
  echo "1. Open: http://localhost:8082"
  echo "2. Navigate to: Administration → Analyzers"
  echo "3. Find: Known Exploited Vulnerabilities"
  echo "4. Click: Enable"
  echo "5. Set update frequency: Daily (recommended)"
  echo ""
  echo "KEV URL: https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"
  echo ""
  echo -e "${GREEN}✓ Instructions displayed${NC}"
  echo ""
}

# EPSS
enable_epss() {
  echo -e "${BLUE}Enabling EPSS...${NC}"
  echo ""
  echo "Manual steps required:"
  echo "1. Open: http://localhost:8082"
  echo "2. Navigate to: Administration → Analyzers"
  echo "3. Find: Exploit Prediction Scoring System (EPSS)"
  echo "4. Click: Enable"
  echo "5. Set update frequency: Daily (recommended)"
  echo ""
  echo "EPSS URL: https://api.first.org/data/v1/epss"
  echo ""
  echo -e "${GREEN}✓ Instructions displayed${NC}"
  echo ""
}

# Webhook
configure_webhook() {
  echo -e "${BLUE}Configuring Webhook Notifications...${NC}"
  echo ""

  # Check if webhook server is running
  if curl -s http://localhost:8888/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Webhook server is running on port 8888${NC}"
  else
    echo -e "${YELLOW}⚠ Webhook server is not running${NC}"
    echo ""
    echo "Start the webhook server:"
    echo -e "  ${CYAN}./scripts/security/dependency-track-webhook-server.sh &${NC}"
    echo ""
  fi

  echo "Configure in Dependency-Track UI:"
  echo ""
  echo "1. Open: http://localhost:8082"
  echo "2. Navigate to: Administration → Notifications → Alerts"
  echo "3. Click: Create Notification"
  echo "4. Configure:"
  echo "   - Name: Cortex Security Webhook"
  echo "   - Scope: Portfolio"
  echo "   - Notification Level: All"
  echo "   - Publisher: Webhook"
  echo "   - Destination: http://host.docker.internal:8888/webhook"
  echo "   - Groups: Select all that apply"
  echo "     ✓ NEW_VULNERABILITY"
  echo "     ✓ NEW_VULNERABLE_DEPENDENCY"
  echo "     ✓ POLICY_VIOLATION"
  echo "     ✓ BOM_CONSUMED"
  echo "     ✓ BOM_PROCESSED"
  echo ""
  echo -e "${GREEN}✓ Configuration instructions displayed${NC}"
  echo ""
}

# Policy
create_policy() {
  echo -e "${BLUE}Creating Security Policy...${NC}"
  echo ""
  echo "Example policies you can create in the UI:"
  echo ""
  echo "1. ${BOLD}Critical Vulnerability Policy${NC}"
  echo "   - Condition: Severity is CRITICAL"
  echo "   - Action: Fail / Alert"
  echo ""
  echo "2. ${BOLD}CISA KEV Policy${NC}"
  echo "   - Condition: Is in CISA KEV catalog"
  echo "   - Action: Fail / Alert"
  echo ""
  echo "3. ${BOLD}High EPSS Score Policy${NC}"
  echo "   - Condition: EPSS score >= 0.7"
  echo "   - Action: Warn"
  echo ""
  echo "4. ${BOLD}Outdated Component Policy${NC}"
  echo "   - Condition: Component age > 730 days"
  echo "   - Action: Warn"
  echo ""
  echo "Create in UI:"
  echo "1. Open: http://localhost:8082"
  echo "2. Navigate to: Policy Management"
  echo "3. Click: Create Policy"
  echo "4. Configure conditions and actions"
  echo ""
  echo -e "${GREEN}✓ Policy templates displayed${NC}"
  echo ""
}

# View config
view_config() {
  echo -e "${BLUE}Current Configuration:${NC}"
  echo ""

  load_api_key

  echo "Connection:"
  echo "  URL: $DTRACK_URL"
  echo "  API Key: $(cat ~/.cortex/dtrack-api-key | head -c 20)..."
  echo ""

  # Get version
  version=$(curl -s "$DTRACK_URL/api/version" 2>/dev/null || echo "unknown")
  echo "Version:"
  echo "  API: $version"
  echo ""

  # Get portfolio metrics
  portfolio=$(get_portfolio_metrics 2>/dev/null | head -n -1 || echo "{}")

  echo "Portfolio:"
  echo "  Projects: $(echo "$portfolio" | jq -r '.projects // "N/A"')"
  echo "  Components: $(echo "$portfolio" | jq -r '.components // "N/A"')"
  echo "  Vulnerabilities: $(echo "$portfolio" | jq -r '.vulnerabilities // "N/A"')"
  echo "  Risk Score: $(echo "$portfolio" | jq -r '.inheritedRiskScore // "N/A"')"
  echo ""

  # Docker status
  echo "Docker Containers:"
  if command -v docker &> /dev/null; then
    docker ps --filter "name=dtrack" --format "  {{.Names}}: {{.Status}}" 2>/dev/null || echo "  Unable to query"
  else
    echo "  Docker not available"
  fi
  echo ""

  echo -e "${GREEN}✓ Configuration displayed${NC}"
  echo ""
}

# Test API
test_api() {
  echo -e "${BLUE}Testing API Connection...${NC}"
  echo ""

  load_api_key

  # Test health
  if check_health; then
    echo ""
  else
    echo ""
    echo -e "${RED}✗ API connection failed${NC}"
    echo ""
    return 1
  fi

  # Test authentication
  echo "Testing authentication..."
  response=$(get_projects 2>/dev/null || echo -e "\n401")
  http_code=$(echo "$response" | tail -n 1)

  if [ "$http_code" = "200" ]; then
    project_count=$(echo "$response" | head -n -1 | jq '. | length')
    echo -e "${GREEN}✓ Authentication successful${NC}"
    echo "  Projects accessible: $project_count"
  else
    echo -e "${RED}✗ Authentication failed (HTTP $http_code)${NC}"
    echo "  Check API key in: ~/.cortex/dtrack-api-key"
  fi

  echo ""
  echo -e "${GREEN}✓ API test complete${NC}"
  echo ""
}

# Generate API docs
generate_docs() {
  echo -e "${BLUE}Generating API Documentation...${NC}"
  echo ""

  local doc_file="$DTRACK_DIR/API-REFERENCE.md"

  cat > "$doc_file" <<'EOF'
# Dependency-Track API Reference

## Base Configuration

```bash
DTRACK_URL=http://localhost:8081
DTRACK_API_KEY=$(cat ~/.cortex/dtrack-api-key)
```

## Common Endpoints

### Get Version
```bash
curl -X GET "$DTRACK_URL/api/version"
```

### Get All Projects
```bash
curl -X GET "$DTRACK_URL/api/v1/project" \
  -H "X-Api-Key: $DTRACK_API_KEY"
```

### Get Project by UUID
```bash
curl -X GET "$DTRACK_URL/api/v1/project/{uuid}" \
  -H "X-Api-Key: $DTRACK_API_KEY"
```

### Upload BOM (SBOM)
```bash
bom_base64=$(base64 < sbom.json | tr -d '\n')

curl -X POST "$DTRACK_URL/api/v1/bom" \
  -H "X-Api-Key: $DTRACK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"projectName\": \"my-project\",
    \"projectVersion\": \"1.0.0\",
    \"autoCreate\": true,
    \"bom\": \"$bom_base64\"
  }"
```

### Get Project Metrics
```bash
curl -X GET "$DTRACK_URL/api/v1/metrics/project/{uuid}/current" \
  -H "X-Api-Key: $DTRACK_API_KEY"
```

### Get Portfolio Metrics
```bash
curl -X GET "$DTRACK_URL/api/v1/metrics/portfolio/current" \
  -H "X-Api-Key: $DTRACK_API_KEY"
```

### Get Project Vulnerabilities
```bash
curl -X GET "$DTRACK_URL/api/v1/vulnerability/project/{uuid}" \
  -H "X-Api-Key: $DTRACK_API_KEY"
```

### Get Project Findings
```bash
curl -X GET "$DTRACK_URL/api/v1/finding/project/{uuid}" \
  -H "X-Api-Key: $DTRACK_API_KEY"
```

## Using the Cortex API Library

```bash
source scripts/security/dependency-track-api.sh
load_api_key

# Check health
check_health

# Get projects
projects=$(get_projects | head -n -1)
echo "$projects" | jq '.[] | {name, version, uuid}'

# Upload SBOM
upload_bom "path/to/sbom.json" "project-name" "version"

# Get metrics
project_uuid="..."
metrics=$(get_project_metrics "$project_uuid" | head -n -1)
echo "$metrics" | jq '{critical, high, medium, low}'
```

## Response Format

All API responses include HTTP status code on last line:
```
{json response}
200
```

Parse with:
```bash
response=$(api_call)
http_code=$(echo "$response" | tail -n 1)
body=$(echo "$response" | head -n -1)
```

## Complete API Documentation

See: https://docs.dependencytrack.org/integrations/rest-api/
EOF

  echo -e "${GREEN}✓ API documentation generated${NC}"
  echo "  File: $doc_file"
  echo ""
}

# Main loop
while true; do
  show_menu
  read -p "Select option (1-8): " choice

  case $choice in
    1)
      enable_kev
      ;;
    2)
      enable_epss
      ;;
    3)
      configure_webhook
      ;;
    4)
      create_policy
      ;;
    5)
      view_config
      ;;
    6)
      test_api
      ;;
    7)
      generate_docs
      ;;
    8)
      echo "Exiting..."
      exit 0
      ;;
    *)
      echo -e "${RED}Invalid option${NC}"
      echo ""
      ;;
  esac

  read -p "Press Enter to continue..."
  clear
done
