#!/bin/bash
# Health check for ansible-mcp-server integration
# Part of Cortex monitoring system

set -euo pipefail

HEALTH_LOG="/Users/ryandahlberg/Projects/cortex/coordination/monitoring/ansible-mcp-health.jsonl"
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Ensure log directory exists
mkdir -p "$(dirname "$HEALTH_LOG")"

# Check if venv exists
VENV_PATH="/Users/ryandahlberg/Projects/ansible-mcp-server/venv"
if [ ! -d "$VENV_PATH" ]; then
    echo "{\"timestamp\":\"$TIMESTAMP\",\"component\":\"ansible-mcp-server\",\"status\":\"unhealthy\",\"error\":\"venv not found at $VENV_PATH\"}" >> "$HEALTH_LOG"
    exit 1
fi

# Activate venv and check components
source "$VENV_PATH/bin/activate"

# Check if Ansible is available in venv
if ! command -v ansible &> /dev/null; then
    echo "{\"timestamp\":\"$TIMESTAMP\",\"component\":\"ansible-mcp-server\",\"status\":\"unhealthy\",\"error\":\"ansible not found in venv\"}" >> "$HEALTH_LOG"
    deactivate
    exit 1
fi

# Get Ansible version
ANSIBLE_VERSION=$(ansible --version | head -1 | awk '{print $2}')

# Check if ansible-mcp-server is installed
if ! python -c "import ansible_mcp_server" 2>/dev/null; then
    echo "{\"timestamp\":\"$TIMESTAMP\",\"component\":\"ansible-mcp-server\",\"status\":\"unhealthy\",\"error\":\"ansible_mcp_server package not installed\"}" >> "$HEALTH_LOG"
    deactivate
    exit 1
fi

# Get package version
PACKAGE_VERSION=$(python -c "import ansible_mcp_server; print(ansible_mcp_server.__version__)" 2>/dev/null || echo "0.1.0")
deactivate

# Check log directory exists
LOG_DIR="$HOME/.ansible-mcp-server/logs"
if [ ! -d "$LOG_DIR" ]; then
    mkdir -p "$LOG_DIR"
    echo "{\"timestamp\":\"$TIMESTAMP\",\"component\":\"ansible-mcp-server\",\"status\":\"warning\",\"message\":\"log directory created at $LOG_DIR\"}" >> "$HEALTH_LOG"
fi

# Count recent executions (last 24 hours)
RECENT_EXECUTIONS=$(find "$LOG_DIR" -name "execution_*.json" -mtime -1 2>/dev/null | wc -l | tr -d ' ')

# Health check passed
echo "{\"timestamp\":\"$TIMESTAMP\",\"component\":\"ansible-mcp-server\",\"status\":\"healthy\",\"ansible_version\":\"$ANSIBLE_VERSION\",\"package_version\":\"$PACKAGE_VERSION\",\"recent_executions\":$RECENT_EXECUTIONS}" >> "$HEALTH_LOG"

exit 0
