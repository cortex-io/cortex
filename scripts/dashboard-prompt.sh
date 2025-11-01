#!/bin/bash

###############################################################################
# Dashboard Prompt Integration
# Prompts user to open dashboard when using commit-relay tools
###############################################################################

DASHBOARD_URL="http://localhost:3000"
DASHBOARD_PID_FILE="/tmp/commit-relay-dashboard.pid"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if dashboard is running
check_dashboard_running() {
    if [ -f "$DASHBOARD_PID_FILE" ]; then
        PID=$(cat "$DASHBOARD_PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            return 0
        else
            # Stale PID file, remove it
            rm "$DASHBOARD_PID_FILE"
            return 1
        fi
    fi
    return 1
}

# Start dashboard server
start_dashboard() {
    echo -e "${BLUE}Starting commit-relay dashboard...${NC}"

    cd "$(dirname "$0")/../dashboard" || exit 1

    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}Installing dashboard dependencies...${NC}"
        npm install
    fi

    # Start server in background
    nohup npm start > /tmp/commit-relay-dashboard.log 2>&1 &
    echo $! > "$DASHBOARD_PID_FILE"

    # Wait for server to start
    sleep 2

    if check_dashboard_running; then
        echo -e "${GREEN}✓ Dashboard started successfully${NC}"
        echo -e "${GREEN}✓ Access at: ${DASHBOARD_URL}${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠ Dashboard failed to start. Check /tmp/commit-relay-dashboard.log${NC}"
        return 1
    fi
}

# Stop dashboard server
stop_dashboard() {
    if [ -f "$DASHBOARD_PID_FILE" ]; then
        PID=$(cat "$DASHBOARD_PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            kill "$PID"
            rm "$DASHBOARD_PID_FILE"
            echo -e "${GREEN}✓ Dashboard stopped${NC}"
        fi
    fi
}

# Open dashboard in browser
open_dashboard() {
    if command -v open > /dev/null 2>&1; then
        # macOS
        open "$DASHBOARD_URL"
    elif command -v xdg-open > /dev/null 2>&1; then
        # Linux
        xdg-open "$DASHBOARD_URL"
    elif command -v start > /dev/null 2>&1; then
        # Windows
        start "$DASHBOARD_URL"
    else
        echo -e "${YELLOW}Please open ${DASHBOARD_URL} in your browser${NC}"
    fi
}

# Main prompt function
prompt_user() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  Commit-Relay Dashboard Available${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
    echo ""

    if check_dashboard_running; then
        echo -e "${GREEN}✓ Dashboard is running at ${DASHBOARD_URL}${NC}"
        echo ""
        echo "Would you like to open the dashboard?"
        echo "  [o] Open dashboard in browser"
        echo "  [r] Restart dashboard"
        echo "  [s] Stop dashboard"
        echo "  [n] No, continue without dashboard"
        echo ""
    else
        echo -e "${YELLOW}Dashboard is not running${NC}"
        echo ""
        echo "Would you like to start the dashboard?"
        echo "  [y] Yes, start and open dashboard"
        echo "  [n] No, continue without dashboard"
        echo ""
    fi

    read -p "Choice: " -n 1 -r choice
    echo ""

    case "$choice" in
        y|Y)
            if ! check_dashboard_running; then
                start_dashboard && open_dashboard
            fi
            ;;
        o|O)
            if check_dashboard_running; then
                open_dashboard
            else
                echo -e "${YELLOW}Dashboard not running. Starting...${NC}"
                start_dashboard && open_dashboard
            fi
            ;;
        r|R)
            stop_dashboard
            sleep 1
            start_dashboard && open_dashboard
            ;;
        s|S)
            stop_dashboard
            ;;
        n|N)
            echo -e "${BLUE}Continuing without dashboard...${NC}"
            ;;
        *)
            echo -e "${YELLOW}Invalid choice. Continuing without dashboard...${NC}"
            ;;
    esac

    echo ""
}

# Check if called with command-line arguments
if [ "$1" == "start" ]; then
    start_dashboard
    exit $?
elif [ "$1" == "stop" ]; then
    stop_dashboard
    exit 0
elif [ "$1" == "status" ]; then
    if check_dashboard_running; then
        echo -e "${GREEN}✓ Dashboard is running${NC}"
        echo -e "${GREEN}  URL: ${DASHBOARD_URL}${NC}"
        PID=$(cat "$DASHBOARD_PID_FILE")
        echo -e "${GREEN}  PID: ${PID}${NC}"
    else
        echo -e "${YELLOW}Dashboard is not running${NC}"
    fi
    exit 0
elif [ "$1" == "open" ]; then
    if check_dashboard_running; then
        open_dashboard
    else
        echo -e "${YELLOW}Dashboard is not running. Starting...${NC}"
        start_dashboard && open_dashboard
    fi
    exit 0
else
    # Interactive prompt
    prompt_user
fi
