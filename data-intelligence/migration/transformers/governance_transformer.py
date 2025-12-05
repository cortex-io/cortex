"""Governance Log Transformer"""
from datetime import datetime
from typing import Dict, Optional
import hashlib


class GovernanceTransformer:
    def transform(self, data: Dict) -> Dict:
        return {
            'log_id': self._generate_log_id(data),
            'timestamp': self._parse_timestamp(data.get('timestamp')),
            'agent_id': data.get('agent_id'),
            'agent_type': data.get('agent_type'),
            'spiffe_id': data.get('spiffe_id'),
            'resource_type': data.get('resource_type'),
            'resource_id': data.get('resource_id'),
            'action': data.get('action'),
            'requested_capabilities': data.get('requested_capabilities', []),
            'granted_capabilities': data.get('granted_capabilities', []),
            'denied_capabilities': data.get('denied_capabilities', []),
            'authorization_decision': data.get('authorization_decision'),
            'trust_level_required': data.get('trust_level_required'),
            'trust_level_actual': data.get('trust_level_actual'),
            'task_id': data.get('task_id'),
            'parent_task_id': data.get('parent_task_id'),
            'execution_context': data.get('execution_context', {}),
            'policies_evaluated': data.get('policies_evaluated', []),
            'policy_results': data.get('policy_results', []),
            'override_applied': data.get('override_applied', False),
            'override_reason': data.get('override_reason'),
            'compliance_frameworks': data.get('compliance_frameworks', []),
            'sensitive_data_accessed': data.get('sensitive_data_accessed', False),
            'pii_accessed': data.get('pii_accessed', False),
            'created_at': self._parse_timestamp(data.get('timestamp')),
            'session_id': data.get('session_id'),
        }

    def _generate_log_id(self, data: Dict) -> str:
        content = f"{data.get('agent_id')}:{data.get('timestamp')}:{data.get('action')}"
        return f"log-{hashlib.sha256(content.encode()).hexdigest()[:16]}"

    def _parse_timestamp(self, ts: Optional[str]) -> Optional[datetime]:
        if not ts:
            return datetime.now()
        try:
            return datetime.fromisoformat(ts.replace('Z', '+00:00'))
        except:
            return datetime.now()
