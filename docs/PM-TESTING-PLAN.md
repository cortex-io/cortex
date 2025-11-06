# Project Manager Testing Plan

Version: 1.0
Date: 2025-11-06
Status: Ready to Execute

---

## Overview

This document provides comprehensive testing strategy for the Project Manager (PM) system. Testing is organized by implementation phase and covers unit, integration, and end-to-end scenarios.

---

## Phase 1 Testing: Core Infrastructure (Days 1-3)

### Test 1.1: PM Daemon Startup and Shutdown

**Objective**: Verify PM daemon starts, runs, and stops cleanly

**Procedure**:
```bash
# Test startup
cd ~/commit-relay
./scripts/pm-daemon.sh --test-mode

# Verify PID file created
test -f /tmp/pm-daemon.pid && echo "PASS: PID file created" || echo "FAIL"

# Verify PM state initialized
test -f coordination/pm-state.json && echo "PASS: State file created" || echo "FAIL"
cat coordination/pm-state.json | jq

# Verify activity log created
test -f coordination/pm-activity.jsonl && echo "PASS: Activity log created" || echo "FAIL"

# Check for pm_started event
grep "pm_started" coordination/pm-activity.jsonl && echo "PASS: Startup logged" || echo "FAIL"

# Test shutdown (daemon should auto-exit in test mode)
sleep 5
test ! -f /tmp/pm-daemon.pid && echo "PASS: PID file cleaned up" || echo "FAIL"
```

**Expected Results**:
- ✓ PID file created at /tmp/pm-daemon.pid
- ✓ PM state initialized at coordination/pm-state.json
- ✓ Activity log created at coordination/pm-activity.jsonl
- ✓ pm_started event logged
- ✓ PID file removed on shutdown

---

### Test 1.2: Worker Registration

**Objective**: PM detects and registers active workers

**Setup**:
```bash
# Create test worker spec
cat > coordination/worker-specs/active/test-worker-12345678.json << 'EOF'
{
  "worker_id": "test-worker-12345678",
  "worker_type": "test-worker",
  "parent_master": "development",
  "task_id": "test-task-001",
  "resources": {
    "token_allocation": 10000,
    "time_limit_minutes": 60
  },
  "status": "running",
  "created_at": "2025-11-06T10:00:00Z",
  "execution": {
    "started_at": "2025-11-06T10:00:00Z"
  }
}
EOF
```

**Procedure**:
```bash
# Run PM daemon once
./scripts/pm-daemon.sh --test-mode

# Check worker was registered
jq '.monitored_workers["test-worker-12345678"]' coordination/pm-state.json

# Check for worker_registered event
grep "worker_registered" coordination/pm-activity.jsonl | grep "test-worker-12345678"
```

**Expected Results**:
- ✓ Worker appears in pm-state.json monitored_workers
- ✓ worker_registered event logged
- ✓ Worker fields populated correctly (task_id, type, started_at)

**Cleanup**:
```bash
rm -f coordination/worker-specs/active/test-worker-12345678.json
```

---

### Test 1.3: Timeout Detection

**Objective**: PM detects and logs timeout warnings

**Setup**:
```bash
# Create worker that started 35 minutes ago (58% of 60 min limit)
START_TIME=$(date -u -v-35M +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '35 minutes ago' +%Y-%m-%dT%H:%M:%SZ)

cat > coordination/worker-specs/active/test-worker-TIMEOUT1.json << EOF
{
  "worker_id": "test-worker-TIMEOUT1",
  "worker_type": "test-worker",
  "parent_master": "development",
  "task_id": "test-task-002",
  "resources": {
    "token_allocation": 10000,
    "time_limit_minutes": 60
  },
  "status": "running",
  "created_at": "$START_TIME",
  "execution": {
    "started_at": "$START_TIME"
  }
}
EOF
```

**Procedure**:
```bash
# Run PM daemon
./scripts/pm-daemon.sh --test-mode

# Check for timeout warning (should be at 50% threshold)
grep "timeout_warning" coordination/pm-activity.jsonl | grep "test-worker-TIMEOUT1"

# Verify warning level
grep "timeout_warning" coordination/pm-activity.jsonl | grep "test-worker-TIMEOUT1" | jq '.data.level'
```

**Expected Results**:
- ✓ timeout_warning event logged
- ✓ Warning level is "first" (50% threshold)
- ✓ time_used_pct calculated correctly

**Cleanup**:
```bash
rm -f coordination/worker-specs/active/test-worker-TIMEOUT1.json
```

---

### Test 1.4: Zombie Detection

**Objective**: PM detects workers marked running but no process exists

**Setup**:
```bash
# Create worker marked as running (started 10 minutes ago)
START_TIME=$(date -u -v-10M +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%SZ)

cat > coordination/worker-specs/active/test-worker-ZOMBIE1.json << EOF
{
  "worker_id": "test-worker-ZOMBIE1",
  "worker_type": "test-worker",
  "parent_master": "development",
  "task_id": "test-task-003",
  "resources": {
    "token_allocation": 10000,
    "time_limit_minutes": 60
  },
  "status": "running",
  "created_at": "$START_TIME",
  "execution": {
    "started_at": "$START_TIME"
  }
}
EOF

# Note: No actual process is running for this worker
```

**Procedure**:
```bash
# Run PM daemon
./scripts/pm-daemon.sh --test-mode

# Check for zombie detection
grep "zombie_detected" coordination/pm-activity.jsonl | grep "test-worker-ZOMBIE1"
```

**Expected Results**:
- ✓ zombie_detected event logged
- ✓ Event includes age in minutes
- ✓ process_found: false in event data

**Cleanup**:
```bash
rm -f coordination/worker-specs/active/test-worker-ZOMBIE1.json
```

---

## Phase 2 Testing: Communication Protocol (Days 4-7)

### Test 2.1: Worker Check-In Processing

**Objective**: Workers can check in and PM processes check-ins

**Setup**:
```bash
# Create worker spec
cat > coordination/worker-specs/active/test-worker-CHECKIN1.json << EOF
{
  "worker_id": "test-worker-CHECKIN1",
  "worker_type": "test-worker",
  "parent_master": "development",
  "task_id": "test-task-004",
  "resources": {
    "token_allocation": 10000,
    "time_limit_minutes": 60
  },
  "status": "running",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "execution": {
    "started_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  }
}
EOF

# Simulate worker check-in
export WORKER_ID="test-worker-CHECKIN1"
source scripts/worker-checkin.sh
worker_checkin "in_progress" 25 --current-step "Testing check-in"
```

**Procedure**:
```bash
# Verify check-in file created
ls coordination/worker-checkins/test-worker-CHECKIN1-*.json

# Run PM daemon to process check-in
./scripts/pm-daemon.sh --test-mode

# Check for checkin_received event
grep "checkin_received" coordination/pm-activity.jsonl | grep "test-worker-CHECKIN1"

# Verify worker health updated
jq '.monitored_workers["test-worker-CHECKIN1"].health_state' coordination/pm-state.json
jq '.monitored_workers["test-worker-CHECKIN1"].progress_pct' coordination/pm-state.json
```

**Expected Results**:
- ✓ Check-in file created
- ✓ checkin_received event logged
- ✓ Worker health_state updated to "healthy"
- ✓ Worker progress_pct updated to 25
- ✓ Check-in file deleted after processing

**Cleanup**:
```bash
rm -f coordination/worker-specs/active/test-worker-CHECKIN1.json
unset WORKER_ID
```

---

### Test 2.2: Missed Check-In Detection

**Objective**: PM detects workers that don't check in

**Setup**:
```bash
# Create worker that started 18 minutes ago (no check-ins)
START_TIME=$(date -u -v-18M +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '18 minutes ago' +%Y-%m-%dT%H:%M:%SZ)

cat > coordination/worker-specs/active/test-worker-LATE1.json << EOF
{
  "worker_id": "test-worker-LATE1",
  "worker_type": "test-worker",
  "parent_master": "development",
  "task_id": "test-task-005",
  "resources": {
    "token_allocation": 10000,
    "time_limit_minutes": 60
  },
  "status": "running",
  "created_at": "$START_TIME",
  "execution": {
    "started_at": "$START_TIME"
  }
}
EOF
```

**Procedure**:
```bash
# Run PM daemon
./scripts/pm-daemon.sh --test-mode

# Check for missed_checkin event (18 min > 15 min threshold)
grep "missed_checkin" coordination/pm-activity.jsonl | grep "test-worker-LATE1"

# Verify health state
jq '.monitored_workers["test-worker-LATE1"].health_state' coordination/pm-state.json
```

**Expected Results**:
- ✓ missed_checkin event logged
- ✓ Health state set to "late"
- ✓ Event includes minutes_since_checkin

**Cleanup**:
```bash
rm -f coordination/worker-specs/active/test-worker-LATE1.json
```

---

### Test 2.3: Intervention - Send Warning

**Objective**: PM can send warnings to workers

**Setup**:
```bash
# Source intervention library
source scripts/pm-intervention.sh
```

**Procedure**:
```bash
# Send warning to test worker
send_warning_to_worker "test-worker-WARNING1" "missed_checkin" \
  "Please check in within 5 minutes"

# Verify warning file created
test -f coordination/worker-checkins/test-worker-WARNING1-WARNING.json && \
  echo "PASS: Warning file created" || echo "FAIL"

# Check warning content
cat coordination/worker-checkins/test-worker-WARNING1-WARNING.json | jq

# Check for warning_sent event
grep "warning_sent" coordination/pm-activity.jsonl | grep "test-worker-WARNING1"
```

**Expected Results**:
- ✓ Warning file created at correct location
- ✓ Warning contains correct fields (type, message, timestamp)
- ✓ warning_sent event logged

**Cleanup**:
```bash
rm -f coordination/worker-checkins/test-worker-WARNING1-WARNING.json
```

---

### Test 2.4: Intervention - Escalate to Master

**Objective**: PM can escalate issues to masters

**Procedure**:
```bash
# Create test worker spec
cat > coordination/worker-specs/active/test-worker-ESCALATE1.json << EOF
{
  "worker_id": "test-worker-ESCALATE1",
  "worker_type": "test-worker",
  "parent_master": "development",
  "task_id": "test-task-006",
  "status": "running"
}
EOF

# Source intervention library
source scripts/pm-intervention.sh

# Escalate to master
escalate_to_master "test-worker-ESCALATE1" "worker_stalled" \
  "Worker has not checked in for 25 minutes"

# Verify alert file created
test -f coordination/pm-alerts/pending/alert-test-worker-ESCALATE1-worker_stalled.json && \
  echo "PASS: Alert created" || echo "FAIL"

# Check alert content
cat coordination/pm-alerts/pending/alert-test-worker-ESCALATE1-worker_stalled.json | jq

# Verify alert fields
jq '.parent_master' coordination/pm-alerts/pending/alert-test-worker-ESCALATE1-worker_stalled.json
```

**Expected Results**:
- ✓ Alert file created in pm-alerts/pending/
- ✓ Alert contains correct master (development)
- ✓ Alert type is "worker_stalled"
- ✓ escalated_to_master event logged

**Cleanup**:
```bash
rm -f coordination/worker-specs/active/test-worker-ESCALATE1.json
rm -f coordination/pm-alerts/pending/alert-test-worker-ESCALATE1-worker_stalled.json
```

---

## Phase 3 Testing: End-to-End (Days 8-14)

### Test 3.1: Complete Worker Lifecycle

**Objective**: Full worker lifecycle with check-ins

**Procedure**:
```bash
# 1. Create worker spec (simulating coordinator/master)
cat > coordination/worker-specs/active/test-worker-FULL1.json << EOF
{
  "worker_id": "test-worker-FULL1",
  "worker_type": "test-worker",
  "parent_master": "development",
  "task_id": "test-task-007",
  "resources": {
    "token_allocation": 10000,
    "time_limit_minutes": 60
  },
  "status": "running",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "execution": {
    "started_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  }
}
EOF

# 2. Start PM daemon in background
./scripts/pm-daemon.sh &
PM_PID=$!
sleep 5

# 3. Simulate worker execution with check-ins
export WORKER_ID="test-worker-FULL1"
source scripts/worker-checkin.sh

echo "Worker starting..."
checkin_start
sleep 10

echo "Worker at 25%..."
worker_checkin "in_progress" 25 --current-step "Implementation"
sleep 10

echo "Worker at 50%..."
worker_checkin "in_progress" 50 --current-step "Testing"
sleep 10

echo "Worker at 75%..."
worker_checkin "in_progress" 75 --current-step "Documentation"
sleep 10

echo "Worker completing..."
checkin_complete "Test task completed successfully"

# 4. Stop PM daemon
kill $PM_PID

# 5. Verify results
echo "=== PM Activity Log ==="
grep "test-worker-FULL1" coordination/pm-activity.jsonl | jq

echo "=== Worker Health States ==="
jq '.monitored_workers["test-worker-FULL1"]' coordination/pm-state.json
```

**Expected Results**:
- ✓ Worker registered by PM
- ✓ All check-ins received and logged
- ✓ Worker health remains "healthy" throughout
- ✓ Progress increases correctly (0 → 25 → 50 → 75 → 100)
- ✓ Completion logged
- ✓ No false warnings or escalations

**Cleanup**:
```bash
rm -f coordination/worker-specs/active/test-worker-FULL1.json
unset WORKER_ID
```

---

### Test 3.2: Concurrent Workers

**Objective**: PM handles multiple workers simultaneously

**Procedure**:
```bash
# Start PM daemon
./scripts/pm-daemon.sh &
PM_PID=$!
sleep 5

# Spawn 5 test workers in parallel
for i in {1..5}; do
    WORKER_ID="test-worker-CONCURRENT${i}"

    # Create spec
    cat > coordination/worker-specs/active/${WORKER_ID}.json << EOF
{
  "worker_id": "$WORKER_ID",
  "worker_type": "test-worker",
  "parent_master": "development",
  "task_id": "test-task-00$i",
  "resources": {"token_allocation": 10000, "time_limit_minutes": 60},
  "status": "running",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "execution": {"started_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
}
EOF

    # Simulate worker check-ins in background
    (
        export WORKER_ID
        source scripts/worker-checkin.sh
        checkin_start
        sleep $((RANDOM % 10 + 5))
        worker_checkin "in_progress" 50
        sleep $((RANDOM % 10 + 5))
        checkin_complete "Task $i completed"
    ) &
done

# Wait for all workers to finish
wait

# Let PM process final check-ins
sleep 10

# Stop PM
kill $PM_PID

# Verify all workers tracked
echo "=== Workers Monitored ==="
jq '.monitored_workers | keys' coordination/pm-state.json

# Count completed workers
COMPLETED=$(grep "worker_completed" coordination/pm-activity.jsonl | grep "test-worker-CONCURRENT" | wc -l)
echo "Completed workers: $COMPLETED/5"
```

**Expected Results**:
- ✓ All 5 workers registered
- ✓ All 5 workers completed
- ✓ No race conditions or lost check-ins
- ✓ PM loop duration < 30 seconds

**Cleanup**:
```bash
rm -f coordination/worker-specs/active/test-worker-CONCURRENT*.json
```

---

## Stress Testing

### Test S.1: High Volume Check-Ins

**Objective**: PM handles 100 check-ins/minute

**Procedure**:
```bash
# Generate 100 check-in files rapidly
for i in {1..100}; do
    cat > "coordination/worker-checkins/test-worker-$i-$(date -u +%Y%m%dT%H%M%SZ).json" << EOF
{
  "worker_id": "test-worker-$i",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "status": "in_progress",
  "progress_pct": 50
}
EOF
done

# Run PM daemon once
time ./scripts/pm-daemon.sh --test-mode

# Verify all processed
ls coordination/worker-checkins/test-worker-*.json 2>/dev/null | wc -l
```

**Expected Results**:
- ✓ All 100 check-ins processed
- ✓ Processing time < 10 seconds
- ✓ No errors or crashes

---

## Regression Testing

### Test R.1: PM Restart Resilience

**Objective**: PM survives restart without losing workers

**Procedure**:
```bash
# 1. Start PM and register workers
./scripts/pm-daemon.sh &
PM_PID=$!
sleep 5

# Create 3 workers
for i in {1..3}; do
    cat > coordination/worker-specs/active/test-worker-RESTART${i}.json << EOF
{"worker_id": "test-worker-RESTART${i}", "status": "running",
 "execution": {"started_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"}}
EOF
done

sleep 10

# 2. Kill PM daemon
kill $PM_PID
sleep 2

# 3. Restart PM daemon
./scripts/pm-daemon.sh &
PM_PID=$!
sleep 10

# 4. Verify workers still monitored
jq '.monitored_workers | keys' coordination/pm-state.json

# Stop PM
kill $PM_PID
```

**Expected Results**:
- ✓ PM restarts successfully
- ✓ All 3 workers re-registered
- ✓ No data loss

**Cleanup**:
```bash
rm -f coordination/worker-specs/active/test-worker-RESTART*.json
```

---

## Success Criteria Summary

### Phase 1 (Core Infrastructure)
- ✓ PM daemon starts and stops cleanly
- ✓ Workers detected and registered
- ✓ Timeout warnings logged at correct thresholds
- ✓ Zombie workers detected

### Phase 2 (Communication)
- ✓ Check-ins processed correctly
- ✓ Missed check-ins detected
- ✓ Warnings sent to workers
- ✓ Escalations created for masters
- ✓ Interventions execute correctly

### Phase 3 (End-to-End)
- ✓ Complete worker lifecycle tracked
- ✓ Multiple concurrent workers handled
- ✓ PM survives restarts
- ✓ Success rate ≥ 75%

---

## Test Automation

Create `scripts/run-pm-tests.sh` to automate all tests:

```bash
#!/bin/bash
# Run all PM tests

cd ~/commit-relay

echo "=== Phase 1 Tests ==="
./scripts/test-pm-startup.sh
./scripts/test-worker-registration.sh
./scripts/test-timeout-detection.sh
./scripts/test-zombie-detection.sh

echo "=== Phase 2 Tests ==="
./scripts/test-checkin-processing.sh
./scripts/test-interventions.sh

echo "=== Phase 3 Tests ==="
./scripts/test-full-lifecycle.sh
./scripts/test-concurrent-workers.sh

echo "=== All tests complete ==="
```

---

**Document Status**: Ready for Implementation
**Test Coverage**: Core, Integration, End-to-End, Stress, Regression
**Automation**: Scripts provided for key tests
