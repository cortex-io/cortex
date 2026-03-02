#!/bin/bash
# Installation script for Coordinator Agent

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Installing Cortex Coordinator Agent..."
echo "Project directory: $PROJECT_DIR"

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "Error: Node.js version 18 or higher required"
    echo "Current version: $(node -v)"
    exit 1
fi

# Install dependencies
echo "Installing dependencies..."
cd "$PROJECT_DIR"
npm install

# Build TypeScript
echo "Building TypeScript..."
npm run build

# Create necessary directories
echo "Creating directory structure..."
mkdir -p "$PROJECT_DIR/logs"
mkdir -p "$PROJECT_DIR/config"
mkdir -p "$PROJECT_DIR/dist"

# Make CLI executable
chmod +x "$PROJECT_DIR/src/cli.ts"

echo ""
echo "✓ Coordinator Agent installed successfully!"
echo ""
echo "Usage:"
echo "  npm run route <task-name> <domain> <priority> [description]"
echo "  npm run spawn-pm <objective> <priority> [requirements...]"
echo "  npm run status"
echo "  npm run process-queue"
echo ""
echo "Example:"
echo "  npm run route \"Deploy VM\" vm_provisioning p1_high \"Staging environment\""
echo ""
