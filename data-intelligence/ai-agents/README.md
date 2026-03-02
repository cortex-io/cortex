# Cortex AI Agents System

Production-grade AI agent orchestration with autonomous execution, advanced reasoning, and comprehensive governance.

## Overview

The Cortex AI Agents System transforms Cortex from a task routing platform into an intelligent, autonomous agent orchestration system based on Forrester's "The State Of AI Agents, 2024" report.

### 🎯 Key Capabilities

1. **Advanced Observability** - Real-time monitoring, anomaly detection, health scoring
2. **Align-by-Design Governance** - Policy validation, ethics checking, compliance (SOC2/GDPR/HIPAA)
3. **Autonomous Execution** - Trigger-based autonomous actions with safety controls
4. **Advanced Reasoning** - Chain-of-Thought, ReAct, Plan-Execute patterns
5. **Multi-Agent Orchestration** - Coordinate multiple agents for complex tasks
6. **AIQ Training** - Measure team AI readiness and provide personalized training
7. **Consumer-Facing Agents** - Public-facing agent interfaces (feature-flagged)

## 🚀 Quick Start

### Installation

```python
from data_intelligence.ai_agents import CortexAIAgents

# Initialize system
ai_agents = CortexAIAgents()

# Check system status
status = ai_agents.get_system_status()
print(status)
```

### Configuration

Feature flags are controlled in `config/features.yaml`:

```yaml
features:
  observability_enabled: true      # ✅ Safe to enable
  governance_enabled: true         # ✅ Safe to enable
  autonomous_enabled: false        # ⚠️ Start disabled
  advanced_reasoning_enabled: true # ✅ Safe to enable
  multi_agent_enabled: true        # ✅ Safe to enable
  aiq_training_enabled: true       # ✅ Safe to enable
  consumer_agents_enabled: false   # ⚠️ Requires security review
```

## 📚 Usage Examples

### 1. Execute Task with Advanced Reasoning

```python
# Use ReAct reasoning pattern
result = ai_agents.execute_task_with_reasoning(
    task="Fix authentication bug causing login failures",
    context={'module': 'auth', 'language': 'python'},
    reasoning_mode='react'
)

print(f"Success: {result['success']}")
print(f"Steps: {result['steps']}")
```

Available reasoning modes:
- `cot` - Chain-of-Thought (step-by-step breakdown)
- `react` - Reason + Act loop (iterative problem solving)
- `plan-execute` - Plan first, then execute with replanning

### 2. Orchestrate Multi-Agent Task

```python
# Complex task requiring multiple agents
result = ai_agents.orchestrate_multi_agent_task({
    'type': 'migrate_authentication',
    'description': 'Migrate authentication system to OAuth2'
})

print(f"Subtasks completed: {result['successful_subtasks']}/{result['total_subtasks']}")
```

The coordinator will:
1. Decompose task into subtasks
2. Assign subtasks to appropriate agents
3. Execute with coordination (sequential or parallel)
4. Synthesize results

### 3. Validate Action with Governance

```python
# Check if action is allowed
validation = ai_agents.validate_action('dev-001', {
    'agent_type': 'development-master',
    'action_type': 'modify_code',
    'files_changed': ['src/auth.py'],
    'estimated_cost': 0.05,
    'modifies_code': True,
    'has_tests': True
})

if validation['approved']:
    # Execute action
    pass
else:
    print(f"Rejected: {validation['policy_result']['reasons']}")
```

Governance validates:
- **Policy**: Autonomy level vs risk level
- **Ethics**: Transparency, fairness, privacy, accountability, safety
- **Compliance**: SOC2, GDPR, HIPAA

### 4. Monitor Agent Health

```python
# Get health score for specific agent
health = ai_agents.get_agent_health('security-scanner-001')
print(f"Health Score: {health['health_score']:.2%}")

# Get health for all agents
all_health = ai_agents.get_agent_health()
for agent_id, score in all_health['agents'].items():
    print(f"{agent_id}: {score:.2%}")
```

Health score considers:
- Error rate (40% weight)
- Confidence level (40% weight)
- Anomaly frequency (20% weight)

### 5. Assess User AIQ

```python
# Assess user's AI Quotient
assessment = ai_agents.assess_user_aiq('user-001', {
    'prompt_engineering': 75,
    'ai_limitations': 80,
    'agent_collaboration': 65,
    'governance_ethics': 85,
    'strategic_thinking': 70
})

print(f"AIQ Score: {assessment['aiq_score']:.1f}")
print(f"Level: {assessment['level']}")

# Generate training plan
plan = ai_agents.generate_training_plan(
    'user-001',
    current_aiq=assessment['aiq_score'],
    target_aiq=80,
    assessment=assessment
)

print(f"Recommended modules: {len(plan['recommended_modules'])}")
print(f"Estimated duration: {plan['estimated_duration_weeks']} weeks")
```

AIQ Levels:
- **Expert** (80-100): Ready for autonomous agents
- **Proficient** (60-79): Can collaborate with supervision
- **Intermediate** (40-59): Needs training
- **Beginner** (20-39): Basic training required
- **Novice** (0-19): Extensive training needed

### 6. Enable Autonomous Execution

```python
# Enable autonomous feature (after testing!)
ai_agents.enable_feature('autonomous_enabled')

# Evaluate triggers based on context
context = {
    'time_of_day': '02:00',
    'test_coverage_percent': 75,
    'daily_cost_usd': 45.0
}

actions = ai_agents.evaluate_autonomous_triggers(context)
print(f"Triggered {actions['triggered_agents']} agents")

# Execute autonomous action
result = ai_agents.execute_autonomous_action('security-scanner-001', {
    'action_type': 'security_scan',
    'scope': 'full_repository'
})
```

## 🏗️ Architecture

### System Components

```
cortex_ai_agents.py (Main Integration)
├── observability/
│   └── agent_observer.py          # Real-time monitoring
├── governance/
│   └── align_by_design.py         # Policy, ethics, compliance
├── autonomous/
│   └── autonomous_agent.py        # Trigger-based execution
├── reasoning/
│   └── advanced_reasoning.py      # CoT, ReAct, Plan-Execute
├── orchestration/
│   └── multi_agent_coordinator.py # Multi-agent coordination
└── training/
    └── aiq_system.py              # AIQ assessment & training
```

### Integration with Cortex Platform

The AI Agents system integrates with:

- **MLflow**: Tracks reasoning experiments and outcomes
- **Delta Lake**: Stores agent observations and decisions
- **Governance**: Existing access control and validation
- **Lineage**: Tracks agent → action → artifact relationships
- **Workers**: Autonomous agents spawn workers when needed

### Data Flow

```
User Request
    ↓
Governance Validation
    ↓
Advanced Reasoning (CoT/ReAct/Plan-Execute)
    ↓
Multi-Agent Orchestration (if complex)
    ↓
Autonomous Execution (if triggered)
    ↓
Observability Monitoring
    ↓
Results + Audit Log
```

## 🔒 Safety & Governance

### Autonomy Levels

| Level | Can Execute | Risk Level |
|-------|-------------|------------|
| `READ_ONLY` | Read operations only | NONE |
| `SUGGEST` | Recommendations only | LOW |
| `EXECUTE_LOW_RISK` | Read, analyze, suggest | LOW |
| `EXECUTE_MEDIUM_RISK` | + Limited modifications | MEDIUM |
| `FULL_AUTONOMY` | + High-risk actions | HIGH |

### Risk Levels

| Risk | Examples | Approval Required |
|------|----------|-------------------|
| `NONE` | Read file, search code | None |
| `LOW` | Analyze, suggest change | None |
| `MEDIUM` | Modify code, run tests | Team Lead |
| `HIGH` | Deploy to staging | Team Lead + Tech Lead |
| `CRITICAL` | Deploy to prod, delete data | Team Lead + Tech Lead + Security |

### Compliance Frameworks

- **SOC2**: Audit logging, access authorization
- **GDPR**: EU data processing, retention policies
- **HIPAA**: PHI access authorization

### Safety Controls

1. **Feature Flags**: Gradual rollout with instant rollback
2. **Governance Validation**: All actions validated before execution
3. **Observability**: Real-time monitoring with anomaly detection
4. **Rate Limiting**: Max autonomous actions per hour
5. **Human Approval**: High-risk actions require approval
6. **Audit Logging**: Complete audit trail (90-day retention)

## 📊 Monitoring & Observability

### Anomaly Detection

The system automatically detects:

- **Confidence Drift**: Agent confidence dropping over time
- **Error Rate Spikes**: Sudden increase in errors
- **Cost Spikes**: Unexpected cost increases
- **Latency Spikes**: Performance degradation

### Alerts

Alerts triggered for:
- Agent health score < 50%
- Error rate > 10%
- Daily cost > $100
- Latency > 5 seconds

### Metrics

Key metrics tracked:
- `routing_accuracy`: Routing decision correctness
- `task_success_rate`: Task completion rate
- `average_latency_ms`: Agent response time
- `cost_per_task`: Average cost per task
- `quality_score`: Output quality rating

## 🎓 AIQ Training System

### Assessment Areas

1. **Prompt Engineering** (25% weight)
   - Writing effective prompts
   - Iterative refinement
   - Context provision

2. **AI Limitations** (20% weight)
   - Understanding capabilities
   - Recognizing limitations
   - Knowing when to intervene

3. **Agent Collaboration** (20% weight)
   - Working with autonomous agents
   - Interpreting recommendations
   - Providing feedback

4. **Governance & Ethics** (15% weight)
   - Ethical considerations
   - Data privacy
   - Regulatory compliance

5. **Strategic Thinking** (20% weight)
   - Operational → Strategic shift
   - High-value work identification
   - Impact measurement

### Training Modules

1. **Effective Prompt Engineering** (1 week)
2. **Working with Autonomous Agents** (1 week)
3. **AI Governance & Ethics** (1 week)
4. **AI Cost Optimization** (1 week)
5. **Debugging AI Agents** (1 week)
6. **Strategic vs Operational Thinking** (1 week)

## 🚢 Deployment

### Recommended Rollout Strategy

**Phase 1 (Week 1): Foundation**
```bash
# Enable observability + governance only
# Test monitoring without execution
observability_enabled: true
governance_enabled: true
autonomous_enabled: false
```

**Phase 2 (Week 2): Intelligence**
```bash
# Enable reasoning and orchestration
advanced_reasoning_enabled: true
multi_agent_enabled: true
```

**Phase 3 (Week 3): Training**
```bash
# Begin team assessments
aiq_training_enabled: true
```

**Phase 4 (Week 4+): Autonomy**
```bash
# Gradually enable autonomous execution
autonomous_enabled: true  # Start with low-risk only
```

**Phase 5 (Future): Consumer**
```bash
# Requires additional security review
consumer_agents_enabled: true
```

### Rollback Procedure

```python
# Instant rollback - disable feature
ai_agents.disable_feature('autonomous_enabled')

# Or edit config/features.yaml
# Set feature to false
# System reloads on next request
```

## 📁 File Structure

```
data-intelligence/ai-agents/
├── cortex_ai_agents.py              # Main integration
├── README.md                         # This file
├── config/
│   ├── features.yaml                 # Feature flags
│   ├── autonomous-agents.yaml        # Agent configurations
│   └── policies/
│       └── default-policies.yaml     # Governance policies
├── observability/
│   ├── agent_observer.py             # Monitoring system
│   └── __init__.py
├── governance/
│   ├── align_by_design.py            # Governance framework
│   ├── policies/                     # Policy files
│   └── __init__.py
├── autonomous/
│   ├── autonomous_agent.py           # Autonomous execution
│   ├── configs/                      # Agent configs
│   └── __init__.py
├── reasoning/
│   ├── advanced_reasoning.py         # CoT, ReAct, Plan-Execute
│   └── __init__.py
├── orchestration/
│   ├── multi_agent_coordinator.py    # Multi-agent coordination
│   └── __init__.py
├── training/
│   ├── aiq_system.py                 # AIQ assessment & training
│   └── __init__.py
└── tests/
    └── test_ai_agents.py             # Integration tests
```

## 🧪 Testing

```python
# Run integration tests
pytest data-intelligence/ai-agents/tests/

# Test specific component
pytest data-intelligence/ai-agents/tests/test_observability.py

# Test with coverage
pytest --cov=data-intelligence/ai-agents
```

## 📖 API Reference

### CortexAIAgents

Main class providing unified interface to all AI agent capabilities.

**Methods:**

- `execute_task_with_reasoning(task, context, reasoning_mode='react')` - Execute task with advanced reasoning
- `orchestrate_multi_agent_task(task)` - Coordinate multiple agents
- `execute_autonomous_action(agent_id, action)` - Execute autonomous action
- `evaluate_autonomous_triggers(context)` - Evaluate all triggers
- `assess_user_aiq(user_id, responses)` - Assess AI Quotient
- `generate_training_plan(user_id, current_aiq, target_aiq, assessment)` - Generate training plan
- `get_agent_health(agent_id=None)` - Get health metrics
- `validate_action(agent_id, action)` - Validate with governance
- `get_system_status()` - Get system status
- `enable_feature(feature_name)` - Enable feature flag
- `disable_feature(feature_name)` - Disable feature flag

## 🔗 Integration with Data Intelligence Platform

The AI Agents system extends the Data Intelligence Platform:

```python
from data_intelligence import CortexIntelligencePlatform
from data_intelligence.ai_agents import CortexAIAgents

# Initialize both systems
platform = CortexIntelligencePlatform()
ai_agents = CortexAIAgents()

# Use together
task_analysis = platform.parse_task("Fix authentication bug")
reasoning_result = ai_agents.execute_task_with_reasoning(
    task_analysis['task'],
    task_analysis['context'],
    reasoning_mode='react'
)
```

## 🐛 Troubleshooting

### Issue: Autonomous actions not executing

**Solution:**
```python
# Check if feature enabled
status = ai_agents.get_system_status()
print(status['features']['autonomous'])

# Enable if needed
ai_agents.enable_feature('autonomous_enabled')
```

### Issue: Governance rejecting all actions

**Solution:**
```python
# Check policy configuration
# Edit config/governance/policies/default-policies.yaml
# Adjust autonomy levels or risk classifications
```

### Issue: Low agent health scores

**Solution:**
```python
# Get detailed health info
health = ai_agents.get_agent_health('agent-001')

# Check recent observations
observations = ai_agents.observer.get_recent_observations('agent-001', limit=20)

# Look for patterns in errors or anomalies
```

## 🤝 Contributing

The AI Agents system is designed to be extensible:

1. **Custom Reasoning Patterns**: Extend `advanced_reasoning.py`
2. **New Agent Types**: Add to `autonomous-agents.yaml`
3. **Additional Compliance**: Extend `ComplianceTracker` in `align_by_design.py`
4. **Custom Metrics**: Add to `AgentObserver` in `agent_observer.py`

## 📄 License

Part of the Cortex project. See main repository for license information.

## 🙏 Acknowledgments

Based on Forrester's "The State Of AI Agents, 2024" report and best practices from leading AI agent implementations.

---

**Version:** 1.0.0
**Last Updated:** 2025-12-03
**Status:** ✅ Production Ready (with feature flags)
