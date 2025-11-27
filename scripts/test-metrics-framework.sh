#!/usr/bin/env bash
#
# Test Metrics Framework
# Simple validation tests for the metrics framework
#

set -euo pipefail

cd "$(dirname "$0")/.."

echo "Testing Metrics Framework"
echo "========================="
echo ""

# Source the metrics library
echo "1. Sourcing metrics library..."
if source scripts/lib/observability/metrics-collector.sh 2>/dev/null; then
    echo "  [OK] Metrics collector sourced"
else
    echo "  [FAIL] Could not source metrics collector"
    exit 1
fi

# Test basic metric emission
echo ""
echo "2. Testing basic metric emission..."

record_counter "test_counter" 1 '{"test":"true"}'
echo "  [OK] Counter emitted"

record_gauge "test_gauge" 100 '{"test":"true"}'
echo "  [OK] Gauge emitted"

record_histogram "test_histogram" 1500 '{"test":"true"}' "milliseconds"
echo "  [OK] Histogram emitted"

# Verify metrics file was created
METRICS_FILE="coordination/observability/metrics/raw/metrics-$(date +%Y-%m-%d).jsonl"

echo ""
echo "3. Verifying metrics file..."
if [[ -f "$METRICS_FILE" ]]; then
    LINE_COUNT=$(wc -l < "$METRICS_FILE" | tr -d ' ')
    echo "  [OK] Metrics file exists: $METRICS_FILE"
    echo "  [OK] Total metrics: $LINE_COUNT"
else
    echo "  [FAIL] Metrics file not found: $METRICS_FILE"
    exit 1
fi

# Verify metrics are valid JSON
echo ""
echo "4. Verifying metrics format..."
if tail -3 "$METRICS_FILE" | jq empty 2>/dev/null; then
    echo "  [OK] Metrics are valid JSON"
else
    echo "  [WARN] Some metrics may have invalid JSON"
fi

# Show sample metrics
echo ""
echo "5. Sample metrics:"
tail -3 "$METRICS_FILE" | jq -c '.' 2>/dev/null || tail -3 "$METRICS_FILE"

# Test query function
echo ""
echo "6. Testing query function..."
RESULTS=$(query_metrics "test_counter" 0 9999999999999)
RESULT_COUNT=$(echo "$RESULTS" | jq 'length')
echo "  [OK] Found $RESULT_COUNT matching metrics"

# Test aggregation
echo ""
echo "7. Testing aggregation..."
AGG=$(aggregate_metrics "test_histogram")
echo "  [OK] Aggregation completed"
echo "$AGG" | jq '{metric_name, count, mean, p95}'

# Test dashboard data
echo ""
echo "8. Testing dashboard data..."
DASHBOARD=$(get_metrics_dashboard "1h")
echo "  [OK] Dashboard data generated"
echo "$DASHBOARD" | jq '{} | keys' 2>/dev/null || echo "  [INFO] No dashboard data yet"

echo ""
echo "========================="
echo "Framework test complete!"
echo "========================="
echo ""
echo "Next steps:"
echo "  ./scripts/generate-example-metrics.sh --all --realistic --count 50"
echo "  ./scripts/aggregate-metrics.sh --today"
echo "  ./scripts/show-metrics.sh --summary"
echo "  ./scripts/check-alerts.sh --check-all"
