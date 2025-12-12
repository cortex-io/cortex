#!/usr/bin/env bash
#
# Cortex Release Creation Helper
#
# This script helps create a new Cortex release by:
# - Validating version format
# - Generating changelog
# - Creating git tag
# - Triggering release workflow
#

set -euo pipefail

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Parse arguments
VERSION=""
CHANGELOG=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --version)
            VERSION="$2"
            shift 2
            ;;
        --changelog)
            CHANGELOG="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help)
            cat <<EOF
Cortex Release Creation Script

Usage: $0 --version <version> [options]

Options:
  --version <version>       Semantic version (e.g., v1.2.3) [required]
  --changelog <message>     Changelog message
  --dry-run                 Show what would be done
  --help                    Show this help

Examples:
  $0 --version v1.3.0 --changelog "feat: Auto-scaling workers"
  $0 --version v1.3.1 --changelog "fix: Memory leak in coordinator"
EOF
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

if [ -z "$VERSION" ]; then
    log_error "Missing required argument: --version"
    exit 1
fi

# Validate version format
if [[ ! $VERSION =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[a-z0-9]+)?$ ]]; then
    log_error "Invalid version format: $VERSION"
    log_error "Expected format: vX.Y.Z or vX.Y.Z-suffix (e.g., v1.2.3, v1.2.3-beta)"
    exit 1
fi

log_info "=========================================="
log_info "Creating Cortex Release"
log_info "=========================================="
log_info "Version: $VERSION"
log_info "Dry Run: $DRY_RUN"
log_info ""

# Check if version already exists
if git rev-parse "$VERSION" >/dev/null 2>&1; then
    log_error "Version $VERSION already exists!"
    exit 1
fi

# Step 1: Verify working directory is clean
log_info "Step 1: Checking working directory..."

if ! git diff-index --quiet HEAD --; then
    log_warn "Working directory has uncommitted changes"
    read -p "Continue anyway? (yes/no): " -r
    if [[ ! $REPLY =~ ^[Yy]es$ ]]; then
        exit 0
    fi
fi

log_info "✓ Working directory checked"

# Step 2: Generate changelog
log_info "Step 2: Generating changelog..."

PREV_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")

if [ -z "$PREV_TAG" ]; then
    log_info "No previous tag found - this is the first release"
    AUTO_CHANGELOG=$(git log --pretty=format:"- %s (%h)" --no-merges | head -10)
else
    log_info "Previous tag: $PREV_TAG"
    AUTO_CHANGELOG=$(git log ${PREV_TAG}..HEAD --pretty=format:"- %s (%h)" --no-merges)
fi

if [ -z "$CHANGELOG" ]; then
    CHANGELOG="$AUTO_CHANGELOG"
fi

echo ""
echo "Changelog:"
echo "$CHANGELOG"
echo ""

# Step 3: Create git tag
log_info "Step 3: Creating git tag..."

if [ "$DRY_RUN" == "false" ]; then
    git tag -a "$VERSION" -m "Release $VERSION

$CHANGELOG"

    log_info "✓ Tag created: $VERSION"
else
    log_info "[DRY-RUN] Would create tag: $VERSION"
fi

# Step 4: Push tag to trigger release workflow
log_info "Step 4: Pushing tag to remote..."

if [ "$DRY_RUN" == "false" ]; then
    git push origin "$VERSION"

    log_info "✓ Tag pushed to origin"
    log_info ""
    log_info "GitHub Actions will now:"
    log_info "  1. Build multi-arch Docker image"
    log_info "  2. Push to GitHub Container Registry"
    log_info "  3. Create GitHub release"
    log_info "  4. Deploy to production (after approval)"
else
    log_info "[DRY-RUN] Would push tag to origin"
fi

# Step 5: Provide next steps
log_info "=========================================="
log_info "Release Creation Complete!"
log_info "=========================================="
log_info "Version: $VERSION"
log_info ""
log_info "Next steps:"
log_info "  1. Monitor workflow: https://github.com/ryandahlberg/cortex/actions"
log_info "  2. Approve production deployment when ready"
log_info "  3. Verify deployment: kubectl get deployments -n cortex"
log_info ""
log_info "To rollback if needed:"
log_info "  ./scripts/deploy/rollback.sh --to-version $PREV_TAG"
log_info "=========================================="

exit 0
