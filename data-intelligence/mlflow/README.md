# MLflow Experiment Tracking for Cortex

This directory contains the MLflow integration for tracking and optimizing Cortex's Mixture of Experts routing decisions, model selection, and overall system performance.

## Overview

MLflow provides:
- **Experiment Tracking**: Log and compare routing strategies and their outcomes
- **Model Versioning**: Track different versions of routing algorithms
- **Metrics Tracking**: Monitor routing accuracy, cost efficiency, and quality
- **A/B Testing**: Compare different routing approaches
- **Hyperparameter Tuning**: Optimize routing confidence thresholds and other parameters

## Architecture

```
mlflow/
├── config/
│   └── mlflow_config.yaml       # MLflow configuration
├── tracking/
│   └── mlflow_client.py         # Python client for tracking
├── experiments/
│   └── routing_optimizer.py     # Routing optimization experiments
├── start-mlflow-server.sh       # Start tracking server
└── README.md
```

## Quick Start

### 1. Start MLflow Tracking Server

```bash
./data-intelligence/mlflow/start-mlflow-server.sh
```

The MLflow UI will be available at: http://localhost:5000

### 2. Use MLflow Client in Python

```python
from data_intelligence.mlflow.tracking.mlflow_client import CortexMLflowClient

# Initialize client
client = CortexMLflowClient()

# Track a routing decision
routing_data = {
    'task_id': 'task-001',
    'routing_strategy': 'mixture_of_experts',
    'routing_method': 'nlp-keyword',
    'decision': {
        'primary_expert': 'development-master',
        'primary_confidence': 0.92,
        'model_recommendation': {
            'model': 'claude-sonnet-4',
            'provider': 'anthropic',
            'tier': 'balanced'
        }
    },
    'matched_keywords': ['implement', 'feature'],
    'task_complexity': 'medium',
}

# Log the routing decision
run_id = client.track_routing_decision('task-001', routing_data)

# Later, update with outcome
outcome_data = {
    'actual_master': 'development-master',
    'tokens_used': 2500,
    'duration_minutes': 8.5,
    'success': True,
    'quality_score': 0.95,
}

client.update_run_metrics(run_id, {
    'tokens_used': outcome_data['tokens_used'],
    'duration_minutes': outcome_data['duration_minutes'],
    'task_success': 1.0,
    'quality_score': outcome_data['quality_score'],
})
```

### 3. Use with MoE Router

```bash
# The MoE router can automatically track decisions
MLFLOW_TRACKING_ENABLED=true ./coordination/masters/coordinator/lib/moe-router.sh task-001 "Fix authentication bug"
```

## Experiments

### 1. Routing Optimization (`moe-routing-optimization`)

Tracks and optimizes routing decisions:
- **Metrics**: Routing accuracy, confidence, task success rate
- **Parameters**: Routing strategy, method, keywords matched
- **Goal**: Maximize routing accuracy while maintaining high confidence

### 2. Model Selection Optimization (`model-selection-optimization`)

Tracks AI model selection for tasks:
- **Metrics**: Cost per task, quality score, cost efficiency
- **Parameters**: Selected model, task type, complexity
- **Goal**: Maximize quality while minimizing cost

### 3. Cost Optimization (`cost-optimization`)

Tracks and optimizes token usage:
- **Metrics**: Tokens per task, cost per task, budget utilization
- **Parameters**: Token budget, model tier, task complexity
- **Goal**: Minimize cost while maintaining quality

### 4. Quality Optimization (`quality-optimization`)

Tracks task output quality:
- **Metrics**: Quality score, success rate, review cycles
- **Parameters**: Worker type, planning strategy, review settings
- **Goal**: Maximize output quality

## Key Metrics

| Metric | Description | Goal | Range |
|--------|-------------|------|-------|
| `routing_accuracy` | % of correct routing decisions | Maximize | 0.0 - 1.0 |
| `average_confidence` | Average routing confidence | Maximize | 0.0 - 1.0 |
| `task_success_rate` | % of successfully completed tasks | Maximize | 0.0 - 1.0 |
| `average_latency_ms` | Average task execution time | Minimize | 0 - ∞ |
| `cost_per_task` | Average cost per task (USD) | Minimize | 0.0 - ∞ |
| `tokens_per_task` | Average tokens per task | Minimize | 0 - ∞ |
| `quality_score` | Average quality score | Maximize | 0.0 - 1.0 |
| `cost_efficiency` | Quality per dollar | Maximize | 0.0 - ∞ |

## Integration with Cortex

### Automatic Tracking

MLflow can automatically track routing decisions when enabled:

```bash
# In MoE router (moe-router.sh)
if [[ "${MLFLOW_TRACKING_ENABLED:-false}" == "true" ]]; then
    python3 data-intelligence/mlflow/tracking/log_routing.py \
        --task-id "$TASK_ID" \
        --routing-data "$ROUTING_DECISION_JSON"
fi
```

### Manual Tracking

For custom experiments:

```python
from data_intelligence.mlflow.tracking.mlflow_client import CortexMLflowClient

client = CortexMLflowClient()

# Start an experiment run
run_id = client.track_experiment_run(
    experiment_key='routing_optimization',
    run_name='confidence-threshold-experiment',
    params={
        'confidence_threshold': 0.85,
        'routing_method': 'semantic-search',
        'use_secondary_experts': True,
    },
    metrics={
        'routing_accuracy': 0.94,
        'average_confidence': 0.91,
        'task_success_rate': 0.96,
    },
    tags={
        'experiment_type': 'threshold_tuning',
        'dataset': 'prod_tasks_nov2025',
    }
)
```

## Analyzing Results

### View in MLflow UI

1. Navigate to http://localhost:5000
2. Select an experiment
3. Compare runs by metrics
4. Visualize trends over time

### Programmatic Analysis

```python
from data_intelligence.mlflow.tracking.mlflow_client import CortexMLflowClient

client = CortexMLflowClient()

# Get best routing run
best_run = client.get_best_run(
    experiment_key='routing_optimization',
    metric='routing_accuracy',
    ascending=False  # Higher is better
)

print(f"Best routing accuracy: {best_run['metrics']['routing_accuracy']}")
print(f"Parameters: {best_run['params']}")

# Get experiment statistics
stats = client.get_experiment_stats('routing_optimization')
print(f"Total runs: {stats['total_runs']}")
print(f"Success rate: {stats['success_rate']:.2%}")
print(f"Average routing accuracy: {stats['metric_stats']['routing_accuracy']['mean']:.3f}")

# Compare multiple runs
run_ids = ['run-001', 'run-002', 'run-003']
comparison = client.compare_runs('routing_optimization', run_ids)

for run in comparison:
    print(f"{run['run_name']}: accuracy={run['metrics']['routing_accuracy']:.3f}")
```

## A/B Testing

MLflow enables A/B testing of routing strategies:

```python
# Strategy A: NLP keyword matching
client.track_experiment_run(
    experiment_key='routing_optimization',
    run_name='strategy-a-nlp-keywords',
    params={'routing_method': 'nlp-keyword', 'threshold': 0.8},
    metrics={'routing_accuracy': 0.87, 'avg_latency': 45},
)

# Strategy B: Semantic search
client.track_experiment_run(
    experiment_key='routing_optimization',
    run_name='strategy-b-semantic-search',
    params={'routing_method': 'semantic-search', 'threshold': 0.8},
    metrics={'routing_accuracy': 0.92, 'avg_latency': 120},
)

# Compare and choose the best
best = client.get_best_run('routing_optimization', 'routing_accuracy')
```

## Delta Lake Integration

MLflow experiments can be synced with Delta Lake tables:

```python
# Export runs to Delta Lake for analysis
from data_intelligence.mlflow.tracking.export_to_delta import export_experiments

export_experiments(
    experiment_keys=['routing_optimization', 'model_selection'],
    output_path='data-intelligence/lakehouse/mlflow/experiments'
)
```

## Next Steps

1. **Phase 1.4**: Build end-to-end lineage tracking
2. **Phase 2.3**: Implement AutoML for routing optimization using MLflow results
3. **Phase 3.2**: Build monitoring dashboard using MLflow metrics
4. **Phase 3.4**: Implement cost optimization using MLflow tracking data

## References

- [MLflow Documentation](https://mlflow.org/docs/latest/index.html)
- [MLflow Tracking](https://mlflow.org/docs/latest/tracking.html)
- [Databricks MLflow Guide](https://docs.databricks.com/mlflow/)
- [Lakehouse Schema](../schemas/cortex-lakehouse-schema.md)
