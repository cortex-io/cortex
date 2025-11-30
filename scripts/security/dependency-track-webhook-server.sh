#!/usr/bin/env bash
#
# Lightweight Webhook Server for Dependency-Track Notifications
# Receives HTTP POST webhooks and processes them with the handler
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HANDLER="$SCRIPT_DIR/dependency-track-webhook-handler.sh"

PORT="${WEBHOOK_PORT:-8888}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║      DEPENDENCY-TRACK WEBHOOK SERVER                           ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo -e "${BLUE}Starting webhook server on port $PORT...${NC}"
echo ""
echo "Configure Dependency-Track webhook:"
echo "  URL: http://localhost:$PORT/webhook"
echo "  Method: POST"
echo ""
echo -e "${GREEN}Server ready. Press Ctrl+C to stop.${NC}"
echo ""

# Simple HTTP server using netcat
while true; do
  {
    # Read HTTP request
    read -r request_line

    # Parse request method and path
    method=$(echo "$request_line" | cut -d' ' -f1)
    path=$(echo "$request_line" | cut -d' ' -f2)

    # Read headers until blank line
    content_length=0
    while read -r header; do
      header=$(echo "$header" | tr -d '\r')
      [ -z "$header" ] && break

      if [[ "$header" =~ ^Content-Length:\ ([0-9]+) ]]; then
        content_length="${BASH_REMATCH[1]}"
      fi
    done

    # Read body if present
    body=""
    if [ "$content_length" -gt 0 ]; then
      body=$(head -c "$content_length")
    fi

    # Process webhook
    if [[ "$method" == "POST" && "$path" == "/webhook" ]]; then
      echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] Received webhook${NC}" >&2

      # Process with handler
      if echo "$body" | bash "$HANDLER" 2>&1; then
        # Send success response
        echo "HTTP/1.1 200 OK"
        echo "Content-Type: application/json"
        echo "Connection: close"
        echo ""
        echo '{"status":"success","message":"Webhook processed"}'

        echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] Webhook processed successfully${NC}" >&2
      else
        # Send error response
        echo "HTTP/1.1 500 Internal Server Error"
        echo "Content-Type: application/json"
        echo "Connection: close"
        echo ""
        echo '{"status":"error","message":"Webhook processing failed"}'

        echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] Webhook processing failed${NC}" >&2
      fi
    elif [[ "$path" == "/health" ]]; then
      # Health check endpoint
      echo "HTTP/1.1 200 OK"
      echo "Content-Type: application/json"
      echo "Connection: close"
      echo ""
      echo '{"status":"healthy","service":"dependency-track-webhook-server"}'
    else
      # Not found
      echo "HTTP/1.1 404 Not Found"
      echo "Content-Type: application/json"
      echo "Connection: close"
      echo ""
      echo '{"status":"error","message":"Not found"}'
    fi

  } | nc -l -p "$PORT" -q 1

  # Small delay to prevent overwhelming
  sleep 0.1
done
