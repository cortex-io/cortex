#!/usr/bin/env bash
#
# Activity Feed Library
# Part of Phase 7.1: Real-time Activity Feed
#
# Provides live event streaming, filtering, search, and timeline visualization
#

set -euo pipefail

if [[ -z "${ACTIVITY_FEED_LOADED:-}" ]]; then
    readonly ACTIVITY_FEED_LOADED=true
fi

# Directory setup
FEED_DIR="${FEED_DIR:-coordination/dashboard/feeds}"
EVENTS_FILE="${EVENTS_FILE:-coordination/dashboard-events.jsonl}"

#
# Initialize activity feed
#
init_activity_feed() {
    mkdir -p "$FEED_DIR"/{streams,filters,timeline}
}

#
# Get timestamp
#
_get_ts() {
    date +%s%3N 2>/dev/null || echo $(($(date +%s) * 1000))
}

#
# Stream events in real-time
#
stream_events() {
    local filter_type="${1:-}"
    local limit="${2:-50}"

    init_activity_feed

    if [[ ! -f "$EVENTS_FILE" ]]; then
        echo "[]"
        return
    fi

    local events
    if [[ -n "$filter_type" ]]; then
        events=$(tail -n "$limit" "$EVENTS_FILE" | jq -s --arg type "$filter_type" \
            '[.[] | select(.type == $type or .event_type == $type)]')
    else
        events=$(tail -n "$limit" "$EVENTS_FILE" | jq -s '.')
    fi

    echo "$events"
}

#
# Search events by keyword
#
search_events() {
    local keyword="$1"
    local limit="${2:-100}"

    if [[ ! -f "$EVENTS_FILE" ]]; then
        echo "[]"
        return
    fi

    grep -i "$keyword" "$EVENTS_FILE" 2>/dev/null | tail -n "$limit" | jq -s '.' || echo "[]"
}

#
# Filter events by multiple criteria
#
filter_events() {
    local type="${1:-}"
    local severity="${2:-}"
    local source="${3:-}"
    local start_time="${4:-0}"
    local end_time="${5:-9999999999999}"
    local limit="${6:-100}"

    if [[ ! -f "$EVENTS_FILE" ]]; then
        echo "[]"
        return
    fi

    local jq_filter=". "

    if [[ -n "$type" ]]; then
        jq_filter+="| select(.type == \"$type\" or .event_type == \"$type\") "
    fi

    if [[ -n "$severity" ]]; then
        jq_filter+="| select(.severity == \"$severity\" or .priority == \"$severity\") "
    fi

    if [[ -n "$source" ]]; then
        jq_filter+="| select(.source == \"$source\" or .master == \"$source\" or .agent_id == \"$source\") "
    fi

    tail -n 1000 "$EVENTS_FILE" | jq -s \
        --argjson start "$start_time" \
        --argjson end "$end_time" \
        "[.[] | $jq_filter | select((.timestamp // 0) >= \$start and (.timestamp // 0) <= \$end)]" | \
        jq ".[0:$limit]"
}

#
# Get activity timeline
#
get_timeline() {
    local hours="${1:-24}"
    local bucket_minutes="${2:-60}"

    if [[ ! -f "$EVENTS_FILE" ]]; then
        echo "[]"
        return
    fi

    local now=$(_get_ts)
    local start=$((now - hours * 3600000))
    local bucket_ms=$((bucket_minutes * 60000))

    # Group events into time buckets
    tail -n 10000 "$EVENTS_FILE" | jq -s \
        --argjson start "$start" \
        --argjson bucket "$bucket_ms" \
        --argjson now "$now" '
        [.[] | select((.timestamp // 0) >= $start)] |
        group_by(((.timestamp // 0) - $start) / $bucket | floor) |
        map({
            bucket: (.[0].timestamp // 0),
            count: length,
            types: (group_by(.type // .event_type) | map({type: .[0].type // .[0].event_type, count: length}))
        })
        '
}

#
# Get event summary
#
get_event_summary() {
    local hours="${1:-24}"

    if [[ ! -f "$EVENTS_FILE" ]]; then
        cat <<EOF
{
  "total_events": 0,
  "by_type": {},
  "by_severity": {},
  "recent_errors": []
}
EOF
        return
    fi

    local now=$(_get_ts)
    local start=$((now - hours * 3600000))

    tail -n 10000 "$EVENTS_FILE" | jq -s \
        --argjson start "$start" '
        [.[] | select((.timestamp // 0) >= $start)] |
        {
            total_events: length,
            by_type: (group_by(.type // .event_type // "unknown") | map({key: .[0].type // .[0].event_type // "unknown", value: length}) | from_entries),
            by_severity: (group_by(.severity // .priority // "normal") | map({key: .[0].severity // .[0].priority // "normal", value: length}) | from_entries),
            recent_errors: [.[] | select(.severity == "error" or .severity == "critical" or .type == "error")] | .[0:10]
        }
        '
}

#
# Subscribe to event stream (for real-time updates)
#
subscribe_stream() {
    local filter="${1:-}"
    local callback="${2:-echo}"

    init_activity_feed

    # Create subscription record
    local sub_id="sub-$(date +%s)-$RANDOM"
    local sub_file="$FEED_DIR/streams/${sub_id}.json"

    cat > "$sub_file" <<EOF
{
  "subscription_id": "$sub_id",
  "filter": "$filter",
  "created_at": $(_get_ts),
  "status": "active"
}
EOF

    echo "$sub_id"
}

#
# Get recent activity for specific entity
#
get_entity_activity() {
    local entity_id="$1"
    local limit="${2:-50}"

    if [[ ! -f "$EVENTS_FILE" ]]; then
        echo "[]"
        return
    fi

    grep "$entity_id" "$EVENTS_FILE" 2>/dev/null | tail -n "$limit" | jq -s '.' || echo "[]"
}

#
# Get activity statistics
#
get_activity_stats() {
    local hours="${1:-24}"

    if [[ ! -f "$EVENTS_FILE" ]]; then
        cat <<EOF
{
  "period_hours": $hours,
  "total_events": 0,
  "events_per_hour": 0,
  "peak_hour": null,
  "most_active_source": null
}
EOF
        return
    fi

    local now=$(_get_ts)
    local start=$((now - hours * 3600000))

    tail -n 10000 "$EVENTS_FILE" | jq -s \
        --argjson start "$start" \
        --argjson hours "$hours" '
        [.[] | select((.timestamp // 0) >= $start)] |
        {
            period_hours: $hours,
            total_events: length,
            events_per_hour: (if $hours > 0 then (length / $hours) else 0 end),
            peak_hour: (group_by(((.timestamp // 0) / 3600000) | floor) | max_by(length) | .[0].timestamp // null),
            most_active_source: (group_by(.source // .master // .agent_id // "unknown") | max_by(length) | .[0].source // .[0].master // .[0].agent_id // "unknown")
        }
        '
}

#
# Create activity report
#
create_activity_report() {
    local hours="${1:-24}"
    local output_file="${2:-}"

    init_activity_feed

    local report=$(cat <<EOF
{
  "report_id": "activity-$(date +%Y%m%d-%H%M%S)",
  "generated_at": $(_get_ts),
  "period_hours": $hours,
  "summary": $(get_event_summary "$hours"),
  "timeline": $(get_timeline "$hours" 60),
  "statistics": $(get_activity_stats "$hours")
}
EOF
)

    if [[ -n "$output_file" ]]; then
        echo "$report" > "$output_file"
        echo "Report saved to: $output_file"
    else
        echo "$report"
    fi
}

# Export functions
export -f init_activity_feed
export -f stream_events
export -f search_events
export -f filter_events
export -f get_timeline
export -f get_event_summary
export -f subscribe_stream
export -f get_entity_activity
export -f get_activity_stats
export -f create_activity_report
