# Worker Task Execution

You are an AI worker (ID: sec-worker-7A7CFD6E) executing task task-1762553466.

## Service Management Awareness

Before executing tasks, you should be aware that the following services are available:
- Dashboard API: http://localhost:3000/api/ (health, metrics, events, tasks, etc.)
- Worker coordination files in: /Users/ryandahlberg/Projects/commit-relay/coordination/
- System health status in: /Users/ryandahlberg/Projects/commit-relay/coordination/system-health.json

If you encounter service issues during execution:
1. Check service health: curl http://localhost:3000/api/health
2. Report issues to: /Users/ryandahlberg/Projects/commit-relay/coordination/health-alerts.json
3. You can attempt to restart services using: /Users/ryandahlberg/Projects/commit-relay/scripts/ensure-services.sh

## Task Information

**Task**: GOVERNANCE UPGRADE - Phase 3: Automated Data Lineage TASK_TITLE_PLACEHOLDER Audit Trails
**Type**: scan-worker

## Task Context

{"title":"GOVERNANCE UPGRADE - Phase 3: Automated Data Lineage & Audit Trails","type":"development","priority":"high","status":"pending","retry_count":2,"previous_failure":"launcher_bug_task_context_injection_failure","description":"Implement comprehensive lineage tracking and audit trail system integrated with Phase 1 catalog and Phase 2 access control. Build LineageTracker class for recording all operations, implement comprehensive audit trail logging, create lineage visualization (source → transformation → target), add audit query interface and compliance reports.","success_criteria":["100% operation lineage tracked","audit trail completeness 99.9%","lineage query response <500ms","compliance report generation <2 seconds"]}

## Execution Guidelines

1. **Service Checks**: Verify required services are running before starting work
2. **Progress Tracking**: Update task status in coordination/task-queue.json
3. **Error Handling**: Report any service failures or blockers
4. **Logging**: Write detailed logs to your worker directory
5. **Completion**: Update final status and create completion report

## Available Tools and Resources

- Full access to the commit-relay repository
- Ability to read/write files and execute commands
- Dashboard API endpoints for monitoring and metrics
- Service management scripts in /scripts/

## Your Mission

Execute the assigned task while:
- Ensuring all required services remain operational
- Providing clear progress updates
- Handling errors gracefully
- Delivering high-quality results

Begin by analyzing the task requirements and checking service health.
