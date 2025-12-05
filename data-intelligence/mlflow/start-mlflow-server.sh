#!/bin/bash
#
# Start MLflow Tracking Server for Cortex
#
# This script starts the MLflow tracking server with the configuration
# specified in mlflow_config.yaml

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Load configuration
CONFIG_FILE="$SCRIPT_DIR/config/mlflow_config.yaml"

if [[ ! -f "$CONFIG_FILE" ]]; then
    echo "Error: Configuration file not found: $CONFIG_FILE"
    exit 1
fi

# Parse configuration using Python
read -r BACKEND_STORE_URI ARTIFACT_ROOT PORT HOST WORKERS < <(python3 <<EOF
import yaml
with open("$CONFIG_FILE") as f:
    config = yaml.safe_load(f)
    tracking = config['tracking']
    print(
        tracking['backend_store_uri'],
        tracking['default_artifact_root'],
        tracking['port'],
        tracking['host'],
        tracking['workers']
    )
EOF
)

# Make paths absolute
if [[ ! "$BACKEND_STORE_URI" = /* ]] && [[ ! "$BACKEND_STORE_URI" = sqlite:///* ]]; then
    BACKEND_STORE_URI="$PROJECT_ROOT/$BACKEND_STORE_URI"
fi

if [[ ! "$ARTIFACT_ROOT" = /* ]]; then
    ARTIFACT_ROOT="$PROJECT_ROOT/$ARTIFACT_ROOT"
fi

# Create directories
mkdir -p "$(dirname "${BACKEND_STORE_URI#sqlite:///}")" 2>/dev/null || true
mkdir -p "$ARTIFACT_ROOT"

# Print configuration
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Starting MLflow Tracking Server"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Backend Store URI: $BACKEND_STORE_URI"
echo "Artifact Root:     $ARTIFACT_ROOT"
echo "Host:              $HOST"
echo "Port:              $PORT"
echo "Workers:           $WORKERS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "MLflow UI will be available at: http://localhost:$PORT"
echo ""

# Start MLflow server
mlflow server \
    --backend-store-uri "$BACKEND_STORE_URI" \
    --default-artifact-root "$ARTIFACT_ROOT" \
    --host "$HOST" \
    --port "$PORT" \
    --workers "$WORKERS" \
    --serve-artifacts
