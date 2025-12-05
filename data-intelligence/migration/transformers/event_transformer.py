"""Event Transformer"""
from datetime import datetime
from typing import Dict, Optional
import hashlib


class EventTransformer:
    def transform(self, data: Dict) -> Dict:
        return {
            'event_id': data.get('event_id') or self._generate_event_id(data),
            'timestamp': self._parse_timestamp(data.get('timestamp')),
            'event_type': data.get('event_type') or data.get('type'),
            'event_category': data.get('event_category') or data.get('category', 'system'),
            'severity': data.get('severity', 'info'),
            'source_agent': data.get('source_agent') or data.get('source'),
            'source_type': data.get('source_type') or data.get('agent_type', 'system'),
            'task_id': data.get('task_id'),
            'worker_id': data.get('worker_id'),
            'session_id': data.get('session_id'),
            'correlation_id': data.get('correlation_id'),
            'event_data': data.get('event_data') or data.get('data', {}),
            'message': data.get('message'),
            'duration_ms': data.get('duration_ms') or data.get('duration'),
            'tokens_used': data.get('tokens_used'),
            'cost': data.get('cost'),
            'tags': data.get('tags', []),
            'metadata': data.get('metadata', {}),
            'ingested_at': datetime.now(),
        }

    def _generate_event_id(self, data: Dict) -> str:
        content = f"{data.get('timestamp')}:{data.get('event_type')}:{data.get('source_agent')}"
        return f"event-{hashlib.sha256(content.encode()).hexdigest()[:16]}"

    def _parse_timestamp(self, ts: Optional[str]) -> Optional[datetime]:
        if not ts:
            return datetime.now()
        try:
            return datetime.fromisoformat(ts.replace('Z', '+00:00'))
        except:
            return datetime.now()
