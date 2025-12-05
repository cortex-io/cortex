#!/usr/bin/env python3
"""
RAG (Retrieval Augmented Generation) System for Cortex

Provides context-aware worker assistance by retrieving relevant knowledge
from past tasks, decisions, and documentation.
"""

import json
import numpy as np
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from sentence_transformers import SentenceTransformer
import chromadb
from chromadb.config import Settings


class CortexRAGSystem:
    """RAG system for context-aware workers"""

    def __init__(
        self,
        chroma_path: Optional[Path] = None,
        embedding_model: str = "all-MiniLM-L6-v2"
    ):
        """
        Initialize RAG system

        Args:
            chroma_path: Path to ChromaDB storage
            embedding_model: Sentence transformer model name
        """
        self.chroma_path = chroma_path or Path('data-intelligence/lakehouse/chromadb')
        self.chroma_path.mkdir(parents=True, exist_ok=True)

        # Initialize embedding model
        self.embedding_model = SentenceTransformer(embedding_model)

        # Initialize ChromaDB
        self.client = chromadb.Client(Settings(
            chroma_db_impl="duckdb+parquet",
            persist_directory=str(self.chroma_path)
        ))

        # Initialize collections
        self._init_collections()

    def _init_collections(self):
        """Initialize ChromaDB collections"""
        # Task history collection
        self.tasks_collection = self.client.get_or_create_collection(
            name="task_history",
            metadata={"description": "Historical task data for RAG"}
        )

        # Routing decisions collection
        self.routing_collection = self.client.get_or_create_collection(
            name="routing_decisions",
            metadata={"description": "MoE routing decisions for RAG"}
        )

        # Knowledge base collection
        self.knowledge_collection = self.client.get_or_create_collection(
            name="knowledge_base",
            metadata={"description": "Master-specific knowledge"}
        )

        # Best practices collection
        self.practices_collection = self.client.get_or_create_collection(
            name="best_practices",
            metadata={"description": "Best practices and patterns"}
        )

    def index_task(self, task_id: str, task_data: Dict):
        """
        Index a task for retrieval

        Args:
            task_id: Unique task identifier
            task_data: Task data to index
        """
        # Create document text
        doc_text = f"""
Task Type: {task_data.get('task_type', 'unknown')}
Description: {task_data.get('description', '')}
Outcome: {task_data.get('outcome', '')}
Master: {task_data.get('assigned_master', '')}
Complexity: {task_data.get('complexity', '')}
Duration: {task_data.get('duration_minutes', 0)} minutes
Tokens Used: {task_data.get('tokens_used', 0)}
Success: {task_data.get('status') == 'completed'}
        """.strip()

        # Generate embedding
        embedding = self.embedding_model.encode(doc_text).tolist()

        # Add to collection
        self.tasks_collection.add(
            ids=[task_id],
            embeddings=[embedding],
            documents=[doc_text],
            metadatas=[{
                'task_type': task_data.get('task_type', ''),
                'master': task_data.get('assigned_master', ''),
                'complexity': task_data.get('complexity', ''),
                'status': task_data.get('status', ''),
            }]
        )

    def index_routing_decision(self, decision_id: str, decision_data: Dict):
        """Index a routing decision"""
        doc_text = f"""
Task Type: {decision_data.get('task_type', '')}
Primary Expert: {decision_data.get('primary_expert', '')}
Confidence: {decision_data.get('primary_confidence', 0)}
Method: {decision_data.get('routing_method', '')}
Keywords: {', '.join(decision_data.get('matched_keywords', []))}
Outcome: {decision_data.get('actual_outcome', '')}
Accuracy: {decision_data.get('routing_accuracy_score', 0)}
        """.strip()

        embedding = self.embedding_model.encode(doc_text).tolist()

        self.routing_collection.add(
            ids=[decision_id],
            embeddings=[embedding],
            documents=[doc_text],
            metadatas=[{
                'primary_expert': decision_data.get('primary_expert', ''),
                'routing_method': decision_data.get('routing_method', ''),
            }]
        )

    def index_knowledge(self, doc_id: str, content: str, metadata: Dict):
        """Index knowledge base document"""
        embedding = self.embedding_model.encode(content).tolist()

        self.knowledge_collection.add(
            ids=[doc_id],
            embeddings=[embedding],
            documents=[content],
            metadatas=[metadata]
        )

    def retrieve_similar_tasks(
        self,
        query: str,
        n_results: int = 5,
        filter_by: Optional[Dict] = None
    ) -> List[Dict]:
        """
        Retrieve similar tasks

        Args:
            query: Query text
            n_results: Number of results to return
            filter_by: Metadata filters

        Returns:
            List of similar tasks with scores
        """
        # Generate query embedding
        query_embedding = self.embedding_model.encode(query).tolist()

        # Query collection
        results = self.tasks_collection.query(
            query_embeddings=[query_embedding],
            n_results=n_results,
            where=filter_by
        )

        return self._format_results(results)

    def retrieve_relevant_knowledge(
        self,
        query: str,
        n_results: int = 3
    ) -> List[Dict]:
        """Retrieve relevant knowledge base articles"""
        query_embedding = self.embedding_model.encode(query).tolist()

        results = self.knowledge_collection.query(
            query_embeddings=[query_embedding],
            n_results=n_results
        )

        return self._format_results(results)

    def get_contextual_recommendations(
        self,
        task_description: str,
        task_type: str
    ) -> Dict:
        """
        Get contextual recommendations for a task

        Args:
            task_description: Task description
            task_type: Type of task

        Returns:
            Recommendations with context
        """
        # Retrieve similar successful tasks
        similar_tasks = self.retrieve_similar_tasks(
            query=task_description,
            n_results=5,
            filter_by={'status': 'completed'}
        )

        # Retrieve relevant routing decisions
        query_embedding = self.embedding_model.encode(task_description).tolist()
        routing_results = self.routing_collection.query(
            query_embeddings=[query_embedding],
            n_results=3
        )

        # Retrieve knowledge
        knowledge = self.retrieve_relevant_knowledge(task_description, n_results=3)

        recommendations = {
            'similar_tasks': similar_tasks[:3],
            'suggested_master': self._suggest_master(similar_tasks, routing_results),
            'estimated_complexity': self._estimate_complexity(similar_tasks),
            'estimated_tokens': self._estimate_tokens(similar_tasks),
            'relevant_knowledge': knowledge,
            'success_patterns': self._extract_success_patterns(similar_tasks)
        }

        return recommendations

    def _suggest_master(self, tasks: List[Dict], routing: Dict) -> str:
        """Suggest best master based on similar tasks"""
        if not tasks:
            return 'development-master'

        # Count master frequency in successful tasks
        master_counts = {}
        for task in tasks:
            if task.get('metadata', {}).get('master'):
                master = task['metadata']['master']
                master_counts[master] = master_counts.get(master, 0) + 1

        if master_counts:
            return max(master_counts.items(), key=lambda x: x[1])[0]

        return 'development-master'

    def _estimate_complexity(self, tasks: List[Dict]) -> str:
        """Estimate complexity based on similar tasks"""
        if not tasks:
            return 'medium'

        complexities = [t.get('metadata', {}).get('complexity') for t in tasks if t.get('metadata', {}).get('complexity')]

        if not complexities:
            return 'medium'

        # Most common complexity
        from collections import Counter
        return Counter(complexities).most_common(1)[0][0]

    def _estimate_tokens(self, tasks: List[Dict]) -> int:
        """Estimate token usage based on similar tasks"""
        if not tasks:
            return 5000

        # Extract token usage from document text (rough estimate)
        return 5000  # Default estimate

    def _extract_success_patterns(self, tasks: List[Dict]) -> List[str]:
        """Extract common patterns from successful tasks"""
        patterns = []

        if len([t for t in tasks if t.get('metadata', {}).get('status') == 'completed']) > len(tasks) * 0.8:
            patterns.append("High success rate for similar tasks")

        return patterns

    def _format_results(self, results: Dict) -> List[Dict]:
        """Format ChromaDB results"""
        formatted = []

        if not results or not results.get('ids'):
            return formatted

        for i, task_id in enumerate(results['ids'][0]):
            formatted.append({
                'id': task_id,
                'document': results['documents'][0][i] if results.get('documents') else '',
                'metadata': results['metadatas'][0][i] if results.get('metadatas') else {},
                'distance': results['distances'][0][i] if results.get('distances') else 0,
            })

        return formatted


# Example usage
if __name__ == '__main__':
    rag = CortexRAGSystem()

    # Index a task
    rag.index_task('task-001', {
        'task_type': 'development',
        'description': 'Implement user authentication',
        'outcome': 'success',
        'assigned_master': 'development-master',
        'complexity': 'high',
        'duration_minutes': 45,
        'tokens_used': 8500,
        'status': 'completed'
    })

    # Get recommendations
    recs = rag.get_contextual_recommendations(
        task_description='Add login functionality',
        task_type='development'
    )

    print(json.dumps(recs, indent=2))
