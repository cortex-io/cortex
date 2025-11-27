#!/usr/bin/env python3
"""
Routing Cache for Performance Optimization

Implements intelligent caching of routing decisions to reduce latency.

Features:
- LRU cache for recent queries
- Embedding-based similarity cache (find similar cached queries)
- TTL-based expiration
- Cache warming from historical data
"""

import json
import time
import hashlib
from pathlib import Path
from typing import Dict, Optional, Tuple, List
from collections import OrderedDict
import numpy as np

try:
    from sentence_transformers import SentenceTransformer
except ImportError:
    pass


class RoutingCache:
    """
    Intelligent routing cache with embedding-based similarity matching
    """

    def __init__(
        self,
        max_size: int = 1000,
        ttl_seconds: int = 3600,  # 1 hour default
        similarity_threshold: float = 0.95,
        use_embeddings: bool = True
    ):
        """
        Initialize routing cache

        Args:
            max_size: Maximum number of cached entries
            ttl_seconds: Time-to-live for cache entries (seconds)
            similarity_threshold: Minimum similarity to use cached result
            use_embeddings: Use embedding similarity for fuzzy matching
        """
        self.max_size = max_size
        self.ttl_seconds = ttl_seconds
        self.similarity_threshold = similarity_threshold
        self.use_embeddings = use_embeddings

        # LRU cache (exact matches)
        self.exact_cache: OrderedDict[str, Dict] = OrderedDict()

        # Embedding cache (similarity matches)
        self.embedding_cache: List[Dict] = []
        self.embedding_model = None

        # Statistics
        self.stats = {
            'hits_exact': 0,
            'hits_similar': 0,
            'misses': 0,
            'evictions': 0,
            'expirations': 0
        }

        # Load embedding model if needed
        if self.use_embeddings:
            try:
                self.embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
            except Exception:
                self.use_embeddings = False

    def _hash_query(self, query: str) -> str:
        """Generate hash for exact cache key"""
        return hashlib.md5(query.encode('utf-8')).hexdigest()

    def _is_expired(self, entry: Dict) -> bool:
        """Check if cache entry is expired"""
        cached_at = entry.get('cached_at', 0)
        return (time.time() - cached_at) > self.ttl_seconds

    def get(self, query: str) -> Optional[Dict]:
        """
        Get cached routing decision

        Args:
            query: Query string

        Returns:
            Cached routing decision or None
        """
        # Try exact match first
        cache_key = self._hash_query(query)

        if cache_key in self.exact_cache:
            entry = self.exact_cache[cache_key]

            # Check expiration
            if self._is_expired(entry):
                del self.exact_cache[cache_key]
                self.stats['expirations'] += 1
                return None

            # Move to end (LRU)
            self.exact_cache.move_to_end(cache_key)
            self.stats['hits_exact'] += 1

            return {
                'agent': entry['agent'],
                'confidence': entry['confidence'],
                'method': entry['method'],
                'cached': True,
                'cache_type': 'exact',
                'cached_at': entry['cached_at']
            }

        # Try similarity match with embeddings
        if self.use_embeddings and self.embedding_model:
            result = self._similarity_lookup(query)
            if result:
                self.stats['hits_similar'] += 1
                return result

        # Cache miss
        self.stats['misses'] += 1
        return None

    def _similarity_lookup(self, query: str) -> Optional[Dict]:
        """
        Find similar cached query using embeddings

        Args:
            query: Query string

        Returns:
            Cached result if similar query found
        """
        if not self.embedding_cache:
            return None

        # Embed query
        query_emb = self.embedding_model.encode(query, convert_to_numpy=True)

        # Find most similar cached query
        best_similarity = 0.0
        best_entry = None

        for entry in self.embedding_cache:
            # Check expiration
            if self._is_expired(entry):
                continue

            # Compute similarity
            cached_emb = np.array(entry['query_embedding'])
            similarity = np.dot(query_emb, cached_emb) / (
                np.linalg.norm(query_emb) * np.linalg.norm(cached_emb)
            )

            if similarity > best_similarity:
                best_similarity = similarity
                best_entry = entry

        # Use cached result if similarity is high enough
        if best_entry and best_similarity >= self.similarity_threshold:
            return {
                'agent': best_entry['agent'],
                'confidence': best_entry['confidence'],
                'method': best_entry['method'],
                'cached': True,
                'cache_type': 'similar',
                'similarity': float(best_similarity),
                'original_query': best_entry['query'],
                'cached_at': best_entry['cached_at']
            }

        return None

    def put(self, query: str, agent: str, confidence: float, method: str):
        """
        Cache routing decision

        Args:
            query: Query string
            agent: Selected agent
            confidence: Routing confidence
            method: Routing method used
        """
        cache_key = self._hash_query(query)
        timestamp = time.time()

        # Store in exact cache
        entry = {
            'query': query,
            'agent': agent,
            'confidence': confidence,
            'method': method,
            'cached_at': timestamp
        }

        self.exact_cache[cache_key] = entry
        self.exact_cache.move_to_end(cache_key)

        # Evict if over size
        if len(self.exact_cache) > self.max_size:
            self.exact_cache.popitem(last=False)
            self.stats['evictions'] += 1

        # Store in embedding cache
        if self.use_embeddings and self.embedding_model:
            query_emb = self.embedding_model.encode(query, convert_to_numpy=True)

            embedding_entry = {
                **entry,
                'query_embedding': query_emb.tolist()
            }

            self.embedding_cache.append(embedding_entry)

            # Trim embedding cache
            if len(self.embedding_cache) > self.max_size:
                self.embedding_cache.pop(0)

    def warm_from_history(self, history_file: Path, max_entries: int = 500):
        """
        Warm cache from historical routing decisions

        Args:
            history_file: Path to routing decisions log (JSONL)
            max_entries: Maximum number of historical entries to load
        """
        if not history_file.exists():
            return

        print(f"Warming cache from {history_file}...")

        with open(history_file, 'r') as f:
            entries = [json.loads(line) for line in f]

        # Take most recent entries
        recent_entries = entries[-max_entries:] if len(entries) > max_entries else entries

        for entry in recent_entries:
            query = entry.get('query')
            agent = entry.get('selected_agent')
            confidence = entry.get('confidence', 0.0)
            method = entry.get('routing_method', 'unknown')

            if query and agent:
                self.put(query, agent, confidence, method)

        print(f"✅ Loaded {len(recent_entries)} entries into cache")

    def get_stats(self) -> Dict:
        """Get cache statistics"""
        total_requests = sum([
            self.stats['hits_exact'],
            self.stats['hits_similar'],
            self.stats['misses']
        ])

        hit_rate = 0.0
        if total_requests > 0:
            hit_rate = (self.stats['hits_exact'] + self.stats['hits_similar']) / total_requests

        return {
            **self.stats,
            'total_requests': total_requests,
            'hit_rate': hit_rate,
            'cache_size_exact': len(self.exact_cache),
            'cache_size_embedding': len(self.embedding_cache)
        }

    def clear(self):
        """Clear all cache entries"""
        self.exact_cache.clear()
        self.embedding_cache.clear()
        self.stats = {
            'hits_exact': 0,
            'hits_similar': 0,
            'misses': 0,
            'evictions': 0,
            'expirations': 0
        }


def main():
    """CLI for cache testing"""
    import argparse

    parser = argparse.ArgumentParser(description='Routing cache CLI')
    parser.add_argument('--warm', type=str, help='Warm cache from history file')
    parser.add_argument('--query', type=str, help='Test query lookup')
    parser.add_argument('--stats', action='store_true', help='Show cache statistics')

    args = parser.parse_args()

    # Initialize cache
    cache = RoutingCache()

    # Warm from history
    if args.warm:
        cache.warm_from_history(Path(args.warm))

    # Test query
    if args.query:
        result = cache.get(args.query)
        if result:
            print("✅ Cache hit!")
            print(json.dumps(result, indent=2))
        else:
            print("❌ Cache miss")

    # Show stats
    if args.stats or (not args.query and not args.warm):
        stats = cache.get_stats()
        print("\nCache Statistics:")
        print(json.dumps(stats, indent=2))


if __name__ == '__main__':
    main()
