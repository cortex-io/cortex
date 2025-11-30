#!/usr/bin/env bash
#
# Dependency-Track Setup and Initialization
# Deploys Dependency-Track, initializes projects, and configures integration
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
echo -e "${BOLD}║      DEPENDENCY-TRACK SETUP FOR CORTEX SECURITY                ║${NC}"
echo -e "${BOLD}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Step 1: Check prerequisites
echo -e "${BLUE}[1/6] Checking prerequisites...${NC}"

if ! command -v docker &> /dev/null; then
  echo -e "${RED}✗ Docker is not installed${NC}"
  exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
  echo -e "${RED}✗ Docker Compose is not installed${NC}"
  exit 1
fi

if ! command -v jq &> /dev/null; then
  echo -e "${RED}✗ jq is not installed${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Prerequisites met${NC}"
echo ""

# Step 2: Start Dependency-Track
echo -e "${BLUE}[2/6] Starting Dependency-Track containers...${NC}"

cd "$DTRACK_DIR"

# Check if already running
if docker ps | grep -q dtrack-apiserver; then
  echo -e "${YELLOW}Dependency-Track is already running${NC}"
  read -p "Stop and restart? (y/N): " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    docker-compose down
  else
    echo "Using existing deployment"
  fi
fi

# Start containers
if ! docker ps | grep -q dtrack-apiserver; then
  echo "Starting containers (this may take a few minutes)..."
  docker-compose up -d

  echo -e "${GREEN}✓ Containers started${NC}"
else
  echo -e "${GREEN}✓ Containers already running${NC}"
fi

echo ""

# Step 3: Wait for Dependency-Track to be ready
echo -e "${BLUE}[3/6] Waiting for Dependency-Track to initialize...${NC}"
echo "This can take 2-5 minutes on first startup..."

source "$API_LIB"

if ! wait_for_ready 60 10; then
  echo -e "${RED}✗ Failed to start Dependency-Track${NC}"
  echo "Check logs with: docker-compose -f $DTRACK_DIR/docker-compose.yml logs"
  exit 1
fi

echo ""

# Step 4: Get or create API key
echo -e "${BLUE}[4/6] Configuring API access...${NC}"

API_KEY_FILE="$HOME/.cortex/dtrack-api-key"
mkdir -p "$(dirname "$API_KEY_FILE")"

if [ -f "$API_KEY_FILE" ]; then
  echo -e "${GREEN}✓ API key already exists at $API_KEY_FILE${NC}"
else
  echo ""
  echo -e "${YELLOW}${BOLD}MANUAL STEP REQUIRED:${NC}"
  echo ""
  echo "1. Open Dependency-Track in your browser:"
  echo -e "   ${CYAN}http://localhost:8082${NC}"
  echo ""
  echo "2. Login with default credentials:"
  echo "   Username: admin"
  echo "   Password: admin"
  echo ""
  echo "3. Change the admin password (you'll be prompted)"
  echo ""
  echo "4. Navigate to: Administration → Access Management → Teams"
  echo ""
  echo "5. Click on 'Administrators' team"
  echo ""
  echo "6. Click 'API Keys' tab"
  echo ""
  echo "7. Click 'Create API Key'"
  echo ""
  echo "8. Copy the generated API key"
  echo ""
  echo "9. Save it to: $API_KEY_FILE"
  echo ""
  echo -e "${BOLD}Press Enter when you've saved the API key...${NC}"
  read -r

  if [ ! -f "$API_KEY_FILE" ]; then
    echo -e "${RED}✗ API key file not found${NC}"
    echo "Please create the file with your API key and run this script again"
    exit 1
  fi

  chmod 600 "$API_KEY_FILE"
  echo -e "${GREEN}✓ API key configured${NC}"
fi

echo ""

# Step 5: Create projects
echo -e "${BLUE}[5/6] Creating projects in Dependency-Track...${NC}"

source "$API_LIB"
load_api_key

# Define projects based on your repositories
declare -A PROJECTS=(
  ["cortex"]="1.0.0"
  ["driveiq-backend"]="1.0.0"
  ["driveiq-frontend"]="1.0.0"
)

for project_name in "${!PROJECTS[@]}"; do
  version="${PROJECTS[$project_name]}"

  echo -e "Creating project: ${GREEN}$project_name${NC} (v$version)"

  # Create project with tags
  response=$(create_project "$project_name" "$version" "Cortex Security Portfolio - $project_name" '"cortex","security-scan"')
  http_code=$?

  if [ $http_code -eq 201 ] || [ $http_code -eq 200 ]; then
    echo -e "  ${GREEN}✓${NC} Project created successfully"
  else
    echo -e "  ${YELLOW}⚠${NC} Project may already exist (HTTP $http_code)"
  fi
done

echo -e "${GREEN}✓ Projects initialized${NC}"
echo ""

# Step 6: Upload initial SBOMs
echo -e "${BLUE}[6/6] Uploading initial SBOMs...${NC}"

SCAN_DIR="$CORTEX_ROOT/coordination/security/scans"

# Map SBOM files to projects
declare -A SBOM_FILES=(
  ["$SCAN_DIR/cortex-sbom-20251130.json"]="cortex:1.0.0"
  ["$SCAN_DIR/driveiq-backend-sbom-20251130.json"]="driveiq-backend:1.0.0"
  ["$SCAN_DIR/driveiq-frontend-sbom-20251130.json"]="driveiq-frontend:1.0.0"
)

for sbom_file in "${!SBOM_FILES[@]}"; do
  if [ ! -f "$sbom_file" ]; then
    echo -e "${YELLOW}⚠ SBOM not found: $sbom_file${NC}"
    continue
  fi

  project_info="${SBOM_FILES[$sbom_file]}"
  project_name="${project_info%:*}"
  project_version="${project_info#*:}"

  echo -e "Uploading SBOM for: ${GREEN}$project_name${NC} v$project_version"

  response=$(upload_bom "$sbom_file" "$project_name" "$project_version" "true")
  http_code=$?

  if [ $http_code -eq 200 ]; then
    # Extract token from response
    token=$(echo "$response" | head -n -1 | jq -r '.token // "unknown"')
    echo -e "  ${GREEN}✓${NC} Upload successful (token: $token)"
    echo -e "  ${CYAN}Analysis in progress...${NC}"
  else
    echo -e "  ${RED}✗${NC} Upload failed (HTTP $http_code)"
  fi
done

echo -e "${GREEN}✓ Initial SBOMs uploaded${NC}"
echo ""

# Summary
echo -e "${BOLD}════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}✓ SETUP COMPLETE${NC}"
echo -e "${BOLD}════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BOLD}Access Dependency-Track:${NC}"
echo -e "  Frontend: ${CYAN}http://localhost:8082${NC}"
echo -e "  API:      ${CYAN}http://localhost:8081${NC}"
echo ""
echo -e "${BOLD}Monitoring (optional, start with --profile monitoring):${NC}"
echo -e "  Prometheus: ${CYAN}http://localhost:9090${NC}"
echo -e "  Grafana:    ${CYAN}http://localhost:3000${NC} (admin/admin)"
echo ""
echo -e "${BOLD}Next steps:${NC}"
echo "  1. View projects and vulnerabilities in the web UI"
echo "  2. Configure notifications: Administration → Notifications"
echo "  3. Enable CISA KEV: Administration → Analyzers → Known Exploited Vulnerabilities"
echo "  4. Enable EPSS: Administration → Analyzers → EPSS"
echo "  5. Run automated SBOM uploads:"
echo -e "     ${CYAN}scripts/security/dependency-track-upload-sboms.sh${NC}"
echo ""
echo -e "${BOLD}Useful commands:${NC}"
echo "  View logs:     docker-compose -f $DTRACK_DIR/docker-compose.yml logs -f"
echo "  Stop:          docker-compose -f $DTRACK_DIR/docker-compose.yml down"
echo "  Restart:       docker-compose -f $DTRACK_DIR/docker-compose.yml restart"
echo "  Portfolio metrics: scripts/security/dependency-track-report.sh"
echo ""

cd "$CORTEX_ROOT"
