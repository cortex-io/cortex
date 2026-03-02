#!/usr/bin/env python3
"""
Retriever module for RAG system.
Performs similarity search on FAISS indexes.
"""

import json
import logging
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional

import faiss
import numpy as np

from embeddings import EmbeddingGenerator

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class RAGRetriever:
    """Retrieves similar tasks and code patterns using FAISS similarity search."""

    def __init__(self, config_path: str = None, base_path: str = None):
        """Initialize the retriever.

        Args:
            config_path: Path to config.json
            base_path: Base path for the RAG system
        """
        if base_path is None:
            base_path = Path(__file__).parent
        else:
            base_path = Path(base_path)

        if config_path is None:
            config_path = base_path / "config.json"

        with open(config_path, 'r') as f:
            self.config = json.load(f)

        self.base_path = base_path

        # Initialize embedding generator
        self.embedder = EmbeddingGenerator(config_path)

        # Load indexes and metadata
        self._load_indexes()

    def _load_indexes(self):
        """Load FAISS indexes and metadata from disk."""
        task_index_path = self.base_path / self.config['storage']['task_outcomes_index']
        pattern_index_path = self.base_path / self.config['storage']['code_patterns_index']
        task_meta_path = self.base_path / self.config['storage']['task_metadata_file']
        pattern_meta_path = self.base_path / self.config['storage']['pattern_metadata_file']

        # Load task index
        if task_index_path.exists():
            self.task_index = faiss.read_index(str(task_index_path))
            logger.info(f"Loaded task index with {self.task_index.ntotal} vectors")
        else:
            logger.warning(f"Task index not found at {task_index_path}")
            self.task_index = None

        # Load pattern index
        if pattern_index_path.exists():
            self.pattern_index = faiss.read_index(str(pattern_index_path))
            logger.info(f"Loaded pattern index with {self.pattern_index.ntotal} vectors")
        else:
            logger.warning(f"Pattern index not found at {pattern_index_path}")
            self.pattern_index = None

        # Load metadata
        self.task_metadata = []
        if task_meta_path.exists():
            with open(task_meta_path, 'r') as f:
                self.task_metadata = [json.loads(line) for line in f]
            logger.info(f"Loaded {len(self.task_metadata)} task metadata entries")

        self.pattern_metadata = []
        if pattern_meta_path.exists():
            with open(pattern_meta_path, 'r') as f:
                self.pattern_metadata = [json.loads(line) for line in f]
            logger.info(f"Loaded {len(self.pattern_metadata)} pattern metadata entries")

    def retrieve_similar_tasks(self,
                               query: str,
                               top_k: int = None,
                               filters: Dict = None) -> List[Dict]:
        """Find similar past tasks.

        Args:
            query: Search query text
            top_k: Number of results to return (default from config)
            filters: Optional filters (master, category, outcome_success)

        Returns:
            List of dicts with keys: id, score, task_id, description, outcome, metadata
        """
        if self.task_index is None or self.task_index.ntotal == 0:
            logger.warning("Task index is empty")
            return []

        if top_k is None:
            top_k = self.config['retrieval_params']['default_top_k']

        # Ensure top_k doesn't exceed index size
        top_k = min(top_k, self.task_index.ntotal)

        # Generate query embedding
        start_time = time.time()
        query_embedding = self.embedder.encode_query(query)

        # Search index
        distances, indices = self.task_index.search(query_embedding, top_k)

        # Process results
        results = []
        for i, (dist, idx) in enumerate(zip(distances[0], indices[0])):
            if idx < len(self.task_metadata):
                meta = self.task_metadata[idx]

                # Apply filters if provided
                if filters:
                    if 'master' in filters and meta.get('master') != filters['master']:
                        continue
                    if 'category' in filters and meta.get('category') != filters['category']:
                        continue
                    if 'outcome_success' in filters and meta.get('success') != filters['outcome_success']:
                        continue

                # Convert L2 distance to similarity score (0-1, higher is better)
                # For normalized vectors, L2 distance relates to cosine similarity
                # similarity = 1 - (distance^2 / 2)
                similarity_score = max(0, 1 - (dist * dist / 2))

                result = {
                    'id': int(idx),
                    'score': float(similarity_score),
                    'distance': float(dist),
                    'task_id': meta.get('task_id', ''),
                    'description': meta.get('description', ''),
                    'outcome': meta.get('outcome', ''),
                    'metadata': {k: v for k, v in meta.items()
                                if k not in ['id', 'task_id', 'description', 'outcome']}
                }
                results.append(result)

        elapsed = (time.time() - start_time) * 1000
        logger.info(f"Retrieved {len(results)} tasks in {elapsed:.2f}ms")

        return results

    def retrieve_similar_patterns(self,
                                  query: str,
                                  top_k: int = None,
                                  filters: Dict = None) -> List[Dict]:
        """Find relevant code patterns.

        Args:
            query: Search query text
            top_k: Number of results to return (default 3)
            filters: Optional filters (pattern_type, language, framework)

        Returns:
            List of dicts with keys: id, score, pattern_type, code, description, metadata
        """
        if self.pattern_index is None or self.pattern_index.ntotal == 0:
            logger.warning("Pattern index is empty")
            return []

        if top_k is None:
            top_k = 3  # Default to 3 for patterns

        # Ensure top_k doesn't exceed index size
        top_k = min(top_k, self.pattern_index.ntotal)

        # Generate query embedding
        start_time = time.time()
        query_embedding = self.embedder.encode_query(query)

        # Search index
        distances, indices = self.pattern_index.search(query_embedding, top_k)

        # Process results
        results = []
        for i, (dist, idx) in enumerate(zip(distances[0], indices[0])):
            if idx < len(self.pattern_metadata):
                meta = self.pattern_metadata[idx]

                # Apply filters if provided
                if filters:
                    if 'pattern_type' in filters and meta.get('pattern_type') != filters['pattern_type']:
                        continue
                    if 'language' in filters and meta.get('language') != filters['language']:
                        continue
                    if 'framework' in filters and meta.get('framework') != filters['framework']:
                        continue

                # Convert distance to similarity score
                similarity_score = max(0, 1 - (dist * dist / 2))

                result = {
                    'id': int(idx),
                    'score': float(similarity_score),
                    'distance': float(dist),
                    'pattern_type': meta.get('pattern_type', ''),
                    'code': meta.get('code', ''),
                    'description': meta.get('description', ''),
                    'metadata': {k: v for k, v in meta.items()
                                if k not in ['id', 'pattern_type', 'code', 'description']}
                }
                results.append(result)

        elapsed = (time.time() - start_time) * 1000
        logger.info(f"Retrieved {len(results)} patterns in {elapsed:.2f}ms")

        return results

    def retrieve_by_master(self, query: str, master: str, top_k: int = 5) -> List[Dict]:
        """Retrieve tasks filtered by master.

        Args:
            query: Search query
            master: Master name (e.g., 'security', 'development')
            top_k: Number of results

        Returns:
            List of similar tasks from the specified master
        """
        return self.retrieve_similar_tasks(query, top_k=top_k, filters={'master': master})

    def get_stats(self) -> Dict:
        """Get retriever statistics."""
        return {
            'task_index_size': self.task_index.ntotal if self.task_index else 0,
            'pattern_index_size': self.pattern_index.ntotal if self.pattern_index else 0,
            'task_metadata_count': len(self.task_metadata),
            'pattern_metadata_count': len(self.pattern_metadata)
        }


def main():
    """CLI interface for retriever."""
    import argparse

    parser = argparse.ArgumentParser(description='RAG Retriever')
    parser.add_argument('command', choices=['query', 'query-patterns', 'stats'],
                       help='Command to execute')
    parser.add_argument('query', nargs='?', help='Search query')
    parser.add_argument('--top-k', type=int, help='Number of results')
    parser.add_argument('--master', help='Filter by master')
    parser.add_argument('--pattern-type', help='Filter by pattern type')
    parser.add_argument('--json', action='store_true', help='Output as JSON')

    args = parser.parse_args()

    retriever = RAGRetriever()

    if args.command == 'query':
        if not args.query:
            print("Error: query required")
            sys.exit(1)

        filters = {}
        if args.master:
            filters['master'] = args.master

        results = retriever.retrieve_similar_tasks(args.query, top_k=args.top_k, filters=filters)

        if args.json:
            print(json.dumps(results, indent=2))
        else:
            print(f"\nFound {len(results)} similar tasks:\n")
            for i, result in enumerate(results, 1):
                print(f"{i}. [Score: {result['score']:.3f}] {result['task_id']}")
                print(f"   Description: {result['description'][:100]}...")
                print(f"   Outcome: {result['outcome'][:100]}...")
                print()

    elif args.command == 'query-patterns':
        if not args.query:
            print("Error: query required")
            sys.exit(1)

        filters = {}
        if args.pattern_type:
            filters['pattern_type'] = args.pattern_type

        results = retriever.retrieve_similar_patterns(args.query, top_k=args.top_k, filters=filters)

        if args.json:
            print(json.dumps(results, indent=2))
        else:
            print(f"\nFound {len(results)} similar patterns:\n")
            for i, result in enumerate(results, 1):
                print(f"{i}. [Score: {result['score']:.3f}] {result['pattern_type']}")
                print(f"   Description: {result['description'][:100]}...")
                print(f"   Code snippet: {result['code'][:100]}...")
                print()

    elif args.command == 'stats':
        stats = retriever.get_stats()
        print(json.dumps(stats, indent=2))


if __name__ == '__main__':
    main()
