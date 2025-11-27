#!/usr/bin/env bash
#
# Generate Example Metrics - Create test data for metrics framework
# Generates realistic sample metrics for testing dashboard and alerts
#
# Usage:
#   ./scripts/generate-example-metrics.sh [OPTIONS]
#

set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Source metrics library
source "$SCRIPT_DIR/lib/metrics.sh"

#
# Print usage
#
usage() {
    cat << EOF
Generate Example Metrics - Test Data Generator

Usage:
    $0 [OPTIONS]

Options:
    --count <n>         Number of metrics to generate per type (default: 100)
    --masters           Generate master metrics
    --workers           Generate worker metrics
    --tasks             Generate task metrics
    --tokens            Generate token usage metrics
    --routing           Generate routing metrics
    --alerts            Generate alert conditions
    --all               Generate all metric types
    --realistic         Use realistic timing distributions
    --help              Show this help

Examples:
    $0 --all                        # Generate all metrics
    $0 --workers --count 50         # Generate 50 worker metrics
    $0 --realistic --all            # Realistic data for all types
EOF
    exit 0
}

#
# Generate random number in range
#
random_range() {
    local min="$1"
    local max="$2"
    echo $((min + RANDOM % (max - min + 1)))
}

#
# Generate random duration with realistic distribution
# Uses log-normal distribution approximation
#
random_duration_ms() {
    local mean="$1"
    local stddev="$2"

    # Simple approximation: use multiple random values
    local sum=0
    for i in {1..12}; do
        sum=$((sum + RANDOM % 1000))
    done

    local normalized=$((sum / 12 - 500))  # Center around 0
    local duration=$((mean + (normalized * stddev / 500)))

    # Ensure positive
    if [[ $duration -lt 100 ]]; then
        echo 100
    else
        echo $duration
    fi
}

#
# Generate master metrics
#
generate_master_metrics() {
    local count="${1:-100}"
    local realistic="${2:-false}"

    echo "Generating $count master metrics..."

    local masters=("development-master" "security-master" "inventory-master" "cicd-master" "coordinator-master")

    for i in $(seq 1 $count); do
        local master="${masters[$((RANDOM % ${#masters[@]}))]}"

        if [[ "$realistic" == "true" ]]; then
            # Realistic task processing times (30s - 5min, log-normal)
            local task_time=$(random_duration_ms 120000 60000)
        else
            # Uniform distribution
            local task_time=$(random_range 30000 300000)
        fi

        emit_master_metric "$master" "task_processing_time_ms" "$task_time" \
            "{\"task_type\":\"$([ $((RANDOM % 2)) -eq 0 ] && echo 'feature' || echo 'bugfix')\"}" "milliseconds"

        # Occasional high token usage
        if [[ $((RANDOM % 10)) -eq 0 ]]; then
            local tokens=$(random_range 40000 80000)
        else
            local tokens=$(random_range 5000 30000)
        fi

        emit_token_usage "task-$i" "$tokens" "master" "processing"

        sleep 0.01  # Prevent overwhelming system
    done

    echo "Generated $count master metrics"
}

#
# Generate worker metrics
#
generate_worker_metrics() {
    local count="${1:-100}"
    local realistic="${2:-false}"

    echo "Generating $count worker metrics..."

    local worker_types=("scan" "implementation" "documentation" "analysis" "test" "review")

    for i in $(seq 1 $count); do
        local worker_id="test-worker-$i"
        local worker_type="${worker_types[$((RANDOM % ${#worker_types[@]}))]}"

        # Worker spawn success (90% success rate)
        if [[ $((RANDOM % 10)) -eq 0 ]]; then
            emit_worker_spawn_result "$worker_id" "failed" "{\"worker_type\":\"$worker_type\"}"
        else
            emit_worker_spawn_result "$worker_id" "success" "{\"worker_type\":\"$worker_type\"}"

            # Worker completion
            if [[ "$realistic" == "true" ]]; then
                # Realistic durations: scan=30s, impl=5min, doc=2min
                case "$worker_type" in
                    scan)
                        local duration=$(random_duration_ms 30000 10000)
                        ;;
                    implementation)
                        local duration=$(random_duration_ms 300000 120000)
                        ;;
                    documentation)
                        local duration=$(random_duration_ms 120000 40000)
                        ;;
                    *)
                        local duration=$(random_duration_ms 60000 30000)
                        ;;
                esac
            else
                local duration=$(random_range 10000 300000)
            fi

            # 95% success rate
            if [[ $((RANDOM % 20)) -eq 0 ]]; then
                emit_worker_completion "$worker_id" "$duration" "failed" 0
            else
                local tokens=$(random_range 3000 25000)
                emit_worker_completion "$worker_id" "$duration" "completed" "$tokens"
            fi
        fi

        sleep 0.01
    done

    echo "Generated $count worker metrics"
}

#
# Generate task metrics
#
generate_task_metrics() {
    local count="${1:-100}"
    local realistic="${2:-false}"

    echo "Generating $count task metrics..."

    local task_types=("feature" "bugfix" "refactor" "optimization" "documentation")

    for i in $(seq 1 $count); do
        local task_id="test-task-$i"
        local task_type="${task_types[$((RANDOM % ${#task_types[@]}))]}"

        if [[ "$realistic" == "true" ]]; then
            # Most tasks complete within SLA
            if [[ $((RANDOM % 100)) -lt 90 ]]; then
                # 90% within SLA (< 5min)
                local duration=$(random_duration_ms 150000 90000)
            else
                # 10% breach SLA
                local duration=$(random_range 300000 600000)
            fi
        else
            local duration=$(random_range 60000 400000)
        fi

        local master_id="${task_type}-master"
        [[ "$task_type" == "feature" ]] && master_id="development-master"
        [[ "$task_type" == "bugfix" ]] && master_id="development-master"

        emit_task_processing_time "$task_id" "$duration" "$task_type" "$master_id"

        sleep 0.01
    done

    echo "Generated $count task metrics"
}

#
# Generate token usage metrics
#
generate_token_metrics() {
    local count="${1:-100}"
    local realistic="${2:-false}"

    echo "Generating $count token usage metrics..."

    local entity_types=("worker" "master" "orchestrator")
    local operations=("processing" "analysis" "generation" "review")

    for i in $(seq 1 $count); do
        local entity_type="${entity_types[$((RANDOM % ${#entity_types[@]}))]}"
        local operation="${operations[$((RANDOM % ${#operations[@]}))]}"
        local entity_id="test-entity-$i"

        if [[ "$realistic" == "true" ]]; then
            # Most usage is normal
            if [[ $((RANDOM % 100)) -lt 95 ]]; then
                # Normal usage
                local tokens=$(random_range 5000 30000)
            else
                # 5% high usage (should trigger alerts)
                local tokens=$(random_range 50000 100000)
            fi
        else
            local tokens=$(random_range 1000 80000)
        fi

        emit_token_usage "$entity_id" "$tokens" "$entity_type" "$operation"

        sleep 0.01
    done

    echo "Generated $count token usage metrics"
}

#
# Generate routing metrics
#
generate_routing_metrics() {
    local count="${1:-100}"
    local realistic="${2:-false}"

    echo "Generating $count routing metrics..."

    local masters=("development-master" "security-master" "inventory-master" "cicd-master")
    local methods=("hybrid" "semantic" "keyword" "learning")

    for i in $(seq 1 $count); do
        local task_id="test-task-$i"
        local selected_master="${masters[$((RANDOM % ${#masters[@]}))]}"
        local method="${methods[$((RANDOM % ${#methods[@]}))]}"

        if [[ "$realistic" == "true" ]]; then
            # Most routing has high confidence
            if [[ $((RANDOM % 100)) -lt 85 ]]; then
                # 85% high confidence (0.7-1.0)
                local confidence=$(echo "scale=2; 0.7 + ($RANDOM % 30) / 100" | bc)
            else
                # 15% low confidence (0.3-0.7) - may trigger alerts
                local confidence=$(echo "scale=2; 0.3 + ($RANDOM % 40) / 100" | bc)
            fi
        else
            local confidence=$(echo "scale=2; ($RANDOM % 100) / 100" | bc)
        fi

        emit_routing_decision "$task_id" "$selected_master" "$confidence" "$method"

        # Handoffs
        if [[ $((RANDOM % 5)) -eq 0 ]]; then
            local from_master="coordinator-master"
            local to_master="$selected_master"

            # 95% success rate
            if [[ $((RANDOM % 20)) -eq 0 ]]; then
                emit_master_handoff "$from_master" "$to_master" "$task_id" "false"
            else
                emit_master_handoff "$from_master" "$to_master" "$task_id" "true"
            fi
        fi

        sleep 0.01
    done

    echo "Generated $count routing metrics"
}

#
# Generate system health metrics
#
generate_health_metrics() {
    local count="${1:-50}"
    local realistic="${2:-false}"

    echo "Generating $count health metrics..."

    local components=("worker_pool" "token_budget" "master_coordination" "rag_system" "event_stream")

    for i in $(seq 1 $count); do
        local component="${components[$((RANDOM % ${#components[@]}))]}"

        if [[ "$realistic" == "true" ]]; then
            # Most components healthy
            if [[ $((RANDOM % 100)) -lt 90 ]]; then
                # 90% healthy (80-100)
                local health=$(random_range 80 100)
            else
                # 10% degraded (50-80) - may trigger alerts
                local health=$(random_range 50 80)
            fi
        else
            local health=$(random_range 40 100)
        fi

        emit_system_health "$component" "$health" "{\"component\":\"$component\"}"

        sleep 0.01
    done

    echo "Generated $count health metrics"
}

#
# Generate RAG metrics
#
generate_rag_metrics() {
    local count="${1:-50}"
    local realistic="${2:-false}"

    echo "Generating $count RAG metrics..."

    local query_types=("semantic" "keyword" "hybrid")

    for i in $(seq 1 $count); do
        local query_type="${query_types[$((RANDOM % ${#query_types[@]}))]}"

        if [[ "$realistic" == "true" ]]; then
            # Most retrievals fast
            if [[ $((RANDOM % 100)) -lt 95 ]]; then
                # 95% fast (< 1s)
                local retrieval_time=$(random_range 100 1000)
            else
                # 5% slow (> 5s) - triggers alerts
                local retrieval_time=$(random_range 5000 10000)
            fi
        else
            local retrieval_time=$(random_range 100 8000)
        fi

        local num_results=$(random_range 1 10)

        emit_rag_retrieval "$retrieval_time" "$num_results" "$query_type"

        sleep 0.01
    done

    echo "Generated $count RAG metrics"
}

#
# Generate alert conditions
#
generate_alert_conditions() {
    echo "Generating alert condition metrics..."

    # Generate some SLA breaches
    for i in {1..5}; do
        emit_task_processing_time "sla-breach-task-$i" 350000 "feature" "development-master"
    done

    # Generate high token usage
    for i in {1..3}; do
        emit_token_usage "high-token-entity-$i" 75000 "worker" "processing"
    done

    # Generate low confidence routing
    for i in {1..3}; do
        emit_routing_decision "low-conf-task-$i" "development-master" 0.35 "hybrid"
    done

    # Generate worker spawn failures
    for i in {1..5}; do
        emit_worker_spawn_result "failed-worker-$i" "failed" '{"worker_type":"implementation"}'
    done

    # Generate low health
    emit_system_health "degraded_component" 55 '{"status":"degraded"}'

    # Generate slow RAG retrievals
    for i in {1..3}; do
        emit_rag_retrieval 6500 5 "semantic"
    done

    echo "Generated alert condition metrics"
}

#
# Main execution
#
main() {
    local count=100
    local realistic=false
    local generate_masters=false
    local generate_workers=false
    local generate_tasks=false
    local generate_tokens=false
    local generate_routing=false
    local generate_alerts=false

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --help|-h)
                usage
                ;;
            --count)
                count="$2"
                shift 2
                ;;
            --masters)
                generate_masters=true
                shift
                ;;
            --workers)
                generate_workers=true
                shift
                ;;
            --tasks)
                generate_tasks=true
                shift
                ;;
            --tokens)
                generate_tokens=true
                shift
                ;;
            --routing)
                generate_routing=true
                shift
                ;;
            --alerts)
                generate_alerts=true
                shift
                ;;
            --all)
                generate_masters=true
                generate_workers=true
                generate_tasks=true
                generate_tokens=true
                generate_routing=true
                generate_alerts=true
                shift
                ;;
            --realistic)
                realistic=true
                shift
                ;;
            *)
                echo "Unknown option: $1" >&2
                usage
                ;;
        esac
    done

    # If nothing selected, show usage
    if [[ "$generate_masters" == false ]] && \
       [[ "$generate_workers" == false ]] && \
       [[ "$generate_tasks" == false ]] && \
       [[ "$generate_tokens" == false ]] && \
       [[ "$generate_routing" == false ]] && \
       [[ "$generate_alerts" == false ]]; then
        usage
    fi

    echo "Generating example metrics..."
    echo "Count per type: $count"
    echo "Realistic distributions: $realistic"
    echo ""

    # Generate requested metrics
    [[ "$generate_masters" == true ]] && generate_master_metrics "$count" "$realistic"
    [[ "$generate_workers" == true ]] && generate_worker_metrics "$count" "$realistic"
    [[ "$generate_tasks" == true ]] && generate_task_metrics "$count" "$realistic"
    [[ "$generate_tokens" == true ]] && generate_token_metrics "$count" "$realistic"
    [[ "$generate_routing" == true ]] && generate_routing_metrics "$count" "$realistic"
    [[ "$generate_alerts" == true ]] && generate_alert_conditions

    # Also generate health and RAG metrics if --all
    if [[ "$generate_masters" == true ]] || [[ "$generate_routing" == true ]]; then
        generate_health_metrics $((count / 2)) "$realistic"
        generate_rag_metrics $((count / 2)) "$realistic"
    fi

    echo ""
    echo "Metrics generation complete!"
    echo ""
    echo "View metrics:"
    echo "  ./scripts/show-metrics.sh --summary"
    echo "  ./scripts/show-metrics.sh --workers"
    echo "  ./scripts/show-metrics.sh --tasks"
    echo ""
    echo "Aggregate metrics:"
    echo "  ./scripts/aggregate-metrics.sh --today"
    echo ""
    echo "Check alerts:"
    echo "  ./scripts/check-alerts.sh --check-all"
}

# Run main
main "$@"
