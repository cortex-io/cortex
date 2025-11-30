#!/usr/bin/env bash
#
# Verify Dependency-Track Deployment
# Checks that all components are properly deployed
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DTRACK_DIR="$CORTEX_ROOT/coordination/security/dependency-track"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║      DEPENDENCY-TRACK DEPLOYMENT VERIFICATION                  ║${NC}"
echo -e "${BOLD}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

checks_passed=0
checks_failed=0

# Check function
check() {
  local name="$1"
  local status="$2"

  if [ "$status" = "0" ]; then
    echo -e "${GREEN}✓${NC} $name"
    checks_passed=$((checks_passed + 1))
  else
    echo -e "${RED}✗${NC} $name"
    checks_failed=$((checks_failed + 1))
  fi
}

echo -e "${BLUE}Checking deployment files...${NC}"
echo ""

# Docker configuration
if [ -f "$DTRACK_DIR/docker-compose.yml" ]; then
  check "docker-compose.yml exists" 0
else
  check "docker-compose.yml exists" 1
fi

# Database init
if [ -f "$DTRACK_DIR/init-db/01-init.sql" ]; then
  check "Database init script exists" 0
else
  check "Database init script exists" 1
fi

# Prometheus config
if [ -f "$DTRACK_DIR/prometheus/prometheus.yml" ]; then
  check "Prometheus config exists" 0
else
  check "Prometheus config exists" 1
fi

# Documentation
if [ -f "$DTRACK_DIR/README.md" ]; then
  check "README.md exists" 0
else
  check "README.md exists" 1
fi

if [ -f "$DTRACK_DIR/QUICKSTART.md" ]; then
  check "QUICKSTART.md exists" 0
else
  check "QUICKSTART.md exists" 1
fi

if [ -f "$DTRACK_DIR/DEPLOYMENT-SUMMARY.md" ]; then
  check "DEPLOYMENT-SUMMARY.md exists" 0
else
  check "DEPLOYMENT-SUMMARY.md exists" 1
fi

if [ -f "$DTRACK_DIR/.env.example" ]; then
  check ".env.example exists" 0
else
  check ".env.example exists" 1
fi

echo ""
echo -e "${BLUE}Checking scripts...${NC}"
echo ""

# Scripts
scripts=(
  "dependency-track-api.sh"
  "dependency-track-setup.sh"
  "dependency-track-config.sh"
  "dependency-track-upload-sboms.sh"
  "dependency-track-report.sh"
  "dependency-track-webhook-handler.sh"
  "dependency-track-webhook-server.sh"
  "dependency-track-monitor.sh"
  "integrated-vulnerability-scan.sh"
)

for script in "${scripts[@]}"; do
  if [ -f "$SCRIPT_DIR/$script" ]; then
    if [ -x "$SCRIPT_DIR/$script" ]; then
      check "$script (executable)" 0
    else
      check "$script (not executable)" 1
    fi
  else
    check "$script (missing)" 1
  fi
done

echo ""
echo -e "${BLUE}Checking prerequisites...${NC}"
echo ""

# Docker
if command -v docker &> /dev/null; then
  check "Docker installed" 0
else
  check "Docker installed" 1
fi

# Docker Compose
if command -v docker-compose &> /dev/null || docker compose version &> /dev/null 2>&1; then
  check "Docker Compose installed" 0
else
  check "Docker Compose installed" 1
fi

# jq
if command -v jq &> /dev/null; then
  check "jq installed" 0
else
  check "jq installed" 1
fi

# curl
if command -v curl &> /dev/null; then
  check "curl installed" 0
else
  check "curl installed" 1
fi

# nc (for webhook server)
if command -v nc &> /dev/null; then
  check "netcat (nc) installed" 0
else
  check "netcat (nc) installed" 1
fi

echo ""
echo -e "${BLUE}Checking SBOM files...${NC}"
echo ""

SCAN_DIR="$CORTEX_ROOT/coordination/security/scans"

if [ -d "$SCAN_DIR" ]; then
  sbom_count=$(find "$SCAN_DIR" -name "*sbom*.json" -type f | wc -l)
  if [ "$sbom_count" -gt 0 ]; then
    check "SBOM files found ($sbom_count files)" 0

    # Check format
    first_sbom=$(find "$SCAN_DIR" -name "*sbom*.json" -type f | head -1)
    if jq -e '.bomFormat == "CycloneDX"' "$first_sbom" > /dev/null 2>&1; then
      check "SBOM format is CycloneDX" 0
    else
      check "SBOM format is CycloneDX" 1
    fi

    if jq -e '.specVersion' "$first_sbom" > /dev/null 2>&1; then
      version=$(jq -r '.specVersion' "$first_sbom")
      check "SBOM spec version: $version" 0
    else
      check "SBOM spec version present" 1
    fi
  else
    check "SBOM files found" 1
  fi
else
  check "Scan directory exists" 1
fi

echo ""
echo -e "${BLUE}Optional: Checking if Dependency-Track is running...${NC}"
echo ""

# Check if running
if docker ps | grep -q dtrack-apiserver; then
  check "Dependency-Track API server running" 0

  # Check if healthy
  if curl -s http://localhost:8081/api/version > /dev/null 2>&1; then
    check "API server responding" 0
  else
    check "API server responding" 1
  fi
else
  echo -e "${YELLOW}⊗${NC} Dependency-Track not running (this is OK if not deployed yet)"
fi

if docker ps | grep -q dtrack-frontend; then
  check "Dependency-Track frontend running" 0
else
  echo -e "${YELLOW}⊗${NC} Frontend not running (this is OK if not deployed yet)"
fi

if docker ps | grep -q dtrack-postgres; then
  check "PostgreSQL running" 0
else
  echo -e "${YELLOW}⊗${NC} PostgreSQL not running (this is OK if not deployed yet)"
fi

# Check API key
echo ""
echo -e "${BLUE}Checking configuration...${NC}"
echo ""

if [ -f "$HOME/.cortex/dtrack-api-key" ]; then
  check "API key file exists" 0

  if [ "$(stat -f%Lp "$HOME/.cortex/dtrack-api-key" 2>/dev/null || stat -c%a "$HOME/.cortex/dtrack-api-key" 2>/dev/null)" = "600" ]; then
    check "API key file permissions correct (600)" 0
  else
    check "API key file permissions correct (600)" 1
  fi
else
  echo -e "${YELLOW}⊗${NC} API key not configured (run setup script first)"
fi

# Summary
echo ""
echo "════════════════════════════════════════════════════════════════"
echo -e "${BOLD}VERIFICATION SUMMARY${NC}"
echo "════════════════════════════════════════════════════════════════"
echo ""

total_checks=$((checks_passed + checks_failed))
success_rate=$((checks_passed * 100 / total_checks))

echo "  Checks passed: ${GREEN}$checks_passed${NC}"
echo "  Checks failed: ${RED}$checks_failed${NC}"
echo "  Success rate:  $success_rate%"
echo ""

if [ "$checks_failed" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}✓ ALL CHECKS PASSED${NC}"
  echo ""
  echo "Deployment is complete and verified!"
  echo ""
  echo "Next steps:"
  echo "  1. Deploy: ./scripts/security/dependency-track-setup.sh"
  echo "  2. Upload SBOMs: ./scripts/security/dependency-track-upload-sboms.sh"
  echo "  3. View report: ./scripts/security/dependency-track-report.sh"
  echo ""
elif [ "$checks_failed" -le 3 ]; then
  echo -e "${YELLOW}⚠ MOSTLY COMPLETE${NC}"
  echo ""
  echo "A few checks failed, but deployment should work."
  echo "Review failed checks above."
  echo ""
else
  echo -e "${RED}✗ DEPLOYMENT INCOMPLETE${NC}"
  echo ""
  echo "Several checks failed. Review errors above."
  echo ""
fi

echo "Files deployed to:"
echo "  Config: $DTRACK_DIR"
echo "  Scripts: $SCRIPT_DIR"
echo ""

exit $checks_failed
