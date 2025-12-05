"""
Task Transformer

Transforms task JSON files to cortex.core.tasks schema
"""

import hashlib
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional


class TaskTransformer:
    """Transforms task data to lakehouse schema"""

    def transform(self, data: Dict, source_file: Path) -> Dict:
        """
        Transform task JSON to lakehouse schema

        Args:
            data: Task data from JSON file
            source_file: Source file path

        Returns:
            Transformed record matching cortex.core.tasks schema
        """
        # Extract task ID from filename or data
        task_id = data.get('task_id') or self._extract_task_id(source_file)

        # Parse timestamps
        created_at = self._parse_timestamp(
            data.get('created_at') or data.get('timestamp')
        )
        started_at = self._parse_timestamp(data.get('started_at'))
        completed_at = self._parse_timestamp(data.get('completed_at'))

        # Calculate duration
        duration_seconds = None
        if started_at and completed_at:
            duration_seconds = int(
                (completed_at - started_at).total_seconds()
            )

        # Extract routing information
        routing_info = data.get('routing', {})
        routing_decision = data.get('routing_decision', {})

        # Generate lineage ID
        lineage_id = self._generate_lineage_id(task_id, created_at)

        return {
            # Primary Key
            'task_id': task_id,

            # Task Definition
            'task_type': data.get('task_type') or data.get('type', 'unknown'),
            'task_description': data.get('description') or data.get('task_description', ''),
            'task_category': data.get('category'),
            'priority': data.get('priority', 'medium'),
            'complexity': data.get('complexity'),

            # Routing Information
            'routing_strategy': routing_info.get('strategy') or routing_decision.get('routing_strategy', 'direct'),
            'assigned_master': routing_decision.get('decision', {}).get('primary_expert') or data.get('master') or data.get('assigned_master'),
            'routing_confidence': routing_decision.get('decision', {}).get('primary_confidence'),
            'routing_method': routing_decision.get('routing_method'),

            # Execution Context
            'parent_task_id': data.get('parent_task') or data.get('parent_task_id'),
            'requesting_agent': data.get('requesting_agent') or data.get('created_by'),
            'deadline': self._parse_timestamp(data.get('deadline')),

            # Status Tracking
            'status': data.get('status', 'unknown'),
            'created_at': created_at,
            'started_at': started_at,
            'completed_at': completed_at,
            'duration_seconds': duration_seconds,

            # Resources & Budget
            'token_budget': data.get('token_budget') or data.get('resources', {}).get('token_budget'),
            'tokens_used': data.get('tokens_used') or data.get('execution', {}).get('tokens_used', 0),
            'model_recommended': routing_decision.get('decision', {}).get('model_recommendation', {}).get('model'),
            'cost_estimate': None,  # Calculate from model and estimated tokens
            'cost_actual': None,  # Calculate from model and actual tokens

            # Results & Artifacts
            'outcome': data.get('outcome') or data.get('results', {}).get('status'),
            'summary': data.get('summary') or data.get('results', {}).get('summary'),
            'artifacts': data.get('artifacts', []) or data.get('results', {}).get('artifacts', []),
            'error_message': data.get('error') or data.get('error_message'),

            # Metadata
            'metadata': data.get('metadata', {}),
            'tags': data.get('tags', []),

            # Governance
            'governance_review_required': True,
            'compliance_status': data.get('compliance_status'),
            'lineage_id': lineage_id,

            # Audit
            'created_by': data.get('created_by', 'system'),
            'updated_at': created_at,
            'updated_by': data.get('updated_by', 'migration'),
            'version': 1,
        }

    def _extract_task_id(self, source_file: Path) -> str:
        """Extract task ID from filename"""
        filename = source_file.stem
        # Remove common prefixes
        for prefix in ['task-', 'task_']:
            if filename.startswith(prefix):
                return filename
        return filename

    def _parse_timestamp(self, ts: Optional[str]) -> Optional[datetime]:
        """Parse timestamp string to datetime"""
        if not ts:
            return None

        try:
            # Try ISO format first
            return datetime.fromisoformat(ts.replace('Z', '+00:00'))
        except (ValueError, AttributeError):
            pass

        try:
            # Try common formats
            for fmt in [
                '%Y-%m-%dT%H:%M:%S',
                '%Y-%m-%d %H:%M:%S',
                '%Y-%m-%d',
            ]:
                return datetime.strptime(ts, fmt)
        except ValueError:
            pass

        return None

    def _generate_lineage_id(self, task_id: str, created_at: Optional[datetime]) -> str:
        """Generate deterministic lineage ID"""
        content = f"{task_id}:{created_at.isoformat() if created_at else 'unknown'}"
        hash_obj = hashlib.sha256(content.encode())
        return hash_obj.hexdigest()[:16]
