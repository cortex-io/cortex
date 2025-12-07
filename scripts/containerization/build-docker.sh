#!/usr/bin/env bash
#
# build-docker.sh - Build Cortex Docker image locally
#
# Usage:
#   ./scripts/containerization/build-docker.sh [options]
#
# Options:
#   -t, --tag TAG        Image tag (default: cortex:latest)
#   -p, --platform ARCH  Target platform (amd64, arm64, or both)
#   --no-cache           Build without cache
#   --push               Push to registry after build
#   -h, --help           Show this help message

set -euo pipefail

# Default values
IMAGE_TAG="${CORTEX_IMAGE_TAG:-cortex:latest}"
PLATFORM="linux/amd64"
USE_CACHE=true
PUSH_IMAGE=false
BUILD_ARGS=()

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
log_info() { echo -e "${GREEN}[INFO]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

show_help() {
    head -n 15 "$0" | tail -n 13
    exit 0
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -t|--tag)
            IMAGE_TAG="$2"
            shift 2
            ;;
        -p|--platform)
            case $2 in
                amd64)
                    PLATFORM="linux/amd64"
                    ;;
                arm64)
                    PLATFORM="linux/arm64"
                    ;;
                both)
                    PLATFORM="linux/amd64,linux/arm64"
                    ;;
                *)
                    log_error "Invalid platform: $2 (must be: amd64, arm64, or both)"
                    exit 1
                    ;;
            esac
            shift 2
            ;;
        --no-cache)
            USE_CACHE=false
            shift
            ;;
        --push)
            PUSH_IMAGE=true
            shift
            ;;
        -h|--help)
            show_help
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            ;;
    esac
done

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed or not in PATH"
    exit 1
fi

# Change to repository root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

log_info "Building Cortex Docker image..."
log_info "  Image tag: $IMAGE_TAG"
log_info "  Platform: $PLATFORM"
log_info "  Use cache: $USE_CACHE"
log_info "  Push: $PUSH_IMAGE"

# Build arguments
if [[ "$USE_CACHE" == "false" ]]; then
    BUILD_ARGS+=("--no-cache")
fi

if [[ "$PUSH_IMAGE" == "true" ]]; then
    BUILD_ARGS+=("--push")
fi

# Check if Dockerfile exists
if [[ ! -f "Dockerfile" ]]; then
    log_error "Dockerfile not found in $REPO_ROOT"
    exit 1
fi

# Build the image
log_info "Starting Docker build..."

if [[ "$PLATFORM" == *","* ]]; then
    # Multi-platform build requires buildx
    log_info "Multi-platform build detected, using buildx..."

    # Ensure buildx is available
    if ! docker buildx version &> /dev/null; then
        log_error "Docker buildx is required for multi-platform builds"
        exit 1
    fi

    # Create builder if it doesn't exist
    if ! docker buildx inspect cortex-builder &> /dev/null; then
        log_info "Creating buildx builder instance..."
        docker buildx create --name cortex-builder --use
    else
        docker buildx use cortex-builder
    fi

    # Build with buildx
    docker buildx build \
        --platform "$PLATFORM" \
        --tag "$IMAGE_TAG" \
        "${BUILD_ARGS[@]}" \
        --progress=plain \
        .
else
    # Single platform build
    docker build \
        --platform "$PLATFORM" \
        --tag "$IMAGE_TAG" \
        "${BUILD_ARGS[@]}" \
        --progress=plain \
        .
fi

BUILD_STATUS=$?

if [[ $BUILD_STATUS -eq 0 ]]; then
    log_info "✓ Docker image built successfully: $IMAGE_TAG"

    # Show image info
    if [[ "$PUSH_IMAGE" == "false" ]]; then
        log_info "Image details:"
        docker images "$IMAGE_TAG" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"
    fi
else
    log_error "✗ Docker build failed with exit code $BUILD_STATUS"
    exit $BUILD_STATUS
fi

# Optional: Run basic validation
if [[ "$PUSH_IMAGE" == "false" ]] && [[ "$PLATFORM" != *","* ]]; then
    log_info "Running basic validation..."

    if docker run --rm "$IMAGE_TAG" bash -c "which bash && which jq && node --version"; then
        log_info "✓ Basic validation passed"
    else
        log_warn "Basic validation failed - image may have issues"
    fi
fi

log_info "Build complete!"
log_info ""
log_info "Next steps:"
log_info "  - Test locally: docker run -it --rm $IMAGE_TAG bash"
log_info "  - Run with compose: docker-compose up"
log_info "  - Push to registry: docker push $IMAGE_TAG"
