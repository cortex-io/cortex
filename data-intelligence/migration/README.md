# Cortex Data Lakehouse Migration

This directory contains the migration framework for transforming Cortex's file-based data architecture into a unified data lakehouse built on Delta Lake.

## Overview

The migration system handles transformation of all existing JSON/JSONL data into structured Delta Lake tables with proper schema, partitioning, and governance.

## Architecture

```
migration/
├── migrate.py              # Main orchestrator script
├── transformers/           # Data transformation modules
│   ├── task_transformer.py
│   ├── worker_transformer.py
│   ├── routing_transformer.py
│   ├── governance_transformer.py
│   ├── strategy_transformer.py
│   ├── event_transformer.py
│   ├── model_selection_transformer.py
│   ├── identity_transformer.py
│   └── embedding_transformer.py
├── validators/             # Data validation modules
└── utils/                  # Utility functions
```

## Usage

### Dry Run (Recommended First)

```bash
python3 data-intelligence/migration/migrate.py --dry-run
```

### Full Migration

```bash
python3 data-intelligence/migration/migrate.py \
  --cortex-root /path/to/cortex \
  --lakehouse-path /path/to/lakehouse
```

### Incremental Migration

```bash
python3 data-intelligence/migration/migrate.py \
  --mode incremental
```

### Strict Mode (Fail on Any Error)

```bash
python3 data-intelligence/migration/migrate.py \
  --mode strict
```

## Data Mapping

| Source File(s) | Destination Table | Transformer |
|----------------|-------------------|-------------|
| `coordination/tasks/*.json` | `cortex.core.tasks` | TaskTransformer |
| `coordination/worker-specs/**/*.json` | `cortex.core.workers` | WorkerTransformer |
| `coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl` | `cortex.moe.routing_decisions` | RoutingTransformer |
| `coordination/governance/access-log.jsonl` | `cortex.governance.access_logs` | GovernanceTransformer |
| `coordination/knowledge-base/strategy-plans/*.json` | `cortex.planning.strategy_plans` | StrategyTransformer |
| `dashboard-events.jsonl` | `cortex.events.event_stream` | EventTransformer |
| `coordination/metrics/model-selection.jsonl` | `cortex.metrics.model_selection` | ModelSelectionTransformer |
| `coordination/governance/identities/active-identities.json` | `cortex.identity.active_identities` | IdentityTransformer |
| `coordination/embeddings/cache/*.json` | `cortex.ml.embeddings_cache` | EmbeddingTransformer |

## Migration Phases

### Phase 1: Schema Creation
- Create Delta Lake tables with proper schema
- Configure partitioning and optimization
- Set up Unity Catalog governance

### Phase 2: Historical Data Migration
- Parse existing JSON/JSONL files
- Transform to lakehouse schema
- Validate data integrity
- Backfill relationships

### Phase 3: Dual-Write Period
- Write to both file-based and lakehouse
- Validate consistency
- Monitor performance

### Phase 4: Cutover
- Switch reads to lakehouse
- Deprecate file-based writes
- Archive old files

## Output

Migration creates:
1. Delta Lake tables in the lakehouse directory
2. Migration report with statistics
3. Validation results
4. Error logs for any failures

## Migration Report Example

```json
{
  "started_at": "2025-12-03T12:00:00",
  "completed_at": "2025-12-03T12:05:00",
  "tables_migrated": [
    {
      "table": "tasks",
      "records": 150,
      "timestamp": "2025-12-03T12:01:00"
    }
  ],
  "tables_failed": [],
  "records_processed": 1500,
  "errors": []
}
```

## Troubleshooting

### Common Issues

1. **Missing files**: Some files may not exist yet - this is normal
2. **JSON parsing errors**: Invalid JSON files will be logged but won't stop migration
3. **Schema mismatches**: Transformers handle most variations gracefully

### Validation

After migration, run validators:

```bash
python3 data-intelligence/migration/validators/validate_migration.py
```

## Next Steps

After migration completes:
1. Review migration report
2. Validate data integrity
3. Configure Delta Live Tables (Phase 3.1)
4. Set up MLflow tracking (Phase 1.3)
5. Implement lineage tracking (Phase 1.4)

## References

- [Lakehouse Schema Design](../schemas/cortex-lakehouse-schema.md)
- [Delta Lake Documentation](https://docs.delta.io/)
- [Databricks Data Intelligence Platform Guide](../../the-data-intelligence-platform-for-dummies-databricks-special-edition.pdf)
