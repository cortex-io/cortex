#!/usr/bin/env bash
# Proactive Scanner Daemon - Automated security and dependency scanning
# Implements proactive sensing from AI Agent transcript
# Instead of waiting for tasks, actively scan for issues

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_HOME="${CORTEX_HOME:-$(cd "$SCRIPT_DIR/../.." && pwd)}"

# Scan schedule (cron-style)
SECURITY_SCAN_SCHEDULE="${SECURITY_SCAN_SCHEDULE:-daily@02:00}"
DEPENDENCY_SCAN_SCHEDULE="${DEPENDENCY_SCAN_SCHEDULE:-daily@03:00}"
HEALTH_CHECK_SCHEDULE="${HEALTH_CHECK_SCHEDULE:-hourly}"

# State files
DAEMON_PID_FILE="$CORTEX_HOME/coordination/daemons/proactive-scanner.pid"
SCAN_LOG="$CORTEX_HOME/coordination/logs/proactive-scans.log"

mkdir -p "$(dirname "$DAEMON_PID_FILE")" "$(dirname "$SCAN_LOG")"

##############################################################################
# log: Log message with timestamp
##############################################################################
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$SCAN_LOG"
}

##############################################################################
# trigger_security_scan: Trigger automated security scan for all repos
##############################################################################
trigger_security_scan() {
    log "🔒 Triggering proactive security scan..."

    # Get list of active repositories from inventory
    local inventory_file="$CORTEX_HOME/coordination/repository-inventory.json"

    if [ ! -f "$inventory_file" ]; then
        log "⚠️  Repository inventory not found, skipping scan"
        return 1
    fi

    # Extract active repositories
    local repos=$(jq -r '.repositories[] | select(.health_status == "active") | .name' "$inventory_file" 2>/dev/null)

    local scan_count=0
    for repo in $repos; do
        log "  Scanning: $repo"

        # Create security scan task
        local task_id="proactive-security-scan-$(date +%s)-$(echo "$repo" | md5 | cut -c1-8)"
        local task_file="$CORTEX_HOME/coordination/tasks/pending/$task_id.json"

        mkdir -p "$(dirname "$task_file")"

        jq -n \
            --arg task_id "$task_id" \
            --arg repo "$repo" \
            --arg timestamp "$(date +%Y-%m-%dT%H:%M:%S%z)" \
            '{
                id: $task_id,
                title: ("Proactive security scan: " + $repo),
                type: "security-scan",
                description: ("Automated daily security scan for " + $repo),
                priority: "medium",
                status: "pending",
                created_at: $timestamp,
                created_by: "proactive-scanner-daemon",
                context: {
                    repository: $repo,
                    scan_types: ["dependencies", "vulnerabilities", "secrets"],
                    automated: true,
                    scan_depth: "full"
                },
                proactive: true
            }' > "$task_file"

        ((scan_count++))
    done

    log "✅ Created $scan_count security scan tasks"
    return 0
}

##############################################################################
# trigger_dependency_scan: Trigger automated dependency health check
##############################################################################
trigger_dependency_scan() {
    log "📦 Triggering proactive dependency scan..."

    local inventory_file="$CORTEX_HOME/coordination/repository-inventory.json"

    if [ ! -f "$inventory_file" ]; then
        log "⚠️  Repository inventory not found, skipping scan"
        return 1
    fi

    local repos=$(jq -r '.repositories[] | select(.health_status == "active") | .name' "$inventory_file" 2>/dev/null)

    local scan_count=0
    for repo in $repos; do
        log "  Checking dependencies: $repo"

        local task_id="proactive-dep-scan-$(date +%s)-$(echo "$repo" | md5 | cut -c1-8)"
        local task_file="$CORTEX_HOME/coordination/tasks/pending/$task_id.json"

        mkdir -p "$(dirname "$task_file")"

        jq -n \
            --arg task_id "$task_id" \
            --arg repo "$repo" \
            --arg timestamp "$(date +%Y-%m-%dT%H:%M:%S%z)" \
            '{
                id: $task_id,
                title: ("Proactive dependency check: " + $repo),
                type: "dependency-audit",
                description: ("Automated dependency health check for " + $repo),
                priority: "low",
                status: "pending",
                created_at: $timestamp,
                created_by: "proactive-scanner-daemon",
                context: {
                    repository: $repo,
                    check_types: ["outdated", "deprecated", "security"],
                    automated: true
                },
                proactive: true
            }' > "$task_file"

        ((scan_count++))
    done

    log "✅ Created $scan_count dependency scan tasks"
    return 0
}

##############################################################################
# trigger_health_check: Trigger system health check
##############################################################################
trigger_health_check() {
    log "🏥 Running proactive health check..."

    # Check daemon health
    local daemons_healthy=true
    local daemon_dir="$CORTEX_HOME/coordination/daemons"

    if [ -d "$daemon_dir" ]; then
        # Check for stale PID files
        for pidfile in "$daemon_dir"/*.pid; do
            if [ -f "$pidfile" ]; then
                local pid=$(cat "$pidfile" 2>/dev/null || echo "")
                if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
                    log "⚠️  Stale daemon detected: $(basename "$pidfile")"
                    daemons_healthy=false
                fi
            fi
        done
    fi

    # Check disk space
    local disk_usage=$(df "$CORTEX_HOME" | tail -1 | awk '{print $5}' | sed 's/%//')
    if [ "$disk_usage" -gt 80 ]; then
        log "⚠️  Disk usage high: ${disk_usage}%"
        daemons_healthy=false
    fi

    if [ "$daemons_healthy" = true ]; then
        log "✅ System health check passed"
    else
        log "⚠️  System health issues detected"
    fi

    return 0
}

##############################################################################
# daemon_loop: Main daemon event loop
##############################################################################
daemon_loop() {
    log "🚀 Proactive Scanner Daemon started (PID: $$)"
    echo $$ > "$DAEMON_PID_FILE"

    local last_security_scan=$(date +%s)
    local last_dependency_scan=$(date +%s)
    local last_health_check=$(date +%s)

    while true; do
        local now=$(date +%s)
        local hour=$(date +%H)

        # Security scan at 02:00 daily
        if [ "$hour" = "02" ]; then
            local time_since_security=$((now - last_security_scan))
            if [ $time_since_security -gt 82800 ]; then  # 23 hours
                trigger_security_scan
                last_security_scan=$now
            fi
        fi

        # Dependency scan at 03:00 daily
        if [ "$hour" = "03" ]; then
            local time_since_dependency=$((now - last_dependency_scan))
            if [ $time_since_dependency -gt 82800 ]; then
                trigger_dependency_scan
                last_dependency_scan=$now
            fi
        fi

        # Health check hourly
        local time_since_health=$((now - last_health_check))
        if [ $time_since_health -gt 3600 ]; then  # 1 hour
            trigger_health_check
            last_health_check=$now
        fi

        # Sleep for 5 minutes
        sleep 300
    done
}

##############################################################################
# Main execution
##############################################################################
case "${1:-start}" in
    start)
        if [ -f "$DAEMON_PID_FILE" ]; then
            local old_pid=$(cat "$DAEMON_PID_FILE")
            if kill -0 "$old_pid" 2>/dev/null; then
                log "⚠️  Daemon already running (PID: $old_pid)"
                exit 1
            fi
        fi
        daemon_loop
        ;;
    stop)
        if [ -f "$DAEMON_PID_FILE" ]; then
            local pid=$(cat "$DAEMON_PID_FILE")
            kill "$pid" 2>/dev/null && log "✅ Daemon stopped (PID: $pid)"
            rm -f "$DAEMON_PID_FILE"
        else
            log "⚠️  Daemon not running"
        fi
        ;;
    status)
        if [ -f "$DAEMON_PID_FILE" ]; then
            local pid=$(cat "$DAEMON_PID_FILE")
            if kill -0 "$pid" 2>/dev/null; then
                echo "Proactive Scanner Daemon is running (PID: $pid)"
            else
                echo "Proactive Scanner Daemon is not running (stale PID file)"
            fi
        else
            echo "Proactive Scanner Daemon is not running"
        fi
        ;;
    scan-now)
        log "🔍 Manual scan triggered"
        trigger_security_scan
        trigger_dependency_scan
        ;;
    *)
        cat << EOF
Proactive Scanner Daemon - Automated Security & Dependency Scanning

Usage:
  $0 start          Start daemon
  $0 stop           Stop daemon
  $0 status         Check daemon status
  $0 scan-now       Trigger immediate scan

Schedule:
  Security scans:   Daily at 02:00
  Dependency scans: Daily at 03:00
  Health checks:    Hourly
EOF
        ;;
esac
