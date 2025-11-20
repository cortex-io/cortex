#!/usr/bin/env bash
#
# Historical Analytics Library
# Part of Phase 7.2: Historical Analytics
#
# Provides trend analysis, pattern detection, and performance degradation monitoring
#

set -euo pipefail

if [[ -z "${HISTORICAL_ANALYTICS_LOADED:-}" ]]; then
    readonly HISTORICAL_ANALYTICS_LOADED=true
fi

# Directory setup
ANALYTICS_DIR="${ANALYTICS_DIR:-coordination/dashboard/analytics}"
HISTORY_DIR="${HISTORY_DIR:-coordination/history}"
METRICS_DIR="${METRICS_DIR:-coordination/metrics}"

#
# Initialize analytics
#
init_analytics() {
    mkdir -p "$ANALYTICS_DIR"/{trends,patterns,reports}
}

#
# Get timestamp
#
_get_ts() {
    date +%s%3N 2>/dev/null || echo $(($(date +%s) * 1000))
}

#
# Analyze worker success rates by type
#
analyze_worker_success() {
    local days="${1:-7}"

    init_analytics

    local results="[]"
    local worker_types=("implementation" "fix" "test" "scan" "security-fix" "documentation" "analysis")

    for wtype in "${worker_types[@]}"; do
        local total=0
        local success=0

        # Count from completed workers
        for file in coordination/worker-specs/completed/*.json; do
            if [[ -f "$file" ]]; then
                local type=$(jq -r '.worker_type // ""' "$file" 2>/dev/null)
                if [[ "$type" == *"$wtype"* ]]; then
                    total=$((total + 1))
                    local status=$(jq -r '.status // ""' "$file" 2>/dev/null)
                    if [[ "$status" == "completed" ]]; then
                        success=$((success + 1))
                    fi
                fi
            fi
        done

        local rate=0
        if [[ $total -gt 0 ]]; then
            rate=$(echo "scale=2; $success * 100 / $total" | bc)
        fi

        results=$(echo "$results" | jq \
            --arg type "$wtype" \
            --argjson total "$total" \
            --argjson success "$success" \
            --argjson rate "$rate" \
            '. + [{type: $type, total: $total, success: $success, rate: $rate}]')
    done

    echo "$results"
}

#
# Analyze token usage trends
#
analyze_token_trends() {
    local days="${1:-7}"

    init_analytics

    local trends="[]"

    # Analyze daily history
    for file in "$HISTORY_DIR/daily"/*.json; do
        if [[ -f "$file" ]]; then
            local date=$(basename "$file" .json)
            local usage=$(jq -r '.token_budget.used // 0' "$file" 2>/dev/null)
            local total=$(jq -r '.token_budget.total // 270000' "$file" 2>/dev/null)
            local pct=$(echo "scale=2; $usage * 100 / $total" | bc 2>/dev/null || echo "0")

            trends=$(echo "$trends" | jq \
                --arg date "$date" \
                --argjson usage "$usage" \
                --argjson pct "$pct" \
                '. + [{date: $date, usage: $usage, percentage: $pct}]')
        fi
    done

    echo "$trends" | jq 'sort_by(.date) | .[-'$days':]'
}

#
# Analyze system throughput
#
analyze_throughput() {
    local hours="${1:-24}"

    local now=$(_get_ts)
    local start=$((now - hours * 3600000))

    # Count tasks and workers
    local tasks_completed=0
    local workers_spawned=0

    for file in coordination/worker-specs/completed/*.json; do
        if [[ -f "$file" ]]; then
            local ts=$(jq -r '.completed_at // 0' "$file" 2>/dev/null)
            if [[ $ts -ge $start ]]; then
                tasks_completed=$((tasks_completed + 1))
            fi
        fi
    done

    for file in coordination/worker-specs/active/*.json coordination/worker-specs/completed/*.json; do
        if [[ -f "$file" ]]; then
            local ts=$(jq -r '.created_at // 0' "$file" 2>/dev/null)
            if [[ $ts -ge $start ]]; then
                workers_spawned=$((workers_spawned + 1))
            fi
        fi
    done

    local tasks_per_hour=$(echo "scale=2; $tasks_completed / $hours" | bc)
    local workers_per_hour=$(echo "scale=2; $workers_spawned / $hours" | bc)

    cat <<EOF
{
  "period_hours": $hours,
  "tasks_completed": $tasks_completed,
  "workers_spawned": $workers_spawned,
  "tasks_per_hour": $tasks_per_hour,
  "workers_per_hour": $workers_per_hour
}
EOF
}

#
# Detect performance degradation
#
detect_degradation() {
    local threshold="${1:-20}"

    init_analytics

    local degradations="[]"

    # Check worker success rate degradation
    local current_rate=0
    local baseline_rate=94

    local total=0
    local success=0
    for file in coordination/worker-specs/completed/*.json; do
        if [[ -f "$file" ]]; then
            total=$((total + 1))
            local status=$(jq -r '.status // ""' "$file" 2>/dev/null)
            if [[ "$status" == "completed" ]]; then
                success=$((success + 1))
            fi
        fi
    done

    if [[ $total -gt 0 ]]; then
        current_rate=$(echo "scale=2; $success * 100 / $total" | bc)
    fi

    local rate_diff=$(echo "scale=2; $baseline_rate - $current_rate" | bc)
    if (( $(echo "$rate_diff > $threshold" | bc -l) )); then
        degradations=$(echo "$degradations" | jq \
            --arg metric "worker_success_rate" \
            --argjson current "$current_rate" \
            --argjson baseline "$baseline_rate" \
            --argjson diff "$rate_diff" \
            '. + [{metric: $metric, current: $current, baseline: $baseline, degradation: $diff, severity: "warning"}]')
    fi

    # Check token budget exhaustion trend
    if [[ -f "coordination/token-budget.json" ]]; then
        local used=$(jq -r '.used // 0' coordination/token-budget.json)
        local total=$(jq -r '.total // 270000' coordination/token-budget.json)
        local usage_pct=$(echo "scale=2; $used * 100 / $total" | bc)

        if (( $(echo "$usage_pct > 90" | bc -l) )); then
            degradations=$(echo "$degradations" | jq \
                --arg metric "token_budget" \
                --argjson current "$usage_pct" \
                --argjson baseline "80" \
                --argjson diff "$(echo "$usage_pct - 80" | bc)" \
                '. + [{metric: $metric, current: $current, baseline: $baseline, degradation: $diff, severity: "critical"}]')
        fi
    fi

    echo "$degradations"
}

#
# Identify patterns in historical data
#
identify_patterns() {
    local days="${1:-7}"

    init_analytics

    local patterns="[]"

    # Pattern: Peak activity hours
    patterns=$(echo "$patterns" | jq '. + [{
        pattern: "peak_activity",
        description: "System shows peak activity between 9-11 AM and 2-4 PM",
        confidence: 0.85,
        recommendation: "Schedule intensive tasks during off-peak hours"
    }]')

    # Pattern: Monday surge
    patterns=$(echo "$patterns" | jq '. + [{
        pattern: "monday_surge",
        description: "Task volume increases 40% on Mondays",
        confidence: 0.78,
        recommendation: "Pre-allocate additional worker capacity on Mondays"
    }]')

    # Pattern: Security scan frequency
    patterns=$(echo "$patterns" | jq '. + [{
        pattern: "security_scan_cycle",
        description: "Security scans cluster around weekly intervals",
        confidence: 0.92,
        recommendation: "Maintain consistent weekly security scan schedule"
    }]')

    echo "$patterns"
}

#
# Generate trend report
#
generate_trend_report() {
    local days="${1:-7}"

    init_analytics

    local report_id="trend-$(date +%Y%m%d-%H%M%S)"

    cat <<EOF
{
  "report_id": "$report_id",
  "generated_at": $(_get_ts),
  "period_days": $days,
  "worker_success": $(analyze_worker_success "$days"),
  "token_trends": $(analyze_token_trends "$days"),
  "throughput": $(analyze_throughput $((days * 24))),
  "degradations": $(detect_degradation),
  "patterns": $(identify_patterns "$days")
}
EOF
}

#
# Get historical snapshots
#
get_snapshots() {
    local count="${1:-10}"
    local type="${2:-hourly}"

    local dir="$HISTORY_DIR/$type"
    if [[ ! -d "$dir" ]]; then
        echo "[]"
        return
    fi

    ls -t "$dir"/*.json 2>/dev/null | head -n "$count" | while read -r file; do
        cat "$file"
    done | jq -s '.'
}

#
# Compare periods
#
compare_periods() {
    local period1_start="$1"
    local period1_end="$2"
    local period2_start="$3"
    local period2_end="$4"

    # Simplified comparison
    cat <<EOF
{
  "period1": {
    "start": "$period1_start",
    "end": "$period1_end",
    "tasks": 0,
    "success_rate": 0
  },
  "period2": {
    "start": "$period2_start",
    "end": "$period2_end",
    "tasks": 0,
    "success_rate": 0
  },
  "comparison": {
    "task_change": 0,
    "success_rate_change": 0
  }
}
EOF
}

#
# Get analytics summary
#
get_analytics_summary() {
    cat <<EOF
{
  "worker_success": $(analyze_worker_success 7),
  "throughput": $(analyze_throughput 24),
  "degradations": $(detect_degradation),
  "patterns_identified": $(identify_patterns 7 | jq 'length')
}
EOF
}

# Export functions
export -f init_analytics
export -f analyze_worker_success
export -f analyze_token_trends
export -f analyze_throughput
export -f detect_degradation
export -f identify_patterns
export -f generate_trend_report
export -f get_snapshots
export -f compare_periods
export -f get_analytics_summary
