"""Identity Transformer"""
from datetime import datetime, timedelta
from typing import Dict, Optional


class IdentityTransformer:
    def transform(self, data: Dict) -> Dict:
        token_issued_at = self._parse_timestamp(data.get('issued_at') or data.get('created_at'))
        token_expires_at = self._parse_timestamp(data.get('expires_at'))

        # Calculate expiration if not provided (default 1 hour)
        if not token_expires_at and token_issued_at:
            token_expires_at = token_issued_at + timedelta(hours=1)

        return {
            'spiffe_id': data.get('spiffe_id'),
            'agent_id': data.get('agent_id'),
            'agent_type': data.get('agent_type'),
            'role': data.get('role'),
            'token': data.get('token'),
            'token_issued_at': token_issued_at,
            'token_expires_at': token_expires_at,
            'trust_level': data.get('trust_level', 50),
            'capabilities': data.get('capabilities', []),
            'granted_permissions': data.get('granted_permissions', []),
            'status': data.get('status', 'active'),
            'created_at': self._parse_timestamp(data.get('created_at')),
            'last_activity': self._parse_timestamp(data.get('last_activity')),
            'revoked_at': self._parse_timestamp(data.get('revoked_at')),
            'revocation_reason': data.get('revocation_reason'),
            'created_by': data.get('created_by'),
            'metadata': data.get('metadata', {}),
        }

    def _parse_timestamp(self, ts: Optional[str]) -> Optional[datetime]:
        if not ts:
            return None
        try:
            return datetime.fromisoformat(ts.replace('Z', '+00:00'))
        except:
            return None
