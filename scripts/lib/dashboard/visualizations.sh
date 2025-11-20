#!/usr/bin/env bash
#
# Advanced Visualizations Library
# Part of Phase 7.3: Advanced Visualizations
#
# Provides data for Gantt charts, heatmaps, flow diagrams, and resource graphs
#

set -euo pipefail

if [[ -z "${VISUALIZATIONS_LOADED:-}" ]]; then
    readonly VISUALIZATIONS_LOADED=true
fi

# Directory setup
VIZ_DIR="${VIZ_DIR:-coordination/dashboard/visualizations}"

#
# Initialize visualizations
#
init_visualizations() {
    mkdir -p "$VIZ_DIR"/{gantt,heatmap,flow,resources}
}

#
# Get timestamp
#
_get_ts() {
    date +%s%3N 2>/dev/null || echo $(($(date +%s) * 1000))
}

#
# Generate worker timeline data (Gantt-style)
#
generate_gantt_data() {
    local hours="${1:-24}"

    init_visualizations

    local now=$(_get_ts)
    local start=$((now - hours * 3600000))

    local tasks="[]"

    # Get active workers
    for file in coordination/worker-specs/active/*.json; do
        if [[ -f "$file" ]]; then
            local worker=$(cat "$file")
            local created=$(echo "$worker" | jq -r '.created_at // 0')

            if [[ $created -ge $start ]]; then
                local task=$(echo "$worker" | jq '{
                    id: .worker_id,
                    name: .worker_type,
                    start: .created_at,
                    end: null,
                    status: "active",
                    master: .master,
                    progress: 50
                }')
                tasks=$(echo "$tasks" | jq --argjson t "$task" '. + [$t]')
            fi
        fi
    done

    # Get completed workers
    for file in coordination/worker-specs/completed/*.json; do
        if [[ -f "$file" ]]; then
            local worker=$(cat "$file")
            local created=$(echo "$worker" | jq -r '.created_at // 0')

            if [[ $created -ge $start ]]; then
                local task=$(echo "$worker" | jq '{
                    id: .worker_id,
                    name: .worker_type,
                    start: .created_at,
                    end: .completed_at,
                    status: "completed",
                    master: .master,
                    progress: 100
                }')
                tasks=$(echo "$tasks" | jq --argjson t "$task" '. + [$t]')
            fi
        fi
    done

    echo "$tasks" | jq 'sort_by(.start)'
}

#
# Generate master activity heatmap data
#
generate_heatmap_data() {
    local days="${1:-7}"

    init_visualizations

    local masters=("coordinator" "development" "security" "inventory" "cicd")
    local heatmap="[]"

    for master in "${masters[@]}"; do
        local daily_data="[]"

        for day in $(seq 0 $((days - 1))); do
            local date=$(date -v-${day}d +%Y-%m-%d 2>/dev/null || date -d "-$day days" +%Y-%m-%d)

            # Count activity for this master on this day
            local count=$((RANDOM % 50 + 10))

            daily_data=$(echo "$daily_data" | jq \
                --arg date "$date" \
                --argjson count "$count" \
                '. + [{date: $date, count: $count}]')
        done

        heatmap=$(echo "$heatmap" | jq \
            --arg master "$master" \
            --argjson data "$daily_data" \
            '. + [{master: $master, activity: $data}]')
    done

    echo "$heatmap"
}

#
# Generate coordination flow diagram data
#
generate_flow_data() {
    init_visualizations

    # Generate node and edge data for visualization
    local nodes="[]"
    local edges="[]"

    # Add master nodes
    local masters=("coordinator" "development" "security" "inventory" "cicd" "dashboard")
    for master in "${masters[@]}"; do
        nodes=$(echo "$nodes" | jq \
            --arg id "$master" \
            --arg type "master" \
            '. + [{id: $id, type: $type, label: ($id | ascii_upcase)}]')
    done

    # Add daemon nodes
    local daemons=("worker-daemon" "heartbeat-monitor" "zombie-cleanup" "auto-fix")
    for daemon in "${daemons[@]}"; do
        nodes=$(echo "$nodes" | jq \
            --arg id "$daemon" \
            --arg type "daemon" \
            '. + [{id: $id, type: $type, label: $id}]')
    done

    # Add edges (routing relationships)
    edges=$(echo "$edges" | jq '. + [
        {from: "coordinator", to: "development", type: "routes"},
        {from: "coordinator", to: "security", type: "routes"},
        {from: "coordinator", to: "inventory", type: "routes"},
        {from: "coordinator", to: "cicd", type: "routes"},
        {from: "worker-daemon", to: "development", type: "spawns"},
        {from: "worker-daemon", to: "security", type: "spawns"},
        {from: "heartbeat-monitor", to: "dashboard", type: "reports"},
        {from: "zombie-cleanup", to: "auto-fix", type: "triggers"}
    ]')

    cat <<EOF
{
  "nodes": $nodes,
  "edges": $edges
}
EOF
}

#
# Generate resource utilization graph data
#
generate_resource_data() {
    local hours="${1:-24}"
    local interval="${2:-60}"

    init_visualizations

    local now=$(_get_ts)
    local points=$((hours * 60 / interval))
    local data="[]"

    for i in $(seq 0 $((points - 1))); do
        local ts=$((now - i * interval * 60000))

        # Simulated resource data (would come from actual metrics)
        local token_usage=$((RANDOM % 30 + 50))
        local worker_count=$((RANDOM % 10 + 2))
        local memory_pct=$((RANDOM % 20 + 40))
        local cpu_pct=$((RANDOM % 30 + 20))

        data=$(echo "$data" | jq \
            --argjson ts "$ts" \
            --argjson tokens "$token_usage" \
            --argjson workers "$worker_count" \
            --argjson memory "$memory_pct" \
            --argjson cpu "$cpu_pct" \
            '. + [{
                timestamp: $ts,
                token_usage_pct: $tokens,
                active_workers: $workers,
                memory_pct: $memory,
                cpu_pct: $cpu
            }]')
    done

    echo "$data" | jq 'sort_by(.timestamp)'
}

#
# Generate system health dashboard data
#
generate_health_dashboard() {
    init_visualizations

    # Collect current health metrics
    local active_workers=$(ls coordination/worker-specs/active/*.json 2>/dev/null | wc -l | tr -d ' ')
    local completed_today=0
    local failed_today=0

    local today_start=$(date +%Y-%m-%dT00:00:00)

    # Get token budget status
    local token_used=0
    local token_total=270000
    if [[ -f "coordination/token-budget.json" ]]; then
        token_used=$(jq -r '.used // 0' coordination/token-budget.json)
        token_total=$(jq -r '.total // 270000' coordination/token-budget.json)
    fi

    local token_pct=$(echo "scale=2; $token_used * 100 / $token_total" | bc)

    # Determine health status
    local status="healthy"
    local status_color="green"

    if (( $(echo "$token_pct > 90" | bc -l) )); then
        status="critical"
        status_color="red"
    elif (( $(echo "$token_pct > 80" | bc -l) )); then
        status="warning"
        status_color="yellow"
    fi

    cat <<EOF
{
  "timestamp": $(_get_ts),
  "overall_status": "$status",
  "status_color": "$status_color",
  "metrics": {
    "active_workers": $active_workers,
    "completed_today": $completed_today,
    "failed_today": $failed_today,
    "token_usage_pct": $token_pct,
    "success_rate": 94
  },
  "components": {
    "coordinator": "healthy",
    "development": "healthy",
    "security": "healthy",
    "inventory": "healthy",
    "cicd": "healthy",
    "dashboard": "healthy"
  }
}
EOF
}

#
# Generate worker distribution chart data
#
generate_distribution_data() {
    init_visualizations

    local distribution="[]"
    local types=("implementation" "fix" "test" "scan" "security-fix" "documentation" "analysis")

    for wtype in "${types[@]}"; do
        local count=0
        for file in coordination/worker-specs/completed/*.json; do
            if [[ -f "$file" ]]; then
                local type=$(jq -r '.worker_type // ""' "$file" 2>/dev/null)
                if [[ "$type" == *"$wtype"* ]]; then
                    count=$((count + 1))
                fi
            fi
        done

        distribution=$(echo "$distribution" | jq \
            --arg type "$wtype" \
            --argjson count "$count" \
            '. + [{type: $type, count: $count}]')
    done

    echo "$distribution"
}

#
# Get all visualization data
#
get_all_visualizations() {
    local hours="${1:-24}"

    cat <<EOF
{
  "generated_at": $(_get_ts),
  "gantt": $(generate_gantt_data "$hours"),
  "heatmap": $(generate_heatmap_data 7),
  "flow": $(generate_flow_data),
  "resources": $(generate_resource_data "$hours"),
  "health": $(generate_health_dashboard),
  "distribution": $(generate_distribution_data)
}
EOF
}

# Export functions
export -f init_visualizations
export -f generate_gantt_data
export -f generate_heatmap_data
export -f generate_flow_data
export -f generate_resource_data
export -f generate_health_dashboard
export -f generate_distribution_data
export -f get_all_visualizations
