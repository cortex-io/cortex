# Commit-Relay Prompt Engineering Upgrade Plan
## Based on LangChain, PDL, and Production LLM Patterns

**Date**: 2025-11-11
**Status**: Planning Phase
**Goal**: Transform commit-relay from ad-hoc LLM interactions into production-grade, deterministic software with contracts, control loops, and observability

---

## Executive Summary

Current state: Commit-relay uses Claude Code agents with free-form prompts and JSON file I/O. While functional, it lacks:
- **Contracts**: Strict schemas for agent outputs
- **Control Loops**: Validation and retry mechanisms
- **Observability**: Tracing of prompt→output chains

This plan upgrades commit-relay using production LLM patterns from LangChain and PDL to make it robust, traceable, and maintainable.

---

## Phase 1: Contract Definition (Week 1-2)

### Objective
Define strict schemas for every agent output format to eliminate shape drift.

### Tasks

#### 1.1 Create Schema Registry
```bash
coordination/schemas/
├── task-queue-entry.schema.json
├── handoff.schema.json
├── master-state.schema.json
├── worker-spec.schema.json
├── routing-decision.schema.json
├── dashboard-event.schema.json
└── README.md
```

**Schema Example** (task-queue-entry.schema.json):
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["id", "title", "type", "priority", "status", "created_at"],
  "properties": {
    "id": {"type": "string", "pattern": "^task-[0-9]+$"},
    "title": {"type": "string", "minLength": 10, "maxLength": 500},
    "type": {"enum": ["security-scan", "security-fix", "development", "catalog"]},
    "priority": {"enum": ["critical", "high", "medium", "low"]},
    "status": {"enum": ["pending", "assigned", "in_progress", "completed", "failed"]},
    "assigned_to": {"type": ["string", "null"]},
    "created_at": {"type": "string", "format": "date-time"},
    "context": {
      "type": "object",
      "required": ["repository", "branch"],
      "properties": {
        "repository": {"type": "string", "pattern": "^[^/]+/[^/]+$"},
        "branch": {"type": "string"},
        "description": {"type": "string"},
        "requirements": {"type": "array", "items": {"type": "string"}}
      }
    }
  },
  "additionalProperties": false
}
```

#### 1.2 Define Agent Output Contracts
For each master agent (coordinator, development, security, inventory, cicd):
- Document expected input schemas
- Document required output schemas
- Create validation rules for handoffs
- Define enum values (no free-form strings)

#### 1.3 Create Contract Documentation
```
docs/contracts/
├── coordinator-master-contracts.md
├── development-master-contracts.md
├── security-master-contracts.md
├── inventory-master-contracts.md
├── cicd-master-contracts.md
└── worker-contracts.md
```

**Deliverables**:
- 15+ JSON schemas
- Contract documentation for all agents
- Schema validation library

**Success Metrics**:
- 100% of agent outputs have defined schemas
- Zero "surprise" fields in production JSON

---

## Phase 2: Validation & Control Loops (Week 3-4)

### Objective
Implement validation layers and retry mechanisms for every agent output.

### Tasks

#### 2.1 Build Schema Validator Library
```javascript
// lib/schema-validator.js
class SchemaValidator {
  constructor(schemaRegistry) {
    this.schemas = schemaRegistry;
    this.ajv = new Ajv({ allErrors: true, strict: true });
  }

  validate(data, schemaName) {
    const schema = this.schemas[schemaName];
    const validate = this.ajv.compile(schema);
    const valid = validate(data);

    return {
      valid,
      errors: validate.errors || [],
      data: valid ? data : null
    };
  }

  validateAndRepair(data, schemaName, maxRetries = 3) {
    // Validation with auto-repair attempts
    let attempt = 0;
    let result = this.validate(data, schemaName);

    while (!result.valid && attempt < maxRetries) {
      data = this.attemptRepair(data, result.errors, schemaName);
      result = this.validate(data, schemaName);
      attempt++;
    }

    return result;
  }

  attemptRepair(data, errors, schemaName) {
    // Common repairs: strip extra fields, coerce types, add defaults
    // Return repaired data or throw if unrepairable
  }
}
```

#### 2.2 Implement Validation Wrappers
Create validation wrappers for all file operations:
- `safeReadJSON(path, schema)` - validates on read
- `safeWriteJSON(path, data, schema)` - validates before write
- `validateHandoff(handoff)` - validates handoff structure
- `validateMasterState(state)` - validates master state

#### 2.3 Add Control Loops to Critical Paths

**Coordinator Routing Control Loop**:
```bash
# coordination/masters/coordinator/lib/routing-with-validation.sh

route_task_with_validation() {
  local task_id="$1"
  local max_attempts=3
  local attempt=1

  while [ $attempt -le $max_attempts ]; do
    # Step 1: Route task
    routing_result=$(moe_route_task "$task_id")

    # Step 2: Validate routing decision
    if validate_routing_decision "$routing_result"; then
      # Step 3: Create handoff
      handoff_result=$(create_handoff "$routing_result")

      # Step 4: Validate handoff
      if validate_handoff "$handoff_result"; then
        log_success "Routing validated and handoff created"
        emit_trace "routing_success" "$routing_result"
        return 0
      fi
    fi

    # Step 5: Retry with tighter instructions
    log_warn "Routing attempt $attempt failed validation, retrying..."
    emit_trace "routing_retry" "$routing_result"
    attempt=$((attempt + 1))
  done

  # Step 6: Fallback - use deterministic routing
  log_error "Routing validation failed after $max_attempts attempts, using fallback"
  use_deterministic_routing "$task_id"
}
```

#### 2.4 Add Retry Logic to Agent Calls
Wrap all agent invocations with retry logic:
```bash
call_agent_with_retry() {
  local agent_type="$1"
  local prompt="$2"
  local expected_output_schema="$3"
  local max_retries=3

  for attempt in $(seq 1 $max_retries); do
    output=$(call_agent "$agent_type" "$prompt")

    if validate_against_schema "$output" "$expected_output_schema"; then
      return 0
    fi

    # Add stricter instructions on retry
    prompt="${prompt}\n\nIMPORTANT: Previous attempt failed validation. Ensure output exactly matches schema."
  done

  return 1
}
```

**Deliverables**:
- Schema validation library (JS + Bash)
- Safe read/write wrappers for all JSON operations
- Control loops for critical paths (routing, handoff creation, task assignment)
- Retry logic for all agent calls

**Success Metrics**:
- 99%+ of agent outputs pass validation first try
- Zero invalid JSON written to coordination files
- < 5% retry rate on agent calls

---

## Phase 3: Observability & Tracing (Week 5-6)

### Objective
Implement comprehensive tracing so every prompt→output chain is visible and measurable.

### Tasks

#### 3.1 Build Tracing Infrastructure
```javascript
// lib/tracing/tracer.js
class PromptTracer {
  constructor() {
    this.traces = [];
    this.tracePath = 'coordination/traces/';
  }

  startTrace(traceId, operation, context) {
    const trace = {
      trace_id: traceId,
      operation,
      context,
      started_at: new Date().toISOString(),
      steps: []
    };

    this.traces.push(trace);
    return trace;
  }

  recordStep(traceId, step, data) {
    const trace = this.findTrace(traceId);
    trace.steps.push({
      step_name: step,
      timestamp: new Date().toISOString(),
      input: data.input,
      prompt_template: data.prompt_template,
      model_call: data.model_call,
      output: data.output,
      validation_result: data.validation_result,
      duration_ms: data.duration_ms
    });
  }

  endTrace(traceId, result) {
    const trace = this.findTrace(traceId);
    trace.completed_at = new Date().toISOString();
    trace.result = result;
    trace.total_duration_ms = Date.now() - new Date(trace.started_at).getTime();

    this.persistTrace(trace);
  }
}
```

#### 3.2 Add Tracing to All Agent Calls
Instrument every agent invocation:
```bash
# Before agent call
trace_id=$(generate_trace_id)
start_trace "$trace_id" "coordinator_routing" "$task_id"

# During agent call
record_trace_step "$trace_id" "prompt_assembly" '{
  "template": "coordinator-routing-v2.md",
  "variables": {"task_id": "'"$task_id"'"}
}'

record_trace_step "$trace_id" "model_call" '{
  "agent": "coordinator-master",
  "input_tokens": 2500,
  "output_tokens": 800
}'

# After agent call
record_trace_step "$trace_id" "validation" '{
  "schema": "routing-decision.schema.json",
  "valid": true
}'

end_trace "$trace_id" "success"
```

#### 3.3 Create Trace Explorer Dashboard
```
dashboard/public/traces.html
- View all traces
- Filter by operation, agent, success/failure
- Inspect full prompt→output chains
- Compare trace performance over time
```

#### 3.4 Add Metrics Collection
Track key metrics:
- First-pass validation rate by agent type
- Retry rate by operation
- Average tokens per operation
- Latency distribution (p50, p95, p99)
- Schema violation types

#### 3.5 Create Trace Analysis Tools
```bash
scripts/analyze-traces.sh
- Show success rates by operation
- Identify frequently failing prompts
- Detect schema drift (new fields appearing)
- Compare prompt versions (A/B testing)
```

**Deliverables**:
- Tracing library (JS + Bash)
- Trace storage in `coordination/traces/`
- Trace explorer dashboard
- Metrics collection and analysis tools
- Real-time trace viewer

**Success Metrics**:
- 100% of agent calls are traced
- Traces retained for 30 days
- < 2 second latency to view traces
- Metrics updated every 5 minutes

---

## Phase 4: Prompt Templates & Version Control (Week 7-8)

### Objective
Standardize all prompts using templates, enabling version control and A/B testing.

### Tasks

#### 4.1 Create Prompt Template Library
```
coordination/prompt-templates/
├── coordinator/
│   ├── routing-v1.md
│   ├── routing-v2.md
│   ├── task-assignment-v1.md
│   └── conflict-resolution-v1.md
├── development/
│   ├── implementation-v1.md
│   ├── code-review-v1.md
│   └── testing-strategy-v1.md
├── security/
│   ├── vulnerability-scan-v1.md
│   ├── cve-remediation-v1.md
│   └── security-audit-v1.md
└── README.md
```

#### 4.2 Implement Template Engine
```javascript
// lib/prompt-templates/engine.js
class PromptTemplateEngine {
  constructor(templateDir) {
    this.templates = this.loadTemplates(templateDir);
  }

  render(templateName, variables, options = {}) {
    const template = this.templates[templateName];

    // Validate required variables
    this.validateVariables(template.requiredVars, variables);

    // Render template
    let rendered = template.content;
    for (const [key, value] of Object.entries(variables)) {
      rendered = rendered.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }

    // Apply options (e.g., strictness level)
    if (options.strict) {
      rendered += this.getStrictnessAddendum(template);
    }

    return {
      prompt: rendered,
      template_name: templateName,
      template_version: template.version,
      variables: variables
    };
  }
}
```

#### 4.3 Add Template Metadata
Each template includes metadata:
```markdown
---
name: coordinator-routing-v2
version: 2.0.0
author: development-master
created: 2025-11-11
last_modified: 2025-11-11
success_rate: 0.95
avg_tokens: 2500
required_variables: [task_id, task_type, task_priority]
output_schema: routing-decision.schema.json
---

You are the Coordinator Master for commit-relay...
```

#### 4.4 Implement A/B Testing Framework
```bash
# Test two prompt versions simultaneously
run_ab_test() {
  local template_a="routing-v1"
  local template_b="routing-v2"
  local sample_size=100

  # Route 50% of traffic to each
  for task in $(get_pending_tasks | head -$sample_size); do
    if [ $((RANDOM % 2)) -eq 0 ]; then
      route_with_template "$task" "$template_a"
    else
      route_with_template "$task" "$template_b"
    fi
  done

  # Compare results
  compare_template_performance "$template_a" "$template_b"
}
```

#### 4.5 Create Prompt Registry Dashboard
Track all prompts:
- Version history
- Usage statistics
- Success rates
- A/B test results
- Deprecation status

**Deliverables**:
- Prompt template library (20+ templates)
- Template engine with validation
- A/B testing framework
- Prompt registry dashboard
- Version control for prompts

**Success Metrics**:
- 100% of agent calls use templates (no ad-hoc prompts)
- A/B tests run weekly
- Prompt versions tracked in git
- Template success rates > 95%

---

## Phase 5: PDL Integration (Optional - Week 9-10)

### Objective
Explore migrating critical workflows to PDL for declarative, type-safe execution.

### Tasks

#### 5.1 Install PDL Interpreter
```bash
npm install -g @pdl/interpreter
```

#### 5.2 Convert Critical Workflows to PDL
**Example**: Coordinator routing workflow in PDL

```yaml
# coordination/pdl-workflows/coordinator-routing.pdl.yaml
description: "Coordinator Master - Route task to appropriate expert"

defs:
  task_data: !file coordination/task-queue.json

text:
  - role: system
    content: |
      You are the Coordinator Master for commit-relay MoE system.
      Your role is to route tasks to the appropriate expert master.

  - role: user
    content: |
      Route this task to the correct expert master:

      Task ID: {{ task_id }}
      Task Type: {{ task_type }}
      Task Priority: {{ task_priority }}
      Task Description: {{ task_description }}

  - model: anthropic/claude-sonnet-4-5
    parameters:
      temperature: 0.1
      max_tokens: 1000
    input: !context
    output: routing_decision
    schema:
      type: object
      required: [target_master, confidence, routing_rule, reasoning]
      properties:
        target_master:
          enum: [development, security, inventory, cicd]
        confidence:
          type: number
          minimum: 0
          maximum: 1
        routing_rule:
          type: string
        reasoning:
          type: string

  - if: routing_decision.confidence < 0.7
    then:
      - model: anthropic/claude-opus-4
        # Retry with more powerful model
        input: !context
        output: routing_decision
        schema: !ref routing_decision.schema

data:
  routing_decision: !result routing_decision
  trace_id: !trace_id
  duration_ms: !duration
```

#### 5.3 Build PDL Runner Integration
```bash
# scripts/run-pdl-workflow.sh
run_pdl_workflow() {
  local workflow="$1"
  local input_data="$2"

  # Run PDL workflow with tracing
  pdl run "coordination/pdl-workflows/${workflow}.pdl.yaml" \
    --input "$input_data" \
    --trace "coordination/traces/pdl-${workflow}-$(date +%s).json" \
    --validate strict
}
```

#### 5.4 Compare PDL vs Bash Performance
Metrics to track:
- Execution time
- First-pass success rate
- Code maintainability
- Error handling quality

**Deliverables**:
- 3-5 critical workflows converted to PDL
- PDL integration scripts
- Performance comparison report
- Recommendation for broader PDL adoption

**Success Metrics**:
- PDL workflows have 98%+ first-pass success
- Execution time comparable to bash
- Easier to maintain than bash equivalents

---

## Phase 6: Production Hardening (Week 11-12)

### Objective
Ensure the upgraded system is production-ready with monitoring and failsafes.

### Tasks

#### 6.1 Implement Circuit Breakers for Agent Calls
Use the circuit breaker from Phase 2 (task-1762553455):
```javascript
const agentCircuitBreaker = new CircuitBreaker(callAgent, {
  failureThreshold: 5,
  resetTimeout: 30000,
  successThreshold: 3
});
```

#### 6.2 Add Rate Limiting
Prevent LLM API overload:
```bash
# scripts/lib/rate-limiter.sh
RATE_LIMIT_WINDOW=60  # seconds
RATE_LIMIT_MAX=30     # calls per window

enforce_rate_limit() {
  local current_calls=$(get_calls_in_window)

  if [ $current_calls -ge $RATE_LIMIT_MAX ]; then
    log_warn "Rate limit reached, sleeping for $(get_sleep_time)s"
    sleep $(get_sleep_time)
  fi

  record_api_call
}
```

#### 6.3 Create Monitoring Dashboard
Real-time monitoring:
- Agent call volume
- Validation success rates
- Retry rates
- Schema violations
- Circuit breaker states
- Rate limit usage

#### 6.4 Implement Alerting
Alert on:
- Validation failure rate > 10%
- Retry rate > 20%
- Circuit breaker opens
- Schema violations
- Rate limit exceeded

#### 6.5 Create Runbook
Document:
- Common failure modes
- Remediation steps
- Rollback procedures
- Emergency contacts

**Deliverables**:
- Circuit breakers for all agent calls
- Rate limiting enforcement
- Monitoring dashboard
- Alerting system
- Operations runbook

**Success Metrics**:
- 99.9% uptime
- < 5 minute MTTR (mean time to recovery)
- Zero data loss incidents
- All alerts have documented remediation

---

## Implementation Priority

**Must Have (Phase 1-2)**:
- Contracts and schemas
- Validation layers
- Basic retry logic

**Should Have (Phase 3-4)**:
- Observability and tracing
- Prompt templates
- A/B testing

**Nice to Have (Phase 5-6)**:
- PDL integration
- Advanced monitoring
- Alerting

---

## Success Metrics (Overall)

| Metric | Baseline | Target | Timeline |
|--------|----------|--------|----------|
| First-pass validation rate | 60% | 95% | Week 4 |
| Schema violations | 20/day | < 1/day | Week 4 |
| Retry rate | Unknown | < 5% | Week 6 |
| Trace coverage | 0% | 100% | Week 6 |
| Prompt version control | 0% | 100% | Week 8 |
| Template usage | 0% | 100% | Week 8 |
| Uptime | 95% | 99.9% | Week 12 |

---

## Resource Requirements

**Engineering Time**:
- 1 senior engineer: 12 weeks
- 1 mid-level engineer: 8 weeks (Phase 1-4)

**Infrastructure**:
- Tracing storage: ~10GB/month
- Monitoring dashboard: 1 server instance
- CI/CD pipeline: GitHub Actions minutes

**External Tools**:
- LangChain: Free (open source)
- PDL: Free (open source)
- JSON Schema validators: Free

---

## Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Schema too strict, blocks valid outputs | High | Medium | Phased rollout, monitoring |
| Validation adds latency | Medium | High | Optimize validators, cache schemas |
| Prompt templates reduce flexibility | Medium | Low | Allow template overrides in dev |
| Team resists new patterns | Low | Medium | Training, documentation, demos |
| PDL adoption fails | Low | Low | Keep as optional, fallback to bash |

---

## Next Steps

1. **Week 1**: Kick-off meeting, review plan
2. **Week 1**: Create schema registry (Phase 1.1)
3. **Week 2**: Define first 5 schemas (Phase 1.2)
4. **Week 3**: Implement validation library (Phase 2.1)
5. **Week 4**: Add validation to critical paths (Phase 2.2-2.3)

---

## References

- LangChain Documentation: https://docs.langchain.com
- PDL Specification: https://pdl.ai
- JSON Schema: https://json-schema.org
- Circuit Breaker Pattern: /Users/ryandahlberg/commit-relay/docs/circuit-breaker.md
- Commit-Relay Architecture: /Users/ryandahlberg/commit-relay/README.md

---

**Document Version**: 1.0.0
**Last Updated**: 2025-11-11
**Owner**: Development Team
**Status**: Awaiting Approval
