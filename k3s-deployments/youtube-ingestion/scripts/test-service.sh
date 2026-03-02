#!/bin/bash

# Test script for YouTube Ingestion Service
# Tests all major endpoints and features

set -e

# Configuration
SERVICE_URL="${SERVICE_URL:-http://localhost:8080}"
TEST_VIDEO_ID="dQw4w9WgXcQ"  # Rick Astley - Never Gonna Give You Up
TEST_VIDEO_URL="https://www.youtube.com/watch?v=${TEST_VIDEO_ID}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=============================================="
echo "  YouTube Ingestion Service - Test Suite"
echo "=============================================="
echo ""
echo "Service URL: $SERVICE_URL"
echo "Test Video: $TEST_VIDEO_URL"
echo ""

# Function to print test status
test_passed() {
    echo -e "${GREEN}✓ $1${NC}"
}

test_failed() {
    echo -e "${RED}✗ $1${NC}"
    exit 1
}

test_info() {
    echo -e "${YELLOW}→ $1${NC}"
}

# Test 1: Health Check
test_info "Test 1: Health Check"
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "$SERVICE_URL/health")
HTTP_CODE=$(echo "$HEALTH_RESPONSE" | tail -n1)
BODY=$(echo "$HEALTH_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ]; then
    test_passed "Health check successful"
    echo "$BODY" | jq '.'
else
    test_failed "Health check failed (HTTP $HTTP_CODE)"
fi
echo ""

# Test 2: Get Stats
test_info "Test 2: Get Statistics"
STATS_RESPONSE=$(curl -s -w "\n%{http_code}" "$SERVICE_URL/stats")
HTTP_CODE=$(echo "$STATS_RESPONSE" | tail -n1)
BODY=$(echo "$STATS_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ]; then
    test_passed "Stats retrieved successfully"
    echo "$BODY" | jq '.'
else
    test_failed "Stats retrieval failed (HTTP $HTTP_CODE)"
fi
echo ""

# Test 3: Ingest Video (may fail if no captions or already exists)
test_info "Test 3: Ingest Video"
test_info "Note: This may take 30-60 seconds..."
INGEST_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$SERVICE_URL/ingest" \
    -H "Content-Type: application/json" \
    -d "{\"url\": \"$TEST_VIDEO_URL\"}")

HTTP_CODE=$(echo "$INGEST_RESPONSE" | tail -n1)
BODY=$(echo "$INGEST_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ]; then
    test_passed "Video ingested successfully"
    echo "$BODY" | jq '.knowledge | {title, category, relevance_to_cortex, summary}'
else
    test_info "Ingestion failed (HTTP $HTTP_CODE) - may be expected if video has no captions"
    echo "$BODY" | jq '.'
fi
echo ""

# Test 4: Get Specific Video
test_info "Test 4: Retrieve Video by ID"
VIDEO_RESPONSE=$(curl -s -w "\n%{http_code}" "$SERVICE_URL/video/$TEST_VIDEO_ID")
HTTP_CODE=$(echo "$VIDEO_RESPONSE" | tail -n1)
BODY=$(echo "$VIDEO_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ]; then
    test_passed "Video retrieved successfully"
    echo "$BODY" | jq '{video_id, title, category, relevance_to_cortex}'
elif [ "$HTTP_CODE" -eq 404 ]; then
    test_info "Video not found (expected if ingestion failed)"
else
    test_failed "Video retrieval failed (HTTP $HTTP_CODE)"
fi
echo ""

# Test 5: List Videos
test_info "Test 5: List All Videos"
LIST_RESPONSE=$(curl -s -w "\n%{http_code}" "$SERVICE_URL/videos?limit=5")
HTTP_CODE=$(echo "$LIST_RESPONSE" | tail -n1)
BODY=$(echo "$LIST_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ]; then
    COUNT=$(echo "$BODY" | jq '.count')
    test_passed "Listed $COUNT videos"
    echo "$BODY" | jq '.videos[] | {title, category, relevance_to_cortex}'
else
    test_failed "List videos failed (HTTP $HTTP_CODE)"
fi
echo ""

# Test 6: Search Videos
test_info "Test 6: Search Videos"
SEARCH_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$SERVICE_URL/search" \
    -H "Content-Type: application/json" \
    -d '{"minRelevance": 0.5, "limit": 10}')

HTTP_CODE=$(echo "$SEARCH_RESPONSE" | tail -n1)
BODY=$(echo "$SEARCH_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ]; then
    COUNT=$(echo "$BODY" | jq '.count')
    test_passed "Search found $COUNT videos"
    echo "$BODY" | jq '.results[] | {title, category, relevance_to_cortex}' | head -20
else
    test_failed "Search failed (HTTP $HTTP_CODE)"
fi
echo ""

# Test 7: Process Message (URL Detection)
test_info "Test 7: Process Message with URL Detection"
MESSAGE="Check out this video: $TEST_VIDEO_URL - it's great!"
PROCESS_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$SERVICE_URL/process" \
    -H "Content-Type: application/json" \
    -d "{\"message\": \"$MESSAGE\"}")

HTTP_CODE=$(echo "$PROCESS_RESPONSE" | tail -n1)
BODY=$(echo "$PROCESS_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ]; then
    DETECTED=$(echo "$BODY" | jq -r '.detected')
    if [ "$DETECTED" = "true" ]; then
        test_passed "URL detected in message"
        echo "$BODY" | jq '.'
    else
        test_failed "URL not detected in message"
    fi
else
    test_failed "Process message failed (HTTP $HTTP_CODE)"
fi
echo ""

# Test 8: Get Improvements
test_info "Test 8: Get Improvement Proposals"
IMPROVE_RESPONSE=$(curl -s -w "\n%{http_code}" "$SERVICE_URL/improvements")
HTTP_CODE=$(echo "$IMPROVE_RESPONSE" | tail -n1)
BODY=$(echo "$IMPROVE_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ]; then
    COUNT=$(echo "$BODY" | jq '.count')
    test_passed "Found $COUNT improvement proposals"
    if [ "$COUNT" -gt 0 ]; then
        echo "$BODY" | jq '.improvements[0]' | head -20
    fi
else
    test_failed "Get improvements failed (HTTP $HTTP_CODE)"
fi
echo ""

# Test 9: Meta-Review (optional, may take a while)
if [ "${RUN_META_REVIEW:-false}" = "true" ]; then
    test_info "Test 9: Perform Meta-Review"
    test_info "Note: This may take 30-60 seconds..."
    REVIEW_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$SERVICE_URL/meta-review" \
        -H "Content-Type: application/json" \
        -d '{"lookbackDays": 30, "minVideos": 1}')

    HTTP_CODE=$(echo "$REVIEW_RESPONSE" | tail -n1)
    BODY=$(echo "$REVIEW_RESPONSE" | sed '$d')

    if [ "$HTTP_CODE" -eq 200 ]; then
        STATUS=$(echo "$BODY" | jq -r '.status')
        if [ "$STATUS" = "complete" ]; then
            test_passed "Meta-review completed"
            echo "$BODY" | jq '{status, videos_analyzed, analysis}'
        elif [ "$STATUS" = "insufficient_data" ]; then
            test_info "Insufficient data for meta-review"
            echo "$BODY" | jq '.'
        fi
    else
        test_failed "Meta-review failed (HTTP $HTTP_CODE)"
    fi
    echo ""
fi

# Summary
echo "=============================================="
echo "  Test Suite Complete!"
echo "=============================================="
echo ""
echo "Next steps:"
echo "  1. Ingest more videos with: curl -X POST $SERVICE_URL/ingest -d '{\"url\": \"YOUTUBE_URL\"}'"
echo "  2. Search knowledge with: curl -X POST $SERVICE_URL/search -d '{\"category\": \"tutorial\"}'"
echo "  3. Review improvements: curl $SERVICE_URL/improvements"
echo ""
echo "For meta-review, run: RUN_META_REVIEW=true $0"
echo ""
