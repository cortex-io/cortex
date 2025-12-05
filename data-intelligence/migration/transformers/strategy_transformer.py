"""Strategy Plan Transformer"""
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional


class StrategyTransformer:
    def transform(self, data: Dict, source_file: Path) -> Dict:
        return {
            'plan_id': data.get('plan_id') or source_file.stem,
            'worker_id': data.get('worker_id'),
            'plan_type': data.get('strategy') or data.get('plan_type', 'direct'),
            'goal_type': data.get('goal_type'),
            'complexity': data.get('complexity'),
            'strategy_description': data.get('description') or data.get('strategy_description'),
            'approach': data.get('approach'),
            'phases': data.get('phases', []),
            'total_estimated_tokens': data.get('total_estimated_tokens') or data.get('estimated_tokens'),
            'success_criteria': data.get('success_criteria', []),
            'risk_factors': data.get('risk_factors', []),
            'mitigation_strategies': data.get('mitigation_strategies', []),
            'current_phase': data.get('current_phase'),
            'completed_phases': data.get('completed_phases', []),
            'phase_results': data.get('phase_results', []),
            'created_at': self._parse_timestamp(data.get('created_at')),
            'created_by': data.get('created_by', 'system'),
            'updated_at': self._parse_timestamp(data.get('updated_at')),
            'version': data.get('version', 1),
        }

    def _parse_timestamp(self, ts: Optional[str]) -> Optional[datetime]:
        if not ts:
            return datetime.now()
        try:
            return datetime.fromisoformat(ts.replace('Z', '+00:00'))
        except:
            return datetime.now()
