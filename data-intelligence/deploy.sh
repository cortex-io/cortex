#!/bin/bash
#
# Deploy Cortex Data Intelligence Platform
#

set -euo pipefail

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Cortex Data Intelligence Platform Deployment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check Python
echo "Checking Python installation..."
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found"
    exit 1
fi
echo "✓ Python 3 found"

# Install dependencies
echo "Installing Python dependencies..."
pip3 install -q -r python-sdk/requirements-ml.txt
echo "✓ Dependencies installed"

# Run data migration
echo "Running data migration..."
python3 data-intelligence/migration/migrate.py --dry-run
echo "✓ Migration validated"

# Start MLflow server in background
echo "Starting MLflow tracking server..."
nohup ./data-intelligence/mlflow/start-mlflow-server.sh > mlflow.log 2>&1 &
echo "✓ MLflow server started (http://localhost:5000)"

# Run integration tests
echo "Running integration tests..."
python3 data-intelligence/tests/test_integration.py
echo "✓ Tests passed"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Deployment Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Services running:"
echo "  - MLflow UI: http://localhost:5000"
echo "  - Analytics API: http://localhost:8000"
echo ""
echo "Next steps:"
echo "  1. Run full migration: python3 data-intelligence/migration/migrate.py"
echo "  2. Start using the platform: python3 data-intelligence/cortex_intelligence_platform.py"
echo "  3. View MLflow experiments at http://localhost:5000"
echo ""
