#!/usr/bin/env bash
# Launch Marimo AI-powered dashboards

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANALYSIS_DIR="$PROJECT_ROOT/analysis"

# Add Python bin to PATH if needed
export PATH="$HOME/Library/Python/3.9/bin:$PATH"

echo "==================================="
echo "  Cortex Marimo Dashboards"
echo "==================================="
echo ""
echo "Available dashboards:"
echo "  1. Routing Optimization"
echo "  2. Security Dashboard"
echo "  3. Worker Performance"
echo "  4. All dashboards (multi-window)"
echo ""
read -p "Select dashboard (1-4): " -n 1 -r
echo ""

case "$REPLY" in
    1)
        echo "Launching Routing Optimization dashboard..."
        cd "$ANALYSIS_DIR"
        marimo edit routing-optimization.py
        ;;
    2)
        echo "Launching Security Dashboard..."
        cd "$ANALYSIS_DIR"
        marimo edit security-dashboard.py
        ;;
    3)
        echo "Launching Worker Performance dashboard..."
        cd "$ANALYSIS_DIR"
        marimo edit worker-performance.py
        ;;
    4)
        echo "Launching all dashboards..."
        cd "$ANALYSIS_DIR"
        echo "Starting Routing Optimization on port 8080..."
        marimo run routing-optimization.py --port 8080 &
        echo "Starting Security Dashboard on port 8081..."
        marimo run security-dashboard.py --port 8081 &
        echo "Starting Worker Performance on port 8082..."
        marimo run worker-performance.py --port 8082 &
        echo ""
        echo "Dashboards running at:"
        echo "  - Routing: http://localhost:8080"
        echo "  - Security: http://localhost:8081"
        echo "  - Performance: http://localhost:8082"
        echo ""
        echo "Press Ctrl+C to stop all dashboards"
        wait
        ;;
    *)
        echo "Invalid selection"
        exit 1
        ;;
esac
