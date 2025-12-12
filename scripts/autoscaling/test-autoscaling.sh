#!/bin/bash
set -euo pipefail

# Test KEDA Autoscaling
# Generates load to trigger worker scaling and observes behavior

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAMESPACE="cortex"
LOAD_DURATION=${1:-300}  # Default 5 minutes
TASK_RATE=${2:-5}        # Default 5 tasks per second

echo "=================================================="
echo "KEDA Autoscaling Test"
echo "=================================================="
echo "Load duration: ${LOAD_DURATION} seconds"
echo "Task rate: ${TASK_RATE} tasks/second"
echo "Namespace: ${NAMESPACE}"
echo ""

# Verify KEDA is deployed
if ! kubectl get scaledobjects -n ${NAMESPACE} &> /dev/null; then
  echo "ERROR: No ScaledObjects found in namespace ${NAMESPACE}"
  echo "Please run: ./deploy-keda.sh"
  exit 1
fi

echo "Step 1: Checking initial state..."
echo ""
echo "Current worker replicas:"
kubectl get deployments -n ${NAMESPACE} -l component=worker
echo ""
echo "Current HPA status:"
kubectl get hpa -n ${NAMESPACE}
echo ""

# Function to monitor scaling
monitor_scaling() {
  echo "=================================================="
  echo "Monitoring Worker Scaling"
  echo "=================================================="
  echo "Press Ctrl+C to stop monitoring"
  echo ""

  while true; do
    clear
    date
    echo ""
    echo "Worker Deployments:"
    kubectl get deployments -n ${NAMESPACE} -l component=worker -o custom-columns=\
NAME:.metadata.name,\
DESIRED:.spec.replicas,\
CURRENT:.status.replicas,\
READY:.status.readyReplicas,\
UPDATED:.status.updatedReplicas

    echo ""
    echo "Worker Pods:"
    kubectl get pods -n ${NAMESPACE} -l component=worker --sort-by=.metadata.creationTimestamp

    echo ""
    echo "HPA Status:"
    kubectl get hpa -n ${NAMESPACE}

    echo ""
    echo "ScaledObject Status:"
    kubectl get scaledobjects -n ${NAMESPACE}

    echo ""
    echo "Task Queue Metrics (if Prometheus is running):"
    # This would query Prometheus for queue depth
    echo "  (Prometheus query would go here)"

    sleep 5
  done
}

# Function to generate load
generate_load() {
  local duration=$1
  local rate=$2
  local worker_type=${3:-implementation}

  echo "Step 2: Generating load for ${worker_type} workers..."
  echo "Duration: ${duration}s, Rate: ${rate} tasks/s"
  echo ""

  # Create tasks directory
  TASK_DIR="/tmp/cortex-test-tasks"
  mkdir -p ${TASK_DIR}

  local start_time=$(date +%s)
  local end_time=$((start_time + duration))
  local task_count=0

  while [ $(date +%s) -lt ${end_time} ]; do
    for i in $(seq 1 ${rate}); do
      task_count=$((task_count + 1))
      task_id="test-task-${worker_type}-${task_count}"

      # Create a test task file
      cat > ${TASK_DIR}/${task_id}.json <<EOF
{
  "task_id": "${task_id}",
  "task_type": "${worker_type}",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "priority": "normal",
  "payload": {
    "action": "test_load",
    "duration_ms": 5000
  }
}
EOF

      # Copy to coordinator pod (if running)
      # In a real scenario, this would use the API
      kubectl exec -n ${NAMESPACE} coordinator-master-0 -- \
        mkdir -p /app/coordination/task-queue/${worker_type} 2>/dev/null || true

      kubectl cp ${TASK_DIR}/${task_id}.json \
        ${NAMESPACE}/coordinator-master-0:/app/coordination/task-queue/${worker_type}/${task_id}.json \
        2>/dev/null || true
    done

    echo "Created ${task_count} tasks..."
    sleep 1
  done

  echo ""
  echo "Load generation complete: ${task_count} tasks created"
  rm -rf ${TASK_DIR}
}

# Function to test scale-to-zero
test_scale_to_zero() {
  echo ""
  echo "Step 3: Testing scale-to-zero..."
  echo "Waiting for workers to scale down (cooldown period: 5 minutes)..."
  echo ""

  local start_time=$(date +%s)
  local timeout=600  # 10 minutes max

  while true; do
    local elapsed=$(($(date +%s) - start_time))
    if [ ${elapsed} -gt ${timeout} ]; then
      echo "Timeout waiting for scale-to-zero"
      break
    fi

    local total_replicas=$(kubectl get deployments -n ${NAMESPACE} -l component=worker -o json | \
      jq -r '.items | map(.status.replicas // 0) | add')

    echo "[$(date +%H:%M:%S)] Total worker replicas: ${total_replicas} (elapsed: ${elapsed}s)"

    if [ "${total_replicas}" = "0" ] || [ "${total_replicas}" = "null" ]; then
      echo ""
      echo "SUCCESS: Workers scaled to zero!"
      break
    fi

    sleep 10
  done
}

# Function to test rapid scale-up
test_scale_up() {
  echo ""
  echo "Step 4: Testing rapid scale-up..."
  echo "Creating burst of 100 tasks..."
  echo ""

  TASK_DIR="/tmp/cortex-burst-tasks"
  mkdir -p ${TASK_DIR}

  for i in $(seq 1 100); do
    task_id="burst-task-${i}"
    cat > ${TASK_DIR}/${task_id}.json <<EOF
{
  "task_id": "${task_id}",
  "task_type": "implementation",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "priority": "high",
  "payload": {
    "action": "test_burst",
    "duration_ms": 10000
  }
}
EOF

    kubectl cp ${TASK_DIR}/${task_id}.json \
      ${NAMESPACE}/coordinator-master-0:/app/coordination/task-queue/implementation/${task_id}.json \
      2>/dev/null || true
  done

  rm -rf ${TASK_DIR}

  echo "Burst tasks created. Monitoring scale-up..."
  echo ""

  # Monitor for 2 minutes
  local start_time=$(date +%s)
  local max_replicas=0

  while [ $(($(date +%s) - start_time)) -lt 120 ]; do
    local current_replicas=$(kubectl get deployment implementation-worker -n ${NAMESPACE} -o json | \
      jq -r '.status.replicas // 0')

    if [ ${current_replicas} -gt ${max_replicas} ]; then
      max_replicas=${current_replicas}
    fi

    echo "[$(date +%H:%M:%S)] Current replicas: ${current_replicas}, Max: ${max_replicas}"
    sleep 5
  done

  echo ""
  echo "Scale-up test complete. Max replicas reached: ${max_replicas}"
}

# Main test flow
echo "Choose test mode:"
echo "  1) Monitor only (watch scaling in real-time)"
echo "  2) Generate sustained load"
echo "  3) Test scale-to-zero"
echo "  4) Test rapid scale-up"
echo "  5) Full test (all of the above)"
echo ""
read -p "Enter choice [1-5]: " choice

case ${choice} in
  1)
    monitor_scaling
    ;;
  2)
    generate_load ${LOAD_DURATION} ${TASK_RATE} "implementation"
    ;;
  3)
    test_scale_to_zero
    ;;
  4)
    test_scale_up
    ;;
  5)
    echo "Running full autoscaling test suite..."
    echo ""

    # Start monitoring in background
    monitor_scaling &
    MONITOR_PID=$!

    # Generate load
    generate_load 120 5 "implementation"

    # Test scale-up
    test_scale_up

    # Stop load and test scale-to-zero
    test_scale_to_zero

    # Stop monitoring
    kill ${MONITOR_PID} 2>/dev/null || true

    echo ""
    echo "=================================================="
    echo "Full Test Complete!"
    echo "=================================================="
    ;;
  *)
    echo "Invalid choice"
    exit 1
    ;;
esac

echo ""
echo "Test complete. Check results with:"
echo "  kubectl get deployments -n ${NAMESPACE} -l component=worker"
echo "  kubectl get hpa -n ${NAMESPACE}"
echo "  kubectl describe scaledobject -n ${NAMESPACE}"
echo ""
