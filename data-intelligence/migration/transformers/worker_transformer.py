"""
Worker Transformer

Transforms worker spec JSON files to cortex.core.workers schema
"""

from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional


class WorkerTransformer:
    """Transforms worker specification data to lakehouse schema"""

    def transform(self, data: Dict, source_file: Path) -> Dict:
        """
        Transform worker spec JSON to lakehouse schema

        Args:
            data: Worker spec data from JSON file
            source_file: Source file path

        Returns:
            Transformed record matching cortex.core.workers schema
        """
        # Parse timestamps
        created_at = self._parse_timestamp(data.get('created_at'))
        started_at = self._parse_timestamp(
            data.get('execution', {}).get('started_at')
        )
        completed_at = self._parse_timestamp(
            data.get('execution', {}).get('completed_at')
        )

        # Extract identity information
        identity = data.get('identity', {})

        # Extract goal-based planning
        planning = data.get('goal_based_planning', {})

        # Extract resources
        resources = data.get('resources', {})

        # Extract tool assignment
        tool_assignment = data.get('tool_assignment', {})

        # Extract execution data
        execution = data.get('execution', {})

        # Extract results
        results = data.get('results', {})

        # Extract review configuration
        review = data.get('review', {})

        # Transform deliverables
        deliverables = self._transform_deliverables(data.get('deliverables', []))

        # Transform review history
        review_history = self._transform_review_history(review.get('history', []))

        return {
            # Primary Key
            'worker_id': data.get('worker_id'),

            # Worker Definition
            'worker_type': data.get('worker_type'),
            'created_by': data.get('created_by'),
            'execution_manager': data.get('execution_manager'),

            # Associated Task
            'task_id': data.get('task_id'),
            'parent_task': data.get('context', {}).get('parent_task'),

            # Identity & Security
            'spiffe_id': identity.get('spiffe_id'),
            'identity_token': identity.get('token'),
            'trust_level': identity.get('trust_level', 50),
            'capabilities': identity.get('capabilities', []),

            # Planning Strategy
            'goal_based_planning_enabled': planning.get('enabled', True),
            'planning_strategy': planning.get('strategy'),
            'goal_type': planning.get('goal_type'),
            'complexity': planning.get('complexity'),
            'strategy_plan_location': planning.get('strategy_plan_location'),

            # Resource Allocation
            'token_budget': resources.get('token_budget'),
            'timeout_minutes': resources.get('timeout_minutes'),
            'max_retries': resources.get('max_retries', 1),

            # Tool Assignment
            'essential_tools': tool_assignment.get('essential_tools', []),
            'optional_tools': tool_assignment.get('optional_tools', []),
            'total_tools': tool_assignment.get('total_tools'),
            'tool_assignment_rationale': tool_assignment.get('rationale'),

            # Execution Tracking
            'status': data.get('status', 'unknown'),
            'created_at': created_at,
            'started_at': started_at,
            'completed_at': completed_at,
            'tokens_used': execution.get('tokens_used', 0),
            'duration_minutes': execution.get('duration_minutes', 0),
            'session_id': execution.get('session_id'),

            # Results
            'result_status': results.get('status'),
            'output_location': results.get('output_location'),
            'summary': results.get('summary'),
            'artifacts': results.get('artifacts', []),
            'deliverables': deliverables,

            # Quality Review
            'review_enabled': review.get('enabled', True),
            'min_cycles': review.get('min_cycles', 1),
            'auto_approve_threshold': review.get('auto_approve_threshold', 0.95),
            'review_history': review_history,

            # Metadata
            'context': data.get('context', {}),
            'scope': data.get('scope', {}),
            'metadata': data.get('metadata', {}),

            # Audit
            'updated_at': created_at,
            'version': 1,
        }

    def _transform_deliverables(self, deliverables: List) -> List[Dict]:
        """Transform deliverables array"""
        if not deliverables:
            return []

        result = []
        for item in deliverables:
            if isinstance(item, dict):
                result.append({
                    'type': item.get('type'),
                    'location': item.get('location'),
                    'status': item.get('status'),
                })
            elif isinstance(item, str):
                result.append({
                    'type': 'artifact',
                    'location': item,
                    'status': 'completed',
                })

        return result

    def _transform_review_history(self, history: List) -> List[Dict]:
        """Transform review history array"""
        if not history:
            return []

        result = []
        for item in history:
            if isinstance(item, dict):
                result.append({
                    'cycle': item.get('cycle'),
                    'score': item.get('score'),
                    'feedback': item.get('feedback'),
                    'timestamp': self._parse_timestamp(item.get('timestamp')),
                })

        return result

    def _parse_timestamp(self, ts: Optional[str]) -> Optional[datetime]:
        """Parse timestamp string to datetime"""
        if not ts:
            return None

        try:
            return datetime.fromisoformat(ts.replace('Z', '+00:00'))
        except (ValueError, AttributeError):
            pass

        try:
            for fmt in [
                '%Y-%m-%dT%H:%M:%S',
                '%Y-%m-%d %H:%M:%S',
                '%Y-%m-%d',
            ]:
                return datetime.strptime(ts, fmt)
        except ValueError:
            pass

        return None
