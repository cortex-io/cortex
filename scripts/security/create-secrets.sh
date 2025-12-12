#!/bin/bash
# Create Kubernetes Secrets from Environment Variables
# Usage: ./create-secrets.sh
#
# Required environment variables:
# - ANTHROPIC_API_KEY
# - GITHUB_TOKEN
#
# Optional:
# - GHCR_TOKEN (defaults to GITHUB_TOKEN)
# - PROXMOX_API_TOKEN
# - OPENAI_API_KEY

set -euo pipefail

NAMESPACE="${NAMESPACE:-cortex}"
DRY_RUN="${DRY_RUN:-false}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Cortex Secrets Creation Script${NC}"
echo "================================"
echo ""

# Check if namespace exists
if ! kubectl get namespace "$NAMESPACE" &>/dev/null; then
  echo -e "${YELLOW}Namespace $NAMESPACE does not exist. Creating...${NC}"
  kubectl create namespace "$NAMESPACE"
fi

# Validate required environment variables
MISSING_VARS=()

if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  MISSING_VARS+=("ANTHROPIC_API_KEY")
fi

if [ -z "${GITHUB_TOKEN:-}" ]; then
  MISSING_VARS+=("GITHUB_TOKEN")
fi

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
  echo -e "${RED}ERROR: Missing required environment variables:${NC}"
  for var in "${MISSING_VARS[@]}"; do
    echo "  - $var"
  done
  echo ""
  echo "Export the required variables and try again:"
  echo "  export ANTHROPIC_API_KEY='sk-ant-...'"
  echo "  export GITHUB_TOKEN='ghp_...'"
  exit 1
fi

# Set defaults for optional variables
GHCR_TOKEN="${GHCR_TOKEN:-$GITHUB_TOKEN}"
PROXMOX_API_TOKEN="${PROXMOX_API_TOKEN:-}"
OPENAI_API_KEY="${OPENAI_API_KEY:-}"

# Function to create or update secret
create_secret() {
  local secret_name=$1
  shift
  local kubectl_args=("$@")

  if $DRY_RUN; then
    echo -e "${YELLOW}[DRY RUN] Would create: $secret_name${NC}"
    kubectl create secret generic "$secret_name" \
      --namespace="$NAMESPACE" \
      "${kubectl_args[@]}" \
      --dry-run=client -o yaml
  else
    # Delete if exists
    kubectl delete secret "$secret_name" \
      --namespace="$NAMESPACE" \
      --ignore-not-found=true

    # Create new secret
    kubectl create secret generic "$secret_name" \
      --namespace="$NAMESPACE" \
      "${kubectl_args[@]}"

    echo -e "${GREEN}Created secret: $secret_name${NC}"
  fi
}

# 1. Create main cortex-secrets
echo "Creating cortex-secrets..."
SECRET_ARGS=(
  "--from-literal=anthropic-api-key=$ANTHROPIC_API_KEY"
  "--from-literal=github-token=$GITHUB_TOKEN"
  "--from-literal=ghcr-token=$GHCR_TOKEN"
)

if [ -n "$PROXMOX_API_TOKEN" ]; then
  SECRET_ARGS+=("--from-literal=proxmox-api-token=$PROXMOX_API_TOKEN")
fi

if [ -n "$OPENAI_API_KEY" ]; then
  SECRET_ARGS+=("--from-literal=openai-api-key=$OPENAI_API_KEY")
fi

create_secret "cortex-secrets" "${SECRET_ARGS[@]}"

# 2. Create anthropic-api-key secret
echo "Creating anthropic-api-key..."
create_secret "anthropic-api-key" \
  "--from-literal=api-key=$ANTHROPIC_API_KEY"

# 3. Create github-token secret
echo "Creating github-token..."
create_secret "github-token" \
  "--from-literal=token=$GITHUB_TOKEN"

# 4. Create Docker config secret for GHCR
echo "Creating ghcr-pull-secret..."
if $DRY_RUN; then
  echo -e "${YELLOW}[DRY RUN] Would create: ghcr-pull-secret${NC}"
else
  kubectl delete secret ghcr-pull-secret \
    --namespace="$NAMESPACE" \
    --ignore-not-found=true

  kubectl create secret docker-registry ghcr-pull-secret \
    --namespace="$NAMESPACE" \
    --docker-server=ghcr.io \
    --docker-username="${GITHUB_USERNAME:-$(git config user.name)}" \
    --docker-password="$GHCR_TOKEN"

  echo -e "${GREEN}Created secret: ghcr-pull-secret${NC}"
fi

# Summary
echo ""
echo -e "${GREEN}Secrets creation complete!${NC}"
echo ""
echo "Created secrets in namespace '$NAMESPACE':"
echo "  - cortex-secrets (main secret bundle)"
echo "  - anthropic-api-key"
echo "  - github-token"
echo "  - ghcr-pull-secret"
echo ""
echo "Verify with:"
echo "  kubectl get secrets -n $NAMESPACE"
echo ""
echo -e "${YELLOW}IMPORTANT: Rotate these secrets every 90 days!${NC}"
echo "Update docs/security/SECRETS-ROTATION.md with rotation date."
