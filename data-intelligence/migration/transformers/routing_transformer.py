"""
Routing Transformer

Transforms routing decision JSONL lines to cortex.moe.routing_decisions schema
"""

import hashlib
import uuid
from datetime import datetime
from typing import Dict, List, Optional


class RoutingTransformer:
    """Transforms routing decision data to lakehouse schema"""

    def transform(self, data: Dict) -> Dict:
        """
        Transform routing decision JSONL line to lakehouse schema

        Args:
            data: Routing decision data from JSONL line

        Returns:
            Transformed record matching cortex.moe.routing_decisions schema
        """
        # Extract decision details
        decision = data.get('decision', {})
        model_recommendation = decision.get('model_recommendation', {})

        # Parse matched keywords
        matched_keywords = data.get('matched_keywords', [])
        keyword_scores = data.get('keyword_scores', {})

        # Extract secondary experts
        secondary_experts = decision.get('secondary_experts', [])
        if not secondary_experts:
            # Handle old format where secondary experts might be in different location
            confidence_scores = data.get('confidence_scores', {})
            secondary_experts = [
                {'expert': expert, 'confidence': score}
                for expert, score in confidence_scores.items()
                if expert != decision.get('primary_expert')
            ]

        # Generate decision ID
        decision_id = self._generate_decision_id(data)

        # Parse timestamp
        timestamp = self._parse_timestamp(data.get('timestamp'))

        return {
            # Primary Key
            'decision_id': decision_id,
            'task_id': data.get('task_id'),

            # Routing Analysis
            'timestamp': timestamp,
            'routing_strategy': data.get('routing_strategy', 'mixture_of_experts'),
            'routing_method': data.get('routing_method', 'nlp-keyword'),

            # Expert Selection
            'primary_expert': decision.get('primary_expert'),
            'primary_confidence': decision.get('primary_confidence') or decision.get('confidence'),
            'secondary_experts': self._transform_secondary_experts(secondary_experts),
            'strategy': decision.get('strategy', 'single_expert'),

            # Keyword/Pattern Matching
            'matched_keywords': matched_keywords,
            'keyword_scores': keyword_scores,
            'pattern_signature': data.get('pattern_signature') or self._generate_pattern_signature(matched_keywords),

            # Model Selection
            'recommended_model': model_recommendation.get('model'),
            'model_provider': model_recommendation.get('provider'),
            'model_tier': model_recommendation.get('tier'),
            'model_reasoning': model_recommendation.get('reasoning'),

            # Task Analysis
            'task_complexity': data.get('task_complexity') or data.get('complexity'),
            'estimated_duration_minutes': data.get('estimated_duration_minutes'),
            'estimated_tokens': data.get('estimated_tokens'),
            'required_capabilities': data.get('required_capabilities', []),

            # Learning Feedback (populated post-execution)
            'actual_expert': data.get('actual_expert'),
            'actual_outcome': data.get('actual_outcome'),
            'actual_duration_minutes': data.get('actual_duration_minutes'),
            'actual_tokens': data.get('actual_tokens'),
            'routing_accuracy_score': data.get('routing_accuracy_score'),

            # Embeddings for Semantic Search (Phase 2)
            'task_embedding': data.get('task_embedding'),
            'embedding_model': data.get('embedding_model', 'all-MiniLM-L6-v2'),

            # Metadata
            'metadata': data.get('metadata', {}),

            # Audit
            'created_at': timestamp,
            'updated_at': timestamp,
        }

    def _transform_secondary_experts(self, experts: List) -> List[Dict]:
        """Transform secondary experts array"""
        if not experts:
            return []

        result = []
        for item in experts:
            if isinstance(item, dict):
                result.append({
                    'expert': item.get('expert') or item.get('name'),
                    'confidence': item.get('confidence') or item.get('score', 0.0),
                })
            elif isinstance(item, str):
                result.append({
                    'expert': item,
                    'confidence': 0.0,
                })

        return result

    def _generate_decision_id(self, data: Dict) -> str:
        """Generate unique decision ID"""
        task_id = data.get('task_id', '')
        timestamp = data.get('timestamp', '')
        content = f"{task_id}:{timestamp}"
        hash_obj = hashlib.sha256(content.encode())
        return f"decision-{hash_obj.hexdigest()[:16]}"

    def _generate_pattern_signature(self, keywords: List[str]) -> str:
        """Generate pattern signature from keywords"""
        if not keywords:
            return ''

        # Sort keywords for consistency
        sorted_keywords = sorted(keywords)
        content = ','.join(sorted_keywords)
        hash_obj = hashlib.md5(content.encode())
        return hash_obj.hexdigest()[:12]

    def _parse_timestamp(self, ts: Optional[str]) -> Optional[datetime]:
        """Parse timestamp string to datetime"""
        if not ts:
            return datetime.now()

        try:
            return datetime.fromisoformat(ts.replace('Z', '+00:00'))
        except (ValueError, AttributeError):
            pass

        try:
            for fmt in [
                '%Y-%m-%dT%H:%M:%S',
                '%Y-%m-%dT%H:%M:%S.%f',
                '%Y-%m-%d %H:%M:%S',
                '%Y-%m-%d',
            ]:
                return datetime.strptime(ts, fmt)
        except ValueError:
            pass

        return datetime.now()
