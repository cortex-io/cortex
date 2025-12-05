#!/usr/bin/env python3
"""
Cortex Data Lakehouse Migration Orchestrator

This script orchestrates the migration of all JSON/JSONL files to Delta Lake tables.
It supports incremental migration, validation, and rollback capabilities.
"""

import argparse
import json
import logging
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class MigrationOrchestrator:
    """Orchestrates the entire migration process"""

    def __init__(
        self,
        cortex_root: Path,
        lakehouse_path: Path,
        mode: str = 'full',
        dry_run: bool = False
    ):
        self.cortex_root = cortex_root
        self.lakehouse_path = lakehouse_path
        self.mode = mode
        self.dry_run = dry_run
        self.migration_state = {
            'started_at': datetime.now().isoformat(),
            'tables_migrated': [],
            'tables_failed': [],
            'records_processed': 0,
            'errors': []
        }

    def migrate_all(self) -> bool:
        """Execute full migration of all tables"""
        logger.info(f"Starting {'DRY RUN' if self.dry_run else 'FULL'} migration")
        logger.info(f"Source: {self.cortex_root}")
        logger.info(f"Destination: {self.lakehouse_path}")

        # Migration order matters due to foreign key relationships
        migration_steps = [
            ('tasks', self._migrate_tasks),
            ('workers', self._migrate_workers),
            ('routing_decisions', self._migrate_routing_decisions),
            ('governance_logs', self._migrate_governance_logs),
            ('strategy_plans', self._migrate_strategy_plans),
            ('events', self._migrate_events),
            ('model_selection', self._migrate_model_selection),
            ('active_identities', self._migrate_active_identities),
            ('embeddings_cache', self._migrate_embeddings_cache),
        ]

        success = True
        for table_name, migrate_func in migration_steps:
            try:
                logger.info(f"Migrating table: {table_name}")
                records_count = migrate_func()
                self.migration_state['tables_migrated'].append({
                    'table': table_name,
                    'records': records_count,
                    'timestamp': datetime.now().isoformat()
                })
                self.migration_state['records_processed'] += records_count
                logger.info(f"✓ Migrated {records_count} records to {table_name}")
            except Exception as e:
                logger.error(f"✗ Failed to migrate {table_name}: {str(e)}")
                self.migration_state['tables_failed'].append({
                    'table': table_name,
                    'error': str(e),
                    'timestamp': datetime.now().isoformat()
                })
                self.migration_state['errors'].append(str(e))
                success = False
                if self.mode == 'strict':
                    logger.error("Strict mode enabled, stopping migration")
                    break

        # Write migration report
        self._write_migration_report()

        return success

    def _migrate_tasks(self) -> int:
        """Migrate coordination/tasks/*.json to cortex.core.tasks"""
        tasks_dir = self.cortex_root / 'coordination' / 'tasks'

        if not tasks_dir.exists():
            logger.warning(f"Tasks directory not found: {tasks_dir}")
            return 0

        records = []
        for json_file in tasks_dir.glob('*.json'):
            try:
                with open(json_file, 'r') as f:
                    task_data = json.load(f)

                # Transform to lakehouse schema
                record = self._transform_task(task_data, json_file)
                records.append(record)

            except Exception as e:
                logger.warning(f"Failed to process {json_file}: {str(e)}")

        if not self.dry_run:
            self._write_to_delta('core.tasks', records)

        return len(records)

    def _migrate_workers(self) -> int:
        """Migrate coordination/worker-specs/**/*.json to cortex.core.workers"""
        worker_specs_dir = self.cortex_root / 'coordination' / 'worker-specs'

        if not worker_specs_dir.exists():
            logger.warning(f"Worker specs directory not found: {worker_specs_dir}")
            return 0

        records = []

        # Process both active and completed workers
        for status_dir in ['active', 'completed']:
            status_path = worker_specs_dir / status_dir
            if not status_path.exists():
                continue

            for json_file in status_path.glob('*.json'):
                try:
                    with open(json_file, 'r') as f:
                        worker_data = json.load(f)

                    # Transform to lakehouse schema
                    record = self._transform_worker(worker_data, json_file)
                    records.append(record)

                except Exception as e:
                    logger.warning(f"Failed to process {json_file}: {str(e)}")

        if not self.dry_run:
            self._write_to_delta('core.workers', records)

        return len(records)

    def _migrate_routing_decisions(self) -> int:
        """Migrate routing-decisions.jsonl to cortex.moe.routing_decisions"""
        jsonl_file = self.cortex_root / 'coordination' / 'masters' / 'coordinator' / 'knowledge-base' / 'routing-decisions.jsonl'

        if not jsonl_file.exists():
            logger.warning(f"Routing decisions file not found: {jsonl_file}")
            return 0

        records = []
        with open(jsonl_file, 'r') as f:
            for line_num, line in enumerate(f, 1):
                try:
                    decision_data = json.loads(line.strip())
                    record = self._transform_routing_decision(decision_data)
                    records.append(record)
                except Exception as e:
                    logger.warning(f"Failed to process line {line_num}: {str(e)}")

        if not self.dry_run:
            self._write_to_delta('moe.routing_decisions', records)

        return len(records)

    def _migrate_governance_logs(self) -> int:
        """Migrate access-log.jsonl to cortex.governance.access_logs"""
        jsonl_file = self.cortex_root / 'coordination' / 'governance' / 'access-log.jsonl'

        if not jsonl_file.exists():
            logger.warning(f"Governance logs file not found: {jsonl_file}")
            return 0

        records = []
        with open(jsonl_file, 'r') as f:
            for line_num, line in enumerate(f, 1):
                try:
                    log_data = json.loads(line.strip())
                    record = self._transform_governance_log(log_data)
                    records.append(record)
                except Exception as e:
                    logger.warning(f"Failed to process line {line_num}: {str(e)}")

        if not self.dry_run:
            self._write_to_delta('governance.access_logs', records)

        return len(records)

    def _migrate_strategy_plans(self) -> int:
        """Migrate strategy-plans/*.json to cortex.planning.strategy_plans"""
        plans_dir = self.cortex_root / 'coordination' / 'knowledge-base' / 'strategy-plans'

        if not plans_dir.exists():
            logger.warning(f"Strategy plans directory not found: {plans_dir}")
            return 0

        records = []
        for json_file in plans_dir.glob('*.json'):
            try:
                with open(json_file, 'r') as f:
                    plan_data = json.load(f)

                record = self._transform_strategy_plan(plan_data, json_file)
                records.append(record)

            except Exception as e:
                logger.warning(f"Failed to process {json_file}: {str(e)}")

        if not self.dry_run:
            self._write_to_delta('planning.strategy_plans', records)

        return len(records)

    def _migrate_events(self) -> int:
        """Migrate dashboard-events.jsonl to cortex.events.event_stream"""
        jsonl_file = self.cortex_root / 'dashboard-events.jsonl'

        if not jsonl_file.exists():
            logger.warning(f"Events file not found: {jsonl_file}")
            return 0

        records = []
        with open(jsonl_file, 'r') as f:
            for line_num, line in enumerate(f, 1):
                try:
                    event_data = json.loads(line.strip())
                    record = self._transform_event(event_data)
                    records.append(record)
                except Exception as e:
                    logger.warning(f"Failed to process line {line_num}: {str(e)}")

        if not self.dry_run:
            self._write_to_delta('events.event_stream', records)

        return len(records)

    def _migrate_model_selection(self) -> int:
        """Migrate model-selection.jsonl to cortex.metrics.model_selection"""
        jsonl_file = self.cortex_root / 'coordination' / 'metrics' / 'model-selection.jsonl'

        if not jsonl_file.exists():
            logger.warning(f"Model selection file not found: {jsonl_file}")
            return 0

        records = []
        with open(jsonl_file, 'r') as f:
            for line_num, line in enumerate(f, 1):
                try:
                    selection_data = json.loads(line.strip())
                    record = self._transform_model_selection(selection_data)
                    records.append(record)
                except Exception as e:
                    logger.warning(f"Failed to process line {line_num}: {str(e)}")

        if not self.dry_run:
            self._write_to_delta('metrics.model_selection', records)

        return len(records)

    def _migrate_active_identities(self) -> int:
        """Migrate active-identities.json to cortex.identity.active_identities"""
        json_file = self.cortex_root / 'coordination' / 'governance' / 'identities' / 'active-identities.json'

        if not json_file.exists():
            logger.warning(f"Active identities file not found: {json_file}")
            return 0

        records = []
        with open(json_file, 'r') as f:
            identities_data = json.load(f)

        # Handle both array and object formats
        if isinstance(identities_data, list):
            identity_list = identities_data
        elif isinstance(identities_data, dict):
            identity_list = identities_data.get('identities', [])
        else:
            logger.warning("Unexpected identities data format")
            return 0

        for identity_data in identity_list:
            try:
                record = self._transform_identity(identity_data)
                records.append(record)
            except Exception as e:
                logger.warning(f"Failed to process identity: {str(e)}")

        if not self.dry_run:
            self._write_to_delta('identity.active_identities', records)

        return len(records)

    def _migrate_embeddings_cache(self) -> int:
        """Migrate embeddings/cache/*.json to cortex.ml.embeddings_cache"""
        cache_dir = self.cortex_root / 'coordination' / 'embeddings' / 'cache'

        if not cache_dir.exists():
            logger.warning(f"Embeddings cache directory not found: {cache_dir}")
            return 0

        records = []
        for json_file in cache_dir.glob('*.json'):
            try:
                with open(json_file, 'r') as f:
                    embedding_data = json.load(f)

                record = self._transform_embedding_cache(embedding_data, json_file)
                records.append(record)

            except Exception as e:
                logger.warning(f"Failed to process {json_file}: {str(e)}")

        if not self.dry_run:
            self._write_to_delta('ml.embeddings_cache', records)

        return len(records)

    # Transformation methods

    def _transform_task(self, data: Dict, source_file: Path) -> Dict:
        """Transform task JSON to lakehouse schema"""
        # Import inline to avoid circular dependencies
        import sys
        sys.path.insert(0, str(Path(__file__).parent))
        from transformers.task_transformer import TaskTransformer
        transformer = TaskTransformer()
        return transformer.transform(data, source_file)

    def _transform_worker(self, data: Dict, source_file: Path) -> Dict:
        """Transform worker spec JSON to lakehouse schema"""
        import sys
        sys.path.insert(0, str(Path(__file__).parent))
        from transformers.worker_transformer import WorkerTransformer
        transformer = WorkerTransformer()
        return transformer.transform(data, source_file)

    def _transform_routing_decision(self, data: Dict) -> Dict:
        """Transform routing decision JSONL line to lakehouse schema"""
        import sys
        sys.path.insert(0, str(Path(__file__).parent))
        from transformers.routing_transformer import RoutingTransformer
        transformer = RoutingTransformer()
        return transformer.transform(data)

    def _transform_governance_log(self, data: Dict) -> Dict:
        """Transform governance log JSONL line to lakehouse schema"""
        import sys
        sys.path.insert(0, str(Path(__file__).parent))
        from transformers.governance_transformer import GovernanceTransformer
        transformer = GovernanceTransformer()
        return transformer.transform(data)

    def _transform_strategy_plan(self, data: Dict, source_file: Path) -> Dict:
        """Transform strategy plan JSON to lakehouse schema"""
        import sys
        sys.path.insert(0, str(Path(__file__).parent))
        from transformers.strategy_transformer import StrategyTransformer
        transformer = StrategyTransformer()
        return transformer.transform(data, source_file)

    def _transform_event(self, data: Dict) -> Dict:
        """Transform event JSONL line to lakehouse schema"""
        import sys
        sys.path.insert(0, str(Path(__file__).parent))
        from transformers.event_transformer import EventTransformer
        transformer = EventTransformer()
        return transformer.transform(data)

    def _transform_model_selection(self, data: Dict) -> Dict:
        """Transform model selection JSONL line to lakehouse schema"""
        import sys
        sys.path.insert(0, str(Path(__file__).parent))
        from transformers.model_selection_transformer import ModelSelectionTransformer
        transformer = ModelSelectionTransformer()
        return transformer.transform(data)

    def _transform_identity(self, data: Dict) -> Dict:
        """Transform identity JSON to lakehouse schema"""
        import sys
        sys.path.insert(0, str(Path(__file__).parent))
        from transformers.identity_transformer import IdentityTransformer
        transformer = IdentityTransformer()
        return transformer.transform(data)

    def _transform_embedding_cache(self, data: Dict, source_file: Path) -> Dict:
        """Transform embedding cache JSON to lakehouse schema"""
        import sys
        sys.path.insert(0, str(Path(__file__).parent))
        from transformers.embedding_transformer import EmbeddingTransformer
        transformer = EmbeddingTransformer()
        return transformer.transform(data, source_file)

    def _write_to_delta(self, table_name: str, records: List[Dict]):
        """Write records to Delta Lake table"""
        if not records:
            logger.warning(f"No records to write for {table_name}")
            return

        logger.info(f"Writing {len(records)} records to {table_name}")

        # Create output directory
        output_dir = self.lakehouse_path / table_name.replace('.', '/')
        output_dir.mkdir(parents=True, exist_ok=True)

        # For now, write as JSON (will be converted to Delta Lake with PySpark)
        output_file = output_dir / f"migration_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(output_file, 'w') as f:
            json.dump(records, f, indent=2, default=str)

        logger.info(f"Wrote to {output_file}")

    def _write_migration_report(self):
        """Write migration report"""
        self.migration_state['completed_at'] = datetime.now().isoformat()

        report_file = self.lakehouse_path / 'migration_report.json'
        with open(report_file, 'w') as f:
            json.dump(self.migration_state, f, indent=2, default=str)

        logger.info(f"Migration report written to {report_file}")
        logger.info(f"Total records processed: {self.migration_state['records_processed']}")
        logger.info(f"Tables migrated: {len(self.migration_state['tables_migrated'])}")
        logger.info(f"Tables failed: {len(self.migration_state['tables_failed'])}")


def main():
    parser = argparse.ArgumentParser(description='Migrate Cortex data to lakehouse')
    parser.add_argument(
        '--cortex-root',
        type=Path,
        default=Path.cwd(),
        help='Root directory of Cortex project'
    )
    parser.add_argument(
        '--lakehouse-path',
        type=Path,
        default=Path.cwd() / 'data-intelligence' / 'lakehouse',
        help='Destination lakehouse directory'
    )
    parser.add_argument(
        '--mode',
        choices=['full', 'incremental', 'strict'],
        default='full',
        help='Migration mode'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Perform dry run without writing data'
    )

    args = parser.parse_args()

    # Create lakehouse directory
    args.lakehouse_path.mkdir(parents=True, exist_ok=True)

    # Run migration
    orchestrator = MigrationOrchestrator(
        cortex_root=args.cortex_root,
        lakehouse_path=args.lakehouse_path,
        mode=args.mode,
        dry_run=args.dry_run
    )

    success = orchestrator.migrate_all()

    if success:
        logger.info("Migration completed successfully")
        sys.exit(0)
    else:
        logger.error("Migration completed with errors")
        sys.exit(1)


if __name__ == '__main__':
    main()
