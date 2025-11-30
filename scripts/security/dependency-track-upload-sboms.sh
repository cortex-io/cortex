#!/usr/bin/env bash
#
# Automated SBOM Upload to Dependency-Track
# Scans for new SBOMs and uploads them automatically
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
API_LIB="$SCRIPT_DIR/dependency-track-api.sh"
SCAN_DIR="$CORTEX_ROOT/coordination/security/scans"
UPLOAD_LOG="$CORTEX_ROOT/coordination/security/dependency-track/upload-log.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║     AUTOMATED SBOM UPLOAD TO DEPENDENCY-TRACK                  ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Source API library
source "$API_LIB"

# Check health first
if ! check_health; then
  echo -e "${RED}✗ Dependency-Track is not running${NC}"
  echo "Start it with: cd coordination/security/dependency-track && docker-compose up -d"
  exit 1
fi

# Load API key
load_api_key

echo -e "${BLUE}Scanning for SBOM files in: $SCAN_DIR${NC}"
echo ""

# Initialize upload log if not exists
if [ ! -f "$UPLOAD_LOG" ]; then
  echo '{"uploads": []}' > "$UPLOAD_LOG"
fi

# Project mapping rules
# Format: filename_pattern:project_name:project_version
declare -a MAPPING_RULES=(
  "cortex-sbom-*.json:cortex:1.0.0"
  "driveiq-backend-sbom-*.json:driveiq-backend:1.0.0"
  "driveiq-frontend-sbom-*.json:driveiq-frontend:1.0.0"
  "blog-sbom-*.json:blog:1.0.0"
)

# Track uploads
total_uploads=0
successful_uploads=0
failed_uploads=0
skipped_uploads=0

# Function to check if file was already uploaded
was_uploaded() {
  local file_path="$1"
  local file_hash=$(sha256sum "$file_path" | cut -d' ' -f1)

  jq -e --arg hash "$file_hash" '.uploads[] | select(.file_hash == $hash)' "$UPLOAD_LOG" > /dev/null 2>&1
}

# Function to record upload
record_upload() {
  local file_path="$1"
  local project_name="$2"
  local project_version="$3"
  local status="$4"
  local token="${5:-}"

  local file_hash=$(sha256sum "$file_path" | cut -d' ' -f1)
  local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  local record=$(cat <<EOF
{
  "file_path": "$file_path",
  "file_hash": "$file_hash",
  "project_name": "$project_name",
  "project_version": "$project_version",
  "upload_timestamp": "$timestamp",
  "status": "$status",
  "token": "$token"
}
EOF
)

  # Add to upload log
  jq --argjson record "$record" '.uploads += [$record]' "$UPLOAD_LOG" > "${UPLOAD_LOG}.tmp"
  mv "${UPLOAD_LOG}.tmp" "$UPLOAD_LOG"
}

# Process each mapping rule
for rule in "${MAPPING_RULES[@]}"; do
  pattern="${rule%%:*}"
  rest="${rule#*:}"
  project_name="${rest%%:*}"
  project_version="${rest#*:}"

  echo -e "${BLUE}Processing rule: ${pattern}${NC}"
  echo -e "  → Project: ${GREEN}${project_name}${NC} v${project_version}"

  # Find matching files
  found_files=$(find "$SCAN_DIR" -name "$pattern" -type f 2>/dev/null || true)

  if [ -z "$found_files" ]; then
    echo -e "  ${YELLOW}No files found${NC}"
    echo ""
    continue
  fi

  # Upload each file
  while IFS= read -r sbom_file; do
    total_uploads=$((total_uploads + 1))

    filename=$(basename "$sbom_file")
    filesize=$(du -h "$sbom_file" | cut -f1)

    echo -e "  ${BLUE}Found:${NC} $filename ($filesize)"

    # Check if already uploaded
    if was_uploaded "$sbom_file"; then
      echo -e "    ${YELLOW}⊗ Already uploaded, skipping${NC}"
      skipped_uploads=$((skipped_uploads + 1))
      continue
    fi

    # Validate SBOM format
    if ! jq -e '.bomFormat == "CycloneDX" and .specVersion' "$sbom_file" > /dev/null 2>&1; then
      echo -e "    ${RED}✗ Invalid SBOM format${NC}"
      record_upload "$sbom_file" "$project_name" "$project_version" "failed" ""
      failed_uploads=$((failed_uploads + 1))
      continue
    fi

    # Upload SBOM
    echo -e "    ${BLUE}⟳ Uploading...${NC}"

    response=$(upload_bom "$sbom_file" "$project_name" "$project_version" "true" 2>/dev/null || echo -e "\n500")
    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | head -n -1)

    if [ "$http_code" = "200" ]; then
      token=$(echo "$body" | jq -r '.token // "unknown"')
      echo -e "    ${GREEN}✓ Upload successful${NC} (token: $token)"

      record_upload "$sbom_file" "$project_name" "$project_version" "success" "$token"
      successful_uploads=$((successful_uploads + 1))

      # Brief pause for analysis to start
      sleep 2
    else
      echo -e "    ${RED}✗ Upload failed (HTTP $http_code)${NC}"
      record_upload "$sbom_file" "$project_name" "$project_version" "failed" ""
      failed_uploads=$((failed_uploads + 1))
    fi

  done <<< "$found_files"

  echo ""
done

# Summary
echo "════════════════════════════════════════════════════════════════"
echo -e "${GREEN}✓ UPLOAD COMPLETE${NC}"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Summary:"
echo "  • Total SBOMs processed: $total_uploads"
echo "  • Successfully uploaded: $successful_uploads"
echo "  • Failed uploads: $failed_uploads"
echo "  • Skipped (already uploaded): $skipped_uploads"
echo ""

if [ $successful_uploads -gt 0 ]; then
  echo -e "${BLUE}Analysis in progress...${NC}"
  echo "View results at: http://localhost:8082"
  echo ""
  echo "Wait a few minutes for vulnerability analysis to complete, then run:"
  echo "  scripts/security/dependency-track-report.sh"
fi

echo ""

exit 0
