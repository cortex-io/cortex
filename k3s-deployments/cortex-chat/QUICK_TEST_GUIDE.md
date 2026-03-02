# Quick Test Guide - Chat to Cortex Integration

## Quick Status Check

```bash
# Check all components
kubectl get pods -n cortex -l app=cortex-orchestrator
kubectl get pods -n cortex-chat -l app=cortex-chat
kubectl get ingress cortex-chat -n cortex-chat

# View current tasks
kubectl exec -n cortex deployment/cortex-orchestrator -- ls -la /app/tasks/
```

## Test via Chat Interface

Go to: https://chat.ry-ops.dev

### Test 1: Single Task
```
"Create a task to deploy monitoring stack with Prometheus and Grafana"
```

Expected: Claude calls `cortex_create_task`, gets task ID back immediately

### Test 2: Parallel Tasks
```
"Set up the following in parallel:
1. Deploy monitoring stack (Prometheus, Grafana)
2. Configure automated security scanning
3. Set up CI/CD pipeline for deployments"
```

Expected: Claude calls `cortex_create_task` THREE times, all complete in <2 seconds

### Test 3: Check Status
```
"Check the status of task task-chat-1766779451040-2axt2h5cq"
```

Expected: Claude calls `cortex_get_task_status`, returns current status

## Test via Direct API

### Create Task
```bash
cat > /tmp/test-task.json <<EOF
{
  "tool_name": "cortex_create_task",
  "tool_input": {
    "title": "Test Infrastructure Setup",
    "description": "Deploy test infrastructure components",
    "category": "infrastructure",
    "priority": "high"
  }
}
EOF

# From inside orchestrator pod
POD=$(kubectl get pods -n cortex -l app=cortex-orchestrator -o jsonpath='{.items[0].metadata.name}')

kubectl cp /tmp/test-task.json cortex/$POD:/tmp/test.json

kubectl exec -n cortex $POD -- node -e "
const http = require('http');
const fs = require('fs');
const data = fs.readFileSync('/tmp/test.json', 'utf8');
const req = http.request({
  hostname: 'localhost',
  port: 8000,
  path: '/execute-tool',
  method: 'POST',
  headers: {'Content-Type': 'application/json', 'Content-Length': data.length}
}, res => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => console.log(body));
});
req.write(data);
req.end();
"
```

### Check Status
```bash
cat > /tmp/check-status.json <<EOF
{
  "tool_name": "cortex_get_task_status",
  "tool_input": {
    "task_id": "TASK_ID_HERE"
  }
}
EOF

# Run same way as above
```

## Performance Benchmarks

### Target Performance
- 1 task: <500ms
- 3 tasks (parallel): <1s
- 10 tasks (parallel): <3s

### Actual Results (2025-12-26)
```
3 parallel tasks: <1 second
All created with timestamp: 2025-12-26T20:04:11.040Z
Task creation confirmed in /app/tasks/ directory
```

## Expected Task Files

```bash
# List tasks
kubectl exec -n cortex deployment/cortex-orchestrator -- ls -la /app/tasks/

# View task
kubectl exec -n cortex deployment/cortex-orchestrator -- cat /app/tasks/task-chat-*.json | jq .
```

## Troubleshooting

### Tasks Not Being Created
```bash
# Check orchestrator logs
kubectl logs -n cortex -l app=cortex-orchestrator --tail=50

# Check if /app/tasks exists
kubectl exec -n cortex deployment/cortex-orchestrator -- ls -la /app/
```

### Chat Timeout (504)
```bash
# Verify ingress timeout
kubectl get ingress cortex-chat -n cortex-chat -o yaml | grep timeout

# Should see: traefik.http.services.cortex-chat.loadbalancer.server.timeout: "300s"
```

### Tools Not Available in Chat
```bash
# Check backend ConfigMap
kubectl get configmap cortex-chat-backend-tools -n cortex-chat -o yaml

# Restart chat if needed
kubectl rollout restart deployment/cortex-chat -n cortex-chat
```

## Success Indicators

- cortex_create_task returns immediately with task_id
- Multiple tasks created in parallel complete in <1 second
- Task files appear in /app/tasks/ directory
- cortex_get_task_status returns task details
- No 504 timeouts on complex requests
- Chat interface responsive

## Categories & Priorities

### Categories
- `development` - Code, features, bugs
- `security` - Scans, compliance, threats
- `infrastructure` - Deployments, monitoring, config
- `inventory` - Assets, dependencies, licenses
- `cicd` - Pipelines, builds, tests
- `general` - Other tasks

### Priorities
- `critical` (1) - Urgent, immediate attention
- `high` (3) - Important, soon
- `medium` (5) - Normal priority
- `low` (7) - Can wait

## Example Chat Conversations

### Complex Infrastructure Request
```
User: "I need to set up our production monitoring. Deploy Prometheus, Grafana,
       AlertManager, and configure security scanning for all pods."

Claude: [Creates 4 parallel tasks]
  - Task 1: Deploy Prometheus
  - Task 2: Deploy Grafana
  - Task 3: Deploy AlertManager
  - Task 4: Configure security scanning

Response: "I've created 4 tasks that will be processed in parallel..."
```

### Check Progress
```
User: "What's the status of my monitoring deployment tasks?"

Claude: [Calls cortex_get_task_status for each task ID]

Response: "Here's the status of your tasks:
  - Prometheus deployment: in_progress
  - Grafana deployment: queued
  - AlertManager deployment: queued
  - Security scanning: completed"
```

## Integration Endpoints

- Chat: https://chat.ry-ops.dev
- Cortex Orchestrator: http://cortex-orchestrator.cortex.svc.cluster.local:8000
- Execute Tool: POST /execute-tool
- Health Check: GET /health

## Next Steps

After successful testing:
1. Monitor task processing by coordinator master
2. Verify tasks are routed to correct master agents
3. Check that Daryl workers are spawned
4. Confirm infrastructure changes are executed
5. Review results in task files

## Support

For issues:
1. Check orchestrator logs: `kubectl logs -n cortex -l app=cortex-orchestrator`
2. Check chat logs: `kubectl logs -n cortex-chat -l app=cortex-chat`
3. Verify ingress: `kubectl describe ingress cortex-chat -n cortex-chat`
4. Review task files: `kubectl exec -n cortex deployment/cortex-orchestrator -- cat /app/tasks/*.json`

---

Last Updated: 2025-12-26
Integration Status: Production Ready
