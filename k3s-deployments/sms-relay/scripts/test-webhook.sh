#!/bin/bash
# Test webhook locally

PORT=${1:-8000}
PHONE=${2:-+1234567890}

echo "Testing webhook at http://localhost:$PORT/sms"
echo "From phone: $PHONE"
echo ""

# Test 1: Initial contact
echo "Test 1: Initial contact"
curl -X POST "http://localhost:$PORT/sms" \
  -d "From=$PHONE" \
  -d "Body=hello" \
  2>/dev/null | grep -o '<Message>.*</Message>' | sed 's/<[^>]*>//g'
echo ""
echo ""

# Test 2: Network menu
echo "Test 2: Network menu"
curl -X POST "http://localhost:$PORT/sms" \
  -d "From=$PHONE" \
  -d "Body=1" \
  2>/dev/null | grep -o '<Message>.*</Message>' | sed 's/<[^>]*>//g'
echo ""
echo ""

# Test 3: Return home
echo "Test 3: Return home"
curl -X POST "http://localhost:$PORT/sms" \
  -d "From=$PHONE" \
  -d "Body=home" \
  2>/dev/null | grep -o '<Message>.*</Message>' | sed 's/<[^>]*>//g'
echo ""
echo ""

# Test 4: Help
echo "Test 4: Help"
curl -X POST "http://localhost:$PORT/sms" \
  -d "From=$PHONE" \
  -d "Body=?" \
  2>/dev/null | grep -o '<Message>.*</Message>' | sed 's/<[^>]*>//g'
echo ""
echo ""

echo "Tests complete!"
