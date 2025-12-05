# Cortex Unified Data Lakehouse Schema Design

**Version:** 1.0
**Date:** 2025-12-03
**Status:** Foundation Phase
**Author:** Cortex Data Intelligence Initiative

## Overview

This document defines the unified data lakehouse schema for Cortex, replacing the current JSON/JSONL file-based architecture with a scalable, governed, and intelligent data platform built on Delta Lake principles.

## Architecture Principles

1. **Unified Data Layer**: Single source of truth for all Cortex data
2. **Time-Travel Enabled**: Full version history and audit trail
3. **Schema Evolution**: Support for backward-compatible schema changes
4. **ACID Transactions**: Guarantee data consistency across operations
5. **Streaming & Batch**: Support both real-time and batch processing
6. **Governance-First**: Built-in lineage, access control, and compliance

## Technology Stack

- **Storage Format**: Delta Lake (Parquet + transaction log)
- **Compute Engine**: Apache Spark with Photon optimization
- **Governance**: Unity Catalog for unified metadata and access control
- **Experiment Tracking**: MLflow for model and routing experiments
- **Vector Storage**: ChromaDB integrated with Delta Lake
- **Streaming**: Delta Live Tables for real-time event processing

---

## Core Schema Tables

### 1. Tasks Table (`cortex.core.tasks`)

Replaces: `coordination/tasks/*.json`

**Purpose**: Central registry for all tasks routed through Cortex

```sql
CREATE TABLE cortex.core.tasks (
  -- Primary Key
  task_id STRING NOT NULL,

  -- Task Definition
  task_type STRING NOT NULL,  -- 'security', 'development', 'inventory', 'cicd'
  task_description STRING NOT NULL,
  task_category STRING,  -- 'bug-fix', 'feature', 'scan', 'documentation'
  priority STRING NOT NULL,  -- 'low', 'medium', 'high', 'critical'
  complexity STRING,  -- 'low', 'medium', 'high'

  -- Routing Information
  routing_strategy STRING NOT NULL,  -- 'mixture_of_experts', 'direct'
  assigned_master STRING,  -- 'development-master', 'security-master', etc.
  routing_confidence DOUBLE,
  routing_method STRING,  -- 'nlp-keyword', 'semantic-search', 'pattern-match'

  -- Execution Context
  parent_task_id STRING,  -- For hierarchical tasks
  requesting_agent STRING,
  deadline TIMESTAMP,

  -- Status Tracking
  status STRING NOT NULL,  -- 'pending', 'assigned', 'in_progress', 'completed', 'failed', 'cancelled'
  created_at TIMESTAMP NOT NULL,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  duration_seconds LONG,

  -- Resources & Budget
  token_budget INT,
  tokens_used INT,
  model_recommended STRING,
  cost_estimate DECIMAL(10,4),
  cost_actual DECIMAL(10,4),

  -- Results & Artifacts
  outcome STRING,  -- 'success', 'partial', 'failed'
  summary STRING,
  artifacts ARRAY<STRING>,  -- List of artifact paths
  error_message STRING,

  -- Metadata
  metadata MAP<STRING, STRING>,
  tags ARRAY<STRING>,

  -- Governance
  governance_review_required BOOLEAN DEFAULT true,
  compliance_status STRING,
  lineage_id STRING,  -- Reference to lineage tracking

  -- Audit
  created_by STRING NOT NULL,
  updated_at TIMESTAMP,
  updated_by STRING,
  version INT DEFAULT 1
)
USING delta
PARTITIONED BY (DATE(created_at), task_type)
TBLPROPERTIES (
  'delta.enableChangeDataFeed' = 'true',
  'delta.columnMapping.mode' = 'name',
  'delta.minReaderVersion' = '2',
  'delta.minWriterVersion' = '5'
);
```

**Migration Path**:
- Parse all `coordination/tasks/*.json` files
- Extract task metadata from JSON structure
- Populate created_at from file timestamp or JSON field
- Generate lineage_id for tracking

---

### 2. Workers Table (`cortex.core.workers`)

Replaces: `coordination/worker-specs/active/*.json`, `coordination/worker-specs/completed/*.json`

**Purpose**: Registry of all worker agents spawned by Cortex

```sql
CREATE TABLE cortex.core.workers (
  -- Primary Key
  worker_id STRING NOT NULL,

  -- Worker Definition
  worker_type STRING NOT NULL,  -- 'implementation-worker', 'scan-worker', 'analysis-worker', etc.
  created_by STRING NOT NULL,  -- Master that created this worker
  execution_manager STRING,

  -- Associated Task
  task_id STRING NOT NULL,  -- Foreign key to tasks table
  parent_task STRING,

  -- Identity & Security
  spiffe_id STRING NOT NULL,
  identity_token STRING,  -- JWT token
  trust_level INT DEFAULT 50,
  capabilities ARRAY<STRING>,

  -- Planning Strategy
  goal_based_planning_enabled BOOLEAN DEFAULT true,
  planning_strategy STRING,  -- 'direct', 'iterative', 'decompose'
  goal_type STRING,  -- 'feature-development', 'security-scan', 'deep-analysis'
  complexity STRING,
  strategy_plan_location STRING,

  -- Resource Allocation
  token_budget INT NOT NULL,
  timeout_minutes INT NOT NULL,
  max_retries INT DEFAULT 1,

  -- Tool Assignment
  essential_tools ARRAY<STRING>,
  optional_tools ARRAY<STRING>,
  total_tools INT,
  tool_assignment_rationale STRING,

  -- Execution Tracking
  status STRING NOT NULL,  -- 'pending', 'running', 'completed', 'failed', 'timeout', 'cancelled'
  created_at TIMESTAMP NOT NULL,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  tokens_used INT DEFAULT 0,
  duration_minutes DOUBLE,
  session_id STRING,

  -- Results
  result_status STRING,  -- 'success', 'partial', 'failed'
  output_location STRING,
  summary STRING,
  artifacts ARRAY<STRING>,
  deliverables ARRAY<STRUCT<type: STRING, location: STRING, status: STRING>>,

  -- Quality Review
  review_enabled BOOLEAN DEFAULT true,
  min_cycles INT DEFAULT 1,
  auto_approve_threshold DOUBLE DEFAULT 0.95,
  review_history ARRAY<STRUCT<cycle: INT, score: DOUBLE, feedback: STRING, timestamp: TIMESTAMP>>,

  -- Metadata
  context MAP<STRING, STRING>,
  scope MAP<STRING, STRING>,
  metadata MAP<STRING, STRING>,

  -- Audit
  updated_at TIMESTAMP,
  version INT DEFAULT 1
)
USING delta
PARTITIONED BY (DATE(created_at), worker_type)
TBLPROPERTIES (
  'delta.enableChangeDataFeed' = 'true',
  'delta.columnMapping.mode' = 'name'
);
```

---

### 3. Routing Decisions Table (`cortex.moe.routing_decisions`)

Replaces: `coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl`

**Purpose**: Historical record of all MoE routing decisions for learning and optimization

```sql
CREATE TABLE cortex.moe.routing_decisions (
  -- Primary Key
  decision_id STRING NOT NULL,
  task_id STRING NOT NULL,

  -- Routing Analysis
  timestamp TIMESTAMP NOT NULL,
  routing_strategy STRING NOT NULL,  -- 'mixture_of_experts', 'direct', 'multi_expert'
  routing_method STRING NOT NULL,  -- 'nlp-keyword', 'semantic-search', 'ml-classifier'

  -- Expert Selection
  primary_expert STRING NOT NULL,
  primary_confidence DOUBLE NOT NULL,
  secondary_experts ARRAY<STRUCT<expert: STRING, confidence: DOUBLE>>,
  strategy STRING,  -- 'single_expert', 'parallel', 'sequential'

  -- Keyword/Pattern Matching
  matched_keywords ARRAY<STRING>,
  keyword_scores MAP<STRING, DOUBLE>,
  pattern_signature STRING,

  -- Model Selection
  recommended_model STRING,
  model_provider STRING,
  model_tier STRING,  -- 'fast', 'balanced', 'quality'
  model_reasoning STRING,

  -- Task Analysis
  task_complexity STRING,
  estimated_duration_minutes INT,
  estimated_tokens INT,
  required_capabilities ARRAY<STRING>,

  -- Learning Feedback
  actual_expert STRING,  -- Master that actually executed (may differ from recommendation)
  actual_outcome STRING,  -- 'success', 'partial', 'failed'
  actual_duration_minutes DOUBLE,
  actual_tokens INT,
  routing_accuracy_score DOUBLE,  -- Post-execution validation

  -- Embeddings for Semantic Search (Phase 2)
  task_embedding ARRAY<DOUBLE>,  -- 1536-dim vector from sentence-transformers
  embedding_model STRING DEFAULT 'all-MiniLM-L6-v2',

  -- Metadata
  metadata MAP<STRING, STRING>,

  -- Audit
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP
)
USING delta
PARTITIONED BY (DATE(timestamp), primary_expert)
TBLPROPERTIES (
  'delta.enableChangeDataFeed' = 'true'
);
```

---

### 4. Governance Logs Table (`cortex.governance.access_logs`)

Replaces: `coordination/governance/access-log.jsonl`

**Purpose**: Comprehensive audit trail for all governance decisions and access control

```sql
CREATE TABLE cortex.governance.access_logs (
  -- Primary Key
  log_id STRING NOT NULL,

  -- Access Request
  timestamp TIMESTAMP NOT NULL,
  agent_id STRING NOT NULL,
  agent_type STRING NOT NULL,  -- 'master', 'worker', 'coordinator'
  spiffe_id STRING NOT NULL,

  -- Resource Access
  resource_type STRING NOT NULL,  -- 'task', 'knowledge_base', 'coordination', 'execution'
  resource_id STRING,
  action STRING NOT NULL,  -- 'read', 'write', 'execute', 'spawn', 'terminate'

  -- Authorization
  requested_capabilities ARRAY<STRING>,
  granted_capabilities ARRAY<STRING>,
  denied_capabilities ARRAY<STRING>,
  authorization_decision STRING NOT NULL,  -- 'granted', 'denied', 'partial'
  trust_level_required INT,
  trust_level_actual INT,

  -- Context
  task_id STRING,
  parent_task_id STRING,
  execution_context MAP<STRING, STRING>,

  -- Policy Evaluation
  policies_evaluated ARRAY<STRING>,
  policy_results ARRAY<STRUCT<policy: STRING, result: STRING, reason: STRING>>,
  override_applied BOOLEAN DEFAULT false,
  override_reason STRING,

  -- Compliance
  compliance_frameworks ARRAY<STRING>,  -- 'SOC2', 'GDPR', 'HIPAA', etc.
  sensitive_data_accessed BOOLEAN DEFAULT false,
  pii_accessed BOOLEAN DEFAULT false,

  -- Audit
  created_at TIMESTAMP NOT NULL,
  session_id STRING
)
USING delta
PARTITIONED BY (DATE(timestamp), agent_type)
TBLPROPERTIES (
  'delta.enableChangeDataFeed' = 'true',
  'delta.dataSkippingNumIndexedCols' = '10'
);
```

---

### 5. Strategy Plans Table (`cortex.planning.strategy_plans`)

Replaces: `coordination/knowledge-base/strategy-plans/*.json`

**Purpose**: Store all goal-based planning strategies for workers

```sql
CREATE TABLE cortex.planning.strategy_plans (
  -- Primary Key
  plan_id STRING NOT NULL,
  worker_id STRING NOT NULL,

  -- Plan Definition
  plan_type STRING NOT NULL,  -- 'direct', 'iterative', 'decompose'
  goal_type STRING NOT NULL,
  complexity STRING NOT NULL,

  -- Strategy Details
  strategy_description STRING,
  approach STRING,
  phases ARRAY<STRUCT<
    phase_number: INT,
    phase_name: STRING,
    description: STRING,
    estimated_tokens: INT,
    steps: ARRAY<STRING>
  >>,

  -- Execution Plan
  total_estimated_tokens INT,
  success_criteria ARRAY<STRING>,
  risk_factors ARRAY<STRING>,
  mitigation_strategies ARRAY<STRING>,

  -- Progress Tracking
  current_phase INT,
  completed_phases ARRAY<INT>,
  phase_results ARRAY<STRUCT<phase: INT, status: STRING, actual_tokens: INT, notes: STRING>>,

  -- Metadata
  created_at TIMESTAMP NOT NULL,
  created_by STRING NOT NULL,
  updated_at TIMESTAMP,
  version INT DEFAULT 1
)
USING delta
PARTITIONED BY (DATE(created_at))
TBLPROPERTIES (
  'delta.enableChangeDataFeed' = 'true'
);
```

---

### 6. Events Table (`cortex.events.event_stream`)

Replaces: `dashboard-events.jsonl`

**Purpose**: Real-time event stream for all system activities (optimized for Delta Live Tables)

```sql
CREATE TABLE cortex.events.event_stream (
  -- Primary Key
  event_id STRING NOT NULL,

  -- Event Metadata
  timestamp TIMESTAMP NOT NULL,
  event_type STRING NOT NULL,  -- 'task_created', 'worker_spawned', 'routing_decision', etc.
  event_category STRING NOT NULL,  -- 'task', 'worker', 'routing', 'governance', 'system'
  severity STRING DEFAULT 'info',  -- 'debug', 'info', 'warning', 'error', 'critical'

  -- Event Source
  source_agent STRING NOT NULL,
  source_type STRING NOT NULL,  -- 'master', 'worker', 'coordinator', 'system'

  -- Event Context
  task_id STRING,
  worker_id STRING,
  session_id STRING,
  correlation_id STRING,  -- For tracing related events

  -- Event Data
  event_data MAP<STRING, STRING>,
  message STRING,

  -- Performance Metrics
  duration_ms LONG,
  tokens_used INT,
  cost DECIMAL(10,4),

  -- Metadata
  tags ARRAY<STRING>,
  metadata MAP<STRING, STRING>,

  -- Ingestion
  ingested_at TIMESTAMP NOT NULL
)
USING delta
PARTITIONED BY (DATE(timestamp), event_category)
TBLPROPERTIES (
  'delta.enableChangeDataFeed' = 'true',
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
```

---

### 7. Model Selection Metrics Table (`cortex.metrics.model_selection`)

Replaces: `coordination/metrics/model-selection.jsonl`

**Purpose**: Track model selection decisions and performance for optimization

```sql
CREATE TABLE cortex.metrics.model_selection (
  -- Primary Key
  selection_id STRING NOT NULL,

  -- Selection Context
  timestamp TIMESTAMP NOT NULL,
  task_id STRING NOT NULL,
  worker_id STRING,
  master STRING NOT NULL,

  -- Model Decision
  selected_model STRING NOT NULL,
  model_provider STRING NOT NULL,  -- 'anthropic', 'openai', 'local'
  model_tier STRING NOT NULL,  -- 'fast', 'balanced', 'quality'
  selection_reason STRING,

  -- Task Context
  task_type STRING NOT NULL,
  task_complexity STRING,
  estimated_tokens INT,
  token_budget INT,

  -- Performance Metrics
  actual_tokens_used INT,
  actual_duration_seconds DOUBLE,
  quality_score DOUBLE,  -- 0.0 to 1.0
  cost_usd DECIMAL(10,4),
  cost_efficiency_score DOUBLE,  -- quality / cost ratio

  -- Outcome
  task_outcome STRING,  -- 'success', 'partial', 'failed'
  retry_count INT DEFAULT 0,

  -- Learning Signals
  optimal_model STRING,  -- What model SHOULD have been used in retrospect
  selection_accuracy DOUBLE,  -- How good was the selection

  -- Metadata
  metadata MAP<STRING, STRING>,
  created_at TIMESTAMP NOT NULL
)
USING delta
PARTITIONED BY (DATE(timestamp), selected_model)
TBLPROPERTIES (
  'delta.enableChangeDataFeed' = 'true'
);
```

---

### 8. Knowledge Base Documents Table (`cortex.knowledge.documents`)

**Purpose**: Store all master-specific knowledge base documents for RAG (Phase 2)

```sql
CREATE TABLE cortex.knowledge.documents (
  -- Primary Key
  document_id STRING NOT NULL,

  -- Document Metadata
  master STRING NOT NULL,  -- 'development-master', 'security-master', etc.
  document_type STRING NOT NULL,  -- 'pattern', 'best-practice', 'failure-analysis', 'routing-rule'
  title STRING NOT NULL,
  content STRING NOT NULL,

  -- Versioning
  version INT DEFAULT 1,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP,

  -- Chunking for RAG
  chunks ARRAY<STRUCT<
    chunk_id: STRING,
    chunk_text: STRING,
    chunk_index: INT,
    chunk_embedding: ARRAY<DOUBLE>
  >>,

  -- Vector Embeddings (Phase 2)
  document_embedding ARRAY<DOUBLE>,  -- Full document embedding
  embedding_model STRING DEFAULT 'all-MiniLM-L6-v2',

  -- Usage Statistics
  access_count LONG DEFAULT 0,
  last_accessed TIMESTAMP,
  relevance_score DOUBLE,  -- Calculated from usage patterns

  -- Metadata
  tags ARRAY<STRING>,
  source STRING,
  author STRING,
  metadata MAP<STRING, STRING>
)
USING delta
PARTITIONED BY (master, document_type)
TBLPROPERTIES (
  'delta.enableChangeDataFeed' = 'true'
);
```

---

### 9. Active Identities Table (`cortex.identity.active_identities`)

Replaces: `coordination/governance/identities/active-identities.json`

**Purpose**: Track all active SPIFFE identities and their authorization state

```sql
CREATE TABLE cortex.identity.active_identities (
  -- Primary Key
  spiffe_id STRING NOT NULL,

  -- Identity Information
  agent_id STRING NOT NULL,
  agent_type STRING NOT NULL,  -- 'master', 'worker', 'coordinator'
  role STRING NOT NULL,

  -- Security
  token STRING NOT NULL,  -- JWT token
  token_issued_at TIMESTAMP NOT NULL,
  token_expires_at TIMESTAMP NOT NULL,
  trust_level INT NOT NULL,

  -- Capabilities
  capabilities ARRAY<STRING>,
  granted_permissions ARRAY<STRING>,

  -- Status
  status STRING NOT NULL,  -- 'active', 'suspended', 'revoked', 'expired'
  created_at TIMESTAMP NOT NULL,
  last_activity TIMESTAMP,
  revoked_at TIMESTAMP,
  revocation_reason STRING,

  -- Audit
  created_by STRING,
  metadata MAP<STRING, STRING>
)
USING delta
TBLPROPERTIES (
  'delta.enableChangeDataFeed' = 'true'
);
```

---

### 10. Embeddings Cache Table (`cortex.ml.embeddings_cache`)

Replaces: `coordination/embeddings/cache/*.json`

**Purpose**: Cache embeddings for semantic search and RAG (Phase 2)

```sql
CREATE TABLE cortex.ml.embeddings_cache (
  -- Primary Key
  cache_key STRING NOT NULL,  -- Hash of input text

  -- Input
  input_text STRING NOT NULL,
  input_type STRING NOT NULL,  -- 'task_description', 'document_chunk', 'query'

  -- Embedding
  embedding ARRAY<DOUBLE> NOT NULL,
  embedding_model STRING NOT NULL,
  embedding_dimension INT NOT NULL,

  -- Usage
  created_at TIMESTAMP NOT NULL,
  last_accessed TIMESTAMP NOT NULL,
  access_count LONG DEFAULT 1,

  -- Metadata
  metadata MAP<STRING, STRING>
)
USING delta
TBLPROPERTIES (
  'delta.enableChangeDataFeed' = 'true',
  'delta.autoOptimize.optimizeWrite' = 'true'
);
```

---

## MLflow Integration Schema

### 11. Experiments Table (`cortex.mlflow.experiments`)

**Purpose**: Track MoE routing experiments and model optimization

```sql
CREATE TABLE cortex.mlflow.experiments (
  -- Primary Key
  experiment_id STRING NOT NULL,

  -- Experiment Definition
  experiment_name STRING NOT NULL,
  experiment_type STRING NOT NULL,  -- 'routing_optimization', 'model_selection', 'cost_optimization'
  description STRING,

  -- Status
  status STRING NOT NULL,  -- 'active', 'completed', 'archived'
  created_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,

  -- Metrics
  runs_count INT DEFAULT 0,
  best_run_id STRING,
  best_metric_value DOUBLE,

  -- Metadata
  tags MAP<STRING, STRING>,
  metadata MAP<STRING, STRING>
)
USING delta;
```

### 12. Runs Table (`cortex.mlflow.runs`)

**Purpose**: Individual experiment runs for A/B testing routing strategies

```sql
CREATE TABLE cortex.mlflow.runs (
  -- Primary Key
  run_id STRING NOT NULL,
  experiment_id STRING NOT NULL,

  -- Run Definition
  run_name STRING,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  status STRING NOT NULL,  -- 'running', 'completed', 'failed'

  -- Parameters
  parameters MAP<STRING, STRING>,

  -- Metrics
  metrics MAP<STRING, DOUBLE>,

  -- Artifacts
  artifact_uri STRING,

  -- Source
  source_type STRING,
  source_name STRING,

  -- Metadata
  tags MAP<STRING, STRING>,
  metadata MAP<STRING, STRING>
)
USING delta
PARTITIONED BY (experiment_id);
```

---

## Lineage Tracking Schema

### 13. Lineage Graph Table (`cortex.lineage.graph`)

**Purpose**: End-to-end lineage tracking for tasks, workers, and artifacts

```sql
CREATE TABLE cortex.lineage.graph (
  -- Primary Key
  lineage_id STRING NOT NULL,

  -- Lineage Entry
  timestamp TIMESTAMP NOT NULL,
  entity_type STRING NOT NULL,  -- 'task', 'worker', 'artifact', 'data'
  entity_id STRING NOT NULL,

  -- Relationships
  parent_entity_id STRING,
  parent_entity_type STRING,
  relationship_type STRING,  -- 'spawned_by', 'derived_from', 'produced_by', 'consumed_by'

  -- Context
  operation STRING,  -- 'create', 'transform', 'consume', 'produce'

  -- Metadata
  attributes MAP<STRING, STRING>,

  -- Audit
  recorded_at TIMESTAMP NOT NULL,
  recorded_by STRING
)
USING delta
PARTITIONED BY (DATE(timestamp), entity_type)
TBLPROPERTIES (
  'delta.enableChangeDataFeed' = 'true'
);
```

---

## Migration Strategy

### Phase 1: Schema Creation and Validation
1. Create all Delta Lake tables with proper partitioning
2. Configure Unity Catalog governance policies
3. Set up MLflow tracking server
4. Validate schema design with sample data

### Phase 2: Historical Data Migration
1. Parse all existing JSON/JSONL files
2. Transform to Delta Lake format with proper typing
3. Backfill lineage relationships
4. Verify data integrity

### Phase 3: Dual-Write Period
1. Maintain both file-based and lakehouse writes
2. Validate consistency between systems
3. Monitor performance and query patterns
4. Adjust partitioning as needed

### Phase 4: Cutover
1. Switch all reads to lakehouse
2. Deprecate file-based writes
3. Archive old JSON/JSONL files
4. Monitor system health

---

## Access Patterns and Optimization

### Primary Query Patterns

1. **Task Status Lookup**: Query by task_id
   - Index: task_id
   - Partition pruning by created_at date

2. **Worker Performance Analytics**: Aggregate by worker_type
   - Partition by worker_type and date
   - Pre-aggregated metrics table

3. **Routing Decision Analysis**: Time-series analysis
   - Partition by timestamp and expert
   - Change data feed for incremental processing

4. **Governance Audit Trail**: Security compliance queries
   - Partition by date and agent_type
   - Data skipping on indexed columns

### Optimization Strategies

1. **Z-Ordering**: Apply on high-cardinality columns
   ```sql
   OPTIMIZE cortex.core.tasks ZORDER BY (task_id, status);
   OPTIMIZE cortex.moe.routing_decisions ZORDER BY (task_id, primary_expert);
   ```

2. **Auto-Compaction**: Enable for high-write tables
   ```sql
   ALTER TABLE cortex.events.event_stream
   SET TBLPROPERTIES ('delta.autoOptimize.autoCompact' = 'true');
   ```

3. **Change Data Feed**: Enable for downstream processing
   ```sql
   ALTER TABLE cortex.core.tasks
   SET TBLPROPERTIES ('delta.enableChangeDataFeed' = 'true');
   ```

---

## Unity Catalog Governance

### Catalog Structure
```
cortex/
├── core/          # Core operational tables
├── moe/           # Mixture of Experts routing
├── governance/    # Access control and compliance
├── planning/      # Strategy and planning
├── events/        # Event streaming
├── metrics/       # Performance metrics
├── knowledge/     # Knowledge base for RAG
├── identity/      # Identity and authorization
├── ml/            # Machine learning artifacts
├── mlflow/        # Experiment tracking
└── lineage/       # Lineage tracking
```

### Access Policies

1. **Master Agents**: Full read/write access to their domain
2. **Worker Agents**: Read-only to knowledge base, write to results
3. **Coordinator**: Read-all, orchestration write access
4. **External Systems**: Row-level security based on sensitivity

---

## Next Steps

1. **Phase 1.2**: Implement data migration scripts
2. **Phase 1.3**: Configure MLflow experiment tracking
3. **Phase 1.4**: Build lineage tracking system
4. **Phase 2.x**: Add vector embeddings and semantic search
5. **Phase 3.x**: Implement Delta Live Tables pipelines
6. **Phase 4.x**: Build collaborative features

---

## References

- [Delta Lake Documentation](https://docs.delta.io/)
- [Unity Catalog Architecture](https://docs.databricks.com/unity-catalog/)
- [MLflow Tracking](https://mlflow.org/docs/latest/tracking.html)
- [Databricks Data Intelligence Platform Guide](../the-data-intelligence-platform-for-dummies-databricks-special-edition.pdf)
