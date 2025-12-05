"""Embedding Cache Transformer"""
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional


class EmbeddingTransformer:
    def transform(self, data: Dict, source_file: Path) -> Dict:
        # Use filename as cache key if not provided
        cache_key = data.get('cache_key') or source_file.stem

        return {
            'cache_key': cache_key,
            'input_text': data.get('input_text') or data.get('text', ''),
            'input_type': data.get('input_type') or data.get('type', 'unknown'),
            'embedding': data.get('embedding') or data.get('vector', []),
            'embedding_model': data.get('embedding_model') or data.get('model', 'all-MiniLM-L6-v2'),
            'embedding_dimension': data.get('embedding_dimension') or len(data.get('embedding', [])),
            'created_at': self._parse_timestamp(data.get('created_at')),
            'last_accessed': self._parse_timestamp(data.get('last_accessed')),
            'access_count': data.get('access_count', 1),
            'metadata': data.get('metadata', {}),
        }

    def _parse_timestamp(self, ts: Optional[str]) -> Optional[datetime]:
        if not ts:
            return datetime.now()
        try:
            return datetime.fromisoformat(ts.replace('Z', '+00:00'))
        except:
            return datetime.now()
