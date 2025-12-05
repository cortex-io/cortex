#!/usr/bin/env python3
"""
End-to-End Lineage Tracking for Cortex

Tracks the complete lineage of tasks, workers, artifacts, and data flows
for governance, debugging, and optimization.
"""

import hashlib
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Set
from collections import defaultdict


class LineageTracker:
    """Tracks end-to-end lineage for Cortex operations"""

    def __init__(self, lineage_db_path: Optional[Path] = None):
        """
        Initialize lineage tracker

        Args:
            lineage_db_path: Path to lineage database (JSONL)
        """
        self.lineage_db_path = lineage_db_path or Path('data-intelligence/lakehouse/lineage/lineage.jsonl')
        self.lineage_db_path.parent.mkdir(parents=True, exist_ok=True)

        # In-memory graph for fast queries
        self.graph = defaultdict(list)
        self.entities = {}

        # Load existing lineage
        self._load_lineage()

    def _load_lineage(self):
        """Load existing lineage data"""
        if not self.lineage_db_path.exists():
            return

        with open(self.lineage_db_path, 'r') as f:
            for line in f:
                try:
                    entry = json.loads(line.strip())
                    self.entities[entry['lineage_id']] = entry

                    # Build graph edges
                    if entry.get('parent_entity_id'):
                        self.graph[entry['parent_entity_id']].append(entry['lineage_id'])
                except:
                    pass

    def record_task_created(
        self,
        task_id: str,
        created_by: str,
        task_data: Dict
    ) -> str:
        """
        Record task creation in lineage

        Args:
            task_id: Unique task identifier
            created_by: Agent that created the task
            task_data: Task metadata

        Returns:
            Lineage ID
        """
        lineage_id = self._generate_lineage_id('task', task_id)

        entry = {
            'lineage_id': lineage_id,
            'timestamp': datetime.now().isoformat(),
            'entity_type': 'task',
            'entity_id': task_id,
            'parent_entity_id': None,
            'parent_entity_type': None,
            'relationship_type': 'created',
            'operation': 'create',
            'attributes': {
                'created_by': created_by,
                'task_type': task_data.get('task_type'),
                'priority': task_data.get('priority'),
                'description': task_data.get('description', '')[:100],
            },
            'recorded_at': datetime.now().isoformat(),
            'recorded_by': 'lineage_tracker'
        }

        self._append_entry(entry)
        return lineage_id

    def record_worker_spawned(
        self,
        worker_id: str,
        task_id: str,
        master: str,
        worker_data: Dict
    ) -> str:
        """
        Record worker spawn in lineage

        Args:
            worker_id: Unique worker identifier
            task_id: Parent task ID
            master: Master that spawned the worker
            worker_data: Worker metadata

        Returns:
            Lineage ID
        """
        lineage_id = self._generate_lineage_id('worker', worker_id)
        task_lineage_id = self._generate_lineage_id('task', task_id)

        entry = {
            'lineage_id': lineage_id,
            'timestamp': datetime.now().isoformat(),
            'entity_type': 'worker',
            'entity_id': worker_id,
            'parent_entity_id': task_lineage_id,
            'parent_entity_type': 'task',
            'relationship_type': 'spawned_by',
            'operation': 'create',
            'attributes': {
                'spawned_by': master,
                'worker_type': worker_data.get('worker_type'),
                'token_budget': worker_data.get('token_budget'),
                'goal_type': worker_data.get('goal_type'),
            },
            'recorded_at': datetime.now().isoformat(),
            'recorded_by': 'lineage_tracker'
        }

        self._append_entry(entry)
        return lineage_id

    def record_artifact_produced(
        self,
        artifact_path: str,
        worker_id: str,
        artifact_type: str,
        metadata: Optional[Dict] = None
    ) -> str:
        """
        Record artifact production

        Args:
            artifact_path: Path to artifact
            worker_id: Worker that produced the artifact
            artifact_type: Type of artifact (code, doc, config, etc.)
            metadata: Additional metadata

        Returns:
            Lineage ID
        """
        lineage_id = self._generate_lineage_id('artifact', artifact_path)
        worker_lineage_id = self._generate_lineage_id('worker', worker_id)

        entry = {
            'lineage_id': lineage_id,
            'timestamp': datetime.now().isoformat(),
            'entity_type': 'artifact',
            'entity_id': artifact_path,
            'parent_entity_id': worker_lineage_id,
            'parent_entity_type': 'worker',
            'relationship_type': 'produced_by',
            'operation': 'produce',
            'attributes': {
                'artifact_type': artifact_type,
                'produced_by': worker_id,
                **(metadata or {})
            },
            'recorded_at': datetime.now().isoformat(),
            'recorded_by': 'lineage_tracker'
        }

        self._append_entry(entry)
        return lineage_id

    def record_artifact_consumed(
        self,
        artifact_path: str,
        consumer_id: str,
        consumer_type: str
    ) -> str:
        """
        Record artifact consumption

        Args:
            artifact_path: Path to artifact
            consumer_id: ID of consuming entity
            consumer_type: Type of consumer (worker, task, etc.)

        Returns:
            Lineage ID
        """
        lineage_id = self._generate_lineage_id(f'{consumer_type}_consumption', consumer_id)
        artifact_lineage_id = self._generate_lineage_id('artifact', artifact_path)

        entry = {
            'lineage_id': lineage_id,
            'timestamp': datetime.now().isoformat(),
            'entity_type': consumer_type,
            'entity_id': consumer_id,
            'parent_entity_id': artifact_lineage_id,
            'parent_entity_type': 'artifact',
            'relationship_type': 'consumed_by',
            'operation': 'consume',
            'attributes': {
                'consumer_type': consumer_type,
                'artifact_consumed': artifact_path,
            },
            'recorded_at': datetime.now().isoformat(),
            'recorded_by': 'lineage_tracker'
        }

        self._append_entry(entry)
        return lineage_id

    def record_data_transformation(
        self,
        source_data: str,
        target_data: str,
        transformer_id: str,
        transformation_type: str
    ) -> str:
        """
        Record data transformation

        Args:
            source_data: Source data identifier
            target_data: Target data identifier
            transformer_id: ID of transformer (worker, script, etc.)
            transformation_type: Type of transformation

        Returns:
            Lineage ID
        """
        lineage_id = self._generate_lineage_id('transformation', target_data)
        source_lineage_id = self._generate_lineage_id('data', source_data)

        entry = {
            'lineage_id': lineage_id,
            'timestamp': datetime.now().isoformat(),
            'entity_type': 'data',
            'entity_id': target_data,
            'parent_entity_id': source_lineage_id,
            'parent_entity_type': 'data',
            'relationship_type': 'derived_from',
            'operation': 'transform',
            'attributes': {
                'transformer': transformer_id,
                'transformation_type': transformation_type,
                'source': source_data,
            },
            'recorded_at': datetime.now().isoformat(),
            'recorded_by': 'lineage_tracker'
        }

        self._append_entry(entry)
        return lineage_id

    def get_lineage_chain(self, entity_id: str, entity_type: str) -> List[Dict]:
        """
        Get full lineage chain for an entity

        Args:
            entity_id: Entity identifier
            entity_type: Type of entity

        Returns:
            List of lineage entries in chronological order
        """
        lineage_id = self._generate_lineage_id(entity_type, entity_id)
        chain = []
        visited = set()

        def traverse_up(lid: str):
            if lid in visited or lid not in self.entities:
                return

            visited.add(lid)
            entry = self.entities[lid]
            chain.append(entry)

            if entry.get('parent_entity_id'):
                traverse_up(entry['parent_entity_id'])

        traverse_up(lineage_id)
        return list(reversed(chain))

    def get_downstream_entities(self, entity_id: str, entity_type: str) -> List[Dict]:
        """
        Get all downstream entities (children)

        Args:
            entity_id: Entity identifier
            entity_type: Type of entity

        Returns:
            List of downstream entities
        """
        lineage_id = self._generate_lineage_id(entity_type, entity_id)
        downstream = []
        visited = set()

        def traverse_down(lid: str):
            if lid in visited:
                return

            visited.add(lid)

            for child_id in self.graph.get(lid, []):
                if child_id in self.entities:
                    downstream.append(self.entities[child_id])
                    traverse_down(child_id)

        traverse_down(lineage_id)
        return downstream

    def get_impact_analysis(self, entity_id: str, entity_type: str) -> Dict:
        """
        Analyze impact of changes to an entity

        Args:
            entity_id: Entity identifier
            entity_type: Type of entity

        Returns:
            Impact analysis results
        """
        downstream = self.get_downstream_entities(entity_id, entity_type)

        impact = {
            'entity': {'id': entity_id, 'type': entity_type},
            'total_downstream': len(downstream),
            'by_type': defaultdict(int),
            'affected_entities': []
        }

        for entity in downstream:
            impact['by_type'][entity['entity_type']] += 1
            impact['affected_entities'].append({
                'id': entity['entity_id'],
                'type': entity['entity_type'],
                'relationship': entity['relationship_type']
            })

        impact['by_type'] = dict(impact['by_type'])
        return impact

    def search_lineage(
        self,
        entity_type: Optional[str] = None,
        operation: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[Dict]:
        """
        Search lineage entries

        Args:
            entity_type: Filter by entity type
            operation: Filter by operation
            start_date: Filter by start date
            end_date: Filter by end date

        Returns:
            Matching lineage entries
        """
        results = []

        for entry in self.entities.values():
            # Apply filters
            if entity_type and entry['entity_type'] != entity_type:
                continue

            if operation and entry['operation'] != operation:
                continue

            if start_date:
                entry_time = datetime.fromisoformat(entry['timestamp'])
                if entry_time < start_date:
                    continue

            if end_date:
                entry_time = datetime.fromisoformat(entry['timestamp'])
                if entry_time > end_date:
                    continue

            results.append(entry)

        return sorted(results, key=lambda x: x['timestamp'])

    def export_to_graphviz(self, output_path: Path):
        """Export lineage graph to Graphviz format"""
        with open(output_path, 'w') as f:
            f.write('digraph Lineage {\n')
            f.write('  rankdir=LR;\n')
            f.write('  node [shape=box];\n\n')

            # Write nodes
            for entry in self.entities.values():
                label = f"{entry['entity_type']}\\n{entry['entity_id'][:20]}"
                color = {
                    'task': 'lightblue',
                    'worker': 'lightgreen',
                    'artifact': 'lightyellow',
                    'data': 'lightpink'
                }.get(entry['entity_type'], 'white')

                f.write(f'  "{entry["lineage_id"]}" [label="{label}", fillcolor="{color}", style=filled];\n')

            f.write('\n')

            # Write edges
            for entry in self.entities.values():
                if entry.get('parent_entity_id'):
                    label = entry['relationship_type']
                    f.write(f'  "{entry["parent_entity_id"]}" -> "{entry["lineage_id"]}" [label="{label}"];\n')

            f.write('}\n')

    def _generate_lineage_id(self, entity_type: str, entity_id: str) -> str:
        """Generate deterministic lineage ID"""
        content = f"{entity_type}:{entity_id}"
        hash_obj = hashlib.sha256(content.encode())
        return f"lineage-{hash_obj.hexdigest()[:16]}"

    def _append_entry(self, entry: Dict):
        """Append entry to lineage database"""
        # Add to in-memory structures
        self.entities[entry['lineage_id']] = entry
        if entry.get('parent_entity_id'):
            self.graph[entry['parent_entity_id']].append(entry['lineage_id'])

        # Write to disk
        with open(self.lineage_db_path, 'a') as f:
            f.write(json.dumps(entry, default=str) + '\n')


# Example usage
if __name__ == '__main__':
    tracker = LineageTracker()

    # Record task creation
    task_lineage = tracker.record_task_created(
        task_id='task-001',
        created_by='user',
        task_data={'task_type': 'development', 'priority': 'high'}
    )

    # Record worker spawn
    worker_lineage = tracker.record_worker_spawned(
        worker_id='worker-001',
        task_id='task-001',
        master='development-master',
        worker_data={'worker_type': 'implementation-worker'}
    )

    # Record artifact production
    artifact_lineage = tracker.record_artifact_produced(
        artifact_path='/path/to/code.py',
        worker_id='worker-001',
        artifact_type='code'
    )

    # Get lineage chain
    chain = tracker.get_lineage_chain('worker-001', 'worker')
    print(f"Lineage chain: {len(chain)} entries")

    # Get downstream impact
    impact = tracker.get_impact_analysis('task-001', 'task')
    print(f"Impact analysis: {impact['total_downstream']} downstream entities")
