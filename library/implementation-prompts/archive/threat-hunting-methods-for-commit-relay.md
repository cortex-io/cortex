# Threat Hunting Methods for Commit-Relay Intelligence

**Source**: `threat-hunters-cookbook.pdf` (Splunk SURGe)
**Date Processed**: 2025-11-09
**Relevance**: Critical - Systematic approach to pattern detection and anomaly hunting applicable to MoE system intelligence

---

## Executive Summary

This cookbook provides systematic methodologies for proactive pattern detection and anomaly hunting. While originally designed for cybersecurity threat hunting, these methods are **directly applicable to commit-relay's MoE intelligence system** for:

1. **Worker Behavior Analysis** - Detecting anomalous worker execution patterns
2. **Task Success Prediction** - Forecasting task outcomes based on historical patterns
3. **System Health Hunting** - Proactively finding performance degradations
4. **Routing Intelligence** - Learning optimal master/worker assignments
5. **Resource Optimization** - Identifying inefficient token/time usage patterns

**Key Framework**: **PEAK Threat Hunting Framework** - Prepare, Execute, Act (on findings), Knowledge (share learnings)

---

## Core Hunting Methods & Commit-Relay Applications

### 1. Searching and Filtering

**Definition**: Querying data for specific artifacts, patterns, or combinations of conditions

**Commit-Relay Applications**:

#### A. Task Identification Phase
```bash
# Example: Find all failed tasks for a specific master type
jq '.tasks[] | select(.status == "failed" and .assigned_master_type == "development")' \
  coordination/task-queue.json
```

#### B. Worker Lifecycle Filtering
```bash
# Example: Find workers that spawned but never completed
jq '.workers[] | select(.status == "spawned" and .completion_time == null and
  (now - .spawn_time) > 3600)' coordination/worker-pool.json
```

#### C. Pattern Matching with Regex
```bash
# Find tasks with specific error patterns in worker logs
grep -E "(timeout|memory.*exceeded|token.*exhausted)" \
  agents/logs/workers/worker-*.log
```

**Prompts for Implementation**:

1. ✅ **Create Unified Search Interface for Commit-Relay Data**
   - Build `scripts/hunt-search.sh` that accepts search patterns across all data sources
   - Support filtering by: status, time range, worker_type, master_type, priority, error_pattern
   - Output results in standardized JSON format for further analysis
   - Examples:
     ```bash
     ./scripts/hunt-search.sh --status failed --time-range "last 24h"
     ./scripts/hunt-search.sh --pattern "timeout" --source worker-logs
     ./scripts/hunt-search.sh --worker-type implementation --success-rate "<80%"
     ```

2. ✅ **Implement Field Extraction for Structured Queries**
   - Parse worker logs to extract structured fields (error_type, duration, token_usage)
   - Create `coordination/telemetry/structured-logs.jsonl` with enriched events
   - Support querying: `hunt --field error_type=timeout --field duration>300`

---

### 2. Sorting and Stacking (Frequency Analysis)

**Definition**: Counting occurrences to find highest/lowest/common/rare values

**Commit-Relay Applications**:

#### A. Identify High-Volume Failures
```bash
# Stack count of failures by error type
jq -r '.tasks[] | select(.status == "failed") | .error_message' \
  coordination/task-queue.json | sort | uniq -c | sort -rn
```

#### B. Rare Event Detection
```bash
# Find rarely-used worker types (potential for consolidation)
jq -r '.workers[] | .worker_type' coordination/worker-pool.json | \
  sort | uniq -c | sort -n | head -5
```

#### C. Top Performers
```bash
# Identify masters with highest success rates
jq -r '.masters[] | "\(.success_rate) \(.master_type)"' \
  coordination/master-performance.json | sort -rn | head -10
```

**Prompts for Implementation**:

3. ✅ **Build Frequency Analysis Dashboard for Commit-Relay**
   - Create `scripts/analyze-frequency.sh` to generate statistics:
     * Top 10 most common error types
     * Rare worker types (< 5 executions in 30 days)
     * Most active masters by task volume
     * Time-of-day distribution for task failures
   - Output visualizations to dashboard or reports
   - Example output:
     ```
     TOP ERRORS (Last 7 Days):
     247  timeout_exceeded
     183  token_limit_reached
      42  worker_spawn_failed
      12  api_rate_limit
       3  unknown_error

     RARE WORKER TYPES (Usage < 5):
       2  experimental-solver
       1  legacy-migration
     ```

4. ✅ **Implement Rare Event Alerting**
   - Detect when a new worker_type is used for the first time
   - Alert on unusual master assignment patterns
   - Flag tasks with never-before-seen error messages
   - Create alerts in `coordination/health-alerts.json`

---

### 3. Grouping

**Definition**: Linking related events by common entities (account, host, time, etc.)

**Commit-Relay Applications**:

#### A. Group Task Lifecycle Events
```bash
# Group all events for a single task across different data sources
task_id="task-1234567890"

echo "Task Queue Entry:"
jq ".tasks[] | select(.id == \"$task_id\")" coordination/task-queue.json

echo "Worker Assignment:"
jq ".workers[] | select(.task_id == \"$task_id\")" coordination/worker-pool.json

echo "Coordinator Routing Decision:"
jq ". | select(.task_id == \"$task_id\")" \
  coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl
```

#### B. Group by Time Windows
```bash
# Count tasks created per hour to find peak times
jq -r '.tasks[] | .created_at' coordination/task-queue.json | \
  cut -d'T' -f2 | cut -d':' -f1 | sort | uniq -c
```

#### C. Multi-Stage Attack Chain (for Commit-Relay: Multi-Stage Workflows)
```bash
# Group related tasks that form a workflow
# Example: code review → testing → deployment
jq '.tasks[] | select(.workflow_id == "deploy-2025-11-09")' \
  coordination/task-queue.json | jq -s 'group_by(.stage)'
```

**Prompts for Implementation**:

5. ✅ **Create Task Lifecycle Tracker**
   - Build `scripts/track-task-lifecycle.sh <task_id>` that:
     * Shows complete timeline: created → assigned → spawned → executing → completed/failed
     * Displays all associated data: routing decision, worker logs, token usage, duration
     * Identifies bottlenecks (time spent in each state)
   - Output timeline visualization:
     ```
     Task: task-1762553446
     Timeline:
     2025-11-09 10:15:23 [Created]      priority=critical, type=dashboard_fix
     2025-11-09 10:15:25 [Assigned]     master=development, confidence=0.95
     2025-11-09 10:15:32 [Worker Spawn] worker_id=worker-891234, type=bug_fix
     2025-11-09 10:16:45 [In Progress]  tokens_used=1250/5000
     2025-11-09 10:22:11 [Completed]    total_duration=348s, tokens=4230

     Bottleneck: Worker spawn took 7s (target: <5s)
     ```

6. ✅ **Implement Workflow Grouping for Related Tasks**
   - Add `workflow_id` field to tasks that are part of multi-step processes
   - Group and analyze workflow success rates
   - Detect incomplete workflows (some steps failed)
   - Example: PR review workflow = [code_analysis, test_execution, review_comment]

---

### 4. Forecasting and Anomaly Detection

**Definition**: Predict future trends and identify deviations from normal patterns

**Commit-Relay Applications**:

#### A. Token Exhaustion Prediction
```python
# Pseudocode: Forecast when tokens will run out
import json
from datetime import datetime, timedelta

# Load token usage history
with open('coordination/telemetry/metrics.jsonl') as f:
    metrics = [json.loads(line) for line in f if 'token_usage' in line]

# Calculate burn rate (tokens/hour)
recent_usage = metrics[-24:]  # Last 24 hours
total_used = sum(m['tokens_used'] for m in recent_usage)
burn_rate = total_used / 24

# Current available
available = 240000  # From token budget

# Forecast exhaustion
hours_remaining = available / burn_rate
exhaustion_time = datetime.now() + timedelta(hours=hours_remaining)

if hours_remaining < 2:
    create_alert("CRITICAL: Token exhaustion predicted in {hours_remaining:.1f} hours")
```

#### B. Worker Spawn Failure Anomaly
```bash
# Detect anomalous spawn failure rates using IQR method
jq -r '.workers[] | select(.spawn_time >= (now - 86400)) |
  if .status == "failed" then 1 else 0 end' \
  coordination/worker-pool.json | \
  awk '{sum+=$1; count++} END {print sum/count}'

# If spawn failure rate > 10%, trigger investigation
```

#### C. Task Duration Prediction
```bash
# Calculate baseline task duration by type, detect outliers
jq '.tasks[] | select(.status == "completed") |
  {type: .task_type, duration: .completion_time - .start_time}' \
  coordination/task-queue.json | \
  jq -s 'group_by(.type) | map({
    type: .[0].type,
    avg_duration: (map(.duration) | add / length),
    p95_duration: (map(.duration) | sort | .[length * 0.95 | floor])
  })'
```

**Statistical Methods** (from the cookbook):

| Method | Formula | Threshold | Use Case in Commit-Relay |
|--------|---------|-----------|-------------------------|
| **Standard Deviation** | outlier if `value < (μ - 2σ)` or `value > (μ + 2σ)` | ±2σ from mean | Task duration anomalies |
| **IQR (Interquartile Range)** | outlier if `value < Q1 - 1.5×IQR` or `value > Q3 + 1.5×IQR` | 1.5×IQR | Token usage spikes |
| **Z-Score** | `z = (value - μ) / σ`, outlier if `|z| > 3` | |z| > 3 | Worker performance |
| **Modified Z-Score** | `Mz = 0.6745 × (value - median) / MAD`, outlier if `|Mz| > 3.5` | |Mz| > 3.5 | Robust to outliers |

**Prompts for Implementation**:

7. ✅ **Build Predictive Token Exhaustion System**
   - Track token burn rate (tokens/hour) over sliding 24-hour window
   - Calculate linear regression forecast: `hours_remaining = available_tokens / burn_rate`
   - Create tiered alerts:
     * WARNING: < 4 hours remaining
     * CRITICAL: < 2 hours remaining
     * EMERGENCY: < 30 minutes remaining
   - Auto-throttle task creation when approaching limits
   - Log predictions to `coordination/telemetry/predictions.jsonl`

8. ✅ **Implement Worker Performance Anomaly Detection**
   - For each worker_type, calculate baseline metrics (mean, stdev, IQR):
     * spawn_duration (target: < 5s)
     * execution_duration by task complexity
     * token_efficiency (output_quality / tokens_used)
     * success_rate
   - Apply Z-score detection: Flag workers with `|z| > 3` for any metric
   - Create performance outlier alerts:
     ```json
     {
       "alert_type": "performance_anomaly",
       "worker_id": "worker-123456",
       "metric": "execution_duration",
       "value": 450,
       "baseline_mean": 180,
       "baseline_stdev": 45,
       "z_score": 6.0,
       "severity": "high"
     }
     ```

9. ✅ **Build Time-Series Forecasting for System Load**
   - Use ARIMA or StateSpace forecasting (from MLTK examples in doc)
   - Predict task queue depth for next 4 hours
   - Forecast required worker capacity
   - Pre-spawn workers during predicted high-load periods
   - Example output:
     ```
     Current Queue Depth: 12 tasks
     Predicted (in 1h): 28 tasks
     Predicted (in 2h): 45 tasks  ← ALERT: Scale up workers
     Predicted (in 4h): 31 tasks

     Recommendation: Spawn 3 additional workers at 11:00 AM
     ```

---

### 5. Clustering

**Definition**: Automatically group similar data points based on attributes without predefined categories

**Commit-Relay Applications**:

#### A. Task Clustering by Similarity
```python
# Cluster tasks by description similarity to find patterns
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.cluster import KMeans
import json

# Load tasks
with open('coordination/task-queue.json') as f:
    data = json.load(f)
    tasks = [(t['id'], t['description']) for t in data['tasks']]

# Vectorize task descriptions
vectorizer = TfidfVectorizer(max_features=100)
task_vectors = vectorizer.fit_transform([t[1] for t in tasks])

# Cluster into 5 groups
kmeans = KMeans(n_clusters=5)
clusters = kmeans.fit_predict(task_vectors)

# Analyze clusters
for i in range(5):
    cluster_tasks = [tasks[j][1] for j, c in enumerate(clusters) if c == i]
    print(f"Cluster {i}: {len(cluster_tasks)} tasks")
    print(f"Sample: {cluster_tasks[0][:100]}...")
```

#### B. Worker Behavior Clustering
```bash
# Cluster workers by performance characteristics
# Features: success_rate, avg_duration, token_efficiency, error_rate
jq '.workers[] | {
  worker_id,
  success_rate: .completed_tasks / .total_tasks,
  avg_duration,
  token_efficiency: .avg_tokens_used,
  error_rate: .failed_tasks / .total_tasks
}' coordination/worker-pool.json > /tmp/worker-features.json

# Use K-Means to identify worker performance tiers:
# - High Performers (fast, efficient, high success)
# - Average Performers
# - Struggling Workers (slow, high token usage, failures)
```

#### C. Error Pattern Clustering
```bash
# Cluster similar error messages to identify root causes
# Group: "timeout connecting to API" + "API connection timeout" = same issue
cat agents/logs/system/worker-daemon.log | \
  grep ERROR | \
  # Apply clustering algorithm (DBSCAN for variable cluster count)
  # Output: Common error families
```

**Prompts for Implementation**:

10. ✅ **Create Task Similarity Clustering System**
    - Implement TFIDF vectorization for task descriptions
    - Use K-Means (k=5-10) or DBSCAN to find natural task groupings
    - Applications:
      * Identify task types for specialized workers
      * Find duplicate/similar tasks (avoid redundant work)
      * Discover new task categories for master specialization
    - Output cluster analysis:
      ```
      TASK CLUSTERS (k=7):

      Cluster 0: "Dashboard Bug Fixes" (42 tasks)
        - Common terms: dashboard, UI, frontend, fix, bug
        - Optimal master: development
        - Avg success rate: 94%

      Cluster 1: "API Development" (38 tasks)
        - Common terms: API, endpoint, REST, integration
        - Optimal master: development
        - Avg success rate: 87%

      Cluster 2: "Database Migration" (12 tasks)
        - Common terms: database, migration, schema, SQL
        - Optimal master: infrastructure
        - Avg success rate: 78%
      ```

11. ✅ **Implement Worker Performance Tier Clustering**
    - Features: `[success_rate, avg_duration, token_efficiency, spawn_reliability]`
    - Use K-Means (k=3) to identify:
      * **Elite Workers**: success>95%, duration<avg, tokens<avg
      * **Standard Workers**: within 1σ of mean
      * **Struggling Workers**: success<80% OR duration>2×avg
    - Auto-assign elite workers to high-priority tasks
    - Flag struggling workers for investigation/retirement

12. ✅ **Build Error Pattern Clustering for Root Cause Analysis**
    - Parse all error messages from logs
    - Use DBSCAN clustering on error text (handles variable cluster count)
    - Group similar errors into "error families"
    - Example output:
      ```
      ERROR FAMILIES:

      Family A: "Token/Rate Limiting" (183 errors)
        - "token limit exceeded"
        - "rate limit reached for API"
        - "quota exhausted"
        → Root Cause: Need to implement token throttling

      Family B: "Worker Spawn Failures" (47 errors)
        - "failed to spawn worker process"
        - "worker initialization timeout"
        - "spawn error: resource unavailable"
        → Root Cause: System resource constraints

      Family C: "API Connectivity" (12 errors)
        - "timeout connecting to Claude API"
        - "API endpoint unreachable"
        → Root Cause: Network/API availability issue
      ```

---

### 6. Exploratory Data Analysis (EDA) and Visualization

**Definition**: Statistical and graphical methods to understand data distribution, patterns, and relationships

**Commit-Relay Applications**:

#### A. Baseline Profiling
```bash
# Profile task queue to understand normal behavior
jq '.tasks[] | {
  priority,
  status,
  duration: (.completion_time - .created_at),
  tokens_used
}' coordination/task-queue.json | \
jq -s 'group_by(.status) | map({
  status: .[0].status,
  count: length,
  avg_duration: (map(.duration) | add / length),
  avg_tokens: (map(.tokens_used) | add / length)
})'
```

#### B. Distribution Visualization
```python
# Visualize task duration distribution (identify outliers)
import matplotlib.pyplot as plt
import json

with open('coordination/task-queue.json') as f:
    tasks = json.load(f)['tasks']
    durations = [t['completion_time'] - t['start_time']
                 for t in tasks if t['status'] == 'completed']

plt.hist(durations, bins=50)
plt.xlabel('Task Duration (seconds)')
plt.ylabel('Frequency')
plt.title('Task Duration Distribution')
plt.axvline(x=np.percentile(durations, 95), color='r',
            linestyle='--', label='P95')
plt.savefig('dashboard/analytics/task-duration-histogram.png')
```

#### C. Correlation Analysis
```python
# Analyze relationship between task complexity and token usage
import pandas as pd
import seaborn as sns

# Load data
df = pd.DataFrame(tasks)
df['complexity'] = df['description'].apply(len)  # Proxy for complexity

# Scatter plot: complexity vs tokens_used
sns.scatterplot(data=df, x='complexity', y='tokens_used')
plt.title('Task Complexity vs Token Usage')
plt.savefig('dashboard/analytics/complexity-vs-tokens.png')

# Calculate correlation
correlation = df['complexity'].corr(df['tokens_used'])
print(f"Correlation: {correlation:.2f}")
```

**Prompts for Implementation**:

13. ✅ **Build Baseline Profiling Dashboard**
    - Create `scripts/profile-baseline.sh` that generates:
      * Task duration statistics (min, max, mean, median, p95, p99)
      * Token usage distribution by worker_type
      * Success rate by master_type
      * Time-to-spawn histogram
      * Queue depth over time (24-hour view)
    - Output to `coordination/baseline-profile.json`
    - Generate visualizations: histograms, box plots, time series

14. ✅ **Implement Box Plot Visualizations for Outlier Detection**
    - For each metric (duration, tokens, spawn_time):
      * Calculate five-number summary: min, Q1, median, Q3, max
      * Identify outliers (beyond whiskers: Q1-1.5×IQR, Q3+1.5×IQR)
      * Visualize in dashboard
    - Example use: Detect workers with unusually high token usage

15. ✅ **Create Correlation Matrix for Performance Factors**
    - Analyze relationships between variables:
      * task_complexity ↔ token_usage
      * task_priority ↔ success_rate
      * worker_type ↔ execution_duration
      * time_of_day ↔ spawn_failure_rate
    - Use findings to optimize routing and resource allocation
    - Example insight: "High-priority tasks have 15% higher success rate when assigned to development master vs. general master"

---

### 7. Combined Methods (Advanced Hunting)

**Definition**: Multi-stage hunts combining several methods to test complex hypotheses

**Commit-Relay Applications**:

#### A. Beaconing Detection → Task Execution Pattern Analysis
From the cookbook: Detect C2 beaconing by finding low variance in connection timing

**Adapted for Commit-Relay**: Detect worker lifecycle anomalies
```bash
# Find workers with suspiciously regular heartbeat patterns (may indicate stuck state)
jq -r '.workers[] | .worker_id, .heartbeat_times[]' \
  coordination/worker-pool.json | \
  awk 'NR%2==1 {worker=$0; next}
       {gaps[worker] = gaps[worker] " " ($0 - last[worker]);
        last[worker] = $0}
       END {for (w in gaps) {
         # Calculate variance in heartbeat gaps
         # Low variance + long duration = potential stuck worker
       }}'
```

#### B. First-Time Baseline Detection → New Domain/Worker Type
From the cookbook: Detect users connecting to new domains for first time

**Adapted for Commit-Relay**: Detect new task/worker type combinations
```bash
# Baseline: Track which worker_types have successfully handled which task_types
jq -r '.workers[] | select(.status == "completed") |
  "\(.worker_type)|\(.task_type)"' coordination/worker-pool.json | \
  sort -u > coordination/baselines/worker-task-combinations.txt

# Detection: Alert on new combinations (may indicate mis-routing or expansion)
current_combo="implementation|database-migration"
if ! grep -q "$current_combo" coordination/baselines/worker-task-combinations.txt; then
  create_alert "NEW: Implementation worker assigned to database task"
fi
```

#### C. Multi-Stage Workflow Analysis
From the cookbook: Detect multi-stage attacks (recon → exploit → exfiltrate)

**Adapted for Commit-Relay**: Analyze multi-task workflows
```bash
# Detect workflow failures: When first task succeeds but dependent tasks fail
# Example: Code review passes, but deployment fails
jq '.tasks[] | select(.workflow_id != null)' coordination/task-queue.json | \
  jq -s 'group_by(.workflow_id) | map({
    workflow: .[0].workflow_id,
    stages: map({stage: .stage, status: .status}),
    pattern: (map(.status) | join("→"))
  }) |
  map(select(.pattern | contains("completed→failed")))'
```

**Prompts for Implementation**:

16. ✅ **Build Worker Health Pattern Analysis**
    - Detect anomalous worker heartbeat patterns:
      * Calculate variance in heartbeat intervals
      * Low variance (< 2s) + long duration (> 10min) = potentially stuck
      * Missing heartbeats (gap > 60s) = potential crash
    - Create alerts for:
      * Stuck workers (require manual intervention)
      * Zombie workers (spawned but never executed)
      * Flapping workers (rapid spawn/die cycles)

17. ✅ **Implement Baseline Tracking for Worker-Task Combinations**
    - Maintain `coordination/baselines/worker-task-combinations.json`:
      ```json
      {
        "bug_fix": {
          "compatible_workers": ["implementation", "bug_hunter"],
          "success_rates": {"implementation": 0.94, "bug_hunter": 0.89},
          "first_seen": "2025-11-01",
          "sample_count": 247
        }
      }
      ```
    - Alert on:
      * New worker-task combinations (may be mis-routing)
      * Degraded success rate for known combinations
      * First-time task types (no baseline exists)

18. ✅ **Create Multi-Stage Workflow Analyzer**
    - Track workflows with multiple dependent tasks
    - Identify failure patterns:
      * "review→test→deploy": Where do failures occur most?
      * Early-stage failures (less costly) vs late-stage (waste more resources)
    - Optimize workflow by:
      * Inserting validation checkpoints
      * Auto-canceling downstream tasks if upstream fails
      * Learning optimal task ordering

---

## Advanced: Model-Assisted Threat Hunting (M-ATH)

From the cookbook: Use machine learning models for sophisticated pattern detection

**Applicable ML Algorithms for Commit-Relay**:

### A. Classification Algorithms

#### 1. **RandomForestClassifier** - Predict Task Success
```python
# Train model to predict if task will succeed based on features
from sklearn.ensemble import RandomForestClassifier
import json

# Features: priority, description_length, assigned_master, time_of_day, queue_depth
# Label: success (1) or failure (0)

X_train = [
    [3, 450, "development", 14, 12],  # priority, desc_len, master, hour, queue
    [2, 320, "general", 9, 5],
    # ... more training data from historical tasks
]
y_train = [1, 0, ...]  # 1=success, 0=failure

model = RandomForestClassifier(n_estimators=100)
model.fit(X_train, y_train)

# Predict success for new task
new_task_features = [3, 500, "development", 15, 18]
success_probability = model.predict_proba([new_task_features])[0][1]

if success_probability < 0.5:
    print(f"WARNING: Low success probability ({success_probability:.2f})")
    print("Consider: reassigning to different master or adjusting priority")
```

#### 2. **LogisticRegression** - Worker Performance Classification
```python
# Classify workers into performance tiers
from sklearn.linear_model import LogisticRegression

# Features: avg_duration, token_efficiency, success_rate, tasks_completed
# Classes: "elite", "standard", "struggling"

X = [[120, 0.85, 0.98, 45],   # Elite worker
     [200, 0.72, 0.88, 28],   # Standard
     [350, 0.45, 0.65, 12]]   # Struggling

y = ["elite", "standard", "struggling"]

model = LogisticRegression(multi_class='multinomial')
model.fit(X, y)

# Classify new worker
new_worker = [[180, 0.78, 0.91, 33]]
tier = model.predict(new_worker)[0]
print(f"Worker tier: {tier}")
```

### B. Anomaly Detection Algorithms

#### 1. **DensityFunction** - Detect Unusual Task Patterns
```python
# From Splunk MLTK: Detect tasks with unusual feature combinations
# Example: Tasks with high priority but low token usage (may indicate mis-classification)

from sklearn.neighbors import LocalOutlierFactor

X = [
    [3, 5000],  # [priority, tokens_used] - Normal high-priority task
    [3, 4800],
    [2, 2500],  # Normal medium-priority task
    [1, 800],   # Normal low-priority task
    [3, 200],   # ANOMALY: High-priority but very low tokens (suspicious)
]

lof = LocalOutlierFactor(n_neighbors=5)
outliers = lof.fit_predict(X)
print("Outliers:", [i for i, v in enumerate(outliers) if v == -1])
```

#### 2. **IsolationForest** - Detect Anomalous Workers
```python
# Detect workers with unusual performance characteristics
from sklearn.ensemble import IsolationForest

# Features: spawn_time, execution_time, token_usage, error_count
X = [
    [4.5, 180, 3200, 0],   # Normal worker
    [5.2, 195, 3400, 0],
    [4.8, 210, 3100, 1],
    [45, 20, 500, 8],      # ANOMALY: Very slow spawn, fast execution, low tokens, many errors
]

iso_forest = IsolationForest(contamination=0.1)
predictions = iso_forest.fit_predict(X)
anomaly_scores = iso_forest.score_samples(X)

for i, (pred, score) in enumerate(zip(predictions, anomaly_scores)):
    if pred == -1:
        print(f"Worker {i} is anomalous (score: {score:.3f})")
```

**Prompts for Implementation**:

19. ✅ **Build Task Success Prediction Model**
    - Train RandomForestClassifier on historical task data
    - Features:
      * priority (1-4)
      * description_length
      * assigned_master_type
      * hour_of_day
      * queue_depth_at_creation
      * worker_type
    - Label: success (1) or failure (0)
    - Use model to:
      * Predict success probability before assigning task
      * Re-route low-probability tasks to better masters
      * Warn users of risky task characteristics
    - Save model to `coordination/models/task-success-predictor.pkl`

20. ✅ **Implement Worker Performance Classification**
    - Use LogisticRegression to classify workers into tiers
    - Features: avg_duration, token_efficiency, success_rate, spawn_reliability
    - Tiers: elite (top 20%), standard (middle 60%), struggling (bottom 20%)
    - Applications:
      * Auto-assign elite workers to critical tasks
      * Flag struggling workers for investigation
      * Balance load by distributing tasks across tiers
    - Retrain model weekly as new performance data arrives

21. ✅ **Create Anomaly Detection for Worker Behavior**
    - Use IsolationForest to detect anomalous worker behavior
    - Flag workers with unusual combinations:
      * Very slow spawn + fast execution = possible caching/cheating
      * High tokens + low quality = inefficient worker
      * Many errors + high success rate = inconsistent data
    - Generate investigation alerts for anomalous workers

---

## PEAK Framework Applied to Commit-Relay

The **PEAK Threat Hunting Framework** provides a structured approach:

### P - Prepare
1. **Define Hypothesis**: What are we hunting for?
   - Example: "Workers assigned to incompatible tasks have 30% higher failure rates"
2. **Identify Data Sources**: Where is the evidence?
   - `coordination/task-queue.json`, `coordination/worker-pool.json`, worker logs
3. **Select Method**: Which hunting method applies?
   - Grouping (by worker_type and task_type) + Statistical Analysis

### E - Execute
1. **Run the Hunt**: Execute queries, analyses, or models
2. **Iterate**: Refine based on initial findings
3. **Document**: Record all queries and results

### A - Act
1. **Validate Findings**: Confirm anomalies are real issues
2. **Remediate**: Fix the problem
   - Example: Update coordinator routing logic to avoid incompatible assignments
3. **Create Detection**: Turn hunt into automated alert
   - Add to health-monitor-daemon.sh

### K - Knowledge
1. **Document Learnings**: Update knowledge base
   - `coordination/memory/long-term/hunting-findings.json`
2. **Share Insights**: Improve system intelligence
   - Update `coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl`
3. **Continuous Improvement**: Feed findings back into MoE routing

**Prompts for Implementation**:

22. ✅ **Create PEAK Hunting Workflow Template**
    - Build `scripts/peak-hunt.sh` template that guides through framework:
      ```bash
      ./scripts/peak-hunt.sh --new "high token usage by implementation workers"

      # Generates structured hunting session:
      # 1. Prepare: Define hypothesis, data sources, method
      # 2. Execute: Provides query templates and analysis tools
      # 3. Act: Validation checklist, remediation tracking
      # 4. Knowledge: Auto-updates knowledge base with findings
      ```
    - Store hunt sessions in `coordination/memory/hunts/hunt-<timestamp>.json`

23. ✅ **Implement Hunt-to-Detection Pipeline**
    - Successful hunts become automated detections
    - Workflow:
      1. Hunt discovers pattern (e.g., "tasks with >10k tokens always timeout")
      2. Create detection rule in `coordination/detection-rules.json`
      3. Health monitor auto-checks rule every 5 minutes
      4. Alerts on new occurrences
    - Example detection rule:
      ```json
      {
        "rule_id": "high-token-timeout",
        "name": "High Token Tasks Timeout",
        "source_hunt": "hunt-2025-11-09-token-analysis",
        "condition": "task.tokens_requested > 10000",
        "alert_threshold": "1 occurrence",
        "severity": "high",
        "created": "2025-11-09",
        "enabled": true
      }
      ```

---

## Future Prompt List (Prioritized)

### Phase 1: Foundation (Critical - Implement First)
1. ✅ Create Unified Search Interface for Commit-Relay Data
2. ✅ Build Frequency Analysis Dashboard
3. ✅ Create Task Lifecycle Tracker
4. ✅ Build Predictive Token Exhaustion System
5. ✅ Implement Worker Performance Anomaly Detection

### Phase 2: Intelligence (High Priority)
6. ✅ Create Task Similarity Clustering System
7. ✅ Implement Worker Performance Tier Clustering
8. ✅ Build Error Pattern Clustering for Root Cause Analysis
9. ✅ Build Baseline Profiling Dashboard
10. ✅ Create Correlation Matrix for Performance Factors

### Phase 3: Advanced Detection (Medium Priority)
11. ✅ Build Worker Health Pattern Analysis
12. ✅ Implement Baseline Tracking for Worker-Task Combinations
13. ✅ Create Multi-Stage Workflow Analyzer
14. ✅ Build Task Success Prediction Model
15. ✅ Implement Worker Performance Classification

### Phase 4: Framework & Automation (Medium Priority)
16. ✅ Create PEAK Hunting Workflow Template
17. ✅ Implement Hunt-to-Detection Pipeline
18. ✅ Build Time-Series Forecasting for System Load
19. ✅ Implement Field Extraction for Structured Queries
20. ✅ Implement Rare Event Alerting

### Phase 5: ML & Optimization (Low Priority)
21. ✅ Create Anomaly Detection for Worker Behavior
22. ✅ Implement Box Plot Visualizations for Outlier Detection
23. ✅ Implement Workflow Grouping for Related Tasks

---

## Integration with Existing Commit-Relay Systems

### 1. Health Monitor Enhancement
**Current**: Basic heartbeat monitoring
**Enhanced**: Full hunting capabilities
- Implement anomaly detection algorithms
- Add forecasting for proactive alerts
- Incorporate ML models for pattern detection

### 2. Coordinator Routing Intelligence
**Current**: Pattern matching based on task description
**Enhanced**: Data-driven routing using hunt findings
- Use task success prediction model
- Route based on worker performance tiers
- Learn from clustering analysis

### 3. Dashboard Analytics
**Current**: Basic metrics display
**Enhanced**: Advanced visualizations and insights
- Box plots for outlier detection
- Time-series forecasting graphs
- Correlation matrices
- Real-time anomaly alerts

### 4. Worker Lifecycle Management
**Current**: Basic spawn/monitor/cleanup
**Enhanced**: Intelligent worker management
- Predict optimal worker types for upcoming tasks
- Auto-retire struggling workers
- Pre-spawn workers during predicted high-load

---

## Expected Benefits

### Quantitative Improvements
- **Reduced Downtime**: Proactive detection prevents issues (target: 50% reduction)
- **Faster MTTR**: Correlation analysis speeds troubleshooting (target: 60% faster)
- **Higher Task Success Rate**: Better routing through ML models (target: +10%)
- **Improved Resource Efficiency**: Token usage optimization (target: -15% waste)

### Qualitative Improvements
- **Proactive vs Reactive**: Predict issues before they occur
- **Data-Driven Decisions**: Route tasks based on evidence, not heuristics
- **Continuous Learning**: System improves autonomously from hunt findings
- **Root Cause Analysis**: Clustering identifies underlying patterns
- **System Intelligence**: MoE becomes smarter over time

---

## References & Further Reading

### From Source Document
- **PEAK Threat Hunting Framework** - Structured hunting methodology
- **Splunk SPL** - Query language patterns (adaptable to jq/bash)
- **Anomaly Detection Methods** - Statistical approaches (IQR, Z-score, etc.)
- **Machine Learning for Detection** - Classification and clustering algorithms

### Recommended for Commit-Relay Team
- Time-series forecasting techniques (ARIMA, StateSpace)
- Feature engineering for ML models
- Unsupervised learning (clustering) for pattern discovery
- Baseline establishment methodologies
- Hunt hypothesis development frameworks

---

## Next Steps

1. **Prioritize Prompts**: Select top 5 from Phase 1 to implement
2. **Proof of Concept**: Build token exhaustion predictor (Prompt #7)
3. **Measure Baseline**: Capture current MTTR, task success rate before improvements
4. **Iterative Rollout**: Implement one hunting method at a time, validate benefits
5. **Hunt Documentation**: Create hunt log template following PEAK framework
6. **Continuous Improvement**: Use hunt findings to enhance MoE routing

---

**Document Status**: ✅ Ready for Implementation
**Estimated Effort**: 60-80 hours for Phase 1-3 prompts
**Expected ROI**: 6-12 months based on improved system reliability and efficiency
**Key Insight**: Threat hunting methods are directly applicable to system intelligence and anomaly detection in MoE architectures
