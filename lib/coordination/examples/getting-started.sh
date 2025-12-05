#!/bin/bash

# Getting Started Script for Coordination Daemon
# This script helps you quickly test the coordination daemon

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║    Cortex Coordination Daemon - Getting Started               ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check if ws is installed
if ! node -e "require('ws')" 2>/dev/null; then
    echo "⚠  WebSocket library not found. Installing..."
    cd "$PROJECT_ROOT"
    npm install ws
    echo "✓ WebSocket library installed"
    echo ""
fi

# Function to cleanup background processes
cleanup() {
    echo ""
    echo "Cleaning up..."
    if [ ! -z "$DAEMON_PID" ]; then
        kill $DAEMON_PID 2>/dev/null || true
    fi
    if [ ! -z "$WORKER1_PID" ]; then
        kill $WORKER1_PID 2>/dev/null || true
    fi
    if [ ! -z "$WORKER2_PID" ]; then
        kill $WORKER2_PID 2>/dev/null || true
    fi
    if [ ! -z "$MONITOR_PID" ]; then
        kill $MONITOR_PID 2>/dev/null || true
    fi
    exit 0
}

trap cleanup SIGINT SIGTERM

# Menu
echo "Choose a demo:"
echo ""
echo "  1. Quick Test - Daemon + Worker + Task Assignment"
echo "  2. Performance Test - Test 1,000 ops/sec target"
echo "  3. Orchestrator Demo - Auto-task assignment"
echo "  4. Monitoring Dashboard"
echo "  5. Full System Test - Daemon + Workers + Monitor"
echo ""
read -p "Enter choice [1-5]: " choice

case $choice in
    1)
        echo ""
        echo "Starting Quick Test..."
        echo ""
        echo "1. Starting daemon..."
        node "$SCRIPT_DIR/basic-daemon.js" &
        DAEMON_PID=$!
        sleep 3

        echo "2. Starting worker..."
        node "$SCRIPT_DIR/basic-worker.js" test-worker-001 development &
        WORKER1_PID=$!
        sleep 2

        echo "3. Assigning a test task..."
        curl -s -X POST http://localhost:9500/api/tasks/assign \
            -H "Content-Type: application/json" \
            -d '{
                "taskId": "test-task-001",
                "taskData": {
                    "title": "Test task from getting-started script",
                    "type": "development"
                }
            }' | python3 -m json.tool 2>/dev/null || cat

        echo ""
        echo ""
        echo "4. Checking metrics..."
        sleep 2
        curl -s http://localhost:9500/api/metrics | python3 -m json.tool 2>/dev/null || cat

        echo ""
        echo ""
        echo "✓ Quick test complete!"
        echo "  - Daemon running on http://localhost:9500"
        echo "  - Worker connected and processing tasks"
        echo ""
        echo "Press Ctrl+C to stop"
        wait
        ;;

    2)
        echo ""
        echo "Starting Performance Test..."
        echo ""
        node "$SCRIPT_DIR/performance-test.js"
        ;;

    3)
        echo ""
        echo "Starting Orchestrator Demo..."
        echo ""
        echo "This will:"
        echo "  - Start daemon with auto-task creation"
        echo "  - Start 3 workers"
        echo "  - Watch tasks being assigned and completed"
        echo ""
        read -p "Press Enter to continue..."

        echo ""
        echo "1. Starting orchestrator daemon..."
        node "$SCRIPT_DIR/task-orchestrator.js" &
        DAEMON_PID=$!
        sleep 3

        echo "2. Starting workers..."
        node "$SCRIPT_DIR/basic-worker.js" worker-dev-001 development &
        WORKER1_PID=$!
        sleep 1

        node "$SCRIPT_DIR/basic-worker.js" worker-sec-001 security &
        WORKER2_PID=$!
        sleep 1

        echo ""
        echo "✓ System running!"
        echo "  Watch the orchestrator automatically create and assign tasks"
        echo ""
        echo "Press Ctrl+C to stop"
        wait
        ;;

    4)
        echo ""
        echo "Starting Monitoring Dashboard..."
        echo ""
        echo "Make sure the daemon is already running!"
        echo "If not, start it in another terminal:"
        echo "  node lib/coordination/examples/basic-daemon.js"
        echo ""
        read -p "Press Enter when ready..."

        node "$SCRIPT_DIR/monitor.js"
        ;;

    5)
        echo ""
        echo "Starting Full System Test..."
        echo ""
        echo "This will start:"
        echo "  - Coordination daemon"
        echo "  - 2 workers"
        echo "  - Real-time monitor"
        echo ""
        read -p "Press Enter to continue..."

        echo ""
        echo "1. Starting daemon..."
        node "$SCRIPT_DIR/basic-daemon.js" &
        DAEMON_PID=$!
        sleep 3

        echo "2. Starting workers..."
        node "$SCRIPT_DIR/basic-worker.js" worker-001 development testing &
        WORKER1_PID=$!
        sleep 1

        node "$SCRIPT_DIR/basic-worker.js" worker-002 security deployment &
        WORKER2_PID=$!
        sleep 2

        echo ""
        echo "3. Starting monitor..."
        echo ""
        node "$SCRIPT_DIR/monitor.js" &
        MONITOR_PID=$!

        echo ""
        echo "4. Assigning test tasks..."
        sleep 2

        for i in {1..5}; do
            curl -s -X POST http://localhost:9500/api/tasks/assign \
                -H "Content-Type: application/json" \
                -d "{
                    \"taskId\": \"test-task-$i\",
                    \"taskData\": {
                        \"title\": \"Test task $i\",
                        \"type\": \"development\"
                    }
                }" > /dev/null
            echo "  - Assigned task $i"
            sleep 1
        done

        echo ""
        echo "✓ Full system running!"
        echo "  - Daemon: http://localhost:9500"
        echo "  - Monitor: Showing real-time updates"
        echo "  - Workers: Processing tasks"
        echo ""
        echo "Press Ctrl+C to stop everything"
        wait
        ;;

    *)
        echo "Invalid choice"
        exit 1
        ;;
esac
