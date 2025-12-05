#!/bin/bash

##############################################################################
# Social Publisher Setup Script
#
# Interactive setup wizard for the Cortex Social Publisher.
# Helps configure API credentials and validates the installation.
##############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "======================================"
echo "Cortex Social Publisher Setup"
echo "======================================"
echo ""

# Check if Buffer token is set
if [[ -n "${BUFFER_ACCESS_TOKEN:-}" ]]; then
    echo -e "${GREEN}✓${NC} BUFFER_ACCESS_TOKEN is set"
else
    echo -e "${RED}✗${NC} BUFFER_ACCESS_TOKEN is not set"
    echo ""
    echo "To get your Buffer access token:"
    echo "1. Go to https://buffer.com/developers/apps"
    echo "2. Create a new app or use existing"
    echo "3. Generate an access token"
    echo ""
    read -p "Paste your Buffer access token: " buffer_token
    echo ""
    echo "Add this to your ~/.zshrc or ~/.bashrc:"
    echo "  export BUFFER_ACCESS_TOKEN=\"$buffer_token\""
    echo ""
    read -p "Press Enter to continue after adding it..."
fi

# Check if Anthropic API key is set
if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
    echo -e "${GREEN}✓${NC} ANTHROPIC_API_KEY is set"
else
    echo -e "${RED}✗${NC} ANTHROPIC_API_KEY is not set"
    echo ""
    echo "The Anthropic API key should already be set for Cortex."
    echo "Check your environment or .env file."
    echo ""
    read -p "Press Enter to continue..."
fi

echo ""
echo "Validating setup..."
echo ""

# Validate Buffer connection
echo "Checking Buffer connection..."
if [[ -n "${BUFFER_ACCESS_TOKEN:-}" ]]; then
    validation=$(node "$CORTEX_ROOT/lib/social/buffer-client.js" validate 2>&1 || echo "failed")

    if echo "$validation" | grep -q '"valid": true'; then
        echo -e "${GREEN}✓${NC} Buffer connection successful"

        twitter_accounts=$(echo "$validation" | jq -r '.twitter_accounts // 0')
        if [[ $twitter_accounts -gt 0 ]]; then
            echo -e "${GREEN}✓${NC} Twitter account connected ($twitter_accounts account)"
        else
            echo -e "${YELLOW}!${NC} No Twitter account connected to Buffer"
            echo "  Please connect Twitter at: https://buffer.com"
        fi
    else
        echo -e "${RED}✗${NC} Buffer connection failed"
        echo "$validation"
    fi
else
    echo -e "${YELLOW}⊘${NC} Skipping Buffer validation (no token)"
fi

echo ""
echo "Running tests..."
echo ""

# Run unit tests
if [[ -f "$CORTEX_ROOT/testing/unit/social-publisher.test.sh" ]]; then
    if "$CORTEX_ROOT/testing/unit/social-publisher.test.sh"; then
        echo -e "${GREEN}✓${NC} Unit tests passed"
    else
        echo -e "${RED}✗${NC} Unit tests failed"
    fi
else
    echo -e "${YELLOW}!${NC} Unit tests not found"
fi

echo ""
echo "======================================"
echo "Setup Complete!"
echo "======================================"
echo ""
echo "Next steps:"
echo ""
echo "1. Publish your latest blog post:"
echo "   ./scripts/social-publish.sh --latest"
echo ""
echo "2. Preview before publishing:"
echo "   ./scripts/social-publish.sh --preview projects/blog/your-post.md"
echo ""
echo "3. Start the monitoring daemon:"
echo "   ./scripts/daemons/social-publisher-daemon.sh start"
echo ""
echo "4. Read the full guide:"
echo "   cat docs/social-publisher-guide.md"
echo ""
echo "For help, run:"
echo "   ./scripts/social-publish.sh --help"
echo ""
