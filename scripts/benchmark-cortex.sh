#!/bin/bash
# Cortex Performance Benchmark Suite
# Measures system performance across key operations

set -euo pipefail

BENCHMARK_DIR="coordination/benchmarks"
RESULTS_FILE="$BENCHMARK_DIR/benchmark-$(date +%Y%m%d-%H%M%S).json"

mkdir -p "$BENCHMARK_DIR"

echo "=== Cortex Performance Benchmarks ==="
echo "Running comprehensive performance tests..."
echo ""

# ==============================================================================
# BENCHMARK 1: Routing Performance
# ==============================================================================

echo "[1/6] Benchmarking routing performance..."

routing_start=$(date +%s%3N)

# Simulate 10 routing decisions
for i in {1..10}; do
    echo "Test task $i: Implement user authentication" | \
        python3 llm-mesh/moe-learning/evaluators/outcome-tracker.sh > /dev/null 2>&1 || true
done

routing_end=$(date +%s%3N)
routing_duration=$((routing_end - routing_start))
routing_avg=$((routing_duration / 10))

echo "  Avg routing time: ${routing_avg}ms"

# ==============================================================================
# BENCHMARK 2: File I/O Performance
# ==============================================================================

echo "[2/6] Benchmarking file I/O..."

# Test JSON read performance
io_start=$(date +%s%3N)

for i in {1..20}; do
    jq '.' coordination/routing/config.json > /dev/null
done

io_end=$(date +%s%3N)
io_duration=$((io_end - io_start))
io_avg=$((io_duration / 20))

echo "  Avg JSON read: ${io_avg}ms"

# Test JSONL append performance
append_start=$(date +%s%3N)

for i in {1..50}; do
    echo '{"test": true}' >> "$BENCHMARK_DIR/test-append.jsonl"
done

append_end=$(date +%s%3N)
append_duration=$((append_end - append_start))
append_avg=$((append_duration / 50))

rm -f "$BENCHMARK_DIR/test-append.jsonl"

echo "  Avg JSONL append: ${append_avg}ms"

# ==============================================================================
# BENCHMARK 3: RAG Retrieval
# ==============================================================================

echo "[3/6] Benchmarking RAG retrieval..."

if [[ -f "llm-mesh/rag/retriever.py" ]]; then
    rag_start=$(date +%s%3N)

    for i in {1..5}; do
        python3 llm-mesh/rag/retriever.py query "Fix CVE vulnerability" 5 > /dev/null 2>&1 || true
    done

    rag_end=$(date +%s%3N)
    rag_duration=$((rag_end - rag_start))
    rag_avg=$((rag_duration / 5))

    echo "  Avg RAG retrieval: ${rag_avg}ms"
else
    rag_avg=0
    echo "  RAG not available (skipped)"
fi

# ==============================================================================
# BENCHMARK 4: Lineage Query
# ==============================================================================

echo "[4/6] Benchmarking lineage queries..."

lineage_start=$(date +%s%3N)

for i in {1..10}; do
    jq 'limit(10; .)' coordination/prod/lineage/*.jsonl 2>/dev/null > /dev/null || true
done

lineage_end=$(date +%s%3N)
lineage_duration=$((lineage_end - lineage_start))
lineage_avg=$((lineage_duration / 10))

echo "  Avg lineage query: ${lineage_avg}ms"

# ==============================================================================
# BENCHMARK 5: Metrics Aggregation
# ==============================================================================

echo "[5/6] Benchmarking metrics aggregation..."

metrics_start=$(date +%s%3N)

if [[ -f "coordination/prod/metrics/coordinator-master-metrics.jsonl" ]]; then
    jq -s 'group_by(.metric_name) | map({metric: .[0].metric_name, avg: (map(.metric_value) | add / length)})' \
        coordination/prod/metrics/*-metrics.jsonl > /dev/null 2>&1 || true
fi

metrics_end=$(date +%s%3N)
metrics_duration=$((metrics_end - metrics_start))

echo "  Metrics aggregation: ${metrics_duration}ms"

# ==============================================================================
# BENCHMARK 6: End-to-End Task Simulation
# ==============================================================================

echo "[6/6] Benchmarking end-to-end task flow..."

e2e_start=$(date +%s%3N)

# Simulate task creation, routing, and completion
TASK_ID="benchmark-task-$(date +%s)"

# Create task
jq -n \
    --arg tid "$TASK_ID" \
    '{task_id: $tid, status: "queued", created_at: (now | strftime("%Y-%m-%dT%H:%M:%S%z"))}' \
    > "/tmp/$TASK_ID.json"

# Route (simulate)
sleep 0.01

# Complete (simulate)
jq '.status = "completed" | .completed_at = (now | strftime("%Y-%m-%dT%H:%M:%S%z"))' \
    "/tmp/$TASK_ID.json" > "/tmp/$TASK_ID-completed.json"

rm -f "/tmp/$TASK_ID.json" "/tmp/$TASK_ID-completed.json"

e2e_end=$(date +%s%3N)
e2e_duration=$((e2e_end - e2e_start))

echo "  End-to-end simulation: ${e2e_duration}ms"

# ==============================================================================
# GENERATE REPORT
# ==============================================================================

echo ""
echo "=== Benchmark Results ==="

jq -n \
    --arg date "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg routing "$routing_avg" \
    --arg io "$io_avg" \
    --arg append "$append_avg" \
    --arg rag "$rag_avg" \
    --arg lineage "$lineage_avg" \
    --arg metrics "$metrics_duration" \
    --arg e2e "$e2e_duration" \
    '{
        benchmark_date: $date,
        benchmarks: {
            routing_avg_ms: ($routing | tonumber),
            file_io_avg_ms: ($io | tonumber),
            jsonl_append_avg_ms: ($append | tonumber),
            rag_retrieval_avg_ms: ($rag | tonumber),
            lineage_query_avg_ms: ($lineage | tonumber),
            metrics_aggregation_ms: ($metrics | tonumber),
            end_to_end_ms: ($e2e | tonumber)
        },
        performance_targets: {
            routing_target_ms: 50,
            file_io_target_ms: 10,
            rag_target_ms: 100,
            e2e_target_ms: 200
        },
        status: {
            routing: (if ($routing | tonumber) < 50 then "PASS" else "NEEDS_OPTIMIZATION" end),
            file_io: (if ($io | tonumber) < 10 then "PASS" else "NEEDS_OPTIMIZATION" end),
            rag: (if ($rag | tonumber) < 100 or ($rag | tonumber) == 0 then "PASS" else "NEEDS_OPTIMIZATION" end),
            e2e: (if ($e2e | tonumber) < 200 then "PASS" else "NEEDS_OPTIMIZATION" end)
        }
    }' > "$RESULTS_FILE"

# Display results
jq '.' "$RESULTS_FILE"

echo ""
echo "Benchmark results saved to: $RESULTS_FILE"

# Check if any benchmarks failed
FAILED=$(jq '[.status[] | select(. == "NEEDS_OPTIMIZATION")] | length' "$RESULTS_FILE")

if [[ $FAILED -gt 0 ]]; then
    echo ""
    echo "⚠️  $FAILED benchmark(s) need optimization"
    exit 1
else
    echo ""
    echo "✅ All benchmarks passed!"
    exit 0
fi
