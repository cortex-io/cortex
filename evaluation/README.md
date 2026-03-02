# Cortex Evaluation Framework

Continuous measurement and improvement of Cortex performance using LLM-based evaluation.

## Quick Start

### 1. Set Up Environment

Ensure `ANTHROPIC_API_KEY` is set in `.env`:

```bash
echo "ANTHROPIC_API_KEY=your-key-here" >> ../.env
```

### 2. Run Lightweight Evaluation

```bash
./run-evaluation.sh --mode light
```

This runs 8 representative tasks (~2 minutes, ~$0.08).

### 3. View Results

```bash
./evaluation-dashboard.sh
```

## Common Commands

```bash
# Full evaluation (all 27 tasks)
./run-evaluation.sh

# Lightweight evaluation (8 tasks)
./run-evaluation.sh --mode light

# Evaluate only security tasks
./run-evaluation.sh --filter 'security-*'

# Evaluate specific task
./run-evaluation.sh --filter 'development-001'

# Dry run (preview tasks)
./run-evaluation.sh --dry-run

# View dashboard
./evaluation-dashboard.sh

# Calculate metrics
python3 evaluators/metrics.py --results results/evaluation-runs.jsonl

# Human evaluation
python3 evaluators/human-eval.py \
  --task golden-dataset/tasks/security-001.json \
  --outcome /path/to/outcome.json
```

## Directory Structure

```
evaluation/
├── golden-dataset/
│   ├── tasks/                    # 27 reference tasks
│   │   ├── security-*.json       # Security master tasks (6)
│   │   ├── development-*.json    # Development master tasks (11)
│   │   ├── inventory-*.json      # Inventory master tasks (5)
│   │   ├── coordinator-*.json    # Coordinator master tasks (3)
│   │   └── integration-*.json    # Integration tests (2)
│   └── expected-outcomes/        # Expected results (optional)
├── evaluators/
│   ├── lm-judge.py              # Claude-based evaluator
│   ├── human-eval.py            # Human annotation tool
│   └── metrics.py               # Metrics calculation
├── results/
│   ├── evaluation-runs.jsonl    # Historical results
│   ├── human-annotations.jsonl  # Human evaluations
│   └── temp/                    # Temporary files
├── run-evaluation.sh            # Main runner
├── evaluation-dashboard.sh      # Results visualization
└── README.md                    # This file
```

## Golden Dataset Overview

**Total Tasks**: 27

### By Master Type
- **Security**: 6 tasks (CVE scanning, audits, secrets, permissions, SQL injection, rate limiting)
- **Development**: 11 tasks (API endpoints, bug fixes, refactoring, optimization, logging, tracing)
- **Inventory**: 5 tasks (API catalog, dependencies, scripts, config, coverage)
- **Coordinator**: 3 tasks (routing, decomposition, handoffs)
- **Integration**: 2 tasks (end-to-end workflows, failure handling)

### By Complexity
- **Low**: 5 tasks (~5-20 minutes)
- **Medium**: 14 tasks (~20-45 minutes)
- **High**: 6 tasks (~45-70 minutes)
- **Very High**: 2 tasks (~90 minutes)

## LM-as-Judge Evaluation

### Dimensions

Each task is evaluated on 5 dimensions (1-5 scale):

1. **Correctness**: Did it solve the task correctly?
2. **Completeness**: Were all requirements addressed?
3. **Efficiency**: Was the approach efficient?
4. **Code Quality**: Is the implementation maintainable?
5. **Best Practices**: Does it follow conventions?

### Passing Threshold

**Score >= 3.0** is considered passing.

### Cost

- **Single task**: ~$0.01
- **Lightweight (8 tasks)**: ~$0.08
- **Full (27 tasks)**: ~$0.25

## Metrics Tracked

### Overall Performance
- Average score (1-5 scale)
- Success rate (% passing)
- Pass/fail counts
- Standard deviation

### By Master Type
- Performance breakdown
- Success rates per master
- Task counts

### Trends
- Performance direction (improving/declining/stable)
- Change over time
- Recent vs historical comparison

### Weaknesses
- Tasks scoring < 3.0
- Weak dimensions
- Recommendations

## Output Files

### evaluation-runs.jsonl

JSONL file with all evaluation results:

```json
{
  "overall_score": 4.2,
  "overall_assessment": "Task completed successfully...",
  "dimensions": {...},
  "strengths": [...],
  "weaknesses": [...],
  "recommendations": [...],
  "metadata": {
    "task_id": "security-001",
    "evaluated_at": "2025-11-27T19:00:00Z",
    "model": "claude-3-5-sonnet-20241022"
  },
  "run_id": "eval-1234567890"
}
```

### human-annotations.jsonl

Human evaluation annotations:

```json
{
  "task_id": "security-001",
  "evaluated_at": "2025-11-27T20:00:00Z",
  "evaluator": "John Doe",
  "overall_score": 4,
  "correctness": 5,
  "completeness": 4,
  "efficiency": 4,
  "feedback": "Good detection, could improve docs",
  "lm_agreement": {...}
}
```

## Integration with CI/CD

Add to `.github/workflows/evaluation.yml`:

```yaml
- name: Run evaluation
  run: ./evaluation/run-evaluation.sh --mode light
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}

- name: Check success rate
  run: |
    SUCCESS_RATE=$(python3 evaluation/evaluators/metrics.py \
      --format json | jq -r '.overall.success_rate.percentage')
    if (( $(echo "$SUCCESS_RATE < 80" | bc -l) )); then
      exit 1
    fi
```

## Human Evaluation Workflow

1. **Run LM Evaluation**: Get automated baseline
2. **Select Sample**: Choose 10-20 tasks for human review
3. **Annotate**: Use human-eval.py tool
4. **Analyze Agreement**: Check human-LM correlation
5. **Calibrate**: Adjust prompts if needed
6. **Iterate**: Re-evaluate with improvements

## When to Run Evaluations

### Development
- **Before major releases**: Full evaluation
- **During development**: Lightweight mode
- **After bug fixes**: Filtered evaluation
- **After prompt changes**: Affected tasks

### Scheduled
- **Weekly**: Full evaluation for trend tracking
- **Daily**: Lightweight evaluation for quick checks

### CI/CD
- **Pull requests**: Lightweight mode
- **Main branch**: Full evaluation
- **Pre-production**: Full validation

## Best Practices

### Task Design
1. Clear, specific requirements
2. Explicit evaluation criteria
3. Realistic scenarios
4. Balanced complexity
5. Diverse coverage

### Evaluation
1. Use consistent model version
2. Track costs (token usage)
3. Review low-scoring tasks
4. Calibrate with human eval
5. Monitor trends over time

### Regression Testing
1. Set baseline scores
2. Alert on drops > 5%
3. Investigate regressions
4. Track fixes in knowledge base
5. Re-validate improvements

## Troubleshooting

### "Error: ANTHROPIC_API_KEY not set"
Set in `.env` file in project root.

### "No evaluations found"
Run evaluation first: `./run-evaluation.sh --mode light`

### "Permission denied"
Make scripts executable: `chmod +x *.sh`

### "jq: command not found"
Install jq: `brew install jq` (macOS) or `apt-get install jq` (Linux)

## Documentation

Full documentation: `/Users/ryandahlberg/Projects/cortex/docs/evaluation-framework.md`

## Examples

### Evaluate Security Tasks
```bash
./run-evaluation.sh --filter 'security-*'
```

### View Recent Metrics
```bash
python3 evaluators/metrics.py --results results/evaluation-runs.jsonl
```

### Human Evaluation Session
```bash
python3 evaluators/human-eval.py \
  --task golden-dataset/tasks/security-001.json \
  --outcome results/temp/security-001-outcome.json \
  --lm-eval results/temp/security-001-evaluation.json
```

### Check Agreement
```bash
python3 evaluators/human-eval.py --analyze
```

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review full documentation
3. Check evaluation logs in `results/temp/`
4. Review LM-as-Judge output for errors

## License

Part of the Cortex project.
