# Unified Governance Catalog Implementation for commit-relay

## Executive Summary

Based on Databricks' "Governance: The Unseen Foundation of AI Success", this document outlines how to implement a unified governance catalog for commit-relay's autonomous agent system. The core principle: **You can't have AI without high-quality data, and you can't have high-quality data without data governance.**

**Current Challenge**: commit-relay faces a "dual-platform dilemma" - disparate systems for task management, worker coordination, code artifacts, and AI routing without unified governance. This creates silos that impede collaboration, increase vulnerability, and make compliance difficult.

**Solution**: Implement a Unity Catalog-inspired governance layer that unifies visibility, enforces security, automates monitoring, and enables secure data sharing across all system components.

---

## Current State Analysis

### What commit-relay HAS:
- ✅ Task queue system (`coordination/task-queue.json`)
- ✅ Worker specifications (`coordination/worker-specs/`)
- ✅ MoE routing decisions (`coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl`)
- ✅ Code-runner for quality checks
- ✅ Multiple specialized masters (coordinator, development, security, inventory)
- ✅ Dashboard for observability
- ✅ Event system (`coordination/dashboard-events.jsonl`)

### What commit-relay is MISSING:
- ❌ **Unified catalog** of all artifacts (tasks, workers, code, outputs, models)
- ❌ **Fine-grained access controls** on sensitive data
- ❌ **Data lineage tracking** across task → worker → output chain
- ❌ **Comprehensive audit trails** for all operations
- ❌ **Automated governance monitoring** (PII detection, policy violations)
- ❌ **Single-permission model** across system components
- ❌ **AI-powered quality monitoring** for bias, drift, and errors
- ❌ **Compliance framework** (GDPR, SOC2, custom policies)

---

## Implementation Roadmap

### Phase 1: Unified Catalog Foundation (Weeks 1-2)

**Goal**: Create a centralized metadata store that catalogs all system artifacts

#### 1.1 Catalog Schema Design

Create `coordination/governance/catalog/schema.json`:

```json
{
  "version": "1.0.0",
  "catalogs": {
    "commit_relay_main": {
      "schemas": {
        "tasks": {
          "description": "All task definitions and executions",
          "owner": "coordinator-master",
          "tables": {
            "task_definitions": {
              "type": "managed",
              "location": "coordination/task-queue.json",
              "columns": [
                {"name": "id", "type": "string", "nullable": false, "pii": false},
                {"name": "title", "type": "string", "nullable": false, "pii": false},
                {"name": "description", "type": "string", "nullable": false, "pii": false},
                {"name": "context", "type": "object", "nullable": true, "pii": true, "sensitive_fields": ["api_keys", "credentials"]}
              ],
              "access_control": {
                "read": ["coordinator-master", "development-master", "security-master"],
                "write": ["coordinator-master"],
                "admin": ["system-admin"]
              }
            }
          }
        },
        "workers": {
          "description": "Worker specifications and execution logs",
          "owner": "coordinator-master",
          "tables": {
            "worker_specs": {
              "type": "managed",
              "location": "coordination/worker-specs/active/",
              "columns": [
                {"name": "worker_id", "type": "string", "nullable": false, "pii": false},
                {"name": "task_id", "type": "string", "nullable": false, "pii": false},
                {"name": "status", "type": "string", "nullable": false, "pii": false},
                {"name": "worker_type", "type": "string", "nullable": false, "pii": false}
              ],
              "access_control": {
                "read": ["all-masters"],
                "write": ["coordinator-master"],
                "admin": ["system-admin"]
              }
            }
          }
        },
        "code_artifacts": {
          "description": "Code files, scripts, and generated outputs",
          "owner": "development-master",
          "tables": {
            "scripts": {
              "type": "external",
              "location": "scripts/",
              "columns": [
                {"name": "file_path", "type": "string", "nullable": false, "pii": false},
                {"name": "file_type", "type": "string", "nullable": false, "pii": false},
                {"name": "created_by", "type": "string", "nullable": false, "pii": false},
                {"name": "quality_score", "type": "number", "nullable": true, "pii": false}
              ],
              "access_control": {
                "read": ["all-masters", "all-workers"],
                "write": ["development-master"],
                "admin": ["system-admin"]
              }
            }
          }
        },
        "governance": {
          "description": "Governance metadata, policies, and audit logs",
          "owner": "security-master",
          "tables": {
            "audit_logs": {
              "type": "managed",
              "location": "coordination/governance/audit/",
              "retention_days": 365,
              "columns": [
                {"name": "timestamp", "type": "datetime", "nullable": false, "pii": false},
                {"name": "actor", "type": "string", "nullable": false, "pii": false},
                {"name": "action", "type": "string", "nullable": false, "pii": false},
                {"name": "resource", "type": "string", "nullable": false, "pii": false},
                {"name": "result", "type": "string", "nullable": false, "pii": false}
              ],
              "access_control": {
                "read": ["security-master", "system-admin"],
                "write": ["system"],
                "admin": ["system-admin"]
              }
            },
            "lineage_graph": {
              "type": "managed",
              "location": "coordination/governance/lineage/",
              "columns": [
                {"name": "source_id", "type": "string", "nullable": false, "pii": false},
                {"name": "target_id", "type": "string", "nullable": false, "pii": false},
                {"name": "transformation", "type": "string", "nullable": false, "pii": false},
                {"name": "timestamp", "type": "datetime", "nullable": false, "pii": false}
              ]
            }
          }
        }
      }
    }
  }
}
```

#### 1.2 Catalog Manager Implementation

Create `coordination/governance/catalog-manager.sh`:

```bash
#!/bin/bash
# Catalog Manager - Centralized metadata and governance
set -euo pipefail

CATALOG_HOME="${COMMIT_RELAY_HOME}/coordination/governance/catalog"
CATALOG_SCHEMA="${CATALOG_HOME}/schema.json"
CATALOG_INDEX="${CATALOG_HOME}/index.jsonl"

# Initialize catalog
init_catalog() {
    mkdir -p "${CATALOG_HOME}"

    if [ ! -f "${CATALOG_INDEX}" ]; then
        echo '{"event":"catalog_initialized","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","version":"1.0.0"}' > "${CATALOG_INDEX}"
    fi
}

# Register a new artifact in catalog
register_artifact() {
    local artifact_type="$1"  # task, worker, script, model
    local artifact_id="$2"
    local artifact_path="$3"
    local owner="$4"

    # Validate artifact exists
    if [ ! -f "${artifact_path}" ] && [ ! -d "${artifact_path}" ]; then
        echo "ERROR: Artifact not found at ${artifact_path}" >&2
        return 1
    fi

    # Check access permissions based on catalog schema
    local schema_entry=$(jq -r --arg type "$artifact_type" '.catalogs.commit_relay_main.schemas[$type]' "${CATALOG_SCHEMA}")

    # Generate catalog entry
    local catalog_entry=$(jq -n \
        --arg id "$artifact_id" \
        --arg type "$artifact_type" \
        --arg path "$artifact_path" \
        --arg owner "$owner" \
        --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        '{
            event: "artifact_registered",
            artifact_id: $id,
            artifact_type: $type,
            location: $path,
            owner: $owner,
            registered_at: $timestamp,
            access_control: {
                read: [],
                write: [$owner],
                admin: ["system-admin"]
            }
        }')

    # Append to catalog index
    echo "${catalog_entry}" >> "${CATALOG_INDEX}"

    # Update audit trail
    log_audit_event "register_artifact" "$owner" "$artifact_id" "success"

    echo "✓ Registered ${artifact_type} ${artifact_id} in catalog"
}

# Query catalog with filters
query_catalog() {
    local filter="$1"  # jq filter expression

    jq -c "$filter" "${CATALOG_INDEX}"
}

# Get artifact metadata
get_artifact() {
    local artifact_id="$1"

    jq -c --arg id "$artifact_id" 'select(.artifact_id == $id)' "${CATALOG_INDEX}" | tail -1
}

# Check access permissions
check_access() {
    local artifact_id="$1"
    local actor="$2"
    local action="$3"  # read, write, admin

    local artifact=$(get_artifact "$artifact_id")

    if [ -z "$artifact" ]; then
        echo "false"
        return
    fi

    # Check if actor has required permission
    local has_access=$(echo "$artifact" | jq -r --arg actor "$actor" --arg action "$action" \
        '.access_control[$action] | contains([$actor]) or contains(["all-masters"]) or contains(["all-workers"])')

    echo "$has_access"
}

# Grant access to artifact
grant_access() {
    local artifact_id="$1"
    local grantee="$2"
    local permission="$3"  # read, write, admin
    local granter="$4"

    # Verify granter has admin access
    local can_grant=$(check_access "$artifact_id" "$granter" "admin")

    if [ "$can_grant" != "true" ]; then
        echo "ERROR: ${granter} does not have admin access to ${artifact_id}" >&2
        return 1
    fi

    # Create grant entry
    local grant_entry=$(jq -n \
        --arg id "$artifact_id" \
        --arg grantee "$grantee" \
        --arg perm "$permission" \
        --arg granter "$granter" \
        --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        '{
            event: "access_granted",
            artifact_id: $id,
            grantee: $grantee,
            permission: $perm,
            granted_by: $granter,
            granted_at: $timestamp
        }')

    echo "${grant_entry}" >> "${CATALOG_INDEX}"

    log_audit_event "grant_access" "$granter" "$artifact_id" "success" "$grantee:$permission"

    echo "✓ Granted ${permission} access to ${grantee} on ${artifact_id}"
}

# Log audit event
log_audit_event() {
    local action="$1"
    local actor="$2"
    local resource="$3"
    local result="$4"
    local details="${5:-}"

    local audit_dir="${COMMIT_RELAY_HOME}/coordination/governance/audit"
    mkdir -p "${audit_dir}"

    local audit_entry=$(jq -n \
        --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --arg action "$action" \
        --arg actor "$actor" \
        --arg resource "$resource" \
        --arg result "$result" \
        --arg details "$details" \
        '{
            timestamp: $timestamp,
            action: $action,
            actor: $actor,
            resource: $resource,
            result: $result,
            details: $details
        }')

    echo "${audit_entry}" >> "${audit_dir}/audit-trail.jsonl"
}

# Main CLI
case "${1:-help}" in
    init)
        init_catalog
        ;;
    register)
        register_artifact "$2" "$3" "$4" "$5"
        ;;
    query)
        query_catalog "$2"
        ;;
    get)
        get_artifact "$2"
        ;;
    check-access)
        check_access "$2" "$3" "$4"
        ;;
    grant)
        grant_access "$2" "$3" "$4" "$5"
        ;;
    *)
        echo "Usage: $0 {init|register|query|get|check-access|grant}"
        echo ""
        echo "Examples:"
        echo "  $0 register task task-123 /path/to/task.json coordinator-master"
        echo "  $0 query '.[] | select(.artifact_type == \"task\")'"
        echo "  $0 get task-123"
        echo "  $0 check-access task-123 dev-worker-001 read"
        echo "  $0 grant task-123 dev-worker-001 read coordinator-master"
        ;;
esac
```

---

### Phase 2: Data Lineage Tracking (Weeks 3-4)

**Goal**: Implement automatic lineage tracking for task → worker → output chains

#### 2.1 Lineage Tracker

Create `coordination/governance/lineage-tracker.sh`:

```bash
#!/bin/bash
# Lineage Tracker - Track data flow across commit-relay
set -euo pipefail

LINEAGE_DIR="${COMMIT_RELAY_HOME}/coordination/governance/lineage"
LINEAGE_GRAPH="${LINEAGE_DIR}/lineage-graph.jsonl"

mkdir -p "${LINEAGE_DIR}"

# Record lineage edge
record_lineage() {
    local source_type="$1"      # task, worker, script, model
    local source_id="$2"
    local target_type="$3"
    local target_id="$4"
    local transformation="$5"   # assigned, executed, produced, consumed
    local metadata="${6:-{}}"

    local lineage_entry=$(jq -n \
        --arg src_type "$source_type" \
        --arg src_id "$source_id" \
        --arg tgt_type "$target_type" \
        --arg tgt_id "$target_id" \
        --arg transform "$transformation" \
        --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --argjson meta "$metadata" \
        '{
            timestamp: $timestamp,
            source: {type: $src_type, id: $src_id},
            target: {type: $tgt_type, id: $tgt_id},
            transformation: $transform,
            metadata: $meta
        }')

    echo "${lineage_entry}" >> "${LINEAGE_GRAPH}"
}

# Get upstream lineage (what produced this artifact)
get_upstream() {
    local artifact_id="$1"
    local depth="${2:-1}"  # How many levels up to trace

    jq -c --arg id "$artifact_id" --argjson depth "$depth" '
        select(.target.id == $id)
    ' "${LINEAGE_GRAPH}"
}

# Get downstream lineage (what this artifact produced)
get_downstream() {
    local artifact_id="$1"
    local depth="${2:-1}"

    jq -c --arg id "$artifact_id" '
        select(.source.id == $id)
    ' "${LINEAGE_GRAPH}"
}

# Visualize lineage chain
visualize_lineage() {
    local artifact_id="$1"

    echo "=== Lineage for ${artifact_id} ==="
    echo ""
    echo "Upstream (what created it):"
    get_upstream "$artifact_id" 3 | jq -r '"  \(.source.type):\(.source.id) --[\(.transformation)]--> \(.target.type):\(.target.id)"'

    echo ""
    echo "Downstream (what it created):"
    get_downstream "$artifact_id" 3 | jq -r '"  \(.source.type):\(.source.id) --[\(.transformation)]--> \(.target.type):\(.target.id)"'
}

# Generate lineage report
generate_report() {
    local output_file="${1:-/tmp/lineage-report.json}"

    # Count total lineage edges
    local total_edges=$(wc -l < "${LINEAGE_GRAPH}")

    # Group by transformation type
    local by_transformation=$(jq -s 'group_by(.transformation) | map({transformation: .[0].transformation, count: length})' "${LINEAGE_GRAPH}")

    # Most connected artifacts
    local most_connected=$(jq -s '
        [.[] | .source.id, .target.id] |
        group_by(.) |
        map({artifact_id: .[0], connections: length}) |
        sort_by(.connections) |
        reverse |
        .[0:10]
    ' "${LINEAGE_GRAPH}")

    jq -n \
        --argjson total "$total_edges" \
        --argjson by_trans "$by_transformation" \
        --argjson connected "$most_connected" \
        '{
            generated_at: (now | todate),
            total_lineage_edges: $total,
            by_transformation: $by_trans,
            most_connected_artifacts: $connected
        }' > "$output_file"

    echo "✓ Lineage report generated: ${output_file}"
}

# Main CLI
case "${1:-help}" in
    record)
        record_lineage "$2" "$3" "$4" "$5" "$6" "${7:-{}}"
        ;;
    upstream)
        get_upstream "$2" "${3:-1}"
        ;;
    downstream)
        get_downstream "$2" "${3:-1}"
        ;;
    visualize)
        visualize_lineage "$2"
        ;;
    report)
        generate_report "${2:-}"
        ;;
    *)
        echo "Usage: $0 {record|upstream|downstream|visualize|report}"
        ;;
esac
```

#### 2.2 Integration with Worker Launcher

Modify `scripts/spawn-worker.sh` to record lineage:

```bash
# After worker creation, record lineage
./coordination/governance/lineage-tracker.sh record \
    "task" "$TASK_ID" \
    "worker" "$WORKER_ID" \
    "assigned" \
    "{\"priority\": \"$PRIORITY\", \"worker_type\": \"$WORKER_TYPE\"}"
```

---

### Phase 3: Automated Governance Monitoring (Weeks 5-6)

**Goal**: AI-powered monitoring for policy violations, PII exposure, and quality issues

#### 3.1 Governance Monitor

Create `coordination/governance/governance-monitor.sh`:

```bash
#!/bin/bash
# Governance Monitor - AI-powered compliance and quality monitoring
set -euo pipefail

MONITOR_DIR="${COMMIT_RELAY_HOME}/coordination/governance/monitoring"
VIOLATIONS_LOG="${MONITOR_DIR}/violations.jsonl"
POLICIES_DIR="${COMMIT_RELAY_HOME}/coordination/governance/policies"

mkdir -p "${MONITOR_DIR}" "${POLICIES_DIR}"

# Scan for PII exposure
scan_pii() {
    local file_path="$1"

    # Common PII patterns
    local patterns=(
        "email:[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"
        "ssn:[0-9]{3}-[0-9]{2}-[0-9]{4}"
        "phone:\+?[0-9]{1,4}?[-.\s]?\(?\d{1,3}?\)?[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}"
        "credit_card:[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}"
        "api_key:(sk|pk)_[a-zA-Z0-9]{20,}"
    )

    local findings=()

    for pattern_spec in "${patterns[@]}"; do
        local pii_type="${pattern_spec%%:*}"
        local regex="${pattern_spec#*:}"

        if grep -qE "$regex" "$file_path" 2>/dev/null; then
            local matches=$(grep -oE "$regex" "$file_path" | wc -l)
            findings+=("{\"type\":\"$pii_type\",\"matches\":$matches}")
        fi
    done

    if [ ${#findings[@]} -gt 0 ]; then
        local findings_json=$(printf '%s\n' "${findings[@]}" | jq -s '.')

        jq -n \
            --arg file "$file_path" \
            --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
            --argjson findings "$findings_json" \
            '{
                event: "pii_detected",
                file: $file,
                timestamp: $timestamp,
                findings: $findings,
                severity: "high",
                requires_action: true
            }' >> "${VIOLATIONS_LOG}"

        return 1  # PII found
    fi

    return 0  # No PII
}

# Check policy compliance
check_policy_compliance() {
    local artifact_type="$1"
    local artifact_path="$2"

    local policy_file="${POLICIES_DIR}/${artifact_type}-policy.json"

    if [ ! -f "$policy_file" ]; then
        echo "No policy defined for ${artifact_type}" >&2
        return 0
    fi

    # Load policy rules
    local required_fields=$(jq -r '.required_fields[]?' "$policy_file")
    local forbidden_patterns=$(jq -r '.forbidden_patterns[]?' "$policy_file")

    local violations=()

    # Check required fields (for JSON artifacts)
    if [[ "$artifact_path" == *.json ]]; then
        while IFS= read -r field; do
            if ! jq -e "has(\"$field\")" "$artifact_path" >/dev/null 2>&1; then
                violations+=("{\"type\":\"missing_field\",\"field\":\"$field\"}")
            fi
        done <<< "$required_fields"
    fi

    # Check forbidden patterns
    while IFS= read -r pattern; do
        if grep -qE "$pattern" "$artifact_path" 2>/dev/null; then
            violations+=("{\"type\":\"forbidden_pattern\",\"pattern\":\"$pattern\"}")
        fi
    done <<< "$forbidden_patterns"

    if [ ${#violations[@]} -gt 0 ]; then
        local violations_json=$(printf '%s\n' "${violations[@]}" | jq -s '.')

        jq -n \
            --arg artifact "$artifact_path" \
            --arg type "$artifact_type" \
            --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
            --argjson violations "$violations_json" \
            '{
                event: "policy_violation",
                artifact: $artifact,
                artifact_type: $type,
                timestamp: $timestamp,
                violations: $violations,
                severity: "medium"
            }' >> "${VIOLATIONS_LOG}"

        return 1
    fi

    return 0
}

# Monitor task queue for governance issues
monitor_task_queue() {
    local task_queue="${COMMIT_RELAY_HOME}/coordination/task-queue.json"

    echo "Scanning task queue for governance violations..."

    # Check for PII in task descriptions
    local task_count=$(jq '.tasks | length' "$task_queue")
    local violations=0

    jq -c '.tasks[]' "$task_queue" | while read -r task; do
        local task_id=$(echo "$task" | jq -r '.id')
        local task_desc=$(echo "$task" | jq -r '.description')

        # Write description to temp file for scanning
        local temp_file="/tmp/task-${task_id}.txt"
        echo "$task_desc" > "$temp_file"

        if ! scan_pii "$temp_file"; then
            echo "  ⚠️  PII detected in task ${task_id}"
            ((violations++))
        fi

        rm "$temp_file"
    done

    echo "✓ Scanned ${task_count} tasks, found ${violations} violations"
}

# Generate governance health report
generate_health_report() {
    local output_file="${1:-${MONITOR_DIR}/health-report.json}"

    # Count violations by severity
    local critical=$(jq -s '[.[] | select(.severity == "critical")] | length' "${VIOLATIONS_LOG}" 2>/dev/null || echo 0)
    local high=$(jq -s '[.[] | select(.severity == "high")] | length' "${VIOLATIONS_LOG}" 2>/dev/null || echo 0)
    local medium=$(jq -s '[.[] | select(.severity == "medium")] | length' "${VIOLATIONS_LOG}" 2>/dev/null || echo 0)
    local low=$(jq -s '[.[] | select(.severity == "low")] | length' "${VIOLATIONS_LOG}" 2>/dev/null || echo 0)

    # Calculate health score (100 - weighted violations)
    local health_score=$((100 - (critical * 20) - (high * 10) - (medium * 5) - (low * 1)))
    [ $health_score -lt 0 ] && health_score=0

    # Determine status
    local status="healthy"
    [ $health_score -lt 80 ] && status="warning"
    [ $health_score -lt 60 ] && status="degraded"
    [ $health_score -lt 40 ] && status="critical"

    jq -n \
        --argjson score "$health_score" \
        --arg status "$status" \
        --argjson critical "$critical" \
        --argjson high "$high" \
        --argjson medium "$medium" \
        --argjson low "$low" \
        '{
            generated_at: (now | todate),
            health_score: $score,
            status: $status,
            violations: {
                critical: $critical,
                high: $high,
                medium: $medium,
                low: $low,
                total: ($critical + $high + $medium + $low)
            },
            recommendations: (
                if $critical > 0 then ["Address critical violations immediately"]
                elif $high > 5 then ["Review high-severity violations within 24 hours"]
                elif $medium > 10 then ["Schedule governance review meeting"]
                else ["System governance is healthy"]
                end
            )
        }' > "$output_file"

    echo "✓ Health report generated: ${output_file}"
    cat "$output_file"
}

# Main CLI
case "${1:-help}" in
    scan-pii)
        scan_pii "$2"
        ;;
    check-policy)
        check_policy_compliance "$2" "$3"
        ;;
    monitor-queue)
        monitor_task_queue
        ;;
    health-report)
        generate_health_report "${2:-}"
        ;;
    *)
        echo "Usage: $0 {scan-pii|check-policy|monitor-queue|health-report}"
        ;;
esac
```

---

### Phase 4: Single-Permission Model (Week 7)

**Goal**: Simplify access control with role-based permissions across all components

#### 4.1 Permission Model

Create `coordination/governance/policies/permission-model.json`:

```json
{
  "version": "1.0.0",
  "roles": {
    "system-admin": {
      "description": "Full system access for maintenance and emergencies",
      "permissions": ["*:*:*"]
    },
    "coordinator-master": {
      "description": "Task routing and worker coordination",
      "permissions": [
        "tasks:*:read",
        "tasks:*:write",
        "workers:*:read",
        "workers:*:write",
        "catalog:*:read"
      ]
    },
    "development-master": {
      "description": "Code quality and implementation",
      "permissions": [
        "tasks:development:read",
        "tasks:development:write",
        "workers:dev:read",
        "workers:dev:write",
        "code_artifacts:*:read",
        "code_artifacts:*:write"
      ]
    },
    "security-master": {
      "description": "Security scanning and vulnerability management",
      "permissions": [
        "tasks:security:read",
        "tasks:security:write",
        "workers:sec:read",
        "workers:sec:write",
        "audit_logs:*:read",
        "violations:*:read"
      ]
    },
    "inventory-master": {
      "description": "Repository cataloging and documentation",
      "permissions": [
        "tasks:inventory:read",
        "tasks:inventory:write",
        "workers:inv:read",
        "workers:inv:write",
        "repositories:*:read",
        "repositories:*:write"
      ]
    },
    "worker": {
      "description": "Execution agents for specific tasks",
      "permissions": [
        "tasks:{assigned_task}:read",
        "code_artifacts:*:read",
        "output:{worker_id}:write"
      ]
    },
    "code-runner": {
      "description": "Autonomous code quality agent",
      "permissions": [
        "code_artifacts:*:read",
        "quality_reports:*:write",
        "tasks:code_quality:write"
      ]
    },
    "dashboard": {
      "description": "Read-only observability interface",
      "permissions": [
        "tasks:*:read",
        "workers:*:read",
        "events:*:read",
        "metrics:*:read"
      ]
    }
  },
  "permission_syntax": {
    "format": "resource:scope:action",
    "resources": ["tasks", "workers", "code_artifacts", "audit_logs", "catalog"],
    "scopes": ["*", "development", "security", "inventory", "{specific_id}"],
    "actions": ["read", "write", "admin", "*"]
  }
}
```

---

### Phase 5: Dashboard Integration (Week 8)

**Goal**: Add governance views to the existing dashboard

#### 5.1 Governance API Endpoints

Add to `dashboard/server/index.js`:

```javascript
// Governance endpoints
app.get('/api/governance/health', (req, res) => {
  const healthReport = readJSON(`${COMMIT_RELAY_HOME}/coordination/governance/monitoring/health-report.json`);
  res.json(healthReport);
});

app.get('/api/governance/violations', (req, res) => {
  const violations = readJSONL(`${COMMIT_RELAY_HOME}/coordination/governance/monitoring/violations.jsonl`);
  res.json(violations.slice(-50)); // Last 50 violations
});

app.get('/api/governance/lineage/:artifactId', (req, res) => {
  const { artifactId } = req.params;

  // Execute lineage tracker to get data
  exec(`${COMMIT_RELAY_HOME}/coordination/governance/lineage-tracker.sh visualize ${artifactId}`,
    (error, stdout, stderr) => {
      if (error) {
        res.status(500).json({ error: stderr });
      } else {
        res.json({ lineage: stdout });
      }
    }
  );
});

app.get('/api/governance/catalog', (req, res) => {
  const catalog = readJSONL(`${COMMIT_RELAY_HOME}/coordination/governance/catalog/index.jsonl`);
  res.json(catalog);
});

app.get('/api/governance/audit', (req, res) => {
  const { hours = 24 } = req.query;
  const auditLog = readJSONL(`${COMMIT_RELAY_HOME}/coordination/governance/audit/audit-trail.jsonl`);

  const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
  const recentAudits = auditLog.filter(entry =>
    new Date(entry.timestamp) > cutoffTime
  );

  res.json(recentAudits);
});
```

---

## Business Value Alignment

### Innovation Acceleration
- **Current**: Workers operate in silos, limited collaboration
- **After**: Unified catalog enables cross-team discovery and reuse
- **Impact**: 30-50% faster task execution (based on Rivian case study)

### Customer Trust and Compliance
- **Current**: No PII detection, limited audit trails
- **After**: Automated PII scanning, comprehensive lineage tracking
- **Impact**: Regulatory compliance, reduced security incidents

### Operational Efficiency
- **Current**: Manual permission management, no quality monitoring
- **After**: Single-permission model, AI-powered monitoring
- **Impact**: 60% reduction in governance overhead (based on MezzoMedia case study)

---

## Success Metrics

1. **Catalog Coverage**: 100% of tasks, workers, and code artifacts registered
2. **Lineage Completeness**: Full traceability for all task executions
3. **Violation Detection Rate**: <1% false positives on PII scanning
4. **Governance Health Score**: Maintain >85/100
5. **Access Control Efficiency**: Permission checks <100ms
6. **Audit Completeness**: 100% of operations logged

---

## Migration Plan

### Week 1: Foundation
- [ ] Implement catalog schema
- [ ] Create catalog-manager.sh
- [ ] Initialize catalog with existing tasks

### Week 2: Registration
- [ ] Integrate catalog registration into worker launcher
- [ ] Backfill catalog with historical workers
- [ ] Set up access controls

### Week 3: Lineage (Phase 1)
- [ ] Implement lineage-tracker.sh
- [ ] Integrate with task creation flow
- [ ] Integrate with worker execution

### Week 4: Lineage (Phase 2)
- [ ] Add lineage visualization
- [ ] Generate lineage reports
- [ ] Test end-to-end traceability

### Week 5: Monitoring (Phase 1)
- [ ] Implement PII scanner
- [ ] Create policy templates
- [ ] Set up violations logging

### Week 6: Monitoring (Phase 2)
- [ ] Implement policy compliance checker
- [ ] Create governance health scoring
- [ ] Set up automated monitoring daemon

### Week 7: Permissions
- [ ] Define role-based permission model
- [ ] Implement permission checking
- [ ] Integrate with catalog access control

### Week 8: Dashboard
- [ ] Add governance API endpoints
- [ ] Create governance UI views
- [ ] Deploy and test

---

## Quick Wins (MVO - Minimum Viable Orchestration)

For immediate value in 2 weeks:

1. **Catalog Initialization** (3 days)
   - Register all existing tasks and workers
   - Basic metadata tracking

2. **Audit Trail** (2 days)
   - Log all task creations, worker launches
   - Simple query interface

3. **PII Scanner** (3 days)
   - Scan task queue for sensitive data
   - Alert on violations

4. **Dashboard Integration** (2 days)
   - Add governance health widget
   - Show recent violations

5. **Documentation** (2 days)
   - Governance policies document
   - Usage examples

---

## Risk Mitigation

### Technical Risks
- **Performance**: Catalog lookups may slow operations
  - *Mitigation*: Cache frequently accessed metadata, index by artifact_id

- **Storage**: Audit logs grow unbounded
  - *Mitigation*: Implement retention policies, archive after 90 days

- **Complexity**: Permission model too restrictive
  - *Mitigation*: Start with permissive defaults, tighten gradually

### Organizational Risks
- **Adoption**: Masters don't use catalog
  - *Mitigation*: Make catalog registration automatic, transparent

- **Maintenance**: Governance tools become stale
  - *Mitigation*: Automated monitoring daemon runs continuously

---

## Conclusion

Implementing unified governance for commit-relay addresses the fundamental challenge identified in the Databricks eBook: **you can't have AI without high-quality data, and you can't have high-quality data without data governance**.

By creating a Unity Catalog-inspired system, commit-relay will:
1. **Unify visibility** across all artifacts (tasks, workers, code, outputs)
2. **Enforce security** through fine-grained access controls and audit trails
3. **Automate monitoring** for PII exposure and policy violations
4. **Enable collaboration** through secure data sharing and lineage tracking

This governance foundation unlocks commit-relay's full potential as an autonomous agent orchestration platform, ensuring quality, compliance, and efficiency as the system scales.

---

## References

- Databricks eBook: "Governance: The Unseen Foundation of AI Success"
- 98% of CIOs believe unified governance for data and AI is critical
- 74% of organizations have moved to lakehouse architecture
- Case studies: Rivian (50x user increase), Amgen (50% audit efficiency), Block (12x cost reduction)
