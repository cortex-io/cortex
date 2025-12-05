"""Model Selection Transformer"""
from datetime import datetime
from typing import Dict, Optional
import hashlib


class ModelSelectionTransformer:
    def transform(self, data: Dict) -> Dict:
        return {
            'selection_id': data.get('selection_id') or self._generate_selection_id(data),
            'timestamp': self._parse_timestamp(data.get('timestamp')),
            'task_id': data.get('task_id'),
            'worker_id': data.get('worker_id'),
            'master': data.get('master'),
            'selected_model': data.get('selected_model') or data.get('model'),
            'model_provider': data.get('model_provider') or data.get('provider', 'anthropic'),
            'model_tier': data.get('model_tier') or data.get('tier', 'balanced'),
            'selection_reason': data.get('selection_reason') or data.get('reason'),
            'task_type': data.get('task_type'),
            'task_complexity': data.get('task_complexity') or data.get('complexity'),
            'estimated_tokens': data.get('estimated_tokens'),
            'token_budget': data.get('token_budget'),
            'actual_tokens_used': data.get('actual_tokens_used') or data.get('tokens_used'),
            'actual_duration_seconds': data.get('actual_duration_seconds') or data.get('duration'),
            'quality_score': data.get('quality_score'),
            'cost_usd': data.get('cost_usd') or data.get('cost'),
            'cost_efficiency_score': data.get('cost_efficiency_score'),
            'task_outcome': data.get('task_outcome') or data.get('outcome'),
            'retry_count': data.get('retry_count', 0),
            'optimal_model': data.get('optimal_model'),
            'selection_accuracy': data.get('selection_accuracy'),
            'metadata': data.get('metadata', {}),
            'created_at': self._parse_timestamp(data.get('timestamp')),
        }

    def _generate_selection_id(self, data: Dict) -> str:
        content = f"{data.get('task_id')}:{data.get('timestamp')}:{data.get('selected_model')}"
        return f"selection-{hashlib.sha256(content.encode()).hexdigest()[:16]}"

    def _parse_timestamp(self, ts: Optional[str]) -> Optional[datetime]:
        if not ts:
            return datetime.now()
        try:
            return datetime.fromisoformat(ts.replace('Z', '+00:00'))
        except:
            return datetime.now()
