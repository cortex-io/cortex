#!/usr/bin/env python3
"""
Indexer module for RAG system.
Creates and manages FAISS indexes for task outcomes and code patterns.
"""

import json
import logging
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

import faiss
import numpy as np

from embeddings import EmbeddingGenerator

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class RAGIndexer:
    """Manages FAISS indexes for task outcomes and code patterns."""

    def __init__(self, config_path: str = None, base_path: str = None):
        """Initialize the indexer.

        Args:
            config_path: Path to config.json
            base_path: Base path for the RAG system (defaults to script directory)
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
        self.storage_path = base_path / Path(self.config['storage']['task_outcomes_index']).parent
        self.storage_path.mkdir(parents=True, exist_ok=True)

        # Initialize embedding generator
        self.embedder = EmbeddingGenerator(config_path)
        self.dimension = self.embedder.get_dimension()

        # Initialize indexes
        self.task_index = None
        self.pattern_index = None
        self.task_metadata = []
        self.pattern_metadata = []

        # Load existing indexes if available
        self._load_indexes()

    def _create_index(self) -> faiss.Index:
        """Create a new FAISS index."""
        index_type = self.config['index_params']['index_type']

        if index_type == 'IndexFlatL2':
            # Simple L2 distance index (exact search)
            index = faiss.IndexFlatL2(self.dimension)
        elif index_type == 'IndexFlatIP':
            # Inner product (cosine similarity with normalized vectors)
            index = faiss.IndexFlatIP(self.dimension)
        else:
            # Default to L2
            index = faiss.IndexFlatL2(self.dimension)

        logger.info(f"Created new {index_type} index with dimension {self.dimension}")
        return index

    def _load_indexes(self):
        """Load existing indexes and metadata from disk."""
        task_index_path = self.base_path / self.config['storage']['task_outcomes_index']
        pattern_index_path = self.base_path / self.config['storage']['code_patterns_index']
        task_meta_path = self.base_path / self.config['storage']['task_metadata_file']
        pattern_meta_path = self.base_path / self.config['storage']['pattern_metadata_file']

        # Load task index
        if task_index_path.exists():
            logger.info(f"Loading task index from {task_index_path}")
            self.task_index = faiss.read_index(str(task_index_path))
            logger.info(f"Loaded task index with {self.task_index.ntotal} vectors")
        else:
            logger.info("Creating new task index")
            self.task_index = self._create_index()

        # Load pattern index
        if pattern_index_path.exists():
            logger.info(f"Loading pattern index from {pattern_index_path}")
            self.pattern_index = faiss.read_index(str(pattern_index_path))
            logger.info(f"Loaded pattern index with {self.pattern_index.ntotal} vectors")
        else:
            logger.info("Creating new pattern index")
            self.pattern_index = self._create_index()

        # Load metadata
        if task_meta_path.exists():
            with open(task_meta_path, 'r') as f:
                self.task_metadata = [json.loads(line) for line in f]
            logger.info(f"Loaded {len(self.task_metadata)} task metadata entries")

        if pattern_meta_path.exists():
            with open(pattern_meta_path, 'r') as f:
                self.pattern_metadata = [json.loads(line) for line in f]
            logger.info(f"Loaded {len(self.pattern_metadata)} pattern metadata entries")

    def _save_indexes(self):
        """Save indexes and metadata to disk."""
        task_index_path = self.base_path / self.config['storage']['task_outcomes_index']
        pattern_index_path = self.base_path / self.config['storage']['code_patterns_index']
        task_meta_path = self.base_path / self.config['storage']['task_metadata_file']
        pattern_meta_path = self.base_path / self.config['storage']['pattern_metadata_file']

        # Save task index
        faiss.write_index(self.task_index, str(task_index_path))
        logger.info(f"Saved task index to {task_index_path}")

        # Save pattern index
        faiss.write_index(self.pattern_index, str(pattern_index_path))
        logger.info(f"Saved pattern index to {pattern_index_path}")

        # Save metadata
        with open(task_meta_path, 'w') as f:
            for meta in self.task_metadata:
                f.write(json.dumps(meta) + '\n')
        logger.info(f"Saved {len(self.task_metadata)} task metadata entries")

        with open(pattern_meta_path, 'w') as f:
            for meta in self.pattern_metadata:
                f.write(json.dumps(meta) + '\n')
        logger.info(f"Saved {len(self.pattern_metadata)} pattern metadata entries")

    def index_task_outcome(self, task_id: str, description: str,
                          outcome: str, metadata: Dict = None) -> int:
        """Index a completed task outcome.

        Args:
            task_id: Unique task identifier
            description: Task description
            outcome: Task outcome/result
            metadata: Additional metadata (master, category, success, etc.)

        Returns:
            Index ID of the added entry
        """
        # Create searchable text
        text = f"{description}\n{outcome}"

        # Generate embedding
        embedding = self.embedder.encode(text)

        # Add to index
        self.task_index.add(embedding)
        idx = self.task_index.ntotal - 1

        # Store metadata
        meta = {
            'id': idx,
            'task_id': task_id,
            'description': description,
            'outcome': outcome,
            'indexed_at': datetime.utcnow().isoformat(),
            **(metadata or {})
        }
        self.task_metadata.append(meta)

        logger.info(f"Indexed task {task_id} at index {idx}")
        return idx

    def index_code_pattern(self, pattern_type: str, code: str,
                          description: str, metadata: Dict = None) -> int:
        """Index a successful code pattern.

        Args:
            pattern_type: Type of pattern (e.g., 'authentication', 'database', 'api')
            code: Code snippet or implementation
            description: Pattern description
            metadata: Additional metadata (language, framework, success_rate, etc.)

        Returns:
            Index ID of the added entry
        """
        # Create searchable text
        text = f"{pattern_type}: {description}\n{code}"

        # Generate embedding
        embedding = self.embedder.encode(text)

        # Add to index
        self.pattern_index.add(embedding)
        idx = self.pattern_index.ntotal - 1

        # Store metadata
        meta = {
            'id': idx,
            'pattern_type': pattern_type,
            'code': code,
            'description': description,
            'indexed_at': datetime.utcnow().isoformat(),
            **(metadata or {})
        }
        self.pattern_metadata.append(meta)

        logger.info(f"Indexed pattern '{pattern_type}' at index {idx}")
        return idx

    def index_batch_tasks(self, tasks: List[Dict]) -> List[int]:
        """Index multiple tasks in batch.

        Args:
            tasks: List of task dicts with keys: task_id, description, outcome, metadata

        Returns:
            List of index IDs
        """
        if not tasks:
            return []

        # Prepare texts
        texts = [f"{t['description']}\n{t['outcome']}" for t in tasks]

        # Generate embeddings in batch
        embeddings = self.embedder.encode_batch(texts)

        # Add to index
        start_idx = self.task_index.ntotal
        self.task_index.add(embeddings)

        # Store metadata
        indices = []
        for i, task in enumerate(tasks):
            idx = start_idx + i
            meta = {
                'id': idx,
                'task_id': task['task_id'],
                'description': task['description'],
                'outcome': task['outcome'],
                'indexed_at': datetime.utcnow().isoformat(),
                **task.get('metadata', {})
            }
            self.task_metadata.append(meta)
            indices.append(idx)

        logger.info(f"Batch indexed {len(tasks)} tasks")
        return indices

    def index_batch_patterns(self, patterns: List[Dict]) -> List[int]:
        """Index multiple code patterns in batch.

        Args:
            patterns: List of pattern dicts with keys: pattern_type, code, description, metadata

        Returns:
            List of index IDs
        """
        if not patterns:
            return []

        # Prepare texts
        texts = [f"{p['pattern_type']}: {p['description']}\n{p['code']}" for p in patterns]

        # Generate embeddings in batch
        embeddings = self.embedder.encode_batch(texts)

        # Add to index
        start_idx = self.pattern_index.ntotal
        self.pattern_index.add(embeddings)

        # Store metadata
        indices = []
        for i, pattern in enumerate(patterns):
            idx = start_idx + i
            meta = {
                'id': idx,
                'pattern_type': pattern['pattern_type'],
                'code': pattern['code'],
                'description': pattern['description'],
                'indexed_at': datetime.utcnow().isoformat(),
                **pattern.get('metadata', {})
            }
            self.pattern_metadata.append(meta)
            indices.append(idx)

        logger.info(f"Batch indexed {len(patterns)} patterns")
        return indices

    def rebuild_from_coordination(self, coordination_path: str):
        """Rebuild index from coordination/lineage directory.

        Args:
            coordination_path: Path to coordination directory
        """
        coord_path = Path(coordination_path)
        tasks_path = coord_path / 'tasks'
        lineage_path = coord_path / 'lineage'

        logger.info(f"Rebuilding index from {coordination_path}")

        # Clear existing indexes
        self.task_index = self._create_index()
        self.task_metadata = []

        # Index tasks from tasks directory
        task_files = list(tasks_path.glob('*.json'))
        logger.info(f"Found {len(task_files)} task files")

        tasks_to_index = []
        for task_file in task_files:
            try:
                with open(task_file, 'r') as f:
                    task_data = json.load(f)

                # Only index completed tasks with outcomes
                if task_data.get('status') == 'completed' and task_data.get('outcome'):
                    tasks_to_index.append({
                        'task_id': task_data.get('task_id', task_file.stem),
                        'description': task_data.get('description', task_data.get('task', '')),
                        'outcome': task_data.get('outcome', ''),
                        'metadata': {
                            'master': task_data.get('master', task_data.get('assigned_to', '')),
                            'category': task_data.get('category', ''),
                            'success': task_data.get('success', True),
                            'duration': task_data.get('duration', 0)
                        }
                    })
            except Exception as e:
                logger.warning(f"Error reading {task_file}: {e}")

        # Batch index tasks
        if tasks_to_index:
            self.index_batch_tasks(tasks_to_index)

        # Save indexes
        self._save_indexes()

        logger.info(f"Rebuild complete. Indexed {len(tasks_to_index)} tasks")

    def save(self):
        """Save indexes to disk."""
        self._save_indexes()

    def get_stats(self) -> Dict:
        """Get indexer statistics."""
        return {
            'task_index_size': self.task_index.ntotal,
            'pattern_index_size': self.pattern_index.ntotal,
            'dimension': self.dimension,
            'index_type': self.config['index_params']['index_type']
        }


def main():
    """CLI interface for indexer."""
    import argparse

    parser = argparse.ArgumentParser(description='RAG Indexer')
    parser.add_argument('command', choices=['rebuild', 'index-task', 'stats'],
                       help='Command to execute')
    parser.add_argument('--coordination-path', default='/Users/ryandahlberg/Projects/cortex/coordination',
                       help='Path to coordination directory')
    parser.add_argument('--task-id', help='Task ID to index')
    parser.add_argument('--description', help='Task description')
    parser.add_argument('--outcome', help='Task outcome')

    args = parser.parse_args()

    indexer = RAGIndexer()

    if args.command == 'rebuild':
        indexer.rebuild_from_coordination(args.coordination_path)
    elif args.command == 'index-task':
        if not all([args.task_id, args.description, args.outcome]):
            print("Error: --task-id, --description, and --outcome required")
            sys.exit(1)
        idx = indexer.index_task_outcome(args.task_id, args.description, args.outcome)
        indexer.save()
        print(f"Indexed task at index {idx}")
    elif args.command == 'stats':
        stats = indexer.get_stats()
        print(json.dumps(stats, indent=2))


if __name__ == '__main__':
    main()
