# Failure Pattern Detection System - Design Document
**Phase 4.4 - Self-Healing Implementation**

## Overview

The Failure Pattern Detection System analyzes worker failures to identify patterns, predict future failures, and enable preventive actions. This creates a learning system that becomes more intelligent over time as it observes and categorizes failure modes.

## Goals

1. **Pattern Recognition**: Automatically identify recurring failure patterns
2. **Failure Categorization**: Classify failures by type, cause, and severity
3. **Predictive Analytics**: Predict failures before they occur
4. **Learning System**: Improve detection accuracy over time
5. **Actionable Insights**: Provide data for preventive measures
6. **Observability**: Complete visibility into failure patterns and trends

## Architecture

### Data Collection

```
┌─────────────────────────────────────────────────────────────┐
│  Failure Event Sources                                      │
├─────────────────────────────────────────────────────────────┤
│  • Zombie cleanup events (worker unresponsive)             │
│  • Worker restart events (restart attempts/failures)       │
│  • Heartbeat critical events (degraded health)             │
│  • Worker completion logs (exit codes, errors)             │
│  • System health alerts (resource exhaustion)              │
│  • Observability hub events (traces, spans)                │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  Pattern Detection Engine                                   │
├─────────────────────────────────────────────────────────────┤
│  • Event ingestion and normalization                       │
│  • Temporal analysis (time-series patterns)                │
│  • Correlation analysis (related failures)                 │
│  • Frequency analysis (recurring patterns)                 │
│  • Anomaly detection (unusual failures)                    │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  Pattern Classification & Storage                           │
├─────────────────────────────────────────────────────────────┤
│  • Failure taxonomy (categorization)                       │
│  • Pattern signatures (unique identifiers)                 │
│  • Historical pattern database                             │
│  • Confidence scoring                                      │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  Predictive Analytics & Alerting                            │
├─────────────────────────────────────────────────────────────┤
│  • Failure prediction (based on patterns)                  │
│  • Early warning signals                                   │
│  • Preventive action recommendations                       │
│  • Alert generation                                        │
└─────────────────────────────────────────────────────────────┘
```

## Failure Taxonomy

### Failure Categories

#### 1. **Transient Failures**
Temporary issues that may succeed on retry.

**Types**:
- `network_timeout` - Network request timeout
- `rate_limit` - API rate limit exceeded
- `resource_contention` - Temporary resource unavailability
- `external_service_unavailable` - Upstream service down

**Characteristics**:
- Often succeed on retry
- No code changes needed
- Environmental/external causes

**Detection Signals**:
- Worker succeeds on restart
- Similar failures across multiple workers simultaneously
- Correlation with external service status

#### 2. **Resource Failures**
Failures due to insufficient resources.

**Types**:
- `out_of_memory` - Worker exceeded memory limit
- `cpu_exhaustion` - Worker consumed all CPU
- `token_budget_exceeded` - Consumed all allocated tokens
- `disk_full` - Insufficient disk space
- `timeout` - Worker exceeded time limit

**Characteristics**:
- Predictable from resource metrics
- Can be prevented with proper allocation
- May indicate inefficient code

**Detection Signals**:
- Memory/CPU usage trending upward before failure
- Token usage exceeding allocation
- Consistent failure at same execution point

#### 3. **Systemic Failures**
Bugs or configuration issues in code.

**Types**:
- `uncaught_exception` - Unhandled error in code
- `assertion_failure` - Code assertion failed
- `configuration_error` - Invalid configuration
- `dependency_missing` - Required dependency not found
- `api_error` - LLM API returned error

**Characteristics**:
- Repeatable/deterministic
- Requires code or configuration fix
- Will not succeed on retry without changes

**Detection Signals**:
- Same failure on every retry
- Stack trace consistency
- Specific error message pattern

#### 4. **Data-Related Failures**
Failures due to input data or state.

**Types**:
- `invalid_input` - Malformed or invalid input data
- `data_corruption` - Corrupted state or data
- `schema_violation` - Data doesn't match schema
- `concurrent_modification` - Race condition on shared data

**Characteristics**:
- Related to specific task or data
- May affect specific worker types
- Requires data validation or cleanup

**Detection Signals**:
- Failures on specific tasks/repos
- Validation errors in logs
- Correlation with data characteristics

#### 5. **Environmental Failures**
Issues with the runtime environment.

**Types**:
- `permission_denied` - Insufficient file/API permissions
- `command_not_found` - Missing required tool
- `path_not_found` - File or directory missing
- `network_unreachable` - Network connectivity issue

**Characteristics**:
- Environment-specific
- May affect all workers
- Requires environment fix

**Detection Signals**:
- Multiple worker types affected
- Consistent error across tasks
- System-level error messages

## Pattern Signatures

Each pattern has a unique signature for identification and matching.

### Signature Components

```json
{
  "pattern_id": "pattern_oom_scan_worker_large_repos",
  "category": "resource_failure",
  "type": "out_of_memory",
  "signature": {
    "worker_type": "scan-worker",
    "failure_mode": "zombie_no_heartbeat",
    "exit_code": 137,
    "memory_trend": "increasing",
    "final_memory_usage": ">90%",
    "task_characteristics": {
      "repo_size": ">100MB",
      "file_count": ">1000"
    }
  },
  "frequency": {
    "total_occurrences": 15,
    "first_seen": "2025-11-15T10:00:00-0600",
    "last_seen": "2025-11-18T14:30:00-0600",
    "occurrences_per_day": 3.75
  },
  "confidence": 0.92,
  "severity": "high",
  "impact": {
    "affected_workers": 15,
    "total_token_waste": 450000,
    "average_time_to_failure": 1200
  },
  "recommendations": [
    {
      "action": "increase_memory_allocation",
      "target_worker_type": "scan-worker",
      "suggested_memory": "4GB",
      "confidence": 0.95
    },
    {
      "action": "add_memory_limit_check",
      "description": "Check memory before loading large files",
      "confidence": 0.80
    }
  ]
}
```

## Pattern Detection Algorithms

### 1. Frequency-Based Detection

**Purpose**: Identify patterns that occur repeatedly

**Algorithm**:
```python
def detect_frequent_patterns(events, threshold=3, window_hours=24):
    """
    Detect patterns that occur >= threshold times within window
    """
    patterns = {}

    for event in events:
        # Generate signature from event characteristics
        signature = generate_signature(event)

        # Track occurrences
        if signature not in patterns:
            patterns[signature] = []
        patterns[signature].append(event)

    # Filter by frequency threshold
    frequent = {
        sig: events
        for sig, events in patterns.items()
        if len(events) >= threshold
    }

    return frequent
```

**Parameters**:
- Minimum occurrences: 3
- Time window: 24 hours
- Similarity threshold: 0.85 (85% match)

### 2. Temporal Pattern Detection

**Purpose**: Identify time-based patterns (e.g., failures at specific times)

**Patterns to Detect**:
- Time-of-day clustering (e.g., failures at night)
- Day-of-week patterns (e.g., Monday failures)
- Periodic patterns (e.g., every 6 hours)
- Trend patterns (e.g., increasing failure rate)

**Algorithm**:
```python
def detect_temporal_patterns(events):
    """
    Identify time-based clustering of failures
    """
    # Extract timestamps
    timestamps = [event['timestamp'] for event in events]

    # Analyze time-of-day distribution
    hour_distribution = bucket_by_hour(timestamps)

    # Detect clustering (chi-square test)
    if is_clustered(hour_distribution, significance=0.05):
        return {
            'pattern': 'time_of_day_clustering',
            'peak_hours': find_peak_hours(hour_distribution),
            'confidence': calculate_confidence(hour_distribution)
        }

    # Analyze day-of-week distribution
    dow_distribution = bucket_by_day_of_week(timestamps)

    if is_clustered(dow_distribution, significance=0.05):
        return {
            'pattern': 'day_of_week_clustering',
            'peak_days': find_peak_days(dow_distribution),
            'confidence': calculate_confidence(dow_distribution)
        }

    return None
```

### 3. Correlation Analysis

**Purpose**: Identify related failures (one failure leads to another)

**Patterns**:
- **Cascade failures**: Worker A fails → Worker B fails → Worker C fails
- **Resource exhaustion chains**: High CPU → Memory pressure → OOM
- **Shared dependency failures**: Multiple workers fail due to same external issue

**Algorithm**:
```python
def detect_correlated_failures(events, correlation_window_seconds=300):
    """
    Find failures that occur within time window (likely related)
    """
    correlated_groups = []

    # Sort events by timestamp
    sorted_events = sort_by_timestamp(events)

    # Find events within correlation window
    for i, event in enumerate(sorted_events):
        related = []

        for j in range(i+1, len(sorted_events)):
            time_diff = sorted_events[j]['timestamp'] - event['timestamp']

            if time_diff <= correlation_window_seconds:
                related.append(sorted_events[j])
            else:
                break  # Events are sorted, no more related

        if len(related) >= 2:
            correlated_groups.append({
                'trigger': event,
                'related': related,
                'time_window': correlation_window_seconds
            })

    return correlated_groups
```

### 4. Anomaly Detection

**Purpose**: Identify unusual or unexpected failures

**Anomalies**:
- First-time failure types
- Sudden spike in failure rate
- Failures outside normal patterns
- Unexpected worker type failures

**Algorithm**:
```python
def detect_anomalies(current_events, historical_baseline):
    """
    Detect deviations from historical baseline
    """
    anomalies = []

    # Calculate current failure rate
    current_rate = calculate_failure_rate(current_events)
    baseline_rate = historical_baseline['average_rate']
    baseline_stddev = historical_baseline['stddev']

    # Statistical anomaly detection (3-sigma rule)
    if abs(current_rate - baseline_rate) > 3 * baseline_stddev:
        anomalies.append({
            'type': 'failure_rate_spike',
            'current_rate': current_rate,
            'expected_rate': baseline_rate,
            'severity': 'high',
            'confidence': 0.99
        })

    # Detect new failure signatures
    current_signatures = extract_signatures(current_events)
    known_signatures = historical_baseline['known_signatures']

    new_signatures = current_signatures - known_signatures

    if new_signatures:
        anomalies.append({
            'type': 'new_failure_pattern',
            'signatures': list(new_signatures),
            'severity': 'medium',
            'confidence': 1.0
        })

    return anomalies
```

## Pattern Storage

### Pattern Database

**Location**: `coordination/patterns/failure-patterns.jsonl`

**Format**: JSONL (one pattern per line)

**Schema**:
```json
{
  "pattern_id": "string",
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601",
  "category": "transient|resource|systemic|data|environmental",
  "type": "string",
  "signature": "object",
  "frequency": "object",
  "confidence": "number (0-1)",
  "severity": "low|medium|high|critical",
  "impact": "object",
  "recommendations": "array",
  "related_patterns": "array of pattern_ids",
  "examples": "array of event references"
}
```

### Pattern Index

**Location**: `coordination/patterns/pattern-index.json`

**Purpose**: Fast pattern lookup and querying

**Schema**:
```json
{
  "patterns_by_category": {
    "resource_failure": ["pattern_001", "pattern_002"],
    "systemic_failure": ["pattern_003"]
  },
  "patterns_by_worker_type": {
    "scan-worker": ["pattern_001", "pattern_004"],
    "implementation-worker": ["pattern_002", "pattern_003"]
  },
  "patterns_by_severity": {
    "high": ["pattern_001", "pattern_003"],
    "medium": ["pattern_002"],
    "low": ["pattern_004"]
  },
  "total_patterns": 4,
  "last_updated": "2025-11-18T15:00:00-0600"
}
```

## Implementation

### Core Library

**File**: `scripts/lib/failure-pattern-detection.sh`

**Functions**:

1. `ingest_failure_event(event)` - Normalize and store failure event
2. `analyze_patterns(time_window)` - Run pattern detection algorithms
3. `classify_failure(event)` - Categorize a failure event
4. `find_matching_pattern(event)` - Match event to known pattern
5. `update_pattern_frequency(pattern_id)` - Increment occurrence count
6. `calculate_pattern_confidence(pattern)` - Compute confidence score
7. `generate_recommendations(pattern)` - Create actionable recommendations
8. `emit_pattern_event(pattern, event_type)` - Observability integration

### Pattern Detection Daemon

**File**: `scripts/daemons/failure-pattern-daemon.sh`

**Responsibilities**:
- Monitor failure event sources (JSONL logs)
- Run pattern detection every 5 minutes
- Update pattern database
- Emit alerts for new patterns
- Generate daily pattern reports
- Clean up old events (>30 days)

**Process**:
```bash
while true; do
    # 1. Collect new failure events
    new_events=$(collect_events_since_last_run)

    # 2. Run detection algorithms
    frequency_patterns=$(detect_frequent_patterns "$new_events")
    temporal_patterns=$(detect_temporal_patterns "$new_events")
    correlated_patterns=$(detect_correlated_failures "$new_events")
    anomalies=$(detect_anomalies "$new_events")

    # 3. Update pattern database
    for pattern in $frequency_patterns $temporal_patterns $correlated_patterns; do
        update_or_create_pattern "$pattern"
    done

    # 4. Handle anomalies
    for anomaly in $anomalies; do
        emit_anomaly_alert "$anomaly"
    done

    # 5. Generate recommendations
    generate_preventive_recommendations

    # 6. Sleep until next cycle
    sleep 300  # 5 minutes
done
```

## Predictive Analytics

### Early Warning Signals

Detect conditions that often precede failures:

**Signals**:
1. **Resource trends**:
   - Memory usage increasing rapidly
   - CPU usage sustained >80%
   - Token usage >90% of allocation

2. **Health degradation**:
   - Health score declining
   - Heartbeat intervals increasing
   - Error rate increasing

3. **Environmental indicators**:
   - External service response time increasing
   - API rate limits approaching
   - Disk space decreasing

### Failure Prediction

```python
def predict_failure_probability(worker_id):
    """
    Calculate probability of worker failure in next N minutes
    """
    # Get current worker metrics
    current_metrics = get_worker_metrics(worker_id)

    # Find similar historical failures
    similar_failures = find_similar_patterns(current_metrics)

    # Calculate time-to-failure distribution
    ttf_distribution = [
        f['time_to_failure']
        for f in similar_failures
    ]

    # Statistical prediction
    if len(similar_failures) >= 5:
        mean_ttf = mean(ttf_distribution)
        current_runtime = get_worker_runtime(worker_id)

        if current_runtime > mean_ttf * 0.8:
            return {
                'probability': 0.7,
                'estimated_time_to_failure': mean_ttf - current_runtime,
                'confidence': len(similar_failures) / 10,
                'recommended_action': 'preemptive_restart'
            }

    return {'probability': 0.1}
```

## Configuration

**File**: `coordination/config/failure-pattern-detection-policy.json`

```json
{
  "enabled": true,
  "detection": {
    "frequency_threshold": 3,
    "time_window_hours": 24,
    "similarity_threshold": 0.85,
    "confidence_threshold": 0.70
  },
  "temporal_analysis": {
    "enabled": true,
    "clustering_significance": 0.05,
    "time_zones": ["America/Chicago"]
  },
  "correlation_analysis": {
    "enabled": true,
    "correlation_window_seconds": 300,
    "minimum_related_events": 2
  },
  "anomaly_detection": {
    "enabled": true,
    "sigma_threshold": 3,
    "baseline_window_days": 7
  },
  "prediction": {
    "enabled": true,
    "prediction_horizon_minutes": 30,
    "minimum_similar_samples": 5
  },
  "storage": {
    "pattern_retention_days": 90,
    "event_retention_days": 30,
    "max_patterns": 1000
  },
  "observability": {
    "emit_events": true,
    "events_log": "coordination/events/failure-pattern-events.jsonl",
    "daily_reports": true,
    "report_directory": "coordination/reports/failure-patterns"
  }
}
```

## Observability

### Events Emitted

**Location**: `coordination/events/failure-pattern-events.jsonl`

**Event Types**:
1. `pattern_detected` - New pattern identified
2. `pattern_updated` - Existing pattern frequency updated
3. `anomaly_detected` - Unusual failure detected
4. `prediction_generated` - Failure predicted
5. `recommendation_created` - Preventive action recommended
6. `pattern_severity_escalated` - Pattern severity increased

### Metrics

**Location**: `coordination/metrics/failure-pattern-metrics.json`

```json
{
  "timestamp": "2025-11-18T16:00:00-0600",
  "total_patterns": 47,
  "patterns_by_category": {
    "transient": 12,
    "resource": 18,
    "systemic": 10,
    "data": 5,
    "environmental": 2
  },
  "patterns_by_severity": {
    "critical": 3,
    "high": 12,
    "medium": 20,
    "low": 12
  },
  "active_patterns_last_24h": 8,
  "anomalies_detected_last_24h": 2,
  "predictions_generated_last_24h": 15,
  "prediction_accuracy": 0.73,
  "average_confidence": 0.82
}
```

### Daily Reports

**Location**: `coordination/reports/failure-patterns/YYYY-MM-DD-failure-pattern-report.md`

**Contents**:
- New patterns detected
- Pattern frequency trends
- High-severity patterns requiring attention
- Anomalies detected
- Prediction accuracy metrics
- Recommended preventive actions

## Integration with Other Systems

### Integration with Worker Restart

When a pattern is detected with high confidence:
- Adjust restart policy (increase max retries for transient failures)
- Modify backoff strategy (longer delays for systemic issues)
- Skip restart for known non-retryable failures

### Integration with Zombie Cleanup

Use patterns to improve cleanup decisions:
- Identify zombies that should not be cleaned up (waiting for external service)
- Prioritize cleanup of zombies matching severe patterns

### Integration with Resource Allocation

Use patterns to optimize resource allocation:
- Increase memory for workers matching OOM patterns
- Reduce token budget for workers that consistently over-allocate
- Adjust timeouts based on historical completion times

## Success Criteria

**Phase 4.4 Complete When**:
1. ✅ Pattern detection library implemented
2. ✅ Failure categorization working
3. ✅ Pattern database operational
4. ✅ Detection daemon running
5. ✅ All unit tests passing (target: 20 tests)
6. ✅ E2E integration test passing
7. ✅ Documentation complete
8. ✅ Pattern metrics being collected

**Target Metrics**:
- Pattern detection accuracy: >80%
- Prediction accuracy: >70%
- False positive rate: <10%
- Pattern identification time: <5 minutes

## Future Enhancements (Phase 4.5+)

1. **Machine Learning Integration**:
   - Train ML models on pattern data
   - Improve prediction accuracy
   - Automated feature engineering

2. **Auto-Remediation**:
   - Automatic fixes for known patterns
   - Self-adjusting resource allocations
   - Intelligent retry strategies

3. **Cross-System Pattern Detection**:
   - Patterns across multiple commit-relay instances
   - Industry-wide failure pattern sharing
   - Collective learning

4. **Root Cause Analysis**:
   - Automated diagnosis of failure causes
   - Dependency graph analysis
   - Causal inference
