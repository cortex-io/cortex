# LLM Mesh for commit-relay

Enterprise-grade LLM Mesh architecture implementation for the commit-relay multi-agent system.

## Overview

This LLM Mesh implementation brings production-ready capabilities to commit-relay:

- **MoE Learning System**: Continuous improvement of routing decisions
- **Prompt Library**: Versioned, reusable prompts for routing analysis
- **Metrics & Observability**: Track routing quality, costs, and performance
- **Catalog**: Central registry for agents, prompts, tools, and LLM services
- **Safety & Quality**: Evaluation frameworks for routing decisions

## Architecture

```
llm-mesh/
├── moe-learning/              # MoE Learning System
│   ├── catalog/               # Routing decisions and learned patterns
│   ├── prompts/               # LLM prompts for analysis
│   ├── metrics/               # Performance metrics
│   ├── evaluators/            # Analysis and improvement tools
│   └── schemas/               # Data schemas
├── gateway/                   # LLM service abstraction (future)
└── README.md                  # This file
```

## MoE Learning System

### What It Does

The MoE Learning System implements a continuous improvement loop:

1. **Track Outcomes**: Record routing decisions and task outcomes
2. **Analyze**: Use LLMs to analyze routing quality and extract patterns
3. **Learn**: Build knowledge base of successful routing patterns
4. **Improve**: Generate and apply improvements to routing logic
5. **Validate**: Test improvements and measure impact

### Quick Start

```bash
# Set up LLM access (optional but recommended)
export ANTHROPIC_API_KEY="your-api-key"
export LLM_PROVIDER="anthropic"
export LLM_MODEL="claude-sonnet-4"

# Track a task outcome
cd llm-mesh/moe-learning
./moe-learn.sh track task-123 completed 0.9

# Run learning cycle
./moe-learn.sh learn

# Show status
./moe-learn.sh status
```

### Components

#### 1. Outcome Tracker (`evaluators/outcome-tracker.sh`)

Tracks routing decisions and their outcomes:

```bash
# Track completed task
./evaluators/outcome-tracker.sh task-123 completed 0.9

# Track failed task
./evaluators/outcome-tracker.sh task-456 failed 0.3

# Track reassigned task
./evaluators/outcome-tracker.sh task-789 reassigned 0.5
```

**Outputs:**
- `catalog/routing-decisions.jsonl` - All routing decisions with outcomes
- `metrics/routing-accuracy.jsonl` - Routing accuracy over time
- `metrics/confidence-calibration.jsonl` - Confidence calibration metrics
- `metrics/learning-progress.jsonl` - Learning progress tracking

#### 2. Pattern Learner (`evaluators/pattern-learner.sh`)

Analyzes outcomes using LLMs to extract patterns:

```bash
# Analyze all unanalyzed outcomes
./evaluators/pattern-learner.sh learn

# Generate improvement suggestions
./evaluators/pattern-learner.sh suggest

# Analyze specific outcome
./evaluators/pattern-learner.sh analyze '{"decision_id":"...", ...}'
```

**Uses Prompts:**
- `prompts/analyze-routing-quality.md` - Evaluates routing decision quality
- `prompts/extract-task-features.md` - Extracts task characteristics
- `prompts/suggest-improvements.md` - Generates routing improvements

**Outputs:**
- `catalog/learned-patterns.json` - Accumulated routing knowledge
- Updates routing decisions with analysis results

#### 3. Router Improver (`evaluators/router-improver.sh`)

Applies learned improvements to the routing system:

```bash
# Apply pending improvements
./evaluators/router-improver.sh apply

# Validate applied improvements
./evaluators/router-improver.sh validate

# Show statistics
./evaluators/router-improver.sh stats

# Rollback to previous version
./evaluators/router-improver.sh rollback
```

**Modifies:**
- `coordination/masters/coordinator/knowledge-base/routing-patterns.json`
- Creates backups before changes
- Validates improvements before marking as successful

### Data Schemas

#### Routing Decision with Outcome

Complete record of a routing decision and its outcome:

```json
{
  "decision_id": "decision-1234567890-5678",
  "timestamp": "2025-11-15T14:30:00-0600",
  "task": {
    "task_id": "task-123",
    "description": "Implement new API endpoint for user authentication",
    "type": "development",
    "complexity": "moderate"
  },
  "routing": {
    "strategy": "single_expert",
    "primary_expert": "development",
    "primary_confidence": 0.85,
    "all_scores": {
      "development": 0.85,
      "security": 0.45,
      "inventory": 0.10
    }
  },
  "execution": {
    "status": "completed",
    "duration_seconds": 1800
  },
  "outcome": {
    "success": true,
    "quality_score": 0.90,
    "routing_accuracy": 0.95,
    "confidence_calibration": 0.90,
    "ideal_expert": "development"
  },
  "learning": {
    "patterns_discovered": [
      {
        "pattern": "implement.*API",
        "expert": "development",
        "confidence_boost": 0.15
      }
    ],
    "improvements_suggested": [
      "Add 'API endpoint' to development confidence boosters"
    ]
  }
}
```

#### Learned Patterns

Accumulated routing knowledge:

```json
{
  "version": "1.0.0",
  "last_updated": "2025-11-15T15:00:00Z",
  "learning_stats": {
    "total_decisions_analyzed": 50,
    "successful_routings": 42,
    "failed_routings": 8,
    "average_routing_accuracy": 0.84
  },
  "expert_patterns": {
    "development": {
      "success_indicators": [
        {
          "pattern": "implement.*feature",
          "confidence_boost": 0.15,
          "success_rate": 0.95
        }
      ],
      "performance_metrics": {
        "total_tasks": 30,
        "success_rate": 0.90
      }
    }
  },
  "routing_improvements": [
    {
      "improvement_id": "imp-001",
      "improvement_type": "add_keyword",
      "expert": "development",
      "status": "validated",
      "expected_impact": "Increase development confidence by 15%"
    }
  ]
}
```

## LLM Mesh Prompts

### Design Principles

1. **Versioned**: Each prompt has a version number
2. **Purpose-Specific**: Single, well-defined purpose
3. **Model-Optimized**: Specify recommended model
4. **Structured Output**: JSON format for machine processing
5. **Actionable**: Generates concrete, applicable results

### Available Prompts

#### 1. Analyze Routing Quality (`prompts/analyze-routing-quality.md`)

**Purpose**: Evaluate routing decision quality based on outcomes

**Model**: Claude Sonnet (complex analysis)

**Input**: Routing decision + execution results + task metadata

**Output**:
```json
{
  "routing_accuracy": 0.85,
  "confidence_calibration": 0.90,
  "ideal_expert": "development",
  "patterns_discovered": [...],
  "improvements_suggested": [...]
}
```

#### 2. Extract Task Features (`prompts/extract-task-features.md`)

**Purpose**: Extract structured features from task descriptions

**Model**: Claude Haiku (fast feature extraction)

**Input**: Task description (plain text)

**Output**:
```json
{
  "domains": ["code_development"],
  "action_verbs": ["implement", "add"],
  "technical_terms": ["API", "endpoint"],
  "complexity": "moderate",
  "routing_hints": {
    "primary_expert_suggested": "development",
    "confidence": 0.85
  }
}
```

#### 3. Suggest Improvements (`prompts/suggest-improvements.md`)

**Purpose**: Generate routing system improvements

**Model**: Claude Sonnet (strategic analysis)

**Input**: Learned patterns + performance metrics + recent failures

**Output**:
```json
{
  "analysis_summary": {
    "overall_routing_accuracy": 0.76,
    "main_issues": [...],
    "key_opportunities": [...]
  },
  "improvements": [
    {
      "improvement_id": "imp-001",
      "priority": "high",
      "improvement_type": "add_keyword",
      "expected_impact": "15% accuracy boost"
    }
  ]
}
```

## Metrics & Observability

### Routing Accuracy

**File**: `metrics/routing-accuracy.jsonl`

**Tracks**: Was the right expert chosen?

```jsonl
{"timestamp":"2025-11-15T14:30:00-0600","routing_accuracy":0.85}
{"timestamp":"2025-11-15T14:45:00-0600","routing_accuracy":0.90}
```

### Confidence Calibration

**File**: `metrics/confidence-calibration.jsonl`

**Tracks**: Do confidence scores match actual performance?

```jsonl
{"timestamp":"2025-11-15T14:30:00-0600","confidence_calibration":0.90}
```

### Learning Progress

**File**: `metrics/learning-progress.jsonl`

**Tracks**: How is the system improving over time?

```jsonl
{
  "timestamp":"2025-11-15T15:00:00-0600",
  "avg_routing_accuracy":0.84,
  "avg_confidence_calibration":0.88
}
```

## Integration with commit-relay

### Automatic Outcome Tracking

To automatically track task outcomes, integrate with your task completion hooks:

```bash
# In your task completion script
if [ "$task_status" = "completed" ]; then
    /path/to/llm-mesh/moe-learning/moe-learn.sh track \
        "$task_id" "completed" "$quality_score"
fi
```

### Scheduled Learning

Run learning cycles periodically:

```bash
# Add to crontab
0 2 * * * cd /path/to/llm-mesh/moe-learning && ./moe-learn.sh learn
```

### Dashboard Integration

The learning system emits events compatible with the commit-relay dashboard:

```json
{
  "type": "moe_routing_decision",
  "data": {
    "task_id": "task-123",
    "expert": "development",
    "confidence": 0.85
  }
}
```

## LLM Provider Configuration

### Anthropic (Recommended)

```bash
export LLM_PROVIDER="anthropic"
export ANTHROPIC_API_KEY="sk-ant-..."
export LLM_MODEL="claude-sonnet-4"
```

### Mock Mode (Testing)

Without API keys, the system uses mock responses:

```bash
# No API key set
./moe-learn.sh learn
# → Uses mock analysis responses
```

## Best Practices

### 1. Start Small

Begin with manual outcome tracking:

```bash
# Track 5-10 tasks manually
./moe-learn.sh track task-1 completed 0.9
./moe-learn.sh track task-2 completed 0.85
# ...

# Run first learning cycle
./moe-learn.sh learn
```

### 2. Validate Before Applying

Always review improvements before applying:

```bash
# Generate improvements
./evaluators/pattern-learner.sh suggest

# Review suggestions
cat catalog/learned-patterns.json | jq '.routing_improvements'

# Apply selectively
./moe-learn.sh apply
```

### 3. Monitor Impact

Track routing accuracy before/after improvements:

```bash
# Before improvements
./moe-learn.sh stats
# Note: Avg Routing Accuracy: 76%

# After improvements
./moe-learn.sh stats
# Check: Avg Routing Accuracy: 84%? ✓
```

### 4. Backup Before Changes

The system creates automatic backups, but be safe:

```bash
cp coordination/masters/coordinator/knowledge-base/routing-patterns.json \
   routing-patterns.backup-manual
```

### 5. Rollback if Needed

If improvements degrade performance:

```bash
./moe-learn.sh rollback
```

## Roadmap

### Phase 1: MoE Learning (Complete ✓)
- [x] Outcome tracking
- [x] Pattern learning with LLMs
- [x] Improvement suggestions
- [x] Automated application
- [x] Metrics and observability

### Phase 2: LLM Gateway (Next)
- [ ] Abstraction layer for multiple LLM providers
- [ ] Token usage tracking
- [ ] Cost optimization
- [ ] Model routing (which model for which task)

### Phase 3: Full Catalog
- [ ] Agent registry with schemas
- [ ] Tool catalog
- [ ] LLM service catalog
- [ ] Central discovery API

### Phase 4: Safety & Quality
- [ ] Safety filters (PII, prompt injection)
- [ ] Quality evaluators
- [ ] Adversarial testing
- [ ] Compliance monitoring

## Contributing

When adding new prompts:

1. Follow the template in existing prompts
2. Specify recommended model
3. Define clear input/output schemas
4. Version your prompt
5. Document expected behavior

When modifying learning logic:

1. Test with mock data first
2. Validate against known good routing decisions
3. Measure impact on routing accuracy
4. Document changes in schemas

## License

Part of commit-relay project.
