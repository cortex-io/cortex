#!/bin/bash

################################################################################
# Master Version Promotion Script
#
# Purpose: Safely promote master versions through deployment stages
# Supports: Champion/Challenger/Shadow deployment patterns
#
# Usage:
#   ./scripts/promote-master.sh <master_id> <action> [version]
#
# Actions:
#   deploy-shadow <version>     - Deploy version to shadow (monitoring only)
#   promote-to-challenger       - Promote shadow to challenger (canary)
#   promote-to-champion         - Promote challenger to champion (production)
#   rollback                    - Rollback champion to previous version
#   set-champion <version>      - Directly set champion version (dangerous!)
#   show                        - Show current alias configuration
#
# Examples:
#   ./scripts/promote-master.sh coordinator show
#   ./scripts/promote-master.sh security deploy-shadow v1.1.0
#   ./scripts/promote-master.sh development promote-to-challenger
#   ./scripts/promote-master.sh inventory promote-to-champion
#   ./scripts/promote-master.sh cicd rollback
################################################################################

set -euo pipefail

# Source libraries
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/logging.sh"
source "$SCRIPT_DIR/lib/read-alias.sh"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Usage message
usage() {
    cat <<EOF
Usage: $0 <master_id> <action> [version]

Master IDs: coordinator, security, development, inventory, cicd

Actions:
  deploy-shadow <version>     Deploy version to shadow (monitoring only)
  promote-to-challenger       Promote shadow to challenger (canary)
  promote-to-champion         Promote challenger to champion (production)
  rollback                    Rollback champion to previous version
  set-champion <version>      Directly set champion version (dangerous!)
  show                        Show current alias configuration

Examples:
  $0 coordinator show
  $0 security deploy-shadow v1.1.0
  $0 development promote-to-challenger
  $0 inventory promote-to-champion
  $0 cicd rollback
EOF
    exit 1
}

# Validate arguments
if [ $# -lt 2 ]; then
    usage
fi

MASTER_ID="$1"
ACTION="$2"
VERSION="${3:-}"

ALIASES_FILE="$SCRIPT_DIR/../coordination/masters/${MASTER_ID}/versions/aliases.json"

# Validate master exists
if [ ! -d "$SCRIPT_DIR/../coordination/masters/${MASTER_ID}" ]; then
    echo -e "${RED}ERROR: Master '${MASTER_ID}' does not exist${NC}" >&2
    exit 1
fi

# Ensure aliases file exists
if [ ! -f "$ALIASES_FILE" ]; then
    echo -e "${RED}ERROR: Aliases file not found: ${ALIASES_FILE}${NC}" >&2
    exit 1
fi

# Update alias in aliases.json
update_alias() {
    local alias_name="$1"
    local version="$2"
    local status="${3:-active}"

    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    # Update alias
    local updated=$(jq \
        --arg alias "$alias_name" \
        --arg ver "$version" \
        --arg stat "$status" \
        --arg ts "$timestamp" \
        '.aliases[$alias].version = (if $ver == "null" then null else $ver end) |
         .aliases[$alias].status = $stat |
         .aliases[$alias].promoted_at = $ts |
         .last_updated = $ts' \
        "$ALIASES_FILE")

    echo "$updated" > "$ALIASES_FILE"
}

# Add version to history
add_version_history() {
    local version="$1"
    local status="$2"
    local description="${3:-}"

    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    local updated=$(jq \
        --arg ver "$version" \
        --arg stat "$status" \
        --arg desc "$description" \
        --arg ts "$timestamp" \
        '.version_history += [{
            version: $ver,
            created_at: $ts,
            description: $desc,
            status: $stat
        }] | .last_updated = $ts' \
        "$ALIASES_FILE")

    echo "$updated" > "$ALIASES_FILE"
}

# Show current configuration
show_config() {
    echo -e "${BLUE}=== Master Version Aliases: ${MASTER_ID} ===${NC}"
    echo ""

    local champion=$(get_champion_version "$MASTER_ID" 2>/dev/null || echo "none")
    local challenger=$(get_challenger_version "$MASTER_ID" 2>/dev/null || echo "none")
    local shadow=$(get_shadow_version "$MASTER_ID" 2>/dev/null || echo "none")

    echo -e "${GREEN}Champion (Production):${NC}    $champion"
    echo -e "${YELLOW}Challenger (Canary):${NC}      $challenger"
    echo -e "${BLUE}Shadow (Monitoring):${NC}      $shadow"
    echo ""

    echo -e "${BLUE}Available Versions:${NC}"
    get_available_versions "$MASTER_ID" | while read -r ver; do
        echo "  - $ver"
    done
    echo ""

    echo -e "${BLUE}Version History (last 5):${NC}"
    jq -r '.version_history[-5:] | reverse | .[] | "  \(.created_at): \(.version) (\(.status))"' "$ALIASES_FILE"
}

# Deploy to shadow
deploy_shadow() {
    local version="$1"

    if [ -z "$version" ]; then
        echo -e "${RED}ERROR: Version required for deploy-shadow${NC}" >&2
        usage
    fi

    if ! version_exists "$MASTER_ID" "$version"; then
        echo -e "${RED}ERROR: Version $version does not exist for $MASTER_ID${NC}" >&2
        exit 1
    fi

    echo -e "${BLUE}Deploying ${version} to shadow for ${MASTER_ID}...${NC}"

    update_alias "shadow" "$version" "active"
    add_version_history "$version" "shadow" "Deployed to shadow monitoring"

    echo -e "${GREEN}SUCCESS: ${version} deployed to shadow${NC}"
    echo "Shadow version will receive traffic but responses will be discarded for monitoring."
}

# Promote shadow to challenger
promote_to_challenger() {
    local shadow_version=$(get_shadow_version "$MASTER_ID")

    if [ -z "$shadow_version" ]; then
        echo -e "${RED}ERROR: No shadow version to promote${NC}" >&2
        exit 1
    fi

    echo -e "${BLUE}Promoting shadow ${shadow_version} to challenger for ${MASTER_ID}...${NC}"
    read -p "Continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 0
    fi

    update_alias "challenger" "$shadow_version" "active"
    update_alias "shadow" "null" "inactive"
    add_version_history "$shadow_version" "challenger" "Promoted from shadow to challenger"

    echo -e "${GREEN}SUCCESS: ${shadow_version} is now challenger (canary)${NC}"
    echo "Challenger will handle a percentage of production traffic for validation."
}

# Promote challenger to champion
promote_to_champion() {
    local challenger_version=$(get_challenger_version "$MASTER_ID")
    local current_champion=$(get_champion_version "$MASTER_ID")

    if [ -z "$challenger_version" ]; then
        echo -e "${RED}ERROR: No challenger version to promote${NC}" >&2
        exit 1
    fi

    echo -e "${BLUE}Promoting challenger ${challenger_version} to champion for ${MASTER_ID}...${NC}"
    echo -e "${YELLOW}Current champion ${current_champion} will be demoted${NC}"
    read -p "Continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 0
    fi

    update_alias "champion" "$challenger_version" "active"
    update_alias "challenger" "null" "inactive"
    add_version_history "$challenger_version" "champion" "Promoted from challenger to champion"

    echo -e "${GREEN}SUCCESS: ${challenger_version} is now champion (production)${NC}"
    echo -e "${YELLOW}Previous champion: ${current_champion}${NC}"
}

# Rollback champion to previous version
rollback() {
    local current_champion=$(get_champion_version "$MASTER_ID")

    # Get previous champion from history
    local previous_champion=$(jq -r '.version_history | reverse | .[] | select(.status == "champion") | .version' "$ALIASES_FILE" | sed -n '2p')

    if [ -z "$previous_champion" ]; then
        echo -e "${RED}ERROR: No previous champion version found for rollback${NC}" >&2
        exit 1
    fi

    echo -e "${RED}Rolling back ${MASTER_ID} from ${current_champion} to ${previous_champion}...${NC}"
    read -p "Continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 0
    fi

    update_alias "champion" "$previous_champion" "active"
    add_version_history "$previous_champion" "champion" "Rollback from ${current_champion}"

    echo -e "${GREEN}SUCCESS: Rolled back to ${previous_champion}${NC}"
}

# Directly set champion (dangerous)
set_champion() {
    local version="$1"

    if [ -z "$version" ]; then
        echo -e "${RED}ERROR: Version required for set-champion${NC}" >&2
        usage
    fi

    if ! version_exists "$MASTER_ID" "$version"; then
        echo -e "${RED}ERROR: Version $version does not exist for $MASTER_ID${NC}" >&2
        exit 1
    fi

    local current_champion=$(get_champion_version "$MASTER_ID")

    echo -e "${RED}WARNING: Directly setting champion bypasses safety checks!${NC}"
    echo -e "${YELLOW}Current champion: ${current_champion}${NC}"
    echo -e "${YELLOW}New champion: ${version}${NC}"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 0
    fi

    update_alias "champion" "$version" "active"
    add_version_history "$version" "champion" "Directly set as champion (bypassed promotion flow)"

    echo -e "${GREEN}SUCCESS: ${version} is now champion${NC}"
}

# Main action dispatcher
case "$ACTION" in
    show)
        show_config
        ;;
    deploy-shadow)
        deploy_shadow "$VERSION"
        ;;
    promote-to-challenger)
        promote_to_challenger
        ;;
    promote-to-champion)
        promote_to_champion
        ;;
    rollback)
        rollback
        ;;
    set-champion)
        set_champion "$VERSION"
        ;;
    *)
        echo -e "${RED}ERROR: Unknown action: ${ACTION}${NC}" >&2
        usage
        ;;
esac

# Show final state
echo ""
show_config
